# 0x22 T_CXFER_BPP

> Opcode wire format from the [SPEC-CXFER-BPP-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CXFER-BPP-AMENDMENT.md) §5.47.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Bulletproofs+ variant of CXFER. Byte-identical to T_CXFER (0x23) except opcode byte and rangeproof uses Bulletproofs+ (~14% smaller witness).**

### Wire layout

```
T_CXFER_BPP(1)
|| asset_id(32)
|| kernel_sig(64)            Schnorr sig over kernel_msg
|| N(1)                      number of outputs, ∈ {1,2,4,8}
|| (commitment(33) || amount_ct(8))  ×N
|| rp_len(2)
|| rangeproof(rp_len)        aggregated Bulletproofs+, m=N, n=64
```

### Constraints
- N ∈ {1, 2, 4, 8}
- Byte-identical to T_CXFER except opcode and proof bytes
- kernel_msg domain: "tacit-kernel-v1" (reused from §5.2)
- Same Pedersen commitments, same generator vectors as T_CXFER

---
**Reference:** [SPEC-CXFER-BPP-AMENDMENT.md §5.47](../tacit-spec/spec/amendments/SPEC-CXFER-BPP-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
