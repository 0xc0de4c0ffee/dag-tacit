#!/usr/bin/env bun
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname as pathDirname } from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import { createCarEntry, assembleCarFile } from '../../src/lib/car.ts'
import { hexToBytes } from '../../src/lib/dag-cbor.ts'
import { flagValue } from '../utils.ts'

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const ASSET_DIR = resolve(ROOT, 'out', 'assets')
const CAR_DIR = resolve(ROOT, 'out', 'assets', 'car')
const ASSET_REL = 'out/assets/car'
mkdirSync(CAR_DIR, { recursive: true })

const argv = process.argv.slice(2)
const force = argv.includes('--force')

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run assets:car [options]

Build per-block asset CAR files from DAG-CBOR JSON references.

Options:
  --from <height>    Starting BTC block height (default: all)
  --to <height>      Ending BTC block height (default: all)
  --force            Rebuild and overwrite existing files
  --help, -h         Show this help`)
  process.exit(0)
}

const fromFlag = flagValue(argv, '--from')
const toFlag = flagValue(argv, '--to')
const start = fromFlag ? parseInt(fromFlag) : null
const end = toFlag ? parseInt(toFlag) : null

console.log('Building asset CAR files...\n')
console.log(`[init] out=${ASSET_REL} force=${force}`)

const t0 = Date.now()

function findBlockJsonFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'car') {
      files.push(...findBlockJsonFiles(path))
    } else if (entry.name.endsWith('.json') && entry.name.startsWith('assets-')) {
      files.push(path)
    }
  }
  return files
}

const jsonFiles = findBlockJsonFiles(ASSET_DIR).sort()
let built = 0
let skipped = 0

for (const jsonFile of jsonFiles) {
  const match = jsonFile.match(/assets-(\d+)\.json$/)
  if (!match) continue
  const height = parseInt(match[1])

  if (start !== null && height < start) continue
  if (end !== null && height > end) continue

  const data = JSON.parse(readFileSync(jsonFile, 'utf8')) as {
    height: number
    time: number
    asset_count: number
    op_count: number
    block: { cid: string; bytes_hex: string }
    nodes: { key: string; cid: string; bytes_hex: string; role: string }[]
  }

  const day = new Date(data.time * 1000).toISOString().slice(0, 10)
  const carSubdir = resolve(CAR_DIR, day)
  mkdirSync(carSubdir, { recursive: true })
  const carFile = resolve(carSubdir, `assets-${height}.car`)

  if (!force && existsSync(carFile)) {
    skipped++
    console.log(`  #${height}  CAR  (skipped)`)
    continue
  }

  const entries: Uint8Array[] = []
  const written = new Set<string>()

  const rootCid = CID.parse(data.block.cid)
  entries.push(createCarEntry(rootCid, hexToBytes(data.block.bytes_hex)))
  written.add(data.block.cid)

  for (const node of data.nodes) {
    if (written.has(node.cid)) continue
    entries.push(createCarEntry(CID.parse(node.cid), hexToBytes(node.bytes_hex)))
    written.add(node.cid)
  }

  const carBytes = assembleCarFile(rootCid, entries)
  writeFileSync(carFile, carBytes)

  built++
  console.log(`  #${height}  CAR  (${data.asset_count} assets, ${data.op_count} ops)`)
}

if (skipped > 0) console.log(`\nSkipped ${skipped} existing blocks (use --force to rebuild)`)

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone: ${built} CAR files built (${elapsed}s)`)
console.log(`Output: ${ASSET_REL}`)
