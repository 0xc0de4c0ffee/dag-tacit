import { describe, expect, test } from 'bun:test'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { btcToSatoshis, bytesToHex, encodeNode, hexToBytes, deriveAssetId } from '../src/lib/dag-cbor.ts'
import { tacitOutputCount } from '../src/lib/utils.ts'
import { parseTPetchPayload } from '../src/assets/assets-parse.ts'

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
})

describe('deriveAssetId', () => {
  test('derives FAIR asset_id matching tacitscan', () => {
    // FAIR T_PETCH at block 948488, txid c2542e7f...
    const txid = 'c2542e7fbaa8c0c9fa632d8720ebf0ba602f9cda8a4c4b1e5ca5d9e41acc4067'
    const id = deriveAssetId(txid)
    expect(bytesToHex(id)).toBe('c4a678d6d674cdd0f4a1a9df0cb5980bd1255bd0b62f8ddc886e61bd43f56b83')
  })

  test('derives unique IDs for different txids', () => {
    const id1 = deriveAssetId('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const id2 = deriveAssetId('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(bytesToHex(id1)).not.toBe(bytesToHex(id2))
  })

  test('uses vout=0 by default', () => {
    const txid = '0000000000000000000000000000000000000000000000000000000000000000'
    const v0 = deriveAssetId(txid, 0)
    const v1 = deriveAssetId(txid, 1)
    expect(bytesToHex(v0)).not.toBe(bytesToHex(v1))
  })
})

describe('tacitOutputCount', () => {
  test('CETCH returns 1', () => {
    expect(tacitOutputCount(0x21, new Uint8Array(100))).toBe(1)
  })

  test('T_PMINT returns 1', () => {
    expect(tacitOutputCount(0x28, new Uint8Array(100))).toBe(1)
  })

  test('T_BURN reads N at offset 105', () => {
    const p = new Uint8Array(150)
    p[105] = 4
    expect(tacitOutputCount(0x25, p)).toBe(4)
  })

  test('CXFER reads N at offset 97', () => {
    const p = new Uint8Array(150)
    p[97] = 2
    expect(tacitOutputCount(0x23, p)).toBe(2)
  })

  test('T_PETCH returns 0', () => {
    expect(tacitOutputCount(0x27, new Uint8Array(50))).toBe(0)
  })

  test('T_SLOT_BURN returns 0', () => {
    expect(tacitOutputCount(0x44, new Uint8Array(50))).toBe(0)
  })

  test('T_CBTC_TAC_TOP_UP returns 0', () => {
    expect(tacitOutputCount(0x59, new Uint8Array(50))).toBe(0)
  })

  test('T_AXFER reads N at offset 98', () => {
    const p = new Uint8Array(150)
    p[98] = 8
    expect(tacitOutputCount(0x26, p)).toBe(8)
  })

  test('T_CBTC_TAC_WITHDRAW returns 2', () => {
    expect(tacitOutputCount(0x4A, new Uint8Array(100))).toBe(2)
  })

  test('unknown opcode returns 0', () => {
    expect(tacitOutputCount(0xFF, new Uint8Array(100))).toBe(0)
  })
})

describe('parseTPetchPayload', () => {
  test('parses FAIR T_PETCH payload', () => {
    // Real FAIR payload from extractTacitPayload at block 948488
    const { extractTacitPayload } = require('../src/lib/envelope.ts')
    const f = require('fs').readFileSync('out/tacit-blocks/2026-05-08/dag-tacit-92-948488.json', 'utf8')
    const d = JSON.parse(f)
    const env = extractTacitPayload(d.txs[0])
    expect(env.ok).toBe(true)
    const r = parseTPetchPayload(env.payload)
    expect(r).not.toBeNull()
    expect(r!.ticker).toBe('FAIR')
    expect(r!.decimals).toBe(0)
    expect(r!.cap_amount).toBe(21000000)
    expect(r!.mint_limit).toBe(100)
    expect(r!.mintStartHeight).toBe(0)
    expect(r!.mintEndHeight).toBe(0)
    expect(r!.imageUri).toContain('bafybei')
  })

  test('rejects short payload', () => {
    expect(parseTPetchPayload(new Uint8Array([0x27]))).toBeNull()
  })

  test('rejects zero cap', () => {
    const p = new Uint8Array(50)
    p[0] = 0x27
    p[1] = 1 // ticker len
    p[2] = 0x41 // 'A'
    p[3] = 0 // decimals
    // cap_amount = 0
    const r = parseTPetchPayload(p)
    expect(r).toBeNull()
  })
})
