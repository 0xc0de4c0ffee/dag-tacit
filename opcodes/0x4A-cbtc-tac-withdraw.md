# 0x4A T_CBTC_TAC_WITHDRAW

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Cooperative unwind: burn cBTC.tac → release LP-share lien + spend slot K_btc.**

### Wire layout

```
T_CBTC_TAC_WITHDRAW(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| burn_count(1)             M ∈ [1, 16]
|| burn_nullifiers(M*32)
|| burn_commits(M*33)
|| burn_amount_LE(8)         MUST equal position.mint_amount
|| burn_balance_proof(var)   bulletproof: Σ amounts = burn_amount
|| insurance_claim_TAC_LE(8)
|| bond_return_commit(33)    Pedersen for TAC bond-return UTXO
|| bind_hash(32)
|| proof_length(2)
|| groth16_proof(proof_length)
```

### Constraints
- burn_count ∈ [1, 16]
- burn_amount must equal position.mint_amount
- bind_hash domain: "tacit-cbtc-tac-withdraw-v1"

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
