# 0x45 T_SLOT_ROTATE

> Opcode wire format from the [SPEC-CBTC-ZK-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) §5.23.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Self-custody-slot wrapper atomic transfer (key rotation). Combines T_SLOT_BURN + T_SLOT_MINT in one tx.**

### Wire layout

```
T_SLOT_ROTATE(1)
|| network_tag(1)
|| asset_id(32)
|| denom_sats_LE(8)
|| old_merkle_root(32)
|| old_nullifier_hash(32)
|| old_recipient_commit(33)
|| old_r_leaf(32)
|| old_bind_hash(32)
|| old_proof_length(2)
|| old_groth16_proof(old_proof_length)
|| new_recipient_commit(33)
|| new_leaf_hash(32)
|| payment_asset_id(32)      0x00..00 = no payment
|| payment_amount_LE(8)      0 = no payment
|| old_owner_pubkey(33)      compressed
|| old_owner_sig(64)          BIP-340 over slot_rotate_msg
```

### Constraints
- Domain tag: "tacit-slot-rotate-v1"
- Supply conserved (not decremented/incremented)
- Old owner sig binds rotation to new note terms

---
**Reference:** [SPEC-CBTC-ZK-AMENDMENT.md §5.23](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
