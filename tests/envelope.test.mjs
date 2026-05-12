import { describe, expect, test } from 'bun:test'
import { decodePayload, extractTacitPayload } from '../src/envelope.mjs'

function envelopeScript(opcodeHex) {
  const pubkey = '11'.repeat(32)
  const payload = opcodeHex
  return `20${pubkey}ac00630554414349544c010101${payload}68`
}

describe('Tacit envelope inclusion rules', () => {
  test('rejects transactions without vin[0].txinwitness[1]', () => {
    expect(extractTacitPayload({ vin: [] }).ok).toBe(false)
    expect(extractTacitPayload({ vin: [{ txinwitness: ['00'] }] }).ok).toBe(false)
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
      expect(decodePayload(Uint8Array.from([parseInt(hex, 16)])).opcode).toBe(name)
      const tx = { vin: [{ txinwitness: ['00', envelopeScript(hex)] }] }
      const decoded = extractTacitPayload(tx)
      expect(decoded.ok).toBe(true)
      expect(decoded.opcode).toBe(name)
    }
  })

  test('rejects unknown payload opcode', () => {
    const tx = { vin: [{ txinwitness: ['00', envelopeScript('ff')] }] }
    const decoded = extractTacitPayload(tx)
    expect(decoded.ok).toBe(false)
    expect(decoded.error).toContain('unknown opcode')
  })
})
