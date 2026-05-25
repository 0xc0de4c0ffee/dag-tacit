# 0x4F T_CTAC_LIEN_SPLIT

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Split a liened LP-share UTXO into multiple outputs; lien inherits onto one chosen output.**

### Wire layout

```
T_CTAC_LIEN_SPLIT(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| n_outputs(1)              u8, 2..16
|| outputs(n_outputs × 33)   Pedersen commitments for each split
|| bind_hash(32)
|| depositor_sig(64)         BIP-340
```

### Constraints
- Σ output amounts = old bond amount
- Lien attaches to one output (must still meet 2× collateral)

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
