# 0x58 T_CBTC_TAC_WITHDRAW_ATOMIC

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.49.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Atomic cBTC.tac withdraw combining WITHDRAW + LP_REMOVE in one tx.**

### Wire layout

```
T_CBTC_TAC_WITHDRAW_ATOMIC(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| slot_denom_sats_LE(8)
|| burn_count(1)             M ∈ [1, 16]
|| burn_nullifiers(M*32)
|| burn_commits(M*33)
|| burn_amount_LE(8)         MUST = position.mint_amount
|| lp_share_amount_LE(8)     MUST = position lien.lp_share_amount
|| recv_cbtc_zk_commit(33)   Pedersen for LP_REMOVE output
|| recv_tac_commit(33)       Pedersen for TAC LP_REMOVE output
|| bind_hash(32)
|| proof_length(2)
|| groth16_proof(proof_length)
```

### Constraints
- Atomic: combines WITHDRAW + LP_REMOVE in one tx
- burn_count ∈ [1, 16]
- Slot K_btc must be spent in this tx

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.49](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
