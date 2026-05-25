# 0x57 T_CBTC_TAC_DEPOSIT_ATOMIC

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.48.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Atomic cBTC.tac deposit combining LP_ADD + DEPOSIT in one tx.**

### Wire layout

```
T_CBTC_TAC_DEPOSIT_ATOMIC(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| slot_denom_sats_LE(8)
|| pool_id(32)               TAC-paired pool
|| delta_cbtc_zk_LE(8)
|| delta_tac_LE(8)
|| share_amount_LE(8)
|| cbtc_zk_input_outpoint(36)
|| cbtc_zk_input_commit(33)
|| tac_input_outpoint(36)
|| tac_input_commit(33)
|| lp_share_commit(33)
|| depositor_recovery_commit(33)
|| mint_amount_LE(8)         MUST = slot_denom_sats
|| mint_recipient_commit(33)
|| bind_hash(32)
|| proof_length(2)
|| groth16_proof(proof_length)
```

### Constraints
- Atomic: combines LP_ADD + DEPOSIT in one tx
- bind_hash domain: "tacit-ctac-deposit-atomic-v1"
- mint_amount == slot_denom_sats == leaf_record.denom_sats

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.48](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
