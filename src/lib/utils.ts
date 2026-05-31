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

/**
 * Compute the number of tacit outputs (N) for a given opcode and its payload.
 * Returns the count of tacit UTXOs this opcode produces at the start of vout[].
 * Per TACIT-SPEC opcode wire formats.
 *
 * Explicit cases for all 30 shipped opcodes — 0 means no tacit UTXO produced.
 */
export function tacitOutputCount(op: number, payload: Uint8Array): number {
  switch (op) {
    // ── Single tacit output (1) ──
    // SPEC §5.1 CETCH, §5.3 T_MINT, §5.9 T_PMINT, §5.11 T_WITHDRAW, §5.13 T_DCLAIM
    // SPEC-CBTC-ZK §5.21 T_SLOT_MINT, SPEC-CBTC-TAC §5.47 T_CBTC_TAC_DEPOSIT, T_CTAC_LIEN_CLAIM
    case 0x21: case 0x24: case 0x28: case 0x2A: case 0x2C:
    case 0x43: case 0x49: case 0x4C:
      return 1

    // ── N from envelope byte — payload[N_offset] (1,2,4,8) ──
    // SPEC §5.21 T_CXFER_BPP, §5.2 T_CXFER: N @ offset 97 (asset_id(32) + kernel_sig(64))
    case 0x22: case 0x23:
      return payload.length > 97 ? payload[97] : 1
    // SPEC §5.4 T_BURN: N @ offset 105 (asset_id(32) + burned_amount(8) + kernel_sig(64))
    case 0x25:
      return payload.length > 105 ? payload[105] : 1
    // SPEC §5.7 T_AXFER, SPEC-AXFER-BPP T_AXFER_BPP: N @ offset 98
    case 0x26: case 0x3C:
      return payload.length > 98 ? payload[98] : 1

    // ── Fixed 2 tacit outputs ──
    // SPEC §5.7.9 T_AXFER_VAR: vout[0] + vout[2]; SPEC-AXFER-BPP T_AXFER_VAR_BPP: same
    case 0x37: case 0x3D:
      return 2
    // SPEC-CBTC-TAC §5.47 T_CBTC_TAC_WITHDRAW, T_CBTC_TAC_FORCE_CLOSE: 2
    // SPEC-CBTC-TAC §5.49 T_CBTC_TAC_WITHDRAW_ATOMIC: 2
    case 0x4A: case 0x4B: case 0x58:
      return 2
    // SPEC-CBTC-TAC §5.48 T_CBTC_TAC_DEPOSIT_ATOMIC: 2
    case 0x57:
      return 2

    // ── Variable N ──
    // SPEC §5.12 T_DROP: reclaim variant (per_claim=0) → 1, standard → 0
    case 0x2B:
      if (payload.length > 66) {
        const perClaim = (payload[65] << 8) | payload[66]
        return perClaim === 0 ? 1 : 0
      }
      return 0
    // SPEC-SWAP-ROUTE §5.22 T_SWAP_ROUTE: 1 receipt UTXO per trader
    case 0x33:
      return 1
    // SPEC-CBTC-ZK §5.23 T_SLOT_ROTATE: optional 1 if payload asset field nonzero
    case 0x45:
      return 1
    // SPEC-CBTC-TAC §5.47 T_CTAC_LIEN_SPLIT: N from payload[1]
    case 0x4F:
      return payload.length > 1 ? payload[1] : 1
    // SPEC-PREAUTH-BID §5.7.11 T_PREAUTH_BID: N_ouputs field @ offset 130
    case 0x5B:
      return payload.length > 130 ? (payload[130] === 2 ? 2 : 1) : 1
    // SPEC-PREAUTH-BID-VAR §5.7.12 T_PREAUTH_BID_VAR: N_ouputs @ offset 131
    case 0x5C:
      return payload.length > 131 ? (payload[131] === 2 ? 2 : 1) : 1

    // ── No tacit UTXO (0) — explicit shipped opcodes ──
    // SPEC §5.8 T_PETCH: deployment only, no supply UTXO
    case 0x27:
      return 0
    // SPEC §5.10 T_DEPOSIT: consumes input into pool, no tacit output
    case 0x29:
      return 0
    // SPEC-CBTC-ZK §5.22 T_SLOT_BURN: spends slot, BTC payout only
    case 0x44:
      return 0
    // SPEC-CBTC-ZK-FUNGIBILITY §5.24 T_SLOT_SPLIT, §5.25 T_SLOT_MERGE: new slot P2TR only
    case 0x46: case 0x47:
      return 0
    // SPEC §5.19 T_WRAPPER_ATTEST: attestation log, no UTXOs
    case 0x38:
      return 0
    // SPEC-CBTC-TAC §5.50 T_CBTC_TAC_TOP_UP, §5.51 T_CBTC_TAC_BOND_RELEASE: bond ops, no UTXOs
    case 0x59: case 0x5A:
      return 0

    // Everything else (drafted/reserved/unknown): 0
    default:
      return 0
  }
}
