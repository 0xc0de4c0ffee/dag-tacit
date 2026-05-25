# 0x25 T_BURN

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Burns asset supply.** `burned_amount` is public (cleartext). `N=0` means burn-everything (no output commitments, no rangeproof). Permissionless.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x25` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 8 | burned_amount | u64 LE | public |
| 41 | 64 | kernel_sig | bytes64 | Schnorr sig |
| 105 | 1 | N | u8 | ∈ {0,1,2,4,8}; N=0 ⇒ burn-everything |
| 106 | 33 | commitment | bytes33 | (repeated N times) |
| 106+N*41 | 8 | amount_ct | u64 LE | (repeated N times) |
| after | 2 | rp_len | u16 LE | omitted if N=0 |
| after | M | rangeproof | bytes | omitted if N=0 |

### Kernel message
Same form as CXFER (§5.2), with non-zero `burned_amount`:

Σ input_commitments == burned_amount · H + Σ output_commitments

### Constraints
- `N ∈ {0, 1, 2, 4, 8}`; N=0 = burn-everything (no outputs)
- `burned_amount` is public
- Permissionless — anyone can burn

### TypeScript

```typescript
export interface T_BURN {
  opcode: "T_BURN";
  payload: Uint8Array;
  assetId: string;
  burnedAmount: bigint;
  kernelSig: Uint8Array;
  N: number;
  commitments: Uint8Array[];
  amountCts: Uint8Array[];
  rpLen: number;
  rangeproof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.4](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
