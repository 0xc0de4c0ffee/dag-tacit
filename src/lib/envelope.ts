import { hexToBytes } from './dag-cbor.ts'
import type { BitcoinTx, DecodePayloadResult, ExtractTacitPayloadResult } from '../types.ts'
import {
  MAGIC, VERSION, OPCODE_NAMES,
  OP_0, OP_PUSHDATA1, OP_PUSHDATA2, OP_PUSHDATA4,
  OP_1NEGATE, OP_1, OP_16, OP_IF, OP_NOTIF, OP_ENDIF,
} from '../config.ts'

interface ScriptOp {
  kind: 'push' | 'op'
  data?: Uint8Array
  opcode?: number
}

function decodeScript(script: Uint8Array): ScriptOp[] {
  const ops: ScriptOp[] = []
  let i = 0
  while (i < script.length) {
    const b = script[i++]
    if (b === OP_0) {
      ops.push({ kind: 'push', data: new Uint8Array(0) })
      continue
    }
    if (b >= 0x01 && b <= 0x4b) {
      if (i + b > script.length) throw new Error('truncated push')
      ops.push({ kind: 'push', data: script.slice(i, i + b) })
      i += b
      continue
    }
    if (b === OP_PUSHDATA1) {
      if (i + 1 > script.length) throw new Error('truncated PUSHDATA1')
      const n = script[i++]
      if (i + n > script.length) throw new Error('truncated PUSHDATA1 data')
      ops.push({ kind: 'push', data: script.slice(i, i + n) })
      i += n
      continue
    }
    if (b === OP_PUSHDATA2) {
      if (i + 2 > script.length) throw new Error('truncated PUSHDATA2')
      const n = script[i] | (script[i + 1] << 8)
      i += 2
      if (i + n > script.length) throw new Error('truncated PUSHDATA2 data')
      ops.push({ kind: 'push', data: script.slice(i, i + n) })
      i += n
      continue
    }
    if (b === OP_PUSHDATA4) {
      if (i + 4 > script.length) throw new Error('truncated PUSHDATA4')
      const n = script[i] | (script[i + 1] << 8) | (script[i + 2] << 16) | (script[i + 3] << 24)
      i += 4
      if (i + n > script.length) throw new Error('truncated PUSHDATA4 data')
      ops.push({ kind: 'push', data: script.slice(i, i + n) })
      i += n
      continue
    }
    if (b === OP_1NEGATE) {
      ops.push({ kind: 'push', data: new Uint8Array([0x81]) })
      continue
    }
    if (b >= OP_1 && b <= OP_16) {
      ops.push({ kind: 'push', data: new Uint8Array([b - OP_1 + 1]) })
      continue
    }
    ops.push({ kind: 'op', opcode: b })
  }
  return ops
}

function extractEnvelopeFrame(ops: ScriptOp[]): Uint8Array[] | null {
  for (let i = 0; i < ops.length - 1; i++) {
    const a = ops[i]
    const b = ops[i + 1]
    if (a.kind === 'push' && a.data && a.data.length === 0 && b.kind === 'op' && b.opcode === OP_IF) {
      const pushes: Uint8Array[] = []
      let depth = 1
      for (let j = i + 2; j < ops.length; j++) {
        const o = ops[j]
        if (o.kind === 'op') {
          if (o.opcode === OP_IF || o.opcode === OP_NOTIF) { depth++; continue }
          if (o.opcode === OP_ENDIF) { depth--; if (depth === 0) return pushes; continue }
          continue
        }
        if (o.data) pushes.push(o.data)
      }
      return pushes
    }
  }
  return null
}

/**
 * Check if witness contains Tacit envelope (fast check)
 */
export function hasTacitEnvelope(witness: string[]): boolean {
  if (!witness || witness.length < 2) return false
  try {
    const hex = witness[1]
    if (!hex) return false
    const b = hexToBytes(hex)
    for (let i = 0; i + MAGIC.length <= b.length; i++) {
      let ok = true
      for (let j = 0; j < MAGIC.length; j++) {
        if (b[i + j] !== MAGIC[j]) { ok = false; break }
      }
      if (ok) return true
    }
  } catch { /* ignore */ }
  return false
}

export function witnessHasTacitMagicHex(hex: string): boolean {
  return typeof hex === 'string' && hex.includes('5441434954')
}

/**
 * Decode payload per TACIT.md opcode specifications
 */
export function decodePayload(payload: Uint8Array): DecodePayloadResult {
  if (payload.length < 1) return { ok: false, error: 'empty payload' }

  const op = payload[0]
  const opcodeName = OPCODE_NAMES[op]

  if (!opcodeName) {
    return { ok: false, error: `unknown opcode 0x${op.toString(16)}` }
  }

  return { ok: true, opcode: opcodeName }
}

/**
 * Extract raw Tacit envelope content from a transaction.
 * Validates envelope structure (magic bytes, version, pushdata framing)
 * but does NOT validate the opcode — this is the block-level check.
 * For full opcode validation, use extractTacitPayload instead.
 */
export function extractEnvelopeContent(tx: BitcoinTx): { ok: true; payload: Uint8Array } | { ok: false; error: string } {
  const w = tx.vin?.[0]?.txinwitness
  if (!w || w.length < 2) return { ok: false, error: 'no witness' }

  try {
    const scriptBytes = hexToBytes(w[1])

    const ops = decodeScript(scriptBytes)
    const pushes = extractEnvelopeFrame(ops)
    if (!pushes || pushes.length < 3) return { ok: false, error: 'no envelope frame' }

    if (pushes[0].length !== MAGIC.length) return { ok: false, error: 'bad magic length' }
    for (let i = 0; i < MAGIC.length; i++) {
      if (pushes[0][i] !== MAGIC[i]) return { ok: false, error: 'bad magic' }
    }

    if (pushes[1].length !== 1 || pushes[1][0] !== VERSION) {
      return { ok: false, error: 'bad version' }
    }

    let totalLen = 0
    for (let i = 2; i < pushes.length; i++) totalLen += pushes[i].length
    const payload = new Uint8Array(totalLen)
    let offset = 0
    for (let i = 2; i < pushes.length; i++) {
      payload.set(pushes[i], offset)
      offset += pushes[i].length
    }

    return { ok: true, payload }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Full Tacit envelope decode per SPEC Section 4.
 * Validates envelope structure AND the opcode byte.
 */
export function extractTacitPayload(tx: BitcoinTx): ExtractTacitPayloadResult {
  const envelope = extractEnvelopeContent(tx)
  if (!envelope.ok) return envelope

  const payloadResult = decodePayload(envelope.payload)
  if (!payloadResult.ok) {
    return { ok: false, error: `payload decode failed: ${payloadResult.error}` }
  }

  return { ok: true, payload: envelope.payload, opcode: payloadResult.opcode }
}
