#!/usr/bin/env bun
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { processBlock } from '../../src/blocks/blocks-nodes.ts'
import { bytesToHex } from '../../src/lib/dag-cbor.ts'
import { jsonNode, utcDay } from '../../src/lib/utils.ts'
import { flagValue } from '../utils.ts'
import type { ProcessedBlock, BitcoinBlock } from '../../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const RAW_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const DAG_DIR = resolve(ROOT, 'out', 'dag-nodes')
const DEBUG_DIR = resolve(ROOT, 'out', 'debug')
const DAG_REL = 'out/dag-nodes'
const DEBUG_REL = 'out/debug'
mkdirSync(DAG_DIR, { recursive: true })
mkdirSync(DEBUG_DIR, { recursive: true })

const argv = process.argv.slice(2)
const force = argv.includes('--force')


if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run dag [options]

Build DAG-CBOR JSON files from fetched Tacit block artifacts.
For debugging and testing only — NOT required for CAR production.
CAR files can be built directly via: bun run fetch --car

Options:
  --from <height>    Starting BTC block height (default: all)
  --to <height>      Ending BTC block height (default: all)
  --force            Rebuild and overwrite existing DAG nodes
  --help, -h         Show this help`)
  process.exit(0)
}

const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))
const fromFlag = flagValue(argv, '--from')
const toFlag = flagValue(argv, '--to')
const start = fromFlag ? parseInt(fromFlag) : (positional[0] ? parseInt(positional[0]) : null)
const end = toFlag ? parseInt(toFlag) : (positional[1] ? parseInt(positional[1]) : null)

if (!existsSync(RAW_DIR)) {
  console.error('No tacit block artifacts found. Run: bun run fetch')
  process.exit(1)
}
if (!existsSync(resolve(RAW_DIR, 'index.json'))) {
  console.error('No tacit block index found. Run: bun run fetch')
  process.exit(1)
}


console.log('Building DAG-CBOR nodes from Tacit block artifacts...\n')
console.log(`[init] out=${DAG_REL} force=${force}`)

const t0 = Date.now()

interface RawBlockIndex {
  blocks: { height: number; hash: string; time: number; file: string }[]
  range?: [number, number]
}

const rawIndex: RawBlockIndex = JSON.parse(readFileSync(resolve(RAW_DIR, 'index.json'), 'utf8'))
const sortedBlocks = [...rawIndex.blocks]
  .filter(b => (start === null || b.height >= start) && (end === null || b.height <= end))
  .sort((a, b) => a.height - b.height)

interface DagIndexBlock {
  height: number
  hash: string
  time: number
  tacit_block: number
  cid: string
  tacit_tx_count: number
  file: string
}

interface DagIndex {
  version: number
  blocks: DagIndexBlock[]
  range?: [number, number]
  total_blocks: number
  total_envs: number
  total_debug: number
}

let tacitBlockIndex = 0
let prevBlockCid: CID | null = null
const dagIndex: DagIndex = {
  version: 1,
  blocks: [],
  range: rawIndex.range,
  total_blocks: 0,
  total_envs: 0,
  total_debug: 0
}
const existingByHeight = new Map<number, DagIndexBlock>()

if (!force && existsSync(resolve(DAG_DIR, 'index.json'))) {
  const existing: DagIndex = JSON.parse(readFileSync(resolve(DAG_DIR, 'index.json'), 'utf8'))
  for (const b of existing.blocks) existingByHeight.set(b.height, b)
  dagIndex.blocks = existing.blocks.filter(b => !sortedBlocks.some(x => x.height === b.height))
  dagIndex.total_blocks = dagIndex.blocks.length
  dagIndex.total_envs = dagIndex.blocks.reduce((s, b) => s + (b.tacit_tx_count ?? 0), 0)
  dagIndex.total_debug = existing.total_debug ?? 0
  tacitBlockIndex = dagIndex.blocks.length
  if (dagIndex.blocks.length) {
    const lastExisting = [...dagIndex.blocks].sort((a, b) => a.tacit_block - b.tacit_block).at(-1)
    prevBlockCid = lastExisting?.cid ? CID.parse(lastExisting.cid) : null
  }
}

let skipped = 0

for (const blockInfo of sortedBlocks) {
  const blockPath = resolve(RAW_DIR, blockInfo.file)
  const day = utcDay(blockInfo.time)
  const dagSubdir = resolve(DAG_DIR, day)
  const dagFileName = `dag-tacit-${tacitBlockIndex}-${blockInfo.height}.json`
  const dagFile = resolve(dagSubdir, dagFileName)

  if (!force && existsSync(dagFile)) {
    const existingBlock = existingByHeight.get(blockInfo.height)
    if (existingBlock) {
      dagIndex.blocks.push(existingBlock)
      dagIndex.total_blocks++
      dagIndex.total_envs += existingBlock.tacit_tx_count ?? 0
      tacitBlockIndex = Math.max(tacitBlockIndex, existingBlock.tacit_block + 1)
      prevBlockCid = existingBlock.cid ? CID.parse(existingBlock.cid) : prevBlockCid
    }
    skipped++
    continue
  }

  if (!existsSync(blockPath)) {
    console.warn(`Missing block file: ${blockPath}`)
    continue
  }

  const block = JSON.parse(readFileSync(blockPath, 'utf8')) as { height: number; hash: string; previousblockhash?: string | null; time: number; tx?: unknown[]; txs?: unknown[]; tx_count?: number; nTx?: number; debug_txs?: { txid: string; error: string; witness_hex: string }[] }
  if (!block.tx && block.txs) {
    (block as { tx: unknown[] }).tx = block.txs
    ;(block as { nTx: number }).nTx = block.tx_count ?? block.txs.length
  }

  const result = processBlock(block as BitcoinBlock, tacitBlockIndex, prevBlockCid)

  if (!result) {
    console.warn(`Block #${blockInfo.height} has no valid Tacit transactions`)
    continue
  }

  const { blockCid, cids } = result

  mkdirSync(dagSubdir, { recursive: true })

  interface NodeEntry {
    key: string
    cid: string
    bytes_hex: string
    role: string
    txid: string | null
    node: unknown
  }

  interface TxRef {
    txid: string
    cid: string
    vinCid?: string
    voutCid?: string
  }

  const nodes: NodeEntry[] = []
  let blockNode: unknown = null
  for (const [key, entry] of cids) {
    nodes.push({
      key,
      cid: entry.cid.toString(),
      bytes_hex: bytesToHex(entry.bytes),
      role: key === 'block' ? 'block' : key === 'txs' ? 'txs' : key.startsWith('tx-') ? 'tx' : key.startsWith('vin-') ? 'vin' : key.startsWith('vout-') ? 'vout' : 'unknown',
      txid: key.includes('-') ? key.slice(key.indexOf('-') + 1) : null,
      node: 'node' in entry ? jsonNode(entry.node) : null
    })
    if (key === 'block') {
      blockNode = jsonNode(dagCbor.decode(entry.bytes))
    }
  }

  const nodeData = {
    v: 1,
    height: blockInfo.height,
    hash: blockInfo.hash,
    tacit_block: tacitBlockIndex,
    tacit_tx_count: result.tacitTxCount,
    block: {
      cid: blockCid.toString(),
      bytes_hex: bytesToHex(cids.get('block')!.bytes),
      node: blockNode
    },
    txs: {
      cid: cids.get('txs')!.cid.toString(),
      bytes_hex: bytesToHex(cids.get('txs')!.bytes)
    },
    nodes,
    transactions: [] as TxRef[]
  }

  for (const [key, { cid }] of cids) {
    if (key.startsWith('tx-')) {
      nodeData.transactions.push({
        txid: key.slice(3),
        cid: cid.toString(),
        vinCid: cids.get(`vin-${key.slice(3)}`)?.cid.toString(),
        voutCid: cids.get(`vout-${key.slice(3)}`)?.cid.toString()
      })
    }
  }

  writeFileSync(dagFile, JSON.stringify(nodeData, null, 2) + '\n')

  // Write debug metadata for txs that passed magic but failed deeper validation
  const debugTxs = block.debug_txs ?? []
  if (debugTxs.length > 0) {
    const debugFile = resolve(DEBUG_DIR, `${blockInfo.height}-debug.json`)
    writeFileSync(debugFile, JSON.stringify({
      hash: blockInfo.hash,
      txs: debugTxs
    }, null, 2) + '\n')
    const logPath = resolve(DEBUG_DIR, 'debug.log')
    const logLines = debugTxs.map(d =>
      `${new Date().toISOString()} #${blockInfo.height} txid=${d.txid} error=${d.error} witness_hex=${d.witness_hex.slice(0, 40)}${d.witness_hex.length > 40 ? '...' : ''}`
    ).join('\n') + '\n'
    const existingLog = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
    writeFileSync(logPath, existingLog + logLines)
    dagIndex.total_debug += debugTxs.length
  }

  dagIndex.blocks.push({
    height: blockInfo.height,
    hash: blockInfo.hash,
    time: blockInfo.time,
    tacit_block: tacitBlockIndex,
    cid: blockCid.toString(),
    tacit_tx_count: result.tacitTxCount,
    file: `${day}/${dagFileName}`
  })

  dagIndex.total_blocks++
  dagIndex.total_envs += result.tacitTxCount

  prevBlockCid = blockCid
  tacitBlockIndex++

  const totalTxs = (block as { nTx: number }).nTx
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  #${blockInfo.height} → ${blockCid.toString()} (${result.tacitTxCount} tacit / ${totalTxs} total txs, ${elapsed}s)`)
}

dagIndex.blocks.sort((a, b) => a.tacit_block - b.tacit_block)
writeFileSync(resolve(DAG_DIR, 'index.json'), JSON.stringify(dagIndex, null, 2) + '\n')

if (skipped) console.log(`[skip]  ${skipped} blocks already built`)
console.log(`\nDone: ${dagIndex.total_blocks} DAG blocks, ${dagIndex.total_envs} envelopes, ${dagIndex.total_debug} debug txs`)
console.log(`Output: ${DAG_REL}`)
if (dagIndex.total_debug > 0) console.log(`Debug:  ${DEBUG_REL}`)
