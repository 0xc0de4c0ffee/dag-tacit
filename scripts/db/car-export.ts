#!/usr/bin/env bun
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './client.ts'
import * as s from './schema.ts'
import { eq, sql } from 'drizzle-orm'
import { processBlock } from '../../src/blocks/blocks-nodes.ts'
import { buildBlockCarFile } from '../../src/blocks/blocks-car.ts'
import { CID } from 'multiformats/cid'
import { utcDay } from '../../src/lib/utils.ts'
import type { BitcoinBlock } from '../../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const argv = process.argv.slice(2)
const fromFlag = argv.includes('--from') ? parseInt(argv[argv.indexOf('--from') + 1]) : 0
const toFlag = argv.includes('--to') ? parseInt(argv[argv.indexOf('--to') + 1]) : 0
const force = argv.includes('--force')
const outDir = (() => {
  const i = argv.indexOf('--out-dir')
  return i >= 0 ? resolve(argv[i + 1]) : resolve(ROOT, 'out', 'sqlite')
})()
const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')
const BLOCKS_DIR = resolve(ROOT, 'out', 'tacit-blocks')
const CAR_DIR = resolve(outDir, 'car', 'blocks')

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run db:car-export [options]

Export indexed blocks from DB to CAR files.

Options:
  --from <height>    Starting BTC block height
  --to <height>      Ending BTC block height
  --out-dir <path>   Output directory (default: out/)
  --force            Overwrite existing CAR files
  --help, -h         Show this help`)
  process.exit(0)
}

if (!existsSync(DB_PATH)) { console.error('Run "bun run db:import" first'); process.exit(1) }
if (!existsSync(BLOCKS_DIR)) { console.error('Raw tacit-block JSON not found at', BLOCKS_DIR); process.exit(1) }

const db = openDb(DB_PATH)

// Get blocks from DB
const allBlocks = db.select().from(s.blocks)
  .orderBy(s.blocks.height).all() as any[]

let filtered = allBlocks
if (fromFlag) filtered = filtered.filter((b: any) => b.height >= fromFlag)
if (toFlag) filtered = filtered.filter((b: any) => b.height <= toFlag)
if (!filtered.length) { console.log('No blocks match range'); process.exit(0) }

console.log(`Exporting ${filtered.length} blocks to CAR`)
const logEvery = Math.max(1, Math.floor(filtered.length / 20))
let built = 0, skipped = 0
let prevBlockCid: CID | null = null
const t0 = Date.now()

for (const block of filtered) {
  if ((built + skipped) % logEvery === 0) console.log(`  #${block.height} (${built + skipped}/${filtered.length})`)
  const day = utcDay(block.time)
  const carSubdir = resolve(CAR_DIR, day)
  mkdirSync(carSubdir, { recursive: true })

  // Find the raw tacit-block JSON
  const idxFile = resolve(BLOCKS_DIR, 'index.json')
  const idx = JSON.parse(readFileSync(idxFile, 'utf8')) as { blocks: { height: number; file: string; tacit_count: number }[] }
  const entry = idx.blocks.find((b: any) => b.height === block.height)
  if (!entry || entry.tacit_count === 0) {
    skipped++
    continue
  }

  const rawPath = resolve(BLOCKS_DIR, entry.file)
  if (!existsSync(rawPath)) { skipped++; continue }
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'))

  // Normalize: fetch.ts uses { txs, tx_count } but processBlock expects { tx, nTx }
  const bitcoinBlock: BitcoinBlock = {
    height: raw.height,
    hash: raw.hash,
    previousblockhash: raw.previousblockhash || null,
    time: raw.time,
    nTx: raw.tx_count,
    tx: raw.txs,
  }

  // Get tacit block index counter
  const tacitBlock = db.select({ c: sql<number>`COUNT(*)` })
    .from(s.blocks)
    .where(sql`${s.blocks.height} <= ${block.height}`)
    .get() as any

  const processed = processBlock(bitcoinBlock, (tacitBlock?.c || 1) - 1, prevBlockCid)
  if (!processed) { skipped++; continue }

  const carBytes = buildBlockCarFile(processed)
  const carFile = resolve(carSubdir, `dag-tacit-${processed.blockCid.toString().slice(0, 8)}-${block.height}.car`)

  if (!force && existsSync(carFile)) { skipped++; continue }

  writeFileSync(carFile, carBytes)
  prevBlockCid = processed.blockCid
  built++
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`Done: ${built} CARs, ${skipped} skipped in ${elapsed}s → ${CAR_DIR}`)
