# 0x2B T_DROP

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**No confidential UTXO output (standard variant).** Reclaim variant (`per_claim == 0`) produces 1 confidential UTXO at `vout[0]`.

### Wire layout (standard, `per_claim ≠ 0`)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2B` |
| 1 | 32 | asset_id | bytes | the existing token's asset_id (CETCH, T_PETCH, T_MINT, or T_PMINT root) |
| 33 | 8 | cap_amount | u64 LE | u64 LE base units, > 0 — total pool supply, MUST equal Σ consumed input amounts |
| 41 | 8 | per_claim | u64 LE | u64 LE base units, > 0 — exact per-T_DCLAIM amount |
| 49 | 32 | merkle_root | bytes | eligibility gate; all-zeros = open FCFS, otherwise the root of an off-chain Merkle tree |
| 81 | 4 | expiry_height | u32 LE | u32 LE — 0 ⇒ no expiry; otherwise highest height at which T_DCLAIM is accepted |
| 85 | 1 | ticker_len | u8 | u8, 0..16 — convenience copy for claim-msg construction; MAY be 0 (deferred to drop's CETCH/T_PETCH ancestor) |
| 86 | N | ticker | UTF-8 | UTF-8 (typically copied from the asset's parent etch envelope) |
| 86 | 1 | decimals | u8 | u8, 0..8 — convenience copy; same role as ticker |
| 87 | 1 | asset_input_count | u8 | u8, 1..16 — number of asset inputs being consumed |
| 88 | 64 | kernel_sig | bytes64 | Schnorr sig over kernel_msg (below) |

### Wire layout (reclaim, `per_claim == 0`)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2B` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 8 | cap_amount | u64 LE | u64 LE — MUST equal the unclaimed remainder |
| 41 | 8 | per_claim | bytes | = 0          sentinel — discriminates reclaim from standard shape |
| 49 | 32 | reclaim_drop_id | bytes | reference to the original T_DROP being reclaimed |
| 81 | 64 | reclaim_sig | bytes64 | BIP-340 sig under depositor pubkey over reclaim_msg (below) |
| 145 | 32 | cap_blinding | bytes | opening for the synthetic output commitment at vout[0] |

### Constraints
- `cap_amount > 0`, `per_claim > 0` (standard) or `per_claim == 0` (reclaim)
- `cap_amount % per_claim == 0` (standard only)
- `asset_input_count ∈ [1, 16]`
- `merkle_root`: 32 bytes; all-zero = open FCFS
- `expiry_height = 0` or `> drop_reveal_height`
- `ticker_len ∈ [0, 16]`; if 0 decimals MUST be 0
- `decimals ∈ [0, 8]`

### TypeScript

```typescript
export interface T_DROP_Standard {
  opcode: "T_DROP";
  variant: "standard";
  payload: Uint8Array;
  assetId: string;
  capAmount: bigint;
  perClaim: bigint;
  merkleRoot: Uint8Array;
  expiryHeight: number;
  tickerLen: number;
  ticker: string;
  decimals: number;
  assetInputCount: number;
  kernelSig: Uint8Array;
}

export interface T_DROP_Reclaim {
  opcode: "T_DROP";
  variant: "reclaim";
  payload: Uint8Array;
  assetId: string;
  capAmount: bigint;
  perClaim: 0n;
  reclaimDropId: string;
  reclaimSig: Uint8Array;
  capBlinding: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.12](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
