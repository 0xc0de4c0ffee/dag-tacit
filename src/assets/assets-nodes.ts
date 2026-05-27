import { encodeNode, link, bytesToHex } from '../lib/dag-cbor.ts'
import { SCHEMA_VERSION } from '../config.ts'
import type { Asset, AssetOp, CidMap } from '../types.ts'
import { CID } from 'multiformats/cid'

/** Build a DAG-CBOR Asset node */
export function buildAssetNode(asset: Asset): { cid: CID; bytes: Uint8Array } {
  const node = {
    asset_id: asset.asset_id,
    etch_txid: asset.etch_txid,
    ticker: asset.ticker,
    decimals: asset.decimals,
    commitment: asset.commitment,
    mint_authority: asset.mint_authority,
    image_uri: asset.image_uri,
    block_height: asset.block_height,
    time: asset.time,
    amount_ct: asset.amountCt,
  }
  return encodeNode(node)
}

/** Build a DAG-CBOR AssetOp node */
export function buildAssetOpNode(op: AssetOp): { cid: CID; bytes: Uint8Array } {
  const node: Record<string, unknown> = {
    txid: op.txid,
    opcode: op.opcode,
    block_height: op.block_height,
    time: op.time,
    payload: op.payload,
    asset_id: op.asset_id,
  }
  return encodeNode(node)
}

/** Build the complete asset index from accumulated assets and ops */
export function buildAssetIndex(
  assets: Asset[],
  ops: AssetOp[]
): { rootCid: CID; rootBytes: Uint8Array; cids: CidMap } {
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

  const indexNode = {
    v: SCHEMA_VERSION,
    assets: assets.length,
    ops: ops.length,
    asset_list: link(assetListCid),
    op_list: link(opListCid)
  }
  const { cid: rootCid, bytes: rootBytes } = encodeNode(indexNode)
  cids.set('root', { cid: rootCid, bytes: rootBytes, node: indexNode })

  return { rootCid, rootBytes, cids }
}
