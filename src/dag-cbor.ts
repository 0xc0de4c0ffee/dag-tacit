import { CID } from 'multiformats/cid'
import { create as createMultihashDigest } from 'multiformats/hashes/digest'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from '@noble/hashes/sha256'
import type { EncodedNode } from './types.ts'

const DAG_CBOR_CODE = 0x71
const RAW_CODE = 0x55
const SHA256_CODE = 0x12

/**
 * Encode a value to DAG-CBOR and compute its CID (v1, SHA-256)
 */
export function encodeNode(value: unknown): EncodedNode {
  const bytes = dagCbor.encode(value)
  const hash = sha256(bytes)
  const cid = CID.create(1, DAG_CBOR_CODE, createMultihashDigest(SHA256_CODE, hash))
  return { cid, bytes }
}

/**
 * Create a CID link (tagged for CBOR)
 */
export function link(cid: CID): CID {
  return cid
}

/**
 * Create a raw CID (v1, raw multicodec 0x55, identity multihash 0x00)
 * where the digest is the raw bytes themselves prefixed with length.
 */
export function rawCid(bytes: Uint8Array): CID {
  return CID.create(1, RAW_CODE, createMultihashDigest(0x00, bytes))
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const x of bytes) s += x.toString(16).padStart(2, '0')
  return s
}

/**
 * Convert BTC value to satoshis per SPEC Section 9:
 * satoshis = max(0, floor(btc * 1e8 + 0.5))
 */
export function btcToSatoshis(btc: number): number {
  return Math.max(0, Math.floor(btc * 1e8 + 0.5))
}

/**
 * Pad bytes to exact length (for hash fields)
 */
export function padBytes(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length > length) throw new Error(`bytes too long: ${bytes.length} > ${length}`)
  const padded = new Uint8Array(length)
  padded.set(bytes, length - bytes.length)
  return padded
}
