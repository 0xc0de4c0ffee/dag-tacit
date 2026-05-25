# 0x2A T_WITHDRAW

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential UTXO at `vout[0]`.** Groth16 zero-knowledge proof. `r_leaf` is public (cleartext). Nullifier prevents double-withdraw.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2A` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 8 | denomination | u64 LE | u64 LE — the pool |
| 41 | 32 | merkle_root | bytes | claimed pool root (must match a recent canonical root) |
| 73 | 32 | nullifier_hash | bytes | public; must be unique within the pool |
| 105 | 33 | recipient_commitment | bytes33 | compressed Pedersen point: denomination·H + r_leaf·G |
| 138 | 32 | r_leaf | bytes32 | public Pedersen blinding scalar (BN254 Fr / secp256k1 scalar) |
| 170 | 32 | bind_hash | bytes | see below |
| 202 | 2 | proof_len | u16 LE | u16 LE |
| 204 | N | proof | bytes | Groth16 proof bytes |

### Public inputs to Groth16 verifier

[merkle_root, nullifier_hash, denomination, r_leaf, bind_hash]  // BN254 scalar field

### Constraints
- Pool must exist for `(asset_id, denomination)`
- `merkle_root` must be in last 32 canonical roots of the pool
- `nullifier_hash` must NOT be in the pool's spent-nullifier set
- `recipient_commitment == denomination · H + r_leaf · G` (external secp256k1 check)
- Tacit UTXO at `vout[0]` only — other vout indices are rejected
- No `kernel_sig` — soundness from Groth16 proof

### TypeScript

```typescript
export interface T_WITHDRAW {
  opcode: "T_WITHDRAW";
  payload: Uint8Array;
  assetId: string;
  denomination: bigint;
  merkleRoot: Uint8Array;
  nullifierHash: Uint8Array;
  recipientCommitment: Uint8Array;
  rLeaf: Uint8Array;
  bindHash: Uint8Array;
  proofLen: number;
  proof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.11](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
