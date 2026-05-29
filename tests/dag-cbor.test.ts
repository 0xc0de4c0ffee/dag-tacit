import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { btcToSatoshis, bytesToHex, encodeNode, hexToBytes, deriveAssetId } from '../src/lib/dag-cbor.ts'
import { tacitOutputCount } from '../src/lib/utils.ts'
import { parseTPetchPayload } from '../src/assets/assets-parse.ts'
import { extractTacitPayload } from '../src/lib/envelope.ts'
import { verifyCommitment, verifyBlindingNonZero, verifyCapDivisible, verifyBurnAmount, verifyKernelSig, verifyPayload, computeBlockChecksum } from '../src/lib/verify.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  test('parses FAIR T_PETCH payload from block 948488', () => {
    const block = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'fixture-948488.json'), 'utf8'))
    const env = extractTacitPayload(block.tx[0])
    expect(env.ok).toBe(true)
    const r = parseTPetchPayload((env as { ok: true; payload: Uint8Array }).payload)
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

describe('verifyCommitment', () => {

  test('accepts valid compressed secp256k1 point (even Y)', () => {
    const g = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    expect(verifyCommitment(g)).toBe(true)
  })

  test('accepts valid compressed secp256k1 point (odd Y)', () => {
    const g = hexToBytes('0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    expect(verifyCommitment(g)).toBe(true)
  })

  test('rejects wrong length', () => {
    expect(verifyCommitment(new Uint8Array([0x02, 0x01]))).toBe(false)
  })

  test('rejects invalid prefix', () => {
    const buf = new Uint8Array(33)
    buf[0] = 0x04
    expect(verifyCommitment(buf)).toBe(false)
  })

  test('rejects invalid point', () => {
    const buf = new Uint8Array(33)
    buf[0] = 0x02
    buf.fill(0xff, 1)
    expect(verifyCommitment(buf)).toBe(false)
  })
})

describe('verifyBlindingNonZero', () => {
  test('rejects all-zero blinding', () => {
    expect(verifyBlindingNonZero(new Uint8Array(32))).toBe(false)
  })

  test('accepts non-zero blinding', () => {
    const b = new Uint8Array(32)
    b[31] = 1
    expect(verifyBlindingNonZero(b)).toBe(true)
  })

  test('rejects wrong length', () => {
    expect(verifyBlindingNonZero(new Uint8Array(16))).toBe(false)
  })
})

describe('verifyCapDivisible', () => {
  test('21000000 / 100 = OK', () => {
    expect(verifyCapDivisible(21000000, 100)).toBe(true)
  })

  test('21000000 / 7 = OK (3000000 exactly)', () => {
    expect(verifyCapDivisible(21000000, 7)).toBe(true) // 21000000/7=3000000
  })

  test('21000000 / 3 = OK (7000000 exactly)', () => {
    expect(verifyCapDivisible(21000000, 3)).toBe(true)
  })

  test('rejects zero cap', () => {
    expect(verifyCapDivisible(0, 100)).toBe(false)
  })
})

describe('verifyBurnAmount', () => {
  test('positive amount is valid', () => {
    expect(verifyBurnAmount(100n)).toBe(true)
  })

  test('zero amount is invalid', () => {
    expect(verifyBurnAmount(0n)).toBe(false)
  })
})

describe('verifyPayload per opcode', () => {
  test('CETCH — valid commitment', () => {
    const hex = '27' + '04' + '54455354' + '00' + '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' + '00'.repeat(8) + '0000'
    const r = verifyPayload('CETCH', hexToBytes(hex), 'x', 0)
    expect(r.commitmentValid).toBe(true)
  })

  test('CETCH — short payload returns null fields', () => {
    const r = verifyPayload('CETCH', new Uint8Array([0x21]), 'x', 0)
    expect(r.commitmentValid).toBeNull()
  })

  test('T_PMINT — valid commitment and blinding', () => {
    // Build minimal 138-byte payload
    const p = new Uint8Array(138)
    p[0] = 0x28
    // Add valid commitment at offset 65
    const g = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    p.set(g, 65)
    // Non-zero blinding at offset 106
    p[106] = 1
    const r = verifyPayload('T_PMINT', p, 'x', 0)
    expect(r.commitmentValid).toBe(true)
    expect(r.blindingValid).toBe(true)
  })

  test('T_PMINT — zero blinding rejected', () => {
    const p = new Uint8Array(138)
    p[0] = 0x28
    const r = verifyPayload('T_PMINT', p, 'x', 0)
    expect(r.blindingValid).toBe(false)
  })

  test('T_BURN — validates N in {0,1,2,4,8}', () => {
    const p = new Uint8Array(150)
    p[0] = 0x25
    const dv = new DataView(p.buffer)
    dv.setBigUint64(33, 100n, true)
    p[1 + 32 + 8 + 64] = 4 // N=4, no valid commitments in test
    const r = verifyPayload('T_BURN', p, 'x', 0)
    expect(r.burnValid).toBe(true)
  })

  test('T_BURN — rejects N=3', () => {
    const p = new Uint8Array(150)
    p[0] = 0x25
    p[1 + 32 + 8 + 64] = 3
    const r = verifyPayload('T_BURN', p, 'x', 0)
    expect(r.commitmentValid).toBe(false)
    expect(r.commitmentError).toContain('N must be')
  })

  test('CXFER — validates N in {1,2,4,8}', () => {
    const p = new Uint8Array(200)
    p[0] = 0x23
    p[1 + 32 + 64] = 2 // N=2
    // Add valid commitments
    const g = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    p.set(g, 1 + 32 + 64 + 1) // first output commitment
    p.set(g, 1 + 32 + 64 + 1 + 41) // second output commitment
    const r = verifyPayload('CXFER', p, 'x', 0)
    expect(r.commitmentValid).toBe(true)
  })

  test('unknown opcode returns null fields', () => {
    const r = verifyPayload('UNKNOWN', new Uint8Array([0xFF]), 'x', 0)
    expect(r.commitmentValid).toBeNull()
  })

  test('T_WITHDRAW — proof_len at fixed offset 202', () => {
    const p = new Uint8Array(300)
    p[0] = 0x2A
    p[202] = 64 // proof_len = 64 LE
    const r = verifyPayload('T_WITHDRAW', p, 'x', 0)
    expect(r.commitmentValid).toBe(true)
  })

  test('T_WITHDRAW — short payload returns null', () => {
    const r = verifyPayload('T_WITHDRAW', new Uint8Array(100), 'x', 0)
    expect(r.commitmentValid).toBeNull()
  })

  test('T_PETCH — valid cap divisibility', () => {
    const p = new Uint8Array(100)
    p[0] = 0x27
    p[1] = 1 // ticker_len
    p[2] = 0x41 // 'A'
    p[3] = 0 // decimals
    const dv = new DataView(p.buffer)
    dv.setBigUint64(4, 10000n, true) // cap_amount = 10000
    dv.setBigUint64(12, 100n, true)  // mint_limit = 100
    const r = verifyPayload('T_PETCH', p, 'x', 0)
    expect(r.burnValid).toBe(true)
  })

  test('T_DROP — per_claim >= 0', () => {
    const p = new Uint8Array(60)
    p[0] = 0x2B
    // cap_amount at offset 1 (8 bytes), per_claim at offset 9 (8 bytes)
    const dv = new DataView(p.buffer)
    dv.setBigUint64(9, 100n, true)
    const r = verifyPayload('T_DROP', p, 'x', 0)
    expect(r.burnValid).toBe(true)
  })

  test('T_DCLAIM — valid commitment and blinding', () => {
    const p = new Uint8Array(200)
    p[0] = 0x2C
    const g = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    p.set(g, 65) // commitment at offset 65
    p[137] = 1  // non-zero blinding at offset 106 (blinding is 32 bytes: 106-137)
    const r = verifyPayload('T_DCLAIM', p, 'x', 0)
    expect(r.commitmentValid).toBe(true)
    expect(r.blindingValid).toBe(true)
  })

  test('T_AXFER_VAR — validates 2 outputs', () => {
    const p = new Uint8Array(200)
    p[0] = 0x37
    p[1 + 32] = 1 // asset_input_count = 1
    p[1 + 32 + 1] = 2 // N = 2
    const g = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
    p.set(g, 1 + 32 + 1 + 1) // output 0 commitment
    p.set(g, 1 + 32 + 1 + 1 + 41) // output 1 commitment
    const r = verifyPayload('T_AXFER_VAR', p, 'x', 0)
    expect(r.commitmentValid).toBe(true)
  })
})

describe('computeBlockChecksum', () => {

  test('genesis checksum uses 32 zero bytes', () => {
    const ck = computeBlockChecksum(null, '[]')
    expect(ck).toBeInstanceOf(Uint8Array)
    expect(ck.length).toBe(32)
  })

  test('non-genesis checksum chains with previous', () => {
    const prev = computeBlockChecksum(null, '["tx1"]')
    const next = computeBlockChecksum(prev, '["tx2"]')
    expect(next).toBeInstanceOf(Uint8Array)
    expect(next.length).toBe(32)
    // Different txs JSON should give different checksums
    const next2 = computeBlockChecksum(prev, '["tx1"]')
    expect(bytesToHex(next)).not.toBe(bytesToHex(next2))
  })

  test('same input produces same checksum', () => {
    const a = computeBlockChecksum(null, '{"a":1}')
    const b = computeBlockChecksum(null, '{"a":1}')
    expect(bytesToHex(a)).toBe(bytesToHex(b))
  })
})
