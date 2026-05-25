import { CID } from 'multiformats/cid'
import { bytesToHex } from './dag-cbor.ts'

/** Recursively convert Uint8Arrays → hex strings and CIDs → strings for JSON output */
export function jsonNode(value: unknown): unknown {
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (value instanceof CID) return value.toString()
  if (Array.isArray(value)) return value.map(jsonNode)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = jsonNode(v)
    return out
  }
  return value
}

/** Format a Unix timestamp as YYYY-MM-DD */
export function utcDay(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 10)
}
