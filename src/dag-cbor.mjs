// DAG-CBOR encoding utilities for dag-tacit
// Implements Section 3 of the dag-tacit SPEC

import { CID } from 'multiformats/cid'
import { create as createMultihashDigest } from 'multiformats/hashes/digest'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from '@noble/hashes/sha256'

// Multicodec codes
const DAG_CBOR_CODE = 0x71
const SHA256_CODE = 0x12

/**
 * Encode a value to DAG-CBOR and compute its CID (v1, SHA-256)
 * @param {any} value - The value to encode
 * @returns {{ cid: CID, bytes: Uint8Array }} - The CID and encoded bytes
 */
export function encodeNode(value) {
  const bytes = dagCbor.encode(value)
  const hash = sha256(bytes)
  const cid = CID.create(1, DAG_CBOR_CODE, createMultihashDigest(SHA256_CODE, hash))
  return { cid, bytes }
}

/**
 * Create a CID link (tagged for CBOR)
 * @param {CID} cid
 * @returns {any} - Link ready for DAG-CBOR encoding
 */
export function link(cid) {
  return cid
}

/**
 * Convert hex string to Uint8Array
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error('odd hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  let s = ''
  for (const x of bytes) s += x.toString(16).padStart(2, '0')
  return s
}

/**
 * Convert BTC value to satoshis per SPEC Section 9:
 * satoshis = max(0, floor(btc * 1e8 + 0.5))
 * @param {number} btc
 * @returns {number}
 */
export function btcToSatoshis(btc) {
  return Math.max(0, Math.floor(btc * 1e8 + 0.5))
}

/**
 * Pad bytes to exact length (for hash fields)
 * @param {Uint8Array} bytes
 * @param {number} length
 * @returns {Uint8Array}
 */
export function padBytes(bytes, length) {
  if (bytes.length > length) throw new Error(`bytes too long: ${bytes.length} > ${length}`)
  const padded = new Uint8Array(length)
  padded.set(bytes, length - bytes.length)
  return padded
}
