# 0x32 T_SWAP_VAR

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential receipt UTXO** (`vout[1]`), **optional change UTXO** (`vout[2]`) if `C_change_or_sentinel` ≠ NO_CHANGE_SENTINEL, **optional tip** (`vout[3]`) if `tip_amount > 0`.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x32` |
| 1 | 1 | envelope_version | u8 | u8 = 0x01 |
| 2 | 32 | pool_id | bytes |  |
| 34 | 1 | direction | u8 | u8, 0 = A→B, 1 = B→A |
| 35 | 8 | R_A_pre | u64 LE | u64 LE — trader's view of reserve A |
| 43 | 8 | R_B_pre | u64 LE | u64 LE — trader's view of reserve B |
| 51 | 8 | delta_in | u64 LE | u64 LE — chosen fill amount |
| 59 | 8 | delta_in_min | u64 LE | u64 LE — Y, lower bound of range |
| 67 | 8 | delta_in_max | u64 LE | u64 LE — X, upper bound of range |
| 75 | 8 | delta_out | u64 LE | u64 LE — settler's computed Δout |
| 83 | 8 | min_out | u64 LE | u64 LE — slippage floor |
| 91 | 8 | tip_amount | u64 LE | u64 LE — settler tip |
| 99 | 1 | tip_asset | u8 | u8, 0 = asset_A, 1 = asset_B (== input asset) |
| 100 | 4 | expiry_height | u32 LE | u32 LE |
| 104 | 33 | trader_pubkey | bytes33 | compressed secp256k1 |
| 137 | 33 | C_in_secp | bytes | trader's input UTXO commitment |
| 170 | 33 | C_change_or_sentinel | bytes | 33×0x00 = NO_CHANGE_SENTINEL |
| 203 | 33 | C_receipt_secp | bytes | receipt commitment |
| 236 | 32 | r_receipt | bytes | scalar mod n_secp, BE |
| 268 | 2 | range_proof_len | u16 LE | u16 LE |
| 270 | N | range_proof | bytes | bulletproof m=2 |
| 270 | 64 | kernel_sig | bytes64 | BIP-340 over kernel_msg |
| 334 | 64 | intent_sig | bytes64 | BIP-340 over intent_msg |

Total: ~950–1000 bytes.

### Constraints
- `envelope_version == 0x01`
- `direction ∈ {0, 1}`
- `delta_in > 0`, `delta_in_min ≤ delta_in ≤ delta_in_max`
- `R_A_pre == pool.reserve_A`, `R_B_pre == pool.reserve_B`
- `current_height < expiry_height`
- `delta_out == curve_recompute(...)` (strict equality)
- `delta_out >= min_out`
- `r_receipt < n_secp`
- `C_receipt_secp == delta_out·H_secp + r_receipt·G_secp`
- OP_RETURN at vout[0] contains SHA256(payload)

### TypeScript

```typescript
export interface T_SWAP_VAR {
  opcode: "T_SWAP_VAR";
  payload: Uint8Array;
  envelopeVersion: number;
  poolId: string;
  direction: number;
  RAPre: bigint;
  RBPre: bigint;
  deltaIn: bigint;
  deltaInMin: bigint;
  deltaInMax: bigint;
  deltaOut: bigint;
  minOut: bigint;
  tipAmount: bigint;
  tipAsset: number;
  expiryHeight: number;
  traderPubkey: Uint8Array;
  CInSecp: Uint8Array;
  CChangeOrSentinel: Uint8Array;  // 33×0x00 = no-change sentinel
  CReceiptSecp: Uint8Array;
  rReceipt: Uint8Array;
  rangeProofLen: number;
  rangeProof: Uint8Array;
  kernelSig: Uint8Array;
  intentSig: Uint8Array;
}

---

---
**Reference:** [Tacit SPEC.md §5.20](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
