#!/usr/bin/env node
// Fetch Bitcoin blocks with Tacit transactions and save as raw JSON
// Per dag-tacit SPEC Section 4: Tacit transaction inclusion
// Usage: node scripts/fetch-blocks.mjs [start] [end] [--force]

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from '../src/config.mjs'
import { createBitcoinRpcClient, fetchVerboseBlock } from '../src/rpc.mjs'
import { extractTacitPayload, witnessHasTacitMagicHex } from '../src/envelope.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'out', 'tacit-blocks')
mkdirSync(OUT_DIR, { recursive: true })

const config = loadConfig(ROOT)
const START_HEIGHT = config.startHeight
const argv = process.argv.slice(2)
const force = argv.includes('--force')
function flagValue(...names) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    for (const name of names) {
      if (arg === name) return argv[i + 1]
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
    }
  }
  return null
}
const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))

if (!config.bitcoinRpcUrl || config.bitcoinRpcUrl.includes('YOUR_KEY')) {
  console.error('Error: BITCOIN_RPC_URL not configured')
  console.error('Copy .env.example to .env and set your RPC URL, or set BITCOIN_RPC_URL environment variable')
  process.exit(1)
}

const CONCURRENCY = Math.max(1, parseInt(flagValue('-t', '--thread', '--threads') || '5'))
const rpc = createBitcoinRpcClient(config.bitcoinRpcUrl)
let active = 0

function payloadHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

function utcDay(time) {
  return new Date(time * 1000).toISOString().slice(0, 10)
}

function tacitBlockFile(tacitBlock, height) {
  return `dag-tacit-${tacitBlock}-${height}.json`
}

async function fetchBlock(height) {
  const tFetch = Date.now()
  active++
  console.log(`[fetch] #${height} getblock start active=${active}`)
  try {
    const block = await fetchVerboseBlock(rpc, height)
    console.log(`[fetch] #${height} getblock done: ${block.nTx} txs in ${((Date.now() - tFetch) / 1000).toFixed(2)}s active=${active}`)
    
    // Filter and extract valid Tacit transactions with opcodes
    const tScan = Date.now()
    const tacitTxs = []
    let candidates = 0
    for (let txIndex = 0; txIndex < block.tx.length; txIndex++) {
      const tx = block.tx[txIndex]
      const witnessHex = tx.vin?.[0]?.txinwitness?.[1]
      if (!witnessHasTacitMagicHex(witnessHex)) continue
      candidates++
      const result = extractTacitPayload(tx)
      if (result.ok) {
        tacitTxs.push({
          tx_index: txIndex,
          txid: tx.txid,
          hash: tx.hash,
          version: tx.version ?? 0,
          size: tx.size ?? 0,
          weight: tx.weight ?? 0,
          locktime: tx.locktime ?? 0,
          fee: tx.fee ?? 0,
          vin: (tx.vin ?? []).map(v => ({
            txid: v.txid ?? '',
            vout: v.vout ?? 0,
            coinbase: v.coinbase,
            scriptSig: v.scriptSig ? { asm: v.scriptSig.asm ?? '', hex: v.scriptSig.hex ?? '' } : undefined,
            txinwitness: v.txinwitness ?? [],
            sequence: v.sequence ?? 0,
            prevout: v.prevout ? {
              value: v.prevout.value ?? 0,
              scriptPubKey: {
                asm: v.prevout.scriptPubKey?.asm ?? '',
                hex: v.prevout.scriptPubKey?.hex ?? '',
                type: v.prevout.scriptPubKey?.type ?? '',
                address: v.prevout.scriptPubKey?.address
              }
            } : undefined
          })),
          vout: (tx.vout ?? []).map(o => ({
            value: o.value ?? 0,
            n: o.n ?? 0,
            scriptPubKey: {
              asm: o.scriptPubKey?.asm ?? '',
              hex: o.scriptPubKey?.hex ?? '',
              type: o.scriptPubKey?.type ?? '',
              address: o.scriptPubKey?.address,
              addresses: o.scriptPubKey?.addresses
            }
          })),
          _tacit: {
            opcode: result.opcode,
            payload_hex: payloadHex(result.payload)
          }
        })
      }
    }
    console.log(`[scan]  #${height} candidates=${candidates} tacit=${tacitTxs.length} in ${((Date.now() - tScan) / 1000).toFixed(2)}s`)
    
    if (!tacitTxs.length) return null
    
    return {
      height,
      hash: block.hash,
      previousblockhash: block.previousblockhash || null,
      time: block.time,
      tx_count: block.nTx,
      tacit_count: tacitTxs.length,
      txs: tacitTxs
    }
  } finally {
    active--
  }
}

// Determine start and end
const start = parseInt(positional[0] || '0')
const tip = await rpc('getblockcount')
const end = parseInt(positional[1] || String(tip))

let resume = start
if (!start) {
  const idxFile = resolve(OUT_DIR, 'index.json')
  if (existsSync(idxFile)) {
    const idx = JSON.parse(readFileSync(idxFile, 'utf8'))
    resume = idx.last_processed + 1
    console.log(`Resume from #${resume} (tip: #${tip}, last: #${idx.last_processed})`)
  } else {
    resume = START_HEIGHT
    console.log(`Starting from Tacit genesis height #${START_HEIGHT}`)
  }
}

if (resume > end) {
  console.log(`Already at tip (#${resume} > #${end}). Nothing to do.`)
  process.exit(0)
}

console.log(`\nFetching ${resume} → ${end} (${end - resume + 1} blocks, ${CONCURRENCY}x concurrency)\n`)
console.log(`[init] network=${config.bitcoinNetwork} out=${OUT_DIR} force=${force}`)

const heights = Array.from({ length: end - resume + 1 }, (_, i) => resume + i)
let idx = 0, done = 0, last = resume - 1
const t0 = Date.now()
const seen = new Set()
const processed = new Set()

function loadIndex() {
  const f = resolve(OUT_DIR, 'index.json')
  if (!existsSync(f)) return { created: new Date().toISOString(), blocks: [], total_envs: 0 }
  return JSON.parse(readFileSync(f, 'utf8'))
}

function saveIndex(idxData, h) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  idxData.blocks.sort((a, b) => a.height - b.height)
  for (let i = 0; i < idxData.blocks.length; i++) idxData.blocks[i].tacit_block = i
  const hs = idxData.blocks.map(b => b.height)
  idxData.range = hs.length ? [Math.min(...hs), Math.max(...hs)] : [0, 0]
  idxData.total_blocks = idxData.blocks.length
  idxData.total_envs = idxData.blocks.reduce((s, b) => s + (b.tacit_count ?? b.txs ?? 0), 0)
  idxData.last_processed = h
  idxData.elapsed = elapsed
  idxData.processed_heights = [...processed].sort((a, b) => a - b)
  
  // Track opcode stats
  idxData.opcodes = idxData.opcodes || {}
  
  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(idxData, null, 2) + '\n')
}

let index = loadIndex()
if (force) {
  index.blocks = index.blocks.filter(b => b.height < resume || b.height > end)
  index.processed_heights = (index.processed_heights || []).filter(h => h < resume || h > end)
  index.opcodes = {}
}
for (const b of index.blocks) seen.add(b.height)
for (const b of index.blocks) processed.add(b.height)
for (const h of index.processed_heights || []) {
  seen.add(h)
  processed.add(h)
}
index.opcodes = index.opcodes || {}
const completed = new Map()
let nextCommit = resume

function commitReady() {
  while (completed.has(nextCommit)) {
    const { result: r, error } = completed.get(nextCommit)
    completed.delete(nextCommit)
    last = nextCommit
    processed.add(nextCommit)
    
    if (error) {
      console.error(`  #${nextCommit} FAILED: ${error.message}`)
      nextCommit++
      continue
    }
    
    if (!r) {
      saveIndex(index, last)
      const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1)
      console.log(`[empty] #${nextCommit} no tacit txs (${done}/${heights.length}) ${rate} blk/s`)
      nextCommit++
      continue
    }
    
    const tacitBlock = index.blocks.length
    const day = utcDay(r.time)
    const fileName = tacitBlockFile(tacitBlock, nextCommit)
    const subdirPath = resolve(OUT_DIR, day)
    mkdirSync(subdirPath, { recursive: true })
    writeFileSync(resolve(subdirPath, fileName), JSON.stringify(r, null, 2) + '\n')
    index.blocks.push({
      tacit_block: tacitBlock,
      height: nextCommit,
      hash: r.hash,
      time: r.time,
      day,
      tacit_count: r.tacit_count,
      file: `${day}/${fileName}`
    })
    seen.add(nextCommit)
    
    for (const tx of r.txs) {
      const op = tx._tacit?.opcode
      if (op) index.opcodes[op] = (index.opcodes[op] || 0) + 1
    }
    
    saveIndex(index, last)
    
    const opcodes = {}
    for (const tx of r.txs) {
      const op = tx._tacit?.opcode || 'UNKNOWN'
      opcodes[op] = (opcodes[op] || 0) + 1
    }
    const opSummary = Object.entries(opcodes).map(([op, n]) => `${n}x${op}`).join(',')
    const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1)
    console.log(`  #${nextCommit}  ${r.tacit_count} envs  ${opSummary}  ${rate} blk/s`)
    nextCommit++
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (true) {
    const i = idx++
    if (i >= heights.length) return
    const h = heights[i]
    
    // Skip if already in index
    if (!force && seen.has(h)) {
      done++
      console.log(`[skip]  #${h} already indexed (${done}/${heights.length})`)
      completed.set(h, { result: null })
      commitReady()
      continue
    }
    
    try {
      const r = await fetchBlock(h)
      done++
      completed.set(h, { result: r })
      commitReady()
    } catch (e) {
      done++
      completed.set(h, { result: null, error: e })
      commitReady()
    }
  }
}))

saveIndex(index, last)
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone: ${index.total_blocks} blocks, ${index.total_envs} envs, ${elapsed}s`)
console.log(`Output: ${OUT_DIR}`)
