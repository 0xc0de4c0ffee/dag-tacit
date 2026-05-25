# 0x4C T_CTAC_LIEN_CLAIM

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Burn cBTC.tac → mint pro-rata LP-share from claim pool. (Wire format preserved from T_SHARE_SLASH_CLAIM.)**

### Wire layout

```
T_CTAC_LIEN_CLAIM(1)
|| network_tag(1)
|| share_count(1)            M ∈ [1, 16]
|| share_nullifiers(M*32)
|| share_commits(M*33)
|| share_burn_amount_LE(8)
|| share_balance_proof(var)  bulletproof
|| claim_TAC_LE(8)           MUST = share_burn_amount × per_share_insurance_TAC
|| recipient_commit(33)
|| bind_hash(32)
|| proof_length(2)
|| groth16_proof(proof_length)
```

### Constraints
- share_count ∈ [1, 16]
- claim_TAC must match current pool ratio exactly

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
