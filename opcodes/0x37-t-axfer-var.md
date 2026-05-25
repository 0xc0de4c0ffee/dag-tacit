# 0x37 T_AXFER_VAR

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Reuses CXFER N=2 cryptography.** Asset-input count tightened to exactly 1. vout layout interleaved: tacit outputs at vout[0] (recipient) and vout[2] (maker change), BTC payment at vout[1]. MANDATORY 80-byte OP_RETURN recovery payload at vout[3].

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x37` |
| 1 | 32 | asset_id | bytes |  |
| 33 | 1 | asset_input_count | u8 | u8 = 0x01 exactly |
| 34 | 1 | N | u8 | u8 = 0x02 (recipient + maker change) |
| 35 | 33 | commitment_0 | bytes33 | recipient commitment (Pedersen) |
| 68 | 8 | amount_ct_0 | u64 LE | u64 LE — keystream-encrypted ciphertext |
| 76 | 33 | commitment_1 | bytes33 | maker change commitment (Pedersen) |
| 109 | 8 | amount_ct_1 | u64 LE | u64 LE — keystream-encrypted ciphertext |
| 117 | 2 | rp_len | u16 LE | u16 LE |
| 119 | N | rangeproof | bytes | aggregated bulletproof m=2 |
| 119 | 64 | kernel_sig | bytes64 | BIP-340 |

### Bitcoin transaction layout (normative)

vin[0]   = commit P2TR (envelope-bearing taproot script-path spend)
vin[1]   = maker's single tacit asset input (SIGHASH_SINGLE_ACP)
vin[2..] = taker's BTC funding inputs

vout[0]  = recipient tacit UTXO
vout[1]  = maker BTC payment
vout[2]  = maker change tacit UTXO
vout[3]  = OP_RETURN(80) dual-recovery payload (MANDATORY)

### Constraints
- `asset_input_count == 0x01`, `N == 0x02` (fixed)
- Asset input `vin[1]` is a validated outpoint of `asset_id`
- Recovery OP_RETURN at `vout[3]` is MANDATORY (80-byte single or split 40+40)
- Uses `tacit-kernel-v1` domain tag (same as CXFER / T_AXFER)
- `kernel_msg = SHA256("tacit-kernel-v1" \|\| asset_id \|\| asset_input_count \|\| asset_input_outpoint \|\| output_commitments_concat \|\| burned_amount_LE=0)`

### TypeScript

```typescript
export interface T_AXFER_VAR {
  opcode: "T_AXFER_VAR";
  payload: Uint8Array;
  assetId: string;
  assetInputCount: number;
  N: number;
  commitments: Uint8Array[];
  amountCts: Uint8Array[];
  rpLen: number;
  rangeproof: Uint8Array;
  kernelSig: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.7.9](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
