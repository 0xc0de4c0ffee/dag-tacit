#!/usr/bin/env bun
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname as pathDirname } from 'path'
import { fileURLToPath } from 'url'
import * as dagCbor from '@ipld/dag-cbor'
import { processAssetBlock } from '../../src/assets/assets-block.ts'
import { hasTacitEnvelope } from '../../src/lib/envelope.ts'
import { bytesToHex } from '../../src/lib/dag-cbor.ts'
import { jsonNode, utcDay } from '../../src/lib/utils.ts'
import { flagValue, loadBlockFile } from '../utils.ts'
import type { BitcoinBlock } from '../../src/types.ts'

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const RAW_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const ASSET_DIR = resolve(ROOT, 'out', 'assets')
const ASSET_REL = 'out/assets'
mkdirSync(ASSET_DIR, { recursive: true })

const argv = process.argv.slice(2)
const force = argv.includes('--force')

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run assets:dag [options]

Build per-block asset DAG-CBOR JSON references from Tacit block artifacts.

Options:
  --from <height>    Starting BTC block height (default: all)
  --to <height>      Ending BTC block height (default: all)
  --force            Rebuild and overwrite existing files
  --help, -h         Show this help`)
  process.exit(0)
}

if (!existsSync(RAW_DIR)) {
  console.error('No tacit block artifacts found. Run: bun run fetch')
  process.exit(1)
}

const fromFlag = flagValue(argv, '--from')
const toFlag = flagValue(argv, '--to')
const start = fromFlag ? parseInt(fromFlag) : null
const end = toFlag ? parseInt(toFlag) : null

console.log('Building asset DAG-CBOR references...\n')
console.log(`[init] out=${ASSET_REL} force=${force}`)

const t0 = Date.now()

const rawIndex = existsSync(resolve(RAW_DIR, 'index.json'))
  ? (JSON.parse(readFileSync(resolve(RAW_DIR, 'index.json'), 'utf8')) as { blocks?: { height: number; file: string; time?: number; day?: string }[] }).blocks ?? []
  : []

const sortedBlocks = [...rawIndex].sort((a, b) => a.height - b.height)

// ── Pass 1: collect qualifying blocks ──
console.log('Pass 1: scanning for Tacit envelopes...\n')

interface QualifyingBlock {
  height: number
  time: number
  file: string
  day: string
  blockPath: string
  txs: Parameters<typeof processAssetBlock>[0]
}

const qualifyingBlocks: QualifyingBlock[] = []
for (const blockInfo of sortedBlocks) {
  if (start !== null && blockInfo.height < start) continue
  if (end !== null && blockInfo.height > end) continue

  const blockPath = resolve(RAW_DIR, blockInfo.file)
  if (!existsSync(blockPath)) {
    console.warn(`Missing block file: ${blockPath}`)
    continue
  }

  const block = loadBlockFile(blockPath)
  const txs = block.txs ?? (block as { tx?: unknown[] }).tx ?? []
  if (txs.length === 0) continue

  const hasTacit = txs.some((tx: unknown) => {
    const t = tx as { vin?: { txinwitness?: string[] }[] }
    const w = t.vin?.[0]?.txinwitness
    return w && hasTacitEnvelope(w)
  })

  if (hasTacit) {
    qualifyingBlocks.push({
      height: blockInfo.height,
      time: block.time ?? 0,
      file: blockInfo.file,
      day: utcDay(block.time ?? 0),
      blockPath,
      txs: txs as Parameters<typeof processAssetBlock>[0]
    })
  }
}

console.log(`Pass 1 done: ${qualifyingBlocks.length} blocks with Tacit envelopes\n`)

// ── Pass 2: build DAG JSON for each qualifying block ──
console.log('Pass 2: building per-block DAG-CBOR JSON...\n')

let skipped = 0

interface NodeEntry {
  key: string
  cid: string
  bytes_hex: string
  role: string
  node?: unknown
}

for (const qb of qualifyingBlocks) {
  const proc = processAssetBlock(qb.txs, qb.height, qb.time)
  if (!proc) continue

  const assetSubdir = resolve(ASSET_DIR, qb.day)
  mkdirSync(assetSubdir, { recursive: true })

  const assetFileName = `assets-${qb.height}.json`
  const assetFile = resolve(assetSubdir, assetFileName)

  if (!force && existsSync(assetFile)) {
    skipped++
    console.log(`  #${qb.height}  ${proc.assetCount} asset${proc.assetCount === 1 ? '' : 's'}, ${proc.opCount} op${proc.opCount === 1 ? '' : 's'}  (skipped)`)
    continue
  }

  const nodes: NodeEntry[] = []
  let blockNodeJson: unknown = null
  for (const [key, entry] of proc.assetCids) {
    const role = key === 'block' ? 'block' : key === 'asset-list' ? 'asset-list' : key === 'op-list' ? 'op-list' : key.startsWith('asset-') ? 'asset' : key.startsWith('op-') ? 'op' : 'unknown'
    const decoded = role === 'block' || role === 'asset' || role === 'op' ? dagCbor.decode(entry.bytes) : null
    const node = decoded ? jsonNode(decoded) : null
    nodes.push({
      key,
      cid: entry.cid.toString(),
      bytes_hex: bytesToHex(entry.bytes),
      role,
      node
    })
    if (key === 'block') blockNodeJson = node
  }

  const blockJson = {
    v: 1,
    height: qb.height,
    time: qb.time,
    asset_count: proc.assetCount,
    op_count: proc.opCount,
    block: {
      cid: proc.assetCids.get('block')!.cid.toString(),
      bytes_hex: bytesToHex(proc.assetCids.get('block')!.bytes),
      node: blockNodeJson
    },
    nodes
  }
  writeFileSync(assetFile, JSON.stringify(blockJson, null, 2) + '\n')

  console.log(`  #${qb.height}  ${proc.assetCount} asset${proc.assetCount === 1 ? '' : 's'}, ${proc.opCount} op${proc.opCount === 1 ? '' : 's'}`)
}

if (skipped > 0) console.log(`\nSkipped ${skipped} existing blocks (use --force to rebuild)`)

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone: ${qualifyingBlocks.length - skipped} blocks processed (${elapsed}s)`)
console.log(`Output: ${ASSET_REL}`)
