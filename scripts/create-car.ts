#!/usr/bin/env bun
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname as pathDirname } from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { buildBlockCarFile, buildCarFile } from '../src/car.ts'
import type { ProcessedBlock } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DAG_DIR = resolve(ROOT, 'out', 'dag-nodes')
const OUT_DIR = resolve(ROOT, 'out', 'car')

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const positional = argv.filter((a, i) => !a.startsWith('-') && !['-t', '--thread', '--threads'].includes(argv[i - 1]))
const numeric = positional.filter(a => /^\d+$/.test(a))
const start = numeric[0] ? parseInt(numeric[0]) : null
const end = numeric[1] ? parseInt(numeric[1]) : null
const BLOCKS_DIR = resolve(OUT_DIR, 'blocks')
const RANGE_DIR = resolve(OUT_DIR, 'range')
const DAILY_DIR = resolve(OUT_DIR, 'daily')

if (!existsSync(DAG_DIR)) {
  console.error('No DAG nodes found. Run: bun run dag')
  process.exit(1)
}

console.log('Creating CAR file...\n')
console.log(`[init] out=${OUT_DIR} force=${force}`)

const t0 = Date.now()

interface DagIndex {
  blocks: { height: number; tacit_block: number; time: number; file: string; hash: string }[]
}

const dagIndex: DagIndex = JSON.parse(readFileSync(resolve(DAG_DIR, 'index.json'), 'utf8'))
const sortedBlocks = [...dagIndex.blocks]
  .filter(b => (start === null || b.height >= start) && (end === null || b.height <= end))
  .sort((a, b) => a.tacit_block - b.tacit_block)

function carMeta(file: string, blocks: typeof sortedBlocks, kind: 'block' | 'range' | 'daily') {
  return {
    kind,
    file: file.replace(`${OUT_DIR}/`, ''),
    tacit_from: Math.min(...blocks.map(b => b.tacit_block)),
    tacit_to: Math.max(...blocks.map(b => b.tacit_block)),
    btc_from: Math.min(...blocks.map(b => b.height)),
    btc_to: Math.max(...blocks.map(b => b.height)),
    day: kind === 'daily' ? utcDay(blocks[0].time) : undefined,
    blocks: blocks.length
  }
}

function carFileName(blocks: typeof sortedBlocks): string {
  const tacitFrom = Math.min(...blocks.map(b => b.tacit_block))
  const tacitTo = Math.max(...blocks.map(b => b.tacit_block))
  const btcFrom = Math.min(...blocks.map(b => b.height))
  const btcTo = Math.max(...blocks.map(b => b.height))
  if (blocks.length === 1) return `dag-tacit-${tacitFrom}-${btcFrom}.car`
  return `dag-tacit-${tacitFrom}-${tacitTo}-${btcFrom}-${btcTo}.car`
}

function writeCarFile(file: string, blocks: typeof sortedBlocks, mode: 'block' | 'range' = 'range') {
  if (!force && existsSync(file)) {
    console.log(`[skip]  CAR already exists: ${file}`)
    return carMeta(file, blocks, mode)
  }
  mkdirSync(dirname(file), { recursive: true })

  const procBlocks: ProcessedBlock[] = blocks.map(b => {
    const dagPath = resolve(DAG_DIR, b.file)
    const nodeData = JSON.parse(readFileSync(dagPath, 'utf8')) as {
      nodes: { key: string; cid: string; bytes_hex: string; node?: unknown }[]
      block: { cid: string; node?: { time: number } }
    }
    const cids = new Map<string, { cid: CID; bytes: Uint8Array; node?: unknown }>()
    let blockNode: unknown = null

    for (const entry of nodeData.nodes) {
      const bytes = Uint8Array.from(Buffer.from(entry.bytes_hex, 'hex'))
      const node = entry.key === 'block' ? dagCbor.decode(bytes) : null
      if (entry.key === 'block') blockNode = node
      cids.set(entry.key, { cid: CID.parse(entry.cid), bytes, node })
    }

    return {
      height: b.height,
      tacit_block: b.tacit_block,
      time: b.time ?? (blockNode as { time?: number })?.time ?? (nodeData.block?.node?.time),
      blockCid: CID.parse(nodeData.block.cid),
      cids
    } as unknown as ProcessedBlock
  })

  const carBytes = mode === 'block' ? buildBlockCarFile(procBlocks[0]) : buildCarFile(procBlocks)
  writeFileSync(file, carBytes)
  console.log(`  Created ${file} (${blocks.length} blocks, ${(carBytes.length / 1024 / 1024).toFixed(2)} MB)`)
  return carMeta(file, blocks, mode)
}

function utcDay(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 10)
}

function dirname(p: string): string {
  return pathDirname(p)
}

try {
  if (!sortedBlocks.length) throw new Error('No DAG blocks matched the requested range')
  mkdirSync(BLOCKS_DIR, { recursive: true })
  mkdirSync(RANGE_DIR, { recursive: true })
  mkdirSync(DAILY_DIR, { recursive: true })

  const from = Math.min(...sortedBlocks.map(b => b.height))
  const to = Math.max(...sortedBlocks.map(b => b.height))
  const carIndex = { version: 1, created: new Date().toISOString(), blocks: [] as ReturnType<typeof carMeta>[], range: [] as ReturnType<typeof carMeta>[], daily: [] as ReturnType<typeof carMeta>[] }

  for (const block of sortedBlocks) {
    const file = resolve(BLOCKS_DIR, carFileName([block]))
    const meta = writeCarFile(file, [block], 'block')
    if (meta) carIndex.blocks.push(meta)
  }

  const rangeMeta = writeCarFile(resolve(RANGE_DIR, carFileName(sortedBlocks)), sortedBlocks, 'range')
  if (rangeMeta) carIndex.range.push(rangeMeta)

  const daily = new Map<string, typeof sortedBlocks>()
  for (const block of sortedBlocks) {
    if (!Number.isFinite(block.time)) throw new Error(`Missing timestamp for block #${block.height}`)
    const day = utcDay(block.time)
    if (!daily.has(day)) daily.set(day, [])
    daily.get(day)!.push(block)
  }
  for (const [day, blocks] of daily) {
    const dailyMeta = writeCarFile(resolve(DAILY_DIR, day, carFileName(blocks)), blocks, 'daily' as 'block' | 'range')
    if (dailyMeta) carIndex.daily.push(dailyMeta)
  }

  writeFileSync(resolve(BLOCKS_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.blocks }, null, 2) + '\n')
  writeFileSync(resolve(RANGE_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.range }, null, 2) + '\n')
  writeFileSync(resolve(DAILY_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.daily }, null, 2) + '\n')
  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(carIndex, null, 2) + '\n')

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nCreated CAR outputs:`)
  console.log(`  Blocks: ${sortedBlocks.length}`)
  console.log(`  Range: ${from}-${to}`)
  console.log(`  Time: ${elapsed}s`)
} catch (e) {
  console.error(`\nFailed to create CAR: ${(e as Error).message}`)
  process.exit(1)
}
