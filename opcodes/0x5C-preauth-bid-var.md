# 0x5C T_PREAUTH_BID_VAR

> Opcode wire format from the [SPEC-PREAUTH-BID-VAR-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-PREAUTH-BID-VAR-AMENDMENT.md) §5.7.12.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Buyer-offline partial-fill preauthorized bid. Uses K pre-signature pattern.**

### Wire layout

```
T_PREAUTH_BID_VAR(1)
|| asset_id(32)
|| asset_input_count(1)      N ≥ 1
|| bid_id(16)
|| recipient_pubkey(33)
|| price_per_unit_LE(8)      sats per scaled unit
|| max_fill_LE(8)            in scaled units
|| fill_increment_LE(8)      in scaled units
|| fill_amount_LE(8)         seller chosen ratio
|| recipient_blinding(32)    cleartext
|| refund_script_hash(20)    hash160 of refund pubkey
|| decimals_scale(1)         log10 base units per scaled unit
|| kernel_sig(64)
|| N_outputs(1)
|| commitments(N*33)
|| encryptedAmounts(N*8)     seller self-keystream if N=2
|| rp_len(2)
|| rangeproof(rp_len)
```

### Constraints
- Inline bid-context: ~138 bytes
- K pre-signature pattern: up to 256 SIGHASH_SINGLE_ACP sigs
- bid_context_hash domain: "tacit-preauth-bid-var-context-v1"
- Refund-vout when fill_amount < max_fill

---
**Reference:** [SPEC-PREAUTH-BID-VAR-AMENDMENT.md §5.7.12](../tacit-spec/spec/amendments/SPEC-PREAUTH-BID-VAR-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
