#!/usr/bin/env bun
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname as pathDirname } from 'path'
import { fileURLToPath } from 'url'
import { buildAssetIndex } from '../../src/assets/assets-nodes.ts'
import { hexToBytes, bytesToHex } from '../../src/lib/dag-cbor.ts'
import { flagValue } from '../utils.ts'
import type { Asset, AssetOp } from '../../src/types.ts'

const __dirname = pathDirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const ASSET_DIR = resolve(ROOT, 'out', 'assets')

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run assets:build [options]
Build unified asset index from per-block DAG-CBOR JSON references.
Options:
  --from <height>    Starting BTC block height (default: all)
  --to <height>      Ending BTC block height (default: all)
  --help, -h         Show this help`)
  process.exit(0)
}

const fromFlag = flagValue(argv, '--from')
const toFlag = flagValue(argv, '--to')
const start = fromFlag ? parseInt(fromFlag) : null
const end = toFlag ? parseInt(toFlag) : null

console.log('Building unified asset index...\n')
const t0 = Date.now()

function findJsonFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'car') {
      files.push(...findJsonFiles(path))
    } else if (entry.name.endsWith('.json') && entry.name.startsWith('assets-')) {
      files.push(path)
    }
  }
  return files
}

const jsonFiles = findJsonFiles(ASSET_DIR).sort()
const allAssets: Asset[] = []
const allOps: AssetOp[] = []
const assetBlockIndex: { height: number; time: number; file: string; car: string; assets: number; ops: number }[] = []

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
    nodes: { role: string; node?: Record<string, unknown> }[]
  }
  const day = new Date(data.time * 1000).toISOString().slice(0, 10)

  for (const node of data.nodes) {
    if (!node.node) continue
    const n = node.node
    if (node.role === 'asset') {
      allAssets.push({
        asset_id: hexToBytes(n.asset_id as string),
        etch_txid: hexToBytes(n.etch_txid as string),
        ticker: n.ticker as string,
        decimals: n.decimals as number,
        commitment: hexToBytes(n.commitment as string),
        mint_authority: hexToBytes(n.mint_authority as string),
        image_uri: n.image_uri as string,
        block_height: n.block_height as number,
        time: n.time as number,
      })
    } else if (node.role === 'op') {
      allOps.push({
        txid: hexToBytes(n.txid as string),
        opcode: n.opcode as string,
        asset_id: n.asset_id ? hexToBytes(n.asset_id as string) : null,
        block_height: n.block_height as number,
        time: n.time as number,
        payload: hexToBytes(n.payload as string),
      })
    }
  }

  assetBlockIndex.push({
    height: data.height,
    time: data.time,
    file: `${day}/assets-${height}.json`,
    car: `${day}/assets-${height}.car`,
    assets: data.asset_count,
    ops: data.op_count
  })
  console.log(`  #${height}  ${data.asset_count} asset${data.asset_count === 1 ? '' : 's'}, ${data.op_count} op${data.op_count === 1 ? '' : 's'}`)
}

if (allAssets.length === 0 && allOps.length === 0) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nDone: no assets or ops found (${elapsed}s)`)
  console.log('Output: out/assets')
  process.exit(0)
}

const { rootCid } = buildAssetIndex(allAssets, allOps)

const assetIndex = {
  assets: allAssets.map(a => ({
    asset_id: bytesToHex(a.asset_id),
    etch_txid: bytesToHex(a.etch_txid),
    ticker: a.ticker,
    decimals: a.decimals,
    commitment: bytesToHex(a.commitment),
    mint_authority: bytesToHex(a.mint_authority),
    image_uri: a.image_uri,
    block_height: a.block_height,
    time: a.time
  })),
  ops: allOps.map(o => ({
    txid: bytesToHex(o.txid),
    opcode: o.opcode,
    asset_id: o.asset_id ? bytesToHex(o.asset_id) : null,
    block_height: o.block_height,
    time: o.time,
    payload: bytesToHex(o.payload)
  })),
  blocks: assetBlockIndex
}

writeFileSync(resolve(ASSET_DIR, 'index.json'), JSON.stringify(assetIndex, null, 2) + '\n')

const opsByAsset = new Map<string, AssetOp[]>()
for (const op of allOps) {
  if (!op.asset_id) continue
  const id = bytesToHex(op.asset_id)
  if (!opsByAsset.has(id)) opsByAsset.set(id, [])
  opsByAsset.get(id)!.push(op)
}

for (const asset of allAssets) {
  const id = bytesToHex(asset.asset_id)
  const assetOps = opsByAsset.get(id) ?? []
  writeFileSync(resolve(ASSET_DIR, `${id}.json`), JSON.stringify({
    asset: {
      asset_id: id,
      etch_txid: bytesToHex(asset.etch_txid),
      ticker: asset.ticker,
      decimals: asset.decimals,
      commitment: bytesToHex(asset.commitment),
      mint_authority: bytesToHex(asset.mint_authority),
      image_uri: asset.image_uri,
      block_height: asset.block_height,
      time: asset.time
    },
    ops: assetOps.map(o => ({
      txid: bytesToHex(o.txid),
      opcode: o.opcode,
      block_height: o.block_height,
      time: o.time,
      payload: bytesToHex(o.payload)
    }))
  }, null, 2) + '\n')
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone: ${allAssets.length} assets, ${allOps.length} ops, ${assetBlockIndex.length} blocks (${elapsed}s)`)
console.log('Output: out/assets')
console.log(`Index CID: ${rootCid.toString()}`)
