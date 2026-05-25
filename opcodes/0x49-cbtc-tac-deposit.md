# 0x49 T_CBTC_TAC_DEPOSIT

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**LP-shaped mint: cBTC.zk slot + LP-share lien on canonical (cBTC.zk, TAC) pool → cBTC.tac.**

### Wire layout

```
T_CBTC_TAC_DEPOSIT(1)
|| network_tag(1)
|| target_leaf_hash(32)     cBTC.zk slot leaf hash
|| slot_denom_sats_LE(8)
|| bond_amount_TAC_LE(8)    TAC amount locked as collateral
|| bond_source_outpoint(36) TAC UTXO consumed for bond
|| bond_commit(33)          Pedersen commit of TAC bond UTXO
|| depositor_recovery_commit(33) blinded-pubkey commit
|| mint_amount_LE(8)        MUST equal slot_denom_sats
|| mint_recipient_commit(33) Pedersen for new cBTC.tac UTXO
|| bind_hash(32)
|| proof_length(2)
|| groth16_proof(proof_length)
```

### Constraints
- mint_amount must equal slot_denom_sats
- bond_ratio ≥ INITIAL_BOND_RATIO (default 2.0)
- bind_hash domain: "tacit-cbtc-tac-deposit-v1"

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
