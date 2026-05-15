#!/usr/bin/env bun
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from '../src/config.ts'
import { createBitcoinRpcClient, fetchVerboseBlock } from '../src/rpc.ts'
import { extractTacitPayload, witnessHasTacitMagicHex } from '../src/envelope.ts'
import type { BitcoinBlock, BitcoinTx } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const OUT_REL = 'out/tacit-blocks'
mkdirSync(OUT_DIR, { recursive: true })

const config = loadConfig()
const START_HEIGHT = config.startHeight
const argv = process.argv.slice(2)
const force = argv.includes('--force')

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run fetch [options]

Fetch Bitcoin blocks via RPC, filter Tacit transactions, and store artifacts.

Options:
  --from <height>    Starting BTC block height (default: resume from index or genesis ${START_HEIGHT})
  --to <height>      Ending BTC block height (default: chain tip)
  --force            Re-fetch and overwrite existing blocks
  -t, --threads N    Concurrency (default: 5)
  --help, -h         Show this help`)
  process.exit(0)
}

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

const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))

if (!config.bitcoinRpcUrl || config.bitcoinRpcUrl.includes('YOUR_KEY')) {
  console.error('Error: BITCOIN_RPC_URL not configured')
  console.error('Copy .env.example to .env and set your RPC URL, or set BITCOIN_RPC_URL environment variable')
  process.exit(1)
}

const CONCURRENCY = Math.max(1, parseInt(flagValue('-t', '--thread', '--threads') || '5'))
const rpc = createBitcoinRpcClient(config.bitcoinRpcUrl)
let active = 0

function payloadHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function utcDay(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 10)
}

function tacitBlockFile(tacitBlock: number, height: number): string {
  return `dag-tacit-${tacitBlock}-${height}.json`
}

interface FetchedBlock {
  height: number
  hash: string
  previousblockhash: string | null
  time: number
  tx_count: number
  tacit_count: number
  txs: BitcoinTx[]
}

async function fetchBlock(height: number): Promise<FetchedBlock | null> {
  const tFetch = Date.now()
  active++
  console.log(`[fetch] #${height} getblock start active=${active}`)
  try {
    const block = await fetchVerboseBlock(rpc, height)
    console.log(`[fetch] #${height} getblock done: ${block.nTx} txs in ${((Date.now() - tFetch) / 1000).toFixed(2)}s active=${active}`)

    const tScan = Date.now()
    const tacitTxs: BitcoinTx[] = []
    let candidates = 0
    for (let txIndex = 0; txIndex < block.tx.length; txIndex++) {
      const tx = block.tx[txIndex]
      const witnessHex = tx.vin?.[0]?.txinwitness?.[1]
      if (!witnessHex || !witnessHasTacitMagicHex(witnessHex)) continue
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
        } as BitcoinTx)
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

const fromFlag = flagValue('--from')
const toFlag = flagValue('--to')
const start = fromFlag ? parseInt(fromFlag) : (positional[0] ? parseInt(positional[0]) : 0)
const tip = await rpc('getblockcount') as number
const end = toFlag ? parseInt(toFlag) : (positional[1] ? parseInt(positional[1]) : tip)

let resume = start
if (!start) {
  const idxPath = resolve(OUT_DIR, 'index.json')
  if (existsSync(idxPath)) {
    const idx = JSON.parse(readFileSync(idxPath, 'utf8')) as { last_processed?: number }
    resume = (idx.last_processed ?? START_HEIGHT - 1) + 1
    console.log(`Resume from #${resume} (tip: #${tip}, last: #${idx.last_processed})`)
  } else {
    resume = START_HEIGHT
    console.log(`Starting from Tacit genesis height #${START_HEIGHT}`)
  }
}

// Reorg check: verify tip hash, walk back only on mismatch (runs before early-exit)
const idxFilePath = resolve(OUT_DIR, 'index.json')
if (existsSync(idxFilePath)) {
  const idx = JSON.parse(readFileSync(idxFilePath, 'utf8')) as IndexData
  if (idx.blocks.length > 0) {
    const reorgDepth = config.reorgDepth
    const sorted = [...idx.blocks].sort((a, b) => a.height - b.height)
    const lastBlock = sorted[sorted.length - 1]
    const lastHeight = lastBlock.height
    const checkFrom = Math.max(START_HEIGHT, lastHeight - reorgDepth + 1)
    if (checkFrom <= lastHeight) {
      const storedByHeight = new Map(sorted.map(b => [b.height, b]))
      const tipHash = await rpc('getblockhash', [lastHeight]) as string

      if (tipHash !== lastBlock.hash) {
        console.log(`\n[reorg] tip #${lastHeight} (tacit ${lastBlock.tacit_block}) hash mismatch — walking back`)
        let cutoff = lastHeight
        for (let h = lastHeight - 1; h >= checkFrom; h--) {
          const rpcHash = await rpc('getblockhash', [h]) as string
          const stored = storedByHeight.get(h)
          if (stored && stored.hash === rpcHash) {
            cutoff = h + 1
            break
          }
          cutoff = h
        }
        console.log(`[reorg] fork at #${cutoff - 1}, removing ${lastHeight - cutoff + 1} blocks from #${cutoff}`)

        const removed = idx.blocks.filter(b => b.height >= cutoff)

        // Clean tacit-blocks
        for (const rb of removed) {
          const fp = resolve(OUT_DIR, rb.file)
          if (existsSync(fp)) rmSync(fp)
        }

        // Clean dag-nodes
        const dagIdxPath = resolve(ROOT, 'out', 'dag-nodes', 'index.json')
        if (existsSync(dagIdxPath)) {
          const dagIdx = JSON.parse(readFileSync(dagIdxPath, 'utf8')) as { blocks: { height: number; file: string }[] }
          const dagRemoved = dagIdx.blocks.filter(b => b.height >= cutoff)
          for (const dr of dagRemoved) {
            const fp = resolve(ROOT, 'out', 'dag-nodes', dr.file)
            if (existsSync(fp)) rmSync(fp)
          }
          dagIdx.blocks = dagIdx.blocks.filter(b => b.height < cutoff)
          writeFileSync(dagIdxPath, JSON.stringify(dagIdx, null, 2) + '\n')
        }

        // Clean car blocks (per-day index structure)
        const carIdxPath = resolve(ROOT, 'out', 'car', 'blocks', 'index.json')
        if (existsSync(carIdxPath)) {
          const carIdx = JSON.parse(readFileSync(carIdxPath, 'utf8')) as { days?: Record<string, string>; cars?: { btc_from: number; file: string }[] }
          if (carIdx.days) {
            const remaining: Record<string, string> = {}
            for (const [day, relPath] of Object.entries(carIdx.days)) {
              const dayIdxPath = resolve(ROOT, 'out', 'car', 'blocks', relPath)
              if (existsSync(dayIdxPath)) {
                const dayIdx = JSON.parse(readFileSync(dayIdxPath, 'utf8')) as { cars: { height: number; file: string }[] }
                const kept = dayIdx.cars.filter(c => c.height < cutoff)
                const carRemoved = dayIdx.cars.filter(c => c.height >= cutoff)
                for (const cr of carRemoved) {
                  const fp = resolve(ROOT, 'out', 'car', 'blocks', day, cr.file)
                  if (existsSync(fp)) rmSync(fp)
                }
                if (kept.length) {
                  dayIdx.cars = kept
                  writeFileSync(dayIdxPath, JSON.stringify(dayIdx, null, 2) + '\n')
                  remaining[day] = relPath
                } else {
                  rmSync(dayIdxPath)
                }
              }
            }
            carIdx.days = remaining
            writeFileSync(carIdxPath, JSON.stringify(carIdx, null, 2) + '\n')
          } else if (carIdx.cars) {
            const carRemoved = carIdx.cars.filter(c => c.btc_from >= cutoff)
            for (const cr of carRemoved) {
              const fp = resolve(ROOT, 'out', 'car', cr.file)
              if (existsSync(fp)) rmSync(fp)
            }
            carIdx.cars = carIdx.cars.filter(c => c.btc_from < cutoff)
            writeFileSync(carIdxPath, JSON.stringify(carIdx, null, 2) + '\n')
          }
        }

        // Clean car range/daily indices
        for (const sub of ['range', 'daily']) {
          const subIdx = resolve(ROOT, 'out', 'car', sub, 'index.json')
          if (existsSync(subIdx)) rmSync(subIdx)
        }

        idx.blocks = idx.blocks.filter(b => b.height < cutoff)
        idx.last_processed = cutoff - 1
        idx.total_blocks = idx.blocks.length
        idx.total_envs = idx.blocks.reduce((s, b) => s + (b.tacit_count ?? 0), 0)
        writeFileSync(idxFilePath, JSON.stringify(idx, null, 2) + '\n')
        if (resume > cutoff) resume = cutoff
        console.log(`[reorg] reset to #${cutoff}, removed ${removed.length} tacit blocks`)
      }
    }
  }
}

if (resume > end) {
  console.log(`Already at tip (#${resume} > #${end}). Nothing to do.`)
  process.exit(0)
}

console.log(`\nFetching ${resume} → ${end} (${end - resume + 1} blocks, ${CONCURRENCY}x concurrency)\n`)
console.log(`[init] network=${config.bitcoinNetwork} out=${OUT_REL} force=${force}`)

const heights = Array.from({ length: end - resume + 1 }, (_, i) => resume + i)
let idx = 0, done = 0, last = resume - 1
const t0 = Date.now()
const seen = new Set<number>()
const processed = new Set<number>()

interface IndexData {
  created: string
  blocks: { tacit_block: number; height: number; hash: string; time: number; day: string; tacit_count: number; file: string }[]
  total_envs: number
  last_processed?: number
  elapsed?: string
  processed_heights?: number[]
  range?: [number, number]
  total_blocks?: number
  opcodes?: Record<string, number>
}

function loadIndex(): IndexData {
  const f = resolve(OUT_DIR, 'index.json')
  if (!existsSync(f)) return { created: new Date().toISOString(), blocks: [], total_envs: 0 }
  return JSON.parse(readFileSync(f, 'utf8'))
}

function saveIndex(idxData: IndexData, h: number): void {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  idxData.blocks.sort((a, b) => a.height - b.height)
  for (let i = 0; i < idxData.blocks.length; i++) idxData.blocks[i].tacit_block = i
  const hs = idxData.blocks.map(b => b.height)
  idxData.range = hs.length ? [Math.min(...hs), Math.max(...hs)] : [0, 0]
  idxData.total_blocks = idxData.blocks.length
  idxData.total_envs = idxData.blocks.reduce((s, b) => s + (b.tacit_count ?? 0), 0)
  idxData.last_processed = h
  idxData.elapsed = elapsed
  idxData.processed_heights = [...processed].sort((a, b) => a - b)
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
const completed = new Map<number, { result: FetchedBlock | null; error?: Error }>()
let nextCommit = resume

function commitReady(): void {
  while (completed.has(nextCommit)) {
    const { result: r, error } = completed.get(nextCommit)!
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
      const op = (tx as unknown as { _tacit?: { opcode: string } })._tacit?.opcode
      if (op) index.opcodes![op] = (index.opcodes![op] || 0) + 1
    }

    saveIndex(index, last)

    const opcodes: Record<string, number> = {}
    for (const tx of r.txs) {
      const op = (tx as unknown as { _tacit?: { opcode: string } })._tacit?.opcode || 'UNKNOWN'
      opcodes[op] = (opcodes[op] || 0) + 1
    }
    const opSummary = Object.entries(opcodes).map(([op, n]) => `${n}x${op}`).join(',')
    const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1)
    console.log(`  #${nextCommit}  ${r.tacit_count} envs  ${opSummary}  ${rate} blk/s`)
    nextCommit++
  }
}

let fetchSkipped = 0

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (true) {
    const i = idx++
    if (i >= heights.length) return
    const h = heights[i]

    if (!force && seen.has(h)) {
      done++
      fetchSkipped++
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
      completed.set(h, { result: null, error: e as Error })
      commitReady()
    }
  }
}))

saveIndex(index, last)
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
if (fetchSkipped) console.log(`[skip]  ${fetchSkipped} blocks already indexed`)
console.log(`\nDone: ${index.total_blocks} blocks, ${index.total_envs} envs, ${elapsed}s`)
console.log(`Output: ${OUT_REL}`)
