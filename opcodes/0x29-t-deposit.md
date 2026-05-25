# 0x29 T_DEPOSIT

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**No tacit UTXO is produced.** Deposits a UTXO into a shielded mixer pool by committing a Poseidon hash leaf. `denomination = 0` is the POOL_INIT sentinel variant.

### Wire layout (standard deposit, `denomination > 0`)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x29` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 8 | denomination | u64 LE | u64 LE — public, the pool's fixed amount |
| 41 | 32 | leaf_commitment | bytes | poseidon(secret, nullifier_preimage, denomination) |
| 73 | 64 | kernel_sig | bytes64 | Schnorr sig over kernel_msg (below) |

### Wire layout (POOL_INIT, `denomination = 0`)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x29` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 8 | denomination | u64 LE | = 0 (POOL_INIT sentinel) |
| 41 | 8 | pool_denom | u64 LE | u64 LE — the actual pool denomination, > 0 |
| 49 | 1 | vk_cid_len | u8 | u8, 1..64 |
| 50 | N | vk_cid | UTF-8 | IPFS CID of the Groth16 verifying key (UTF-8) |
| 50 | 1 | ceremony_cid_len | u8 | u8, 1..64 |
| 51 | ... | ceremony_cid | UTF-8 | IPFS CID of MPC ceremony transcripts (UTF-8) |
| 51 | 64 | init_sig | bytes64 | BIP-340 sig over init_msg by initializer pubkey at vin[1].witness[1] |

### Kernel message

kernel_msg = SHA256(
    "tacit-deposit-v1"
    || asset_id(32)
    || denomination_LE(8)
    || input_txid_BE(32) || input_vout_LE(4)
    || leaf_commitment(32)
)

Kernel sig verifies under `(C_in − denomination · H).x_only()`.

### Constraints
- `denomination > 0` for standard deposit; `denomination = 0` for POOL_INIT
- Canonical pool for `(asset_id, denomination)` must already exist (standard deposit)
- `vin.length ≥ 2`; `vin[1]` is the asset input
- No tacit UTXO produced — validator returns `false`
- `vout[0]` of reveal tx is BTC change

### TypeScript

```typescript
export interface T_DEPOSIT {
  opcode: "T_DEPOSIT";
  payload: Uint8Array;
  assetId: string;
  denomination: bigint;
  leafCommitment?: Uint8Array;
  kernelSig?: Uint8Array;
  // POOL_INIT variant:
  poolDenom?: bigint;
  vkCid?: string;
  ceremonyCid?: string;
  initSig?: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.10](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
