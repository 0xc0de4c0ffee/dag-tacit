# 0x2D T_LP_ADD

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential LP-share UTXO.** Two variants: variant=0 (standard add), variant=1 (POOL_INIT).

### Wire layout (variant 0, standard)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2D` |
| 1 | 1 | variant | u8 | u8 = 0x00 |
| 2 | 32 | asset_A | bytes | lex-smaller |
| 34 | 32 | asset_B | bytes | lex-larger |
| 66 | 8 | delta_A_LE | u64 LE | u64 LE, > 0 |
| 74 | 8 | delta_B_LE | u64 LE | u64 LE, > 0 |
| 82 | 8 | share_amount_LE | u64 LE | u64 LE, > 0 |
| 90 | 33 | share_C_secp | bytes33 | compressed Pedersen-secp |
| 123 | 32 | share_C_BJJ | bytes32 | packed BJJ (§3.9) |
| 155 | 169 | share_xcurve_sigma | bytes | sigma cross-curve binding (§3.10) |
| 324 | 64 | kernel_sig_A | bytes64 | BIP-340 |
| 388 | 64 | kernel_sig_B | bytes64 | BIP-340 |
| 452 | 2 | proof_len_LE | u16 LE | u16 LE |
| 454 | N | proof | bytes | Groth16 batch proof |

Fixed prefix: **454 bytes** before proof.

### Wire layout (variant 1, POOL_INIT)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2D` |
| 1 | 1 | variant | u8 | u8 = 0x01 |
| 2 | 32 | asset_A | bytes | lex-smaller |
| 34 | 32 | asset_B | bytes | lex-larger |
| 66 | 8 | delta_A_LE | u64 LE | u64 LE, > 0 |
| 74 | 8 | delta_B_LE | u64 LE | u64 LE, > 0 |
| 82 | 8 | share_amount_LE | u64 LE | u64 LE, > 0 |
| 90 | 33 | share_C_secp | bytes33 | compressed Pedersen-secp |
| 123 | 32 | share_C_BJJ | bytes32 | packed BJJ (§3.9) |
| 155 | 169 | share_xcurve_sigma | bytes | sigma cross-curve binding (§3.10) |
| 324 | 64 | kernel_sig_A | bytes64 | BIP-340 |
| 388 | 64 | kernel_sig_B | bytes64 | BIP-340 |
| 452 | 2 | fee_bps_LE | u16 LE | u16 LE, 0..1000 |
| 454 | 1 | vk_cid_len | u8 | u8, 1..64 |
| 455 | N | vk_cid | UTF-8 | IPFS CID (UTF-8) |
| 455 | 1 | ceremony_cid_len | u8 | u8, 1..64 |
| 456 | ... | ceremony_cid | UTF-8 | IPFS CID of MPC ceremony (UTF-8) |
| 456 | 1 | arbiter_count | u8 | u8, 0..16 |
| 457 | 1 | arbiter_threshold_m | u8 | u8 — 0 if count=0; else 1..count |
| 458 | 33 | arbiter_pubkeys | bytes | C = arbiter_count |
| 491 | 1 | launcher_sig_count | u8 | u8, 0..2 |
| 492 | 64 | launcher_sigs | bytes | L = launcher_sig_count |
| 556 | 33 | protocol_fee_address | bytes | all-zeros = disabled |
| 589 | 2 | protocol_fee_bps_LE | u16 LE | u16 LE, 0..1000 |
| 591 | 1 | pool_meta_uri_len | u8 | u8, 0..255 |
| 592 | N | pool_meta_uri | UTF-8 | UTF-8, M = pool_meta_uri_len |
| 592 | 1 | pool_capability_flags | u8 | u8 bitfield |
| 593 | 2 | proof_len_LE | u16 LE | u16 LE |
| 595 | N | proof | bytes | Groth16 batch proof |

Then: proof_len(2) + proof(N).

### Constraints (both variants)
- `asset_A < asset_B` (lex order)
- `variant ∈ {0, 1}`
- Variant 0: existing pool must exist
- Variant 1: pool must not exist; `fee_bps ≤ 1000`, `protocol_fee_bps ≤ 1000`
- `delta_A_LE > 0`, `delta_B_LE > 0`, `share_amount_LE > 0`

### TypeScript

```typescript
export interface T_LP_ADD_V0 {
  opcode: "T_LP_ADD";
  variant: 0;
  payload: Uint8Array;
  assetA: string;
  assetB: string;
  deltaA: bigint;
  deltaB: bigint;
  shareAmount: bigint;
  shareCSecp: Uint8Array;
  shareCBJJ: Uint8Array;
  shareXcurveSigma: Uint8Array;
  kernelSigA: Uint8Array;
  kernelSigB: Uint8Array;
  proofLen: number;
  proof: Uint8Array;
}

export interface T_LP_ADD_V1_POOL_INIT {
  opcode: "T_LP_ADD";
  variant: 1;
  payload: Uint8Array;
  assetA: string;
  assetB: string;
  deltaA: bigint;
  deltaB: bigint;
  shareAmount: bigint;
  shareCSecp: Uint8Array;
  shareCBJJ: Uint8Array;
  shareXcurveSigma: Uint8Array;
  kernelSigA: Uint8Array;
  kernelSigB: Uint8Array;
  feeBps: number;
  vkCid: string;
  ceremonyCid: string;
  arbiterCount: number;
  arbiterThresholdM: number;
  arbiterPubkeys: Uint8Array;
  launcherSigCount: number;
  launcherSigs: Uint8Array;
  protocolFeeAddress: Uint8Array;
  protocolFeeBps: number;
  poolMetaUriLen: number;
  poolMetaUri: string;
  poolCapabilityFlags: number;
  proofLen: number;
  proof: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.14](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
