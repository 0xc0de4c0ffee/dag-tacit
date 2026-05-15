#!/usr/bin/env bun
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { processBlock } from '../src/nodes.ts'
import type { ProcessedBlock, BitcoinBlock } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RAW_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const DAG_DIR = resolve(ROOT, 'out', 'dag-nodes')
const DAG_REL = 'out/dag-nodes'
mkdirSync(DAG_DIR, { recursive: true })

const argv = process.argv.slice(2)
const force = argv.includes('--force')

function flagValue(...names: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    for (const name of names) {
      if (arg === name) return argv[i + 1]
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
    }
  }
  return null
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run dag [options]

Build DAG-CBOR nodes from fetched Tacit block artifacts.

Options:
  --from <height>    Starting BTC block height (default: all)
  --to <height>      Ending BTC block height (default: all)
  --force            Rebuild and overwrite existing DAG nodes
  --help, -h         Show this help`)
  process.exit(0)
}

const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))
const fromFlag = flagValue('--from')
const toFlag = flagValue('--to')
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

function jsonNode(value: unknown): unknown {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  if (value instanceof CID) return value.toString()
  if (Array.isArray(value)) return value.map(jsonNode)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = jsonNode(v)
    return out
  }
  return value
}

console.log('Building DAG-CBOR nodes from Tacit block artifacts...\n')
console.log(`[init] out=${DAG_REL} force=${force}`)

const t0 = Date.now()

interface RawBlockIndex {
  blocks: { height: number; hash: string; time: number; file: string; day?: string }[]
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
  day: string
  tacit_block: number
  cid: string
  tacit_tx_count: number
  file: string
}

interface DagIndex {
  version: number
  created: string
  blocks: DagIndexBlock[]
  range?: [number, number]
  total_blocks: number
  total_envs: number
}

let tacitBlockIndex = 0
let prevBlockCid: CID | null = null
const dagIndex: DagIndex = {
  version: 1,
  created: new Date().toISOString(),
  blocks: [],
  range: rawIndex.range,
  total_blocks: 0,
  total_envs: 0
}
const existingByHeight = new Map<number, DagIndexBlock>()

if (!force && existsSync(resolve(DAG_DIR, 'index.json'))) {
  const existing: DagIndex = JSON.parse(readFileSync(resolve(DAG_DIR, 'index.json'), 'utf8'))
  for (const b of existing.blocks) existingByHeight.set(b.height, b)
  dagIndex.blocks = existing.blocks.filter(b => !sortedBlocks.some(x => x.height === b.height))
  dagIndex.total_blocks = dagIndex.blocks.length
  dagIndex.total_envs = dagIndex.blocks.reduce((s, b) => s + (b.tacit_tx_count ?? 0), 0)
  tacitBlockIndex = dagIndex.blocks.length
  if (dagIndex.blocks.length) {
    const lastExisting = [...dagIndex.blocks].sort((a, b) => a.tacit_block - b.tacit_block).at(-1)
    prevBlockCid = lastExisting?.cid ? CID.parse(lastExisting.cid) : null
  }
}

let skipped = 0

for (const blockInfo of sortedBlocks) {
  const blockPath = resolve(RAW_DIR, blockInfo.file)
  const day = blockInfo.day || new Date(blockInfo.time * 1000).toISOString().slice(0, 10)
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

  const block = JSON.parse(readFileSync(blockPath, 'utf8')) as { tx?: unknown[]; txs?: unknown[]; tx_count?: number; nTx?: number }
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
      bytes_hex: Buffer.from(entry.bytes).toString('hex'),
      role: key === 'block' ? 'block' : key === 'txs' ? 'txs' : key.startsWith('tx-') ? 'tx' : key.startsWith('vin-') ? 'vin' : key.startsWith('vout-') ? 'vout' : 'unknown',
      txid: key.includes('-') ? key.slice(key.indexOf('-') + 1) : null,
      node: 'node' in entry ? jsonNode(entry.node) : null
    })
    if (key === 'block') {
      blockNode = dagCbor.decode(entry.bytes)
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
      bytes_hex: Buffer.from(cids.get('block')!.bytes).toString('hex'),
      node: blockNode
    },
    txs: {
      cid: cids.get('txs')!.cid.toString(),
      bytes_hex: Buffer.from(cids.get('txs')!.bytes).toString('hex')
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

  dagIndex.blocks.push({
    height: blockInfo.height,
    hash: blockInfo.hash,
    time: blockInfo.time,
    day,
    tacit_block: tacitBlockIndex,
    cid: blockCid.toString(),
    tacit_tx_count: result.tacitTxCount,
    file: `${day}/${dagFileName}`
  })

  dagIndex.total_blocks++
  dagIndex.total_envs += result.tacitTxCount

  prevBlockCid = blockCid
  tacitBlockIndex++

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  #${blockInfo.height} → ${blockCid.toString().slice(0, 20)}... (${result.tacitTxCount} txs, ${elapsed}s)`)
}

dagIndex.blocks.sort((a, b) => a.tacit_block - b.tacit_block)
writeFileSync(resolve(DAG_DIR, 'index.json'), JSON.stringify(dagIndex, null, 2) + '\n')

if (skipped) console.log(`[skip]  ${skipped} blocks already built`)
console.log(`\nDone: ${dagIndex.total_blocks} DAG blocks, ${dagIndex.total_envs} envelopes`)
console.log(`Output: ${DAG_REL}`)
