# 0x5A T_CBTC_TAC_BOND_RELEASE

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.51.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Partial bond release from a cBTC.tac position.**

### Wire layout

```
T_CBTC_TAC_BOND_RELEASE(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| old_bond_outpoint(36)
|| old_bond_commit(33)
|| old_bond_amount_LE(8)
|| new_bond_commit(33)
|| new_bond_amount_LE(8)
|| new_bond_blinding(32)
|| release_commit(33)
|| release_amount_LE(8)
|| release_blinding(32)
|| recipient_pk(33)
|| depositor_sig(64)
|| bind_hash(32)
```

### Constraints
- No ZK proof (same model as TOP_UP)
- new_bond_amount > 0 and release_amount > 0
- Pedersen balance: old_bond_commit == new_bond_commit + release_commit
- bind_hash domain: "tacit-ctac-release-v1"

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.51](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
