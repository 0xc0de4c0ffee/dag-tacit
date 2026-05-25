# 0x59 T_CBTC_TAC_TOP_UP

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.50.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Lien top-up: add more TAC bond to an existing cBTC.tac position.**

### Wire layout

```
T_CBTC_TAC_TOP_UP(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| old_bond_outpoint(36)
|| old_bond_commit(33)
|| old_bond_amount_LE(8)
|| add_count(1)              1..15
|| adds(add_count × 77)      each: outpoint(36) + commit(33) + amount_LE(8)
|| new_bond_commit(33)
|| new_bond_amount_LE(8)
|| new_bond_blinding(32)
|| depositor_sig(64)
|| bind_hash(32)
```

### Constraints
- No ZK proof (all amounts + blindings revealed)
- add_count ∈ [1, 15]
- bind_hash domain: "tacit-ctac-topup-v1"
- Pedersen balance: new_bond_commit == old_bond_commit + Σ add_commit[i]

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.50](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
