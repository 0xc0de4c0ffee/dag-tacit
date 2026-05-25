# 0x2C T_DCLAIM

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential UTXO at `vout[0]`.** Amount and blinding are public in the envelope.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2C` |
| 1 | 32 | asset_id | bytes | must equal drop.asset_id |
| 33 | 32 | drop_reveal_txid | bytes | the on-chain txid of the originating T_DROP reveal tx |
| 65 | 33 | commitment | bytes33 | Pedersen C = amount · H + blinding · G (compressed) |
| 98 | 8 | amount | u64 LE | u64 LE — public; MUST equal drop.per_claim |
| 106 | 32 | blinding | bytes | public scalar — 0 < blinding < curve_order |
| 138 | 2 | witness_len | u16 LE | u16 LE — 0 for open drops, > 0 if drop.merkle_root ≠ 0 |
| 140 | N | witness | bytes | eligibility witness; see structure below |

### Witness structure (Merkle-gated, `witness_len > 0`)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2C` |
| 1 | 4 | leaf_index | u32 LE | u32 LE — position of the claimant's leaf in the snapshot merkle tree |
| 5 | 20 | eth_address | bytes | the claimant's Ethereum address bound in the snapshot leaf |
| 25 | 65 | eth_sig | bytes | r(32) || s(32) || v(1), EIP-191 signature over canonical_claim_msg |
| 90 | 1 | proof_len | u8 | u8, 0..32 |
| 91 | proof_len*32 | proof_path | bytes | sibling hashes |

### Constraints
- `amount > 0`, `amount == drop.per_claim`
- `blinding`: not all-zero (trivial check)
- Open drops: `witness_len == 0`, `witness` empty
- `drop.merkle_root != 0` gates witness presence

### TypeScript

```typescript
export interface T_DCLAIM {
  opcode: "T_DCLAIM";
  payload: Uint8Array;
  assetId: string;
  dropRevealTxid: string;
  commitment: Uint8Array;
  amount: bigint;
  blinding: Uint8Array;
  witnessLen: number;
  witness: Uint8Array; // raw; for Merkle-gated drops includes recipient_pub(33) + leaf_index(4) + eth_address(20) + eth_sig(65) + proof_len(1) + proof_path(proof_len*32)
}

---
**Reference:** [Tacit SPEC.md §5.13](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
