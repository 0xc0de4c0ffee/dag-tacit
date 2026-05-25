# 0x47 T_SLOT_MERGE

> Opcode wire format from the [SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md) §5.25.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Atomic N→1 slot merge, ΣD_old ≥ D_new. Supports 2–16 inputs.**

### Wire layout

```
T_SLOT_MERGE(1)
|| network_tag(1)
|| n_inputs(1)               u8, 2..16
|| inputs(n_inputs)          each: asset_id(32)+denom_LE(8)+merkle_root(32)+nullifier(32)+commit(33)+r_leaf(32)+bind_hash(32)+proof_length(2)+proof(var)
|| asset_id_new(32)
|| denom_new_LE(8)
|| new_recipient_commit(33)
|| new_leaf_hash(32)
|| new_owner_pubkey(33)
|| new_owner_sig(64)
```

### Constraints
- n_inputs ∈ [2, 16]
- Σ denom_old_i ≥ denom_new + bitcoin_fee
- Each old input validated via T_SLOT_BURN-equivalent logic

---
**Reference:** [SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md §5.25](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
