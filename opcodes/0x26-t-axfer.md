# 0x26 T_AXFER

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces N confidential UTXOs at `vout[0..N-1]`.** Like CXFER but with auxiliary BTC inputs/outputs. `asset_input_count` declares how many `vin[1..]` are tacit asset inputs — the remainder are aux BTC funding inputs.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x26` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 1 | asset_input_count | u8 | 1..255 |
| 34 | 64 | kernel_sig | bytes64 | Schnorr sig over kernel_msg |
| 98 | 1 | N | u8 | ∈ {1, 2, 4, 8} |
| 99 | 33 | commitment | bytes33 | (repeated N times) |
| 99+N*41 | 8 | amount_ct | u64 LE | (repeated N times) |
| after | 2 | rp_len | u16 LE | |
| after | M | rangeproof | bytes | aggregated bulletproof, m=N |

### Kernel message
Identical to CXFER's kernel msg, with `in_count := asset_input_count`:

kernel_msg = SHA256(
    "tacit-kernel-v1"
    || asset_id(32)
    || asset_input_count(1) || (input_txid_BE(32) || input_vout_LE(4))*asset_input_count
    || N(1) || output_commitment(33)*N
    || burned_amount_LE(8)    // always 0 for T_AXFER
)

### Constraints
- `asset_input_count ∈ [1, 255]`
- `N ∈ {1, 2, 4, 8}`
- `vin[1..1+asset_input_count]` are tacit asset inputs
- `vin[1+asset_input_count..]` are aux BTC inputs (not tacit-validated)
- `vout[0..N-1]` are tacit outputs; `vout[N..]` are aux BTC outputs
- Auxiliary inputs/outputs never enter the balance equation

### TypeScript

```typescript
export interface T_AXFER {
  opcode: "T_AXFER";
  payload: Uint8Array;
  assetId: string;
  assetInputCount: number;
  kernelSig: Uint8Array;
  N: number;
  commitments: Uint8Array[];
  amountCts: Uint8Array[];
  rpLen: number;
  rangeproof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.7](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
