#!/usr/bin/env node
// Create CAR file from DAG nodes
// Usage: node scripts/create-car.mjs [start] [end] [--force]

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
  console.error('No DAG nodes found. Run: bun run build')
  process.exit(1)
}

const { buildBlockCarFile, buildCarFile } = await import(resolve(ROOT, 'src/car.mjs'))
const { CID } = await import('multiformats/cid')
const dagCbor = await import('@ipld/dag-cbor')

console.log('Creating CAR file...\n')
console.log(`[init] out=${OUT_DIR} force=${force}`)

const t0 = Date.now()

// Load DAG index
const dagIndex = JSON.parse(readFileSync(resolve(DAG_DIR, 'index.json'), 'utf8'))
const sortedBlocks = [...dagIndex.blocks]
  .filter(b => (start === null || b.height >= start) && (end === null || b.height <= end))
  .sort((a, b) => a.tacit_block - b.tacit_block)

function carMeta(file, blocks, kind) {
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

function carFileName(blocks) {
  const tacitFrom = Math.min(...blocks.map(b => b.tacit_block))
  const tacitTo = Math.max(...blocks.map(b => b.tacit_block))
  const btcFrom = Math.min(...blocks.map(b => b.height))
  const btcTo = Math.max(...blocks.map(b => b.height))
  if (blocks.length === 1) return `dag-tacit-${tacitFrom}-${btcFrom}.car`
  return `dag-tacit-${tacitFrom}-${tacitTo}-${btcFrom}-${btcTo}.car`
}

function writeCarFile(file, blocks, mode = 'range') {
  if (!force && existsSync(file)) {
    console.log(`[skip]  CAR already exists: ${file}`)
    return carMeta(file, blocks, mode)
  }
  mkdirSync(dirname(file), { recursive: true })
  const carBytes = mode === 'block' ? buildBlockCarFile(blocks[0]) : buildCarFile(blocks)
  writeFileSync(file, carBytes)
  console.log(`  Created ${file} (${blocks.length} blocks, ${(carBytes.length / 1024 / 1024).toFixed(2)} MB)`)
  return carMeta(file, blocks, mode)
}

function utcDay(time) {
  return new Date(time * 1000).toISOString().slice(0, 10)
}

// Collect all processed blocks with their CIDs
const processedBlocks = []

for (const blockInfo of sortedBlocks) {
  const dagPath = resolve(DAG_DIR, blockInfo.file)
  
  if (!existsSync(dagPath)) {
    console.warn(`Missing DAG file: ${dagPath}`)
    continue
  }
  
  const nodeData = JSON.parse(readFileSync(dagPath, 'utf8'))
  const cids = new Map()
  let blockNode = null

  for (const entry of nodeData.nodes) {
    const bytes = Uint8Array.from(Buffer.from(entry.bytes_hex, 'hex'))
    const node = entry.key === 'block' ? dagCbor.decode(bytes) : null
    if (entry.key === 'block') blockNode = node
    cids.set(entry.key, {
      cid: CID.parse(entry.cid),
      bytes,
      node
    })
  }

  const blockCid = CID.parse(nodeData.block.cid)

  processedBlocks.push({
    height: blockInfo.height,
    tacit_block: blockInfo.tacit_block,
    time: blockInfo.time ?? blockNode?.time ?? nodeData.block?.node?.time,
    blockCid,
    cids
  })
  
  console.log(`  Loaded block #${blockInfo.height} (${blockInfo.tacit_block}) → ${blockCid.toString().slice(0, 20)}...`)
}

try {
  if (!processedBlocks.length) throw new Error('No DAG blocks matched the requested range')
  mkdirSync(BLOCKS_DIR, { recursive: true })
  mkdirSync(RANGE_DIR, { recursive: true })
  mkdirSync(DAILY_DIR, { recursive: true })
  
  const from = Math.min(...processedBlocks.map(b => b.height))
  const to = Math.max(...processedBlocks.map(b => b.height))
  const carIndex = { version: 1, created: new Date().toISOString(), blocks: [], range: [], daily: [] }
  
  for (const block of processedBlocks) {
    const file = resolve(BLOCKS_DIR, carFileName([block]))
    const meta = writeCarFile(file, [block], 'block')
    if (meta) carIndex.blocks.push(meta)
  }
  
  const rangeMeta = writeCarFile(resolve(RANGE_DIR, carFileName(processedBlocks)), processedBlocks, 'range')
  if (rangeMeta) carIndex.range.push(rangeMeta)
  
  const daily = new Map()
  for (const block of processedBlocks) {
    if (!Number.isFinite(block.time)) throw new Error(`Missing timestamp for block #${block.height}`)
    const day = utcDay(block.time)
    if (!daily.has(day)) daily.set(day, [])
    daily.get(day).push(block)
  }
  for (const [day, blocks] of daily) {
    const dailyMeta = writeCarFile(resolve(DAILY_DIR, day, carFileName(blocks)), blocks, 'daily')
    if (dailyMeta) carIndex.daily.push(dailyMeta)
  }
  writeFileSync(resolve(BLOCKS_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.blocks }, null, 2) + '\n')
  writeFileSync(resolve(RANGE_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.range }, null, 2) + '\n')
  writeFileSync(resolve(DAILY_DIR, 'index.json'), JSON.stringify({ version: 1, created: carIndex.created, cars: carIndex.daily }, null, 2) + '\n')
  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(carIndex, null, 2) + '\n')
  
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nCreated CAR outputs:`)
  console.log(`  Blocks: ${processedBlocks.length}`)
  console.log(`  Range: ${from}-${to}`)
  console.log(`  Time: ${elapsed}s`)
} catch (e) {
  console.error(`\nFailed to create CAR: ${e.message}`)
  process.exit(1)
}
