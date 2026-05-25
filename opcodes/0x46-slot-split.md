# 0x46 T_SLOT_SPLIT

> Opcode wire format from the [SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md) §5.24.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Atomic 1→N slot split, ΣD_new = D_old. Supports 2–16 outputs.**

### Wire layout

```
T_SLOT_SPLIT(1)
|| network_tag(1)
|| asset_id_old(32)          old slot wrapper asset_id
|| denom_old_LE(8)           u64 old slot denom_sats
|| old_merkle_root(32)
|| old_nullifier_hash(32)
|| old_recipient_commit(33)
|| old_r_leaf(32)
|| old_bind_hash(32)
|| old_proof_length(2)
|| old_proof(old_proof_length)
|| n_outputs(1)              u8, 2..16
|| outputs(n_outputs)        each: asset_id_new(32) + denom_new_LE(8) + commit(33) + leaf_hash(32)
|| old_owner_pubkey(33)
|| old_owner_sig(64)
```

### Constraints
- n_outputs ∈ [2, 16]
- Domain tag: "tacit-slot-split-v1"
- denom_old ≥ Σ denom_new_i

---
**Reference:** [SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md §5.24](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
