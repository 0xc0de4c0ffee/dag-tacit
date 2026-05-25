# 0x31 T_PROTOCOL_FEE_CLAIM

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential LP-share UTXO** at `vout[0]`.

### Wire layout (fixed 202 bytes)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x31` |
| 1 | 32 | pool_id | bytes | SHA256(...) per §4.1 |
| 33 | 32 | claimer_pubkey_x_only | bytes | x-only of pool.protocol_fee_address |
| 65 | 8 | claim_amount_LE | u64 LE | u64 LE, > 0 — MUST equal pool.protocol_fee_accrued |
| 73 | 33 | claim_C_secp | bytes33 | Pedersen commitment |
| 106 | 32 | claim_blinding | bytes | r_secp, revealed |
| 138 | 64 | claim_sig | bytes64 | BIP-340 |

### Constraints
- Fixed 202 bytes total
- `claim_amount > 0`
- `claim_blinding < secp256k1 group order`
- `claimer_pubkey_x_only` matches `pool.protocol_fee_address` x-only
- Pool must have protocol fee enabled

### TypeScript

```typescript
export interface T_PROTOCOL_FEE_CLAIM {
  opcode: "T_PROTOCOL_FEE_CLAIM";
  payload: Uint8Array;
  poolId: string;
  claimerPubkeyXOnly: Uint8Array;
  claimAmount: bigint;
  claimCSecp: Uint8Array;
  claimBlinding: Uint8Array;
  claimSig: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.18](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
