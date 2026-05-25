# 0x2E T_LP_REMOVE

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 2 confidential receipt UTXOs** (vout[0] = asset A, vout[1] = asset B).

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2E` |
| 1 | 32 | asset_A | bytes |  |
| 33 | 32 | asset_B | bytes |  |
| 65 | 8 | share_amount_LE | u64 LE | u64 LE, > 0 |
| 73 | 8 | delta_A_LE | u64 LE | u64 LE — public receipt |
| 81 | 8 | delta_B_LE | u64 LE | u64 LE — public receipt |
| 89 | 33 | recv_A_C_secp | bytes |  |
| 122 | 32 | recv_A_C_BJJ | bytes |  |
| 154 | 169 | recv_A_xcurve_sigma | bytes |  |
| 323 | 33 | recv_B_C_secp | bytes |  |
| 356 | 32 | recv_B_C_BJJ | bytes |  |
| 388 | 169 | recv_B_xcurve_sigma | bytes |  |
| 557 | 64 | kernel_sig_LP | bytes64 | BIP-340 |
| 621 | 2 | proof_len_LE | u16 LE | u16 LE |
| 623 | N | proof | bytes | Groth16 |

Fixed prefix: **623 bytes** before proof.

### Constraints
- `share_amount_LE > 0`
- Existing pool must exist
- Proportional: `delta_A == floor(R_A · share_amount / S)`, `delta_B == floor(R_B · share_amount / S)`

### TypeScript

```typescript
export interface T_LP_REMOVE {
  opcode: "T_LP_REMOVE";
  payload: Uint8Array;
  assetA: string;
  assetB: string;
  shareAmount: bigint;
  deltaA: bigint;
  deltaB: bigint;
  recvACSecp: Uint8Array;
  recvACBJJ: Uint8Array;
  recvAXcurveSigma: Uint8Array;
  recvBCSecp: Uint8Array;
  recvBCBJJ: Uint8Array;
  recvBXcurveSigma: Uint8Array;
  kernelSigLP: Uint8Array;
  proofLen: number;
  proof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.15](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
