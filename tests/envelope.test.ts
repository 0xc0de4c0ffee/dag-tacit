import { describe, expect, test } from 'bun:test'
import { decodePayload, extractEnvelopeContent, extractTacitPayload, witnessHasTacitMagicHex } from '../src/lib/envelope.ts'
import { OPCODES_INFO } from '../src/config.ts'
import type { BitcoinTx } from '../src/types.ts'

function envelopeScript(opcodeHex: string): string {
  const pubkey = '11'.repeat(32)
  const payload = opcodeHex
  return `20${pubkey}ac00630554414349544c010101${payload}68`
}

function makeTx(witnessHex: string): BitcoinTx {
  return { vin: [{ txinwitness: ['00', witnessHex] }] } as unknown as BitcoinTx
}

describe('Tacit envelope inclusion rules', () => {
  test('rejects transactions without vin[0].txinwitness[1]', () => {
    const r1 = extractTacitPayload({ vin: [] } as unknown as BitcoinTx)
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toBe('no witness')
    const r2 = extractTacitPayload({ vin: [{ txinwitness: ['00'] }] } as unknown as BitcoinTx)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toBe('no witness')
  })

  test('both extractEnvelopeContent and extractTacitPayload reject missing witness', () => {
    expect(extractEnvelopeContent({ vin: [] } as BitcoinTx).ok).toBe(false)
    expect(extractTacitPayload({ vin: [] } as BitcoinTx).ok).toBe(false)
  })

  test('decodePayload rejects unknown opcode with 2-digit hex', () => {
    const dp = decodePayload(new Uint8Array([0x03]))
    expect(dp.ok).toBe(false)
    if (!dp.ok) expect(dp.error).toBe('unknown opcode 0x03')
  })

  test('accepts all known TACIT opcodes', () => {
    for (const [key, info] of Object.entries(OPCODES_INFO)) {
      const hex = info.value.toString(16).padStart(2, '0')
      const dp = decodePayload(Uint8Array.from([info.value]))
      expect(dp.ok).toBe(true)
      if (dp.ok) expect(dp.opcode).toBe(info.name)
      const tx = makeTx(envelopeScript(hex))
      const decoded = extractTacitPayload(tx)
      expect(decoded.ok).toBe(true)
      if (decoded.ok) expect(decoded.opcode).toBe(info.name)
    }
  })

  test('extractEnvelopeContent rejects bad magic', () => {
    // Replace TACIT bytes with FOOO
    const badMagic = '20' + '11'.repeat(32) + 'ac006305464f4f4f4c0101012168'
    const tx = makeTx(badMagic)
    const ec = extractEnvelopeContent(tx)
    expect(ec.ok).toBe(false)
    if (!ec.ok) expect(ec.error).toContain('magic')
  })

  test('extractEnvelopeContent rejects bad version', () => {
    // Same structure as envelopeScript, but version byte = 0x02 instead of 0x01
    // Need 3+ pushes: push5(magic), push1(version=2), push1(payload byte)
    const badVersion = '20' + '11'.repeat(32) + 'ac00630554414349544c0102' + '0121' + '68'
    const tx = makeTx(badVersion)
    const ec = extractEnvelopeContent(tx)
    expect(ec.ok).toBe(false)
    if (!ec.ok) expect(ec.error).toContain('version')
  })

  test('extractEnvelopeContent rejects no envelope frame', () => {
    // Valid script but no OP_0 OP_IF frame
    const noFrame = '20' + '11'.repeat(32) + 'ac'
    const tx = makeTx(noFrame)
    const ec = extractEnvelopeContent(tx)
    expect(ec.ok).toBe(false)
    if (!ec.ok) expect(ec.error).toContain('envelope frame')
  })

  test('extractEnvelopeContent passes for unknown opcode, extractTacitPayload fails', () => {
    const unknownTx = makeTx(envelopeScript('ff'))
    const ec = extractEnvelopeContent(unknownTx)
    expect(ec.ok).toBe(true)
    if (ec.ok) expect(ec.payload).toBeInstanceOf(Uint8Array)

    const etp = extractTacitPayload(unknownTx)
    expect(etp.ok).toBe(false)
    if (!etp.ok) expect(etp.error).toContain('unknown opcode')
  })

  test('extractEnvelopeContent returns payload bytes', () => {
    const tx = makeTx(envelopeScript('21'))
    const ec = extractEnvelopeContent(tx)
    expect(ec.ok).toBe(true)
    if (ec.ok) {
      expect(ec.payload.length).toBeGreaterThanOrEqual(1)
      expect(ec.payload[0]).toBe(0x21) // first byte is CETCH opcode
    }
  })

  test('rejects unknown payload opcode', () => {
    const tx = makeTx(envelopeScript('ff'))
    const decoded = extractTacitPayload(tx)
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error).toContain('unknown opcode')
  })

  test('witnessHasTacitMagicHex fast-check on hex string', () => {
    expect(witnessHasTacitMagicHex('5441434954')).toBe(true)
    expect(witnessHasTacitMagicHex('deadbeef')).toBe(false)
    expect(witnessHasTacitMagicHex('')).toBe(false)
  })

  test('witnessHasTacitMagicHex finds magic in long hex string', () => {
    const longHex = '00'.repeat(100) + '5441434954' + 'ff'.repeat(100)
    expect(witnessHasTacitMagicHex(longHex)).toBe(true)
  })
})
