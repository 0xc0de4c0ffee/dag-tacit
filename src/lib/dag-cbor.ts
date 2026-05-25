import { CID } from 'multiformats/cid'
import { create as createMultihashDigest } from 'multiformats/hashes/digest'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from '@noble/hashes/sha256'
import type { EncodedNode } from '../types.ts'
import { DAG_CBOR_CODE, SHA256_CODE } from '../config.ts'

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


