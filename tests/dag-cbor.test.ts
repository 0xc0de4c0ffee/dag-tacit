import { describe, expect, test } from 'bun:test'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { btcToSatoshis, bytesToHex, encodeNode, hexToBytes, rawCid, padBytes } from '../src/dag-cbor.ts'

describe('dag-cbor utilities', () => {
  test('converts btc JSON numbers to satoshis per Section 9', () => {
    expect(btcToSatoshis(0)).toBe(0)
    expect(btcToSatoshis(0.00000001)).toBe(1)
    expect(btcToSatoshis(0.000000004)).toBe(0)
    expect(btcToSatoshis(0.000000005)).toBe(1)
    expect(btcToSatoshis(-1)).toBe(0)
  })

  test('hex roundtrip preserves bytes', () => {
    const bytes = hexToBytes('000102ff')
    expect(bytesToHex(bytes)).toBe('000102ff')
  })

  test('encodes DAG-CBOR with CID v1 dag-cbor sha2-256', () => {
    const { cid, bytes } = encodeNode({ v: 1, n: 7 })
    expect(cid).toBeInstanceOf(CID)
    expect(cid.version).toBe(1)
    expect(cid.code).toBe(0x71)
    expect(cid.multihash.code).toBe(0x12)
    expect(cid.multihash.digest.length).toBe(32)
    expect(dagCbor.decode(bytes)).toEqual({ v: 1, n: 7 })
  })

  test('rawCid creates v1 raw+identity CID for 32-byte digest', () => {
    const bytes = hexToBytes('00'.repeat(32))
    const cid = rawCid(bytes)
    expect(cid).toBeInstanceOf(CID)
    expect(cid.version).toBe(1)
    expect(cid.code).toBe(0x55)
    expect(cid.multihash.code).toBe(0x00)
    expect(cid.multihash.digest.length).toBe(32)
  })

  test('padBytes pads to exact length', () => {
    const short = new Uint8Array([0x01, 0x02])
    const padded = padBytes(short, 4)
    expect(padded).toEqual(new Uint8Array([0x00, 0x00, 0x01, 0x02]))
  })

  test('padBytes throws when input exceeds target length', () => {
    const long = new Uint8Array([0x01, 0x02, 0x03])
    expect(() => padBytes(long, 2)).toThrow('bytes too long')
  })
})
