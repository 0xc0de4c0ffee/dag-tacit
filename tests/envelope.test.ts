import { describe, expect, test } from 'bun:test'
import { decodePayload, extractTacitPayload, witnessHasTacitMagicHex } from '../src/envelope.ts'
import type { BitcoinTx } from '../src/types.ts'

function envelopeScript(opcodeHex: string): string {
  const pubkey = '11'.repeat(32)
  const payload = opcodeHex
  return `20${pubkey}ac00630554414349544c010101${payload}68`
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

  test('accepts all known TACIT opcodes', () => {
    const opcodes = {
      CETCH: '21',
      CXFER: '23',
      T_MINT: '24',
      T_BURN: '25',
      T_AXFER: '26',
      T_PETCH: '27',
      T_PMINT: '28',
      T_DEPOSIT: '29',
      T_WITHDRAW: '2a'
    }
    for (const [name, hex] of Object.entries(opcodes)) {
      const dp = decodePayload(Uint8Array.from([parseInt(hex, 16)]))
      expect(dp.ok).toBe(true)
      if (dp.ok) expect(dp.opcode).toBe(name)
      const tx = { vin: [{ txinwitness: ['00', envelopeScript(hex)] }] } as unknown as BitcoinTx
      const decoded = extractTacitPayload(tx)
      expect(decoded.ok).toBe(true)
      if (decoded.ok) expect(decoded.opcode).toBe(name)
    }
  })

  test('rejects unknown payload opcode', () => {
    const tx = { vin: [{ txinwitness: ['00', envelopeScript('ff')] }] } as unknown as BitcoinTx
    const decoded = extractTacitPayload(tx)
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error).toContain('unknown opcode')
  })

  test('witnessHasTacitMagicHex fast-check on hex string', () => {
    expect(witnessHasTacitMagicHex('5441434954')).toBe(true)
    expect(witnessHasTacitMagicHex('deadbeef')).toBe(false)
    expect(witnessHasTacitMagicHex('')).toBe(false)
  })
})
