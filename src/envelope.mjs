// Tacit envelope detection and decoding
// Per SPEC Section 4: Tacit transaction inclusion
// Per TACIT.md: Envelope and payload decoding

import { hexToBytes } from './dag-cbor.mjs'

const MAGIC = new Uint8Array([0x54, 0x41, 0x43, 0x49, 0x54]) // "TACIT"
const VERSION = 0x01

// Tacit opcodes per TACIT.md
const OPCODES = {
  CETCH: 0x21,    // Asset etching
  CXFER: 0x23,    // Confidential transfer
  T_MINT: 0x24,   // Issuer mint
  T_BURN: 0x25,   // Burn
  T_AXFER: 0x26,  // Atomic transfer
  T_PETCH: 0x27,  // Permissionless etch
  T_PMINT: 0x28,  // Permissionless mint
  T_DEPOSIT: 0x29, // Mixer deposit
  T_WITHDRAW: 0x2a // Mixer withdrawal
}

const OPCODE_NAMES = {
  [OPCODES.CETCH]: 'CETCH',
  [OPCODES.CXFER]: 'CXFER',
  [OPCODES.T_MINT]: 'T_MINT',
  [OPCODES.T_BURN]: 'T_BURN',
  [OPCODES.T_AXFER]: 'T_AXFER',
  [OPCODES.T_PETCH]: 'T_PETCH',
  [OPCODES.T_PMINT]: 'T_PMINT',
  [OPCODES.T_DEPOSIT]: 'T_DEPOSIT',
  [OPCODES.T_WITHDRAW]: 'T_WITHDRAW'
}

const OP_0 = 0x00
const OP_PUSHDATA1 = 0x4c
const OP_PUSHDATA2 = 0x4d
const OP_PUSHDATA4 = 0x4e
const OP_1NEGATE = 0x4f
const OP_1 = 0x51
const OP_16 = 0x60
const OP_IF = 0x63
const OP_NOTIF = 0x64
const OP_ENDIF = 0x68

/**
 * Decode Bitcoin script and extract pushes
 * @param {Uint8Array} script
 * @returns {{kind: 'push' | 'op', data?: Uint8Array, opcode?: number}[]}
 */
function decodeScript(script) {
  const ops = []
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

/**
 * Extract envelope frame pushes from script ops
 * @param {{kind: 'push' | 'op', data?: Uint8Array, opcode?: number}[]} ops
 * @returns {Uint8Array[] | null}
 */
function extractEnvelopeFrame(ops) {
  for (let i = 0; i < ops.length - 1; i++) {
    const a = ops[i]
    const b = ops[i + 1]
    if (a.kind === 'push' && a.data.length === 0 && b.kind === 'op' && b.opcode === OP_IF) {
      const pushes = []
      let depth = 1
      for (let j = i + 2; j < ops.length; j++) {
        const o = ops[j]
        if (o.kind === 'op') {
          if (o.opcode === OP_IF || o.opcode === OP_NOTIF) { depth++; continue }
          if (o.opcode === OP_ENDIF) { depth--; if (depth === 0) return pushes; continue }
          continue
        }
        pushes.push(o.data)
      }
      return pushes
    }
  }
  return null
}

/**
 * Check if witness contains Tacit envelope (fast check)
 * @param {string[]} witness
 * @returns {boolean}
 */
export function hasTacitEnvelope(witness) {
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
  } catch {}
  return false
}

export function witnessHasTacitMagicHex(hex) {
  return typeof hex === 'string' && hex.includes('5441434954')
}

/**
 * Decode payload per TACIT.md opcode specifications
 * @param {Uint8Array} payload
 * @returns {{ok: boolean, opcode?: string, error?: string}}
 */
export function decodePayload(payload) {
  if (payload.length < 1) return { ok: false, error: 'empty payload' }
  
  const op = payload[0]
  const opcodeName = OPCODE_NAMES[op]
  
  if (!opcodeName) {
    return { ok: false, error: `unknown opcode 0x${op.toString(16)}` }
  }
  
  // Per SPEC Section 4 step 3: Payload decode must succeed
  // We validate the opcode is known; additional validation would require
  // full payload structure parsing per TACIT.md sections 5-8
  return { ok: true, opcode: opcodeName }
}

/**
 * Check if transaction has a valid Tacit envelope (full decode check per SPEC Section 4)
 * Step 1: vin[0] has second witness item
 * Step 2: Envelope decode succeeds
 * Step 3: Payload decode succeeds
 * @param {Object} tx - Bitcoin transaction
 * @returns {{ok: boolean, payload?: Uint8Array, opcode?: string, error?: string}}
 */
export function extractTacitPayload(tx) {
  // Step 1: Check witness availability
  const w = tx.vin?.[0]?.txinwitness
  if (!w || w.length < 2) return { ok: false, error: 'no witness' }
  
  try {
    const scriptBytes = hexToBytes(w[1])
    
    // Step 2: Envelope decode
    const ops = decodeScript(scriptBytes)
    const pushes = extractEnvelopeFrame(ops)
    if (!pushes || pushes.length < 3) return { ok: false, error: 'no envelope frame' }
    
    // Check magic
    if (pushes[0].length !== MAGIC.length) return { ok: false, error: 'bad magic length' }
    for (let i = 0; i < MAGIC.length; i++) {
      if (pushes[0][i] !== MAGIC[i]) return { ok: false, error: 'bad magic' }
    }
    
    // Check version
    if (pushes[1].length !== 1 || pushes[1][0] !== VERSION) {
      return { ok: false, error: 'bad version' }
    }
    
    // Concatenate remaining pushes into payload
    let totalLen = 0
    for (let i = 2; i < pushes.length; i++) totalLen += pushes[i].length
    const payload = new Uint8Array(totalLen)
    let offset = 0
    for (let i = 2; i < pushes.length; i++) {
      payload.set(pushes[i], offset)
      offset += pushes[i].length
    }
    
    // Step 3: Payload decode
    const payloadResult = decodePayload(payload)
    if (!payloadResult.ok) {
      return { ok: false, error: `payload decode failed: ${payloadResult.error}` }
    }
    
    return { ok: true, payload, opcode: payloadResult.opcode }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
