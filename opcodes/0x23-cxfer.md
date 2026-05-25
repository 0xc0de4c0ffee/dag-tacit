# 0x23 CXFER

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces N confidential UTXOs** at `vout[0..N-1]`. Mimblewimble-style balance equation: `Σ outputs == Σ inputs`. All `vin[1..]` are tacit asset inputs.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x23` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 64 | kernel_sig | bytes64 | Schnorr sig over kernel_msg |
| 97 | 1 | N | u8 | ∈ {1, 2, 4, 8} |
| 98 | 33 | commitment | bytes33 | (repeated N times) |
| 98+N*41 | 8 | amount_ct | u64 LE | (repeated N times) |
| after | 2 | rp_len | u16 LE | |
| after | M | rangeproof | bytes | aggregated bulletproof, m=N |

### Kernel message

kernel_msg = SHA256(
    "tacit-kernel-v1"
    || asset_id(32)
    || in_count(1) || (input_txid_BE(32) || input_vout_LE(4))*in_count
    || out_count(1) || output_commitment(33)*out_count
    || burned_amount_LE(8)    // 0 for CXFER
)

Kernel sig verifies under `E'.x_only()` where `E' = Σ output_commitments − Σ input_commitments`.

### Constraints
- `N ∈ {1, 2, 4, 8}`
- Balance: `Σ outputs == Σ inputs` (burned_amount = 0)
- `in_count` and `out_count` are 1-byte unsigned

### TypeScript

```typescript
export interface CXFER {
  opcode: "CXFER";
  payload: Uint8Array;
  assetId: string;
  kernelSig: Uint8Array;
  N: number;
  commitments: Uint8Array[];
  amountCts: Uint8Array[];
  rpLen: number;
  rangeproof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.2](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
