# 0x4B T_CBTC_TAC_FORCE_CLOSE

> Opcode wire format from the [SPEC-CBTC-TAC-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Permissionless liquidation when bond ratio < liquidation threshold.**

### Wire layout

```
T_CBTC_TAC_FORCE_CLOSE(1)
|| network_tag(1)
|| target_leaf_hash(32)
|| liquidator_payout_pk(33) BTC payout address
|| amm_swap_min_BTC_out_LE(8)
|| bind_hash(32)
```

### Constraints
- Triggered when current_ratio < LIQUIDATION_RATIO (1.2×)
- FORCE_CLOSES_PER_BLOCK ≤ MAX_FORCE_CLOSES_PER_BLOCK (5)
- Fixed 75 bytes payload

---
**Reference:** [SPEC-CBTC-TAC-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CBTC-TAC-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
