# 0x28 T_PMINT

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 UTXO at `vout[0]` of the reveal tx.** No Schnorr signature — anyone may mint. Amount and blinding are **public** (cleartext).

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x28` |
| 1 | 32 | asset_id | bytes | must equal SHA256(etch_txid_BE || 0_LE) |
| 33 | 32 | etch_txid | bytes | reference to the originating T_PETCH reveal tx |
| 65 | 33 | commitment | bytes33 | Pedersen C = amount·H + blinding·G (compressed) |
| 98 | 8 | amount | u64 LE | u64 LE — public; MUST equal petch.mint_limit |
| 106 | 32 | blinding | bytes | public scalar — 0 < blinding < curve_order |

### Constraints
- `asset_id == SHA256(etch_txid_BE || 0_LE)`
- Parent MUST be T_PETCH (0x27), not CETCH — a T_PMINT naming a CETCH parent is rejected
- `amount == petch.mint_limit`
- Height window: `effective_start ≤ confirmed_height ≤ effective_end`
- Cap: `(prior_count + 1) × mint_limit ≤ cap_amount`
- `blinding ∈ (0, curve_order)`
- `pedersenCommit(amount, blinding) == commitment`
- `vout[0]` holds the new supply UTXO
- No Schnorr signature on the envelope

### TypeScript

```typescript
export interface T_PMINT {
  opcode: "T_PMINT";
  payload: Uint8Array;
  assetId: string;
  etchTxid: string;
  commitment: Uint8Array;
  amount: bigint;
  blinding: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.9](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
