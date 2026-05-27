#!/usr/bin/env bun
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './client.ts'
import * as s from './schema.ts'
import { eq } from 'drizzle-orm'
import { CarReader } from '@ipld/car'
import * as dagCbor from '@ipld/dag-cbor'
import { OPCODE_NAMES } from '../../src/config.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const argv = process.argv.slice(2)
const carFile = argv.find(a => !a.startsWith('-'))
const force = argv.includes('--force')
const outDir = (() => {
  const i = argv.indexOf('--out-dir')
  return i >= 0 ? resolve(argv[i + 1]) : resolve(ROOT, 'out', 'sqlite')
})()
const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')

if (argv.includes('--help') || argv.includes('-h') || !carFile) {
  console.log(`Usage: bun run db:car-import <file.car> [options]

Import a CAR file into the SQLite database, reconstructing envelope data
from the DAG-CBOR blocks. Each CAR should be rooted at a Block node.

Options:
  --out-dir <path>   Output directory (default: out/)
  --force            Overwrite existing envelope rows
  --help, -h         Show this help`)
  process.exit(0)
}

if (!existsSync(carFile)) { console.error('CAR file not found:', carFile); process.exit(1) }

async function main() {
  const carBytes = readFileSync(carFile)
  const reader = await CarReader.fromBytes(carBytes)
  const roots = await reader.getRoots()

  if (!roots.length) { console.error('CAR has no roots'); process.exit(1) }

  // Index all blocks by CID for fast lookup
  const blocks = new Map<string, { cid: any; bytes: Uint8Array; decoded: any }>()
  for await (const b of reader.blocks()) {
    blocks.set(b.cid.toString(), {
      cid: b.cid,
      bytes: b.bytes,
      decoded: dagCbor.decode(b.bytes),
    })
  }

  const rootCid = roots[0].toString()
  const root = blocks.get(rootCid)
  if (!root) { console.error('Root block not found in CAR entries'); process.exit(1) }

  const node = root.decoded
  console.log(`\nCAR: ${carFile}`)
  console.log(`Root: ${rootCid}`)
  console.log(`Block height: ${node.height}`)
  console.log(`Tacit txs: ${node.tx}`)
  console.log(`Entries: ${blocks.size} blocks`)

  // Find the txs array CID
  const txsCid = node.txs?.toString?.() || node.txs?.('/')
  if (!txsCid) { console.error('No txs link in root block'); process.exit(1) }

  const txsEntry = blocks.get(txsCid)
  if (!txsEntry) { console.error('Txs array not found in CAR'); process.exit(1) }

  const txsArray = txsEntry.decoded as any[]
  console.log(`Transaction entries: ${txsArray.length}`)

  // Open DB
  const db = openDb(DB_PATH)
  const blockTime = node.time
  const blockHash = bytesToHex(node.hash)

  // Insert block record
  db.insert(s.blocks).values({
    height: node.height, hash: blockHash, time: blockTime,
    block: node.block ?? 0,
    tx: node.tx ?? txsArray.length,
  }).onConflictDoNothing().run()

  let envCount = 0, voutCount = 0

  for (let ti = 0; ti < txsArray.length; ti++) {
    if (ti > 0 && ti % 5 === 0) console.log(`  tx ${ti}/${txsArray.length}`)
    const txCid = txsArray[ti]?.toString?.() || txsArray[ti]?.('/')
    if (!txCid) continue

    const txEntry = blocks.get(txCid)
    if (!txEntry) continue

    const tx = txEntry.decoded
    // tx has: fee, index, locktime, txid, version, vin, vout
    const txid = bytesToHex(tx.txid)

    // Get vin array CID
    const vinCid = tx.vin?.toString?.() || tx.vin?.('/')
    const voutCid = tx.vout?.toString?.() || tx.vout?.('/')

    const { opcode, commitTxid } = resolveWitnessData(vinCid, blocks)

    // Count outputs
    let outputCount = 0
    let commitments: { vout: number; commitmentC: Uint8Array }[] = []
    if (voutCid) {
      const voutEntry = blocks.get(voutCid)
      if (voutEntry) {
        const voutArray = voutEntry.decoded as any[]
        outputCount = voutArray.length
        for (let vi = 0; vi < voutArray.length; vi++) {
          const voCid = voutArray[vi]?.toString?.() || voutArray[vi]?.('/')
          if (voCid) {
            const voEntry = blocks.get(voCid)
            if (voEntry) {
              const vo = voEntry.decoded
              // We store the scriptPubKey as commitment placeholder
              commitments.push({
                vout: vi,
                commitmentC: vo.pubkey || new Uint8Array(33),
              })
            }
          }
        }
      }
    }

    // Insert tx record
    const txResult = db.insert(s.txs).values({
      txid, height: node.height, index: ti,
      fee: tx.fee ?? 0,
      envelopeValid: 1,
      opcode,
    }).run()
    const txId = Number(txResult.lastInsertRowid)
    envCount++

    // Insert vouts from commitment data
    for (const c of commitments) {
      db.insert(s.vouts).values({
        txId, voutIndex: c.vout,
        assetId: '',
      }).run()
      voutCount++
    }
  }

  console.log(`Done: ${envCount} envelopes, ${voutCount} vouts imported from CAR`)
}

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

function findLastPush(script: Uint8Array): Uint8Array {
  let i = script.length - 1
  while (i >= 0 && script[i] === 0x68) i-- // skip OP_ENDIF
  if (i < 0) return script
  // Handle push opcodes
  if (script[i] <= 0x4b) {
    const len = script[i]
    return script.slice(Math.max(0, i - len), i)
  }
  if (script[i] === 0x4c && i >= 2) { // PUSHDATA1
    const len = script[i - 1]
    return script.slice(Math.max(0, i - 1 - len), i - 1)
  }
  if (script[i] === 0x4d && i >= 3) { // PUSHDATA2
    const len = script[i - 1] | (script[i - 2] << 8)
    return script.slice(Math.max(0, i - 2 - len), i - 2)
  }
  return script
}

function extractPubkey(script: Uint8Array): string | null {
  let i = 0
  while (i < script.length && script[i] !== 0x63) i++ // OP_IF
  i++
  if (i + 32 <= script.length) return bytesToHex(script.slice(i, i + 32))
  return null
}

function getOpcodeName(b: number): string {
  return OPCODE_NAMES[b] || `UNKNOWN_0x${b.toString(16)}`
}

function resolveWitnessData(vinCid: string | undefined, blocks: Map<string, { cid: any; bytes: Uint8Array; decoded: any }>): { opcode: string; commitTxid: string | null } {
  if (!vinCid) return { opcode: 'UNKNOWN', commitTxid: null }
  const vinEntry = blocks.get(vinCid)
  if (!vinEntry) return { opcode: 'UNKNOWN', commitTxid: null }
  const vinArray = vinEntry.decoded as any[]
  if (!vinArray.length) return { opcode: 'UNKNOWN', commitTxid: null }

  const v0Cid = vinArray[0]?.toString?.() || vinArray[0]?.('/')
  if (!v0Cid) return { opcode: 'UNKNOWN', commitTxid: null }
  const v0Entry = blocks.get(v0Cid)
  if (!v0Entry) return { opcode: 'UNKNOWN', commitTxid: null }

  const v0 = v0Entry.decoded
  let opcode = 'UNKNOWN'
  const witCid = v0.witness?.toString?.() || v0.witness?.('/')
  if (witCid) {
    const witEntry = blocks.get(witCid)
    if (witEntry) {
      const witArray = witEntry.decoded as any[]
      if (witArray.length > 1) {
        const w1Cid = witArray[1]?.toString?.() || witArray[1]?.('/')
        if (w1Cid) {
          const w1Entry = blocks.get(w1Cid)
          if (w1Entry) {
            const witnessScript = w1Entry.decoded as Uint8Array
            const lastPush = findLastPush(witnessScript)
            if (lastPush.length > 0) opcode = getOpcodeName(lastPush[0])
          }
        }
      }
    }
  }
  const commitTxid = v0.txid?.length > 0 ? bytesToHex(v0.txid) : null
  return { opcode, commitTxid }
}

main().catch(e => { console.error(e); process.exit(1) })
