import { encodeNode, link, bytesToHex } from '../lib/dag-cbor.ts'
import { buildAssetNode, buildAssetOpNode } from './assets-nodes.ts'
import { processBlockAssets } from './assets-parse.ts'
import { createCarEntry, assembleCarFile } from '../lib/car.ts'
import { SCHEMA_VERSION } from '../config.ts'
import type { BitcoinTx, CidMap, ProcessedAssetBlock } from '../types.ts'
import { CID } from 'multiformats/cid'

/** Process a single block's Tacit txs into a ProcessedAssetBlock with DAG-CBOR nodes */
export function processAssetBlock(
  txs: BitcoinTx[],
  blockHeight: number,
  time: number
): ProcessedAssetBlock | null {
  const { assets, ops } = processBlockAssets(txs, blockHeight, time)
  if (assets.length === 0 && ops.length === 0) return null

  const cids: CidMap = new Map()
  const assetCids: CID[] = []
  for (const asset of assets) {
    const { cid, bytes } = buildAssetNode(asset)
    cids.set(`asset-${bytesToHex(asset.asset_id)}`, { cid, bytes })
    assetCids.push(cid)
  }

  const opCids: CID[] = []
  for (const op of ops) {
    const { cid, bytes } = buildAssetOpNode(op)
    cids.set(`op-${bytesToHex(op.txid)}`, { cid, bytes })
    opCids.push(cid)
  }

  const { cid: assetListCid, bytes: assetListBytes } = encodeNode(assetCids)
  cids.set('asset-list', { cid: assetListCid, bytes: assetListBytes })

  const { cid: opListCid, bytes: opListBytes } = encodeNode(opCids)
  cids.set('op-list', { cid: opListCid, bytes: opListBytes })

  const blockNode = {
    v: SCHEMA_VERSION,
    height: blockHeight,
    time,
    assets: link(assetListCid),
    ops: link(opListCid)
  }
  const { cid: blockCid, bytes: blockBytes } = encodeNode(blockNode)
  cids.set('block', { cid: blockCid, bytes: blockBytes, node: blockNode })

  return {
    height: blockHeight,
    time,
    assetCids: cids,
    assetListCid,
    opListCid,
    assetCount: assets.length,
    opCount: ops.length
  }
}

/** Build a per-block asset CAR file from a ProcessedAssetBlock */
export function buildAssetBlockCarFile(proc: ProcessedAssetBlock): Uint8Array {
  const entries: Uint8Array[] = []
  const written = new Set<string>()

  const block = proc.assetCids.get('block')!
  entries.push(createCarEntry(block.cid, block.bytes))
  written.add(block.cid.toString())

  for (const [, { cid, bytes }] of proc.assetCids) {
    if (written.has(cid.toString())) continue
    entries.push(createCarEntry(cid, bytes))
    written.add(cid.toString())
  }

  return assembleCarFile(block.cid, entries)
}
