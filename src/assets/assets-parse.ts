import { sha256 } from '@noble/hashes/sha256'
import { hexToBytes, deriveAssetId } from '../lib/dag-cbor.ts'
import { extractTacitPayload } from '../lib/envelope.ts'
import { OPCODES_INFO } from '../config.ts'
import type { BitcoinTx, Asset, AssetOp, TPetchParams } from '../types.ts'

/** Parse a CETCH payload into an Asset record */
export function parseCetchPayload(
  txid: string,
  payload: Uint8Array,
  blockHeight: number,
  time: number
): Asset | null {
  if (payload.length < 1 + 1 + 1 + 33 + 8 + 2 + 32) return null
  let offset = 1 // skip opcode

  const tickerLen = payload[offset++]
  if (tickerLen < 1 || tickerLen > 16 || offset + tickerLen > payload.length) return null
  const ticker = new TextDecoder().decode(payload.slice(offset, offset + tickerLen))
  offset += tickerLen

  if (offset + 1 > payload.length) return null
  const decimals = payload[offset++]
  if (decimals > 8) return null

  if (offset + 33 > payload.length) return null
  const commitment = payload.slice(offset, offset + 33)
  offset += 33

  if (offset + 8 > payload.length) return null
  const amountCt = payload.slice(offset, offset + 8)
  offset += 8

  if (offset + 2 > payload.length) return null
  const rpLen = payload[offset] | (payload[offset + 1] << 8)
  offset += 2
  if (offset + rpLen > payload.length) return null
  offset += rpLen // skip rangeproof

  if (offset + 32 > payload.length) return null
  const mintAuthority = payload.slice(offset, offset + 32)
  offset += 32

  let imageUri = ''
  if (offset + 2 <= payload.length) {
    const imgLen = payload[offset] | (payload[offset + 1] << 8)
    offset += 2
    if (imgLen > 0 && offset + imgLen <= payload.length) {
      imageUri = new TextDecoder().decode(payload.slice(offset, offset + imgLen))
    }
  }

  const etchTxid = hexToBytes(txid) // RPC display order (big-endian hex, for display only)
  const assetId = deriveAssetId(txid) // wire format (LE bytes + 4-byte LE vout) per SPEC §4

  return {
    asset_id: assetId,
    etch_txid: etchTxid,
    ticker,
    decimals,
    commitment,
    mint_authority: mintAuthority,
    image_uri: imageUri,
    block_height: blockHeight,
    time,
    amountCt,
  }
}

/** Extract asset_id from a non-CETCH payload (first 32 bytes after opcode) */
export function extractAssetId(payload: Uint8Array): Uint8Array | null {
  if (payload.length < 1 + 32) return null
  return payload.slice(1, 33)
}

/** Parse a Tacit tx into an AssetOp record */
export function parseAssetOp(
  tx: BitcoinTx,
  opcode: string,
  payload: Uint8Array,
  blockHeight: number,
  time: number
): AssetOp {
  const isCetch = opcode === OPCODES_INFO.CETCH.name
  const assetId = isCetch ? null : extractAssetId(payload)
  return {
    txid: hexToBytes(tx.txid),
    opcode,
    asset_id: assetId,
    block_height: blockHeight,
    time,
    payload
  }
}

/** Parse a T_PETCH payload into cap/mint params */
export function parseTPetchPayload(payload: Uint8Array): (TPetchParams & { ticker: string; decimals: number; mintStartHeight: number; mintEndHeight: number; imageUri: string }) | null {
  if (payload.length < 1 + 1 + 1 + 8 + 8) return null
  let offset = 1 // skip opcode
  const tickerLen = payload[offset++]
  if (tickerLen < 1 || tickerLen > 16 || offset + tickerLen + 1 + 8 + 8 > payload.length) return null
  const ticker = new TextDecoder().decode(payload.slice(offset, offset + tickerLen))
  offset += tickerLen
  const decimals = payload[offset++]
  if (decimals > 8) return null
  if (offset + 16 + 4 + 4 > payload.length) return null
  const capAmount = new DataView(payload.slice(offset, offset + 8).buffer).getBigUint64(0, true)
  offset += 8
  const mintLimit = new DataView(payload.slice(offset, offset + 8).buffer).getBigUint64(0, true)
  offset += 8
  if (capAmount <= 0 || mintLimit <= 0) return null
  if (Number(capAmount) % Number(mintLimit) !== 0) return null
  const mintStartHeight = new DataView(payload.slice(offset, offset + 4).buffer).getUint32(0, true)
  offset += 4
  const mintEndHeight = new DataView(payload.slice(offset, offset + 4).buffer).getUint32(0, true)
  offset += 4
  // kernel_sig(32) — skip for now; not stored in DB
  offset += 32
  let imageUri = ''
  if (offset + 2 <= payload.length) {
    const imgLen = payload[offset] | (payload[offset + 1] << 8)
    offset += 2
    if (imgLen > 0 && offset + imgLen <= payload.length) {
      imageUri = new TextDecoder().decode(payload.slice(offset, offset + imgLen))
    }
  }
  return { cap_amount: Number(capAmount), mint_limit: Number(mintLimit), ticker, decimals, mintStartHeight, mintEndHeight, imageUri }
}

/** Process a block's Tacit transactions and extract Assets + AssetOps */
export function processBlockAssets(
  txs: BitcoinTx[],
  blockHeight: number,
  time: number
): { assets: Asset[]; ops: AssetOp[] } {
  const assets: Asset[] = []
  const ops: AssetOp[] = []

  for (const tx of txs) {
    const result = extractTacitPayload(tx)
    if (!result.ok) continue
    const op = parseAssetOp(tx, result.opcode, result.payload, blockHeight, time)
    ops.push(op)

    if (result.opcode === OPCODES_INFO.CETCH.name) {
      const asset = parseCetchPayload(tx.txid, result.payload, blockHeight, time)
      if (asset) assets.push(asset)
    } else if (result.opcode === OPCODES_INFO.T_PETCH.name && result.payload.length > 1) {
      // For T_PETCH, create a minimal Asset record (no commitment/mint_authority)
      const assetId = deriveAssetId(tx.txid)
      const params = parseTPetchPayload(result.payload)
      if (params) {
        assets.push({
          asset_id: assetId,
          etch_txid: hexToBytes(tx.txid),
          ticker: params.ticker,
          decimals: params.decimals,
          commitment: new Uint8Array(33),
          mint_authority: new Uint8Array(32),
          image_uri: params.imageUri || '',
          block_height: blockHeight,
          time,
          amountCt: new Uint8Array(8),
        })
      }
    }
  }

  return { assets, ops }
}
