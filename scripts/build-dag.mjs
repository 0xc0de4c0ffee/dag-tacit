#!/usr/bin/env node
// Build DAG-CBOR nodes from compact Tacit block artifacts
// Usage: node scripts/build-dag.mjs [start] [end] [--force]

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RAW_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const DAG_DIR = resolve(ROOT, 'out', 'dag-nodes')
mkdirSync(DAG_DIR, { recursive: true })
const argv = process.argv.slice(2)
const force = argv.includes('--force')
const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))
const start = positional[0] ? parseInt(positional[0]) : null
const end = positional[1] ? parseInt(positional[1]) : null

if (!existsSync(RAW_DIR)) {
  console.error('No tacit block artifacts found. Run: bun run fetch [start] [end]')
  process.exit(1)
}
if (!existsSync(resolve(RAW_DIR, 'index.json'))) {
  console.error('No tacit block index found. Run: bun run fetch [start] [end]')
  process.exit(1)
}

const { processBlock } = await import(resolve(ROOT, 'src/nodes.mjs'))
const { CID } = await import('multiformats/cid')

function jsonNode(value) {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  if (value instanceof CID) return value.toString()
  if (Array.isArray(value)) return value.map(jsonNode)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = jsonNode(v)
    return out
  }
  return value
}

console.log('Building DAG-CBOR nodes from Tacit block artifacts...\n')
console.log(`[init] out=${DAG_DIR} force=${force}`)

const t0 = Date.now()

// Load Tacit block index
const rawIndex = JSON.parse(readFileSync(resolve(RAW_DIR, 'index.json'), 'utf8'))
const sortedBlocks = [...rawIndex.blocks]
  .filter(b => (start === null || b.height >= start) && (end === null || b.height <= end))
  .sort((a, b) => a.height - b.height)

// Track tacit block index and previous CID
let tacitBlockIndex = 0
let prevBlockCid = null
const dagIndex = {
  version: 1,
  created: new Date().toISOString(),
  blocks: [],
  range: rawIndex.range,
  total_blocks: 0,
  total_envs: 0
}
const existingByHeight = new Map()

if (!force && existsSync(resolve(DAG_DIR, 'index.json'))) {
  const existing = JSON.parse(readFileSync(resolve(DAG_DIR, 'index.json'), 'utf8'))
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
    console.log(`[skip]  #${blockInfo.height} already built`)
    continue
  }
  
  if (!existsSync(blockPath)) {
    console.warn(`Missing block file: ${blockPath}`)
    continue
  }
  
  const block = JSON.parse(readFileSync(blockPath, 'utf8'))
  if (!block.tx && block.txs) {
    block.tx = block.txs
    block.nTx = block.tx_count ?? block.txs.length
  }
  
  // Process into DAG nodes
  const result = processBlock(block, tacitBlockIndex, prevBlockCid)
  
  if (!result) {
    console.warn(`Block #${blockInfo.height} has no valid Tacit transactions`)
    continue
  }
  
  const { blockCid, cids } = result
  
  // Write DAG nodes to subdir
  mkdirSync(dagSubdir, { recursive: true })
  
  const nodes = []
  for (const [key, entry] of cids) {
    nodes.push({
      key,
      cid: entry.cid.toString(),
      bytes_hex: Buffer.from(entry.bytes).toString('hex'),
      role: key === 'block' ? 'block' : key === 'txs' ? 'txs' : key.startsWith('tx-') ? 'tx' : key.startsWith('vin-') ? 'vin' : key.startsWith('vout-') ? 'vout' : 'unknown',
      txid: key.includes('-') ? key.slice(key.indexOf('-') + 1) : null,
      node: entry.node ? jsonNode(entry.node) : null
    })
  }

  const nodeData = {
    v: 1,
    height: blockInfo.height,
    hash: blockInfo.hash,
    tacit_block: tacitBlockIndex,
    tacit_tx_count: result.tacitTxCount,
    block: {
      cid: blockCid.toString(),
      bytes_hex: Buffer.from(cids.get('block').bytes).toString('hex'),
      node: jsonNode(cids.get('block').node)
    },
    txs: {
      cid: cids.get('txs').cid.toString(),
      bytes_hex: Buffer.from(cids.get('txs').bytes).toString('hex')
    },
    nodes,
    transactions: []
  }
  
  // Add tx nodes
  for (const [key, { cid, bytes }] of cids) {
    if (key.startsWith('tx-')) {
      nodeData.transactions.push({
        txid: key.slice(3),
        cid: cid.toString(),
        vinCid: cids.get(`vin-${key.slice(3)}`)?.cid.toString(),
        voutCid: cids.get(`vout-${key.slice(3)}`)?.cid.toString()
      })
    }
  }
  
  // Write node file
  writeFileSync(dagFile, JSON.stringify(nodeData, null, 2) + '\n')
  
  // Update index
  dagIndex.blocks.push({
    height: blockInfo.height,
    hash: blockInfo.hash,
    time: block.time,
    day,
    tacit_block: tacitBlockIndex,
    cid: blockCid.toString(),
    tacit_tx_count: result.tacitTxCount,
    file: `${day}/${dagFileName}`
  })
  
  dagIndex.total_blocks++
  dagIndex.total_envs += result.tacitTxCount
  
  // Update for next iteration
  prevBlockCid = blockCid
  tacitBlockIndex++
  
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  #${blockInfo.height} → ${blockCid.toString().slice(0, 20)}... (${result.tacitTxCount} txs, ${elapsed}s)`)
}

// Write DAG index
writeFileSync(resolve(DAG_DIR, 'index.json'), JSON.stringify(dagIndex, null, 2) + '\n')

console.log(`\nDone: ${dagIndex.total_blocks} DAG blocks, ${dagIndex.total_envs} envelopes`)
console.log(`Output: ${DAG_DIR}`)
