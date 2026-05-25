# 0x2F T_SWAP_BATCH

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces per-trader receipt UTXOs** at `vout[1+i]`. Optional aggregate tip outputs.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x2F` |
| 1 | 32 | asset_A | bytes |  |
| 33 | 32 | asset_B | bytes |  |
| 65 | 1 | n_intents | u8 | u8, 1..16 |
| 66 | 9 | delta_A_net_signed | u64 LE | sign(1) + u64 LE(8) |
| 75 | 9 | delta_B_net_signed | u64 LE | sign(1) + u64 LE(8) |
| 84 | 32 | R_net_A | bytes | secp scalar BE |
| 116 | 32 | R_net_B | bytes | secp scalar BE |
| 148 | 2 | fee_bps_at_settle_LE | u16 LE | u16 LE |
| 150 | 8 | tip_A_amount_LE | u64 LE | u64 LE |
| 158 | 8 | tip_B_amount_LE | u64 LE | u64 LE |
| 166 | 33 | tip_A_C_secp | bytes |  |
| 199 | 33 | tip_B_C_secp | bytes |  |
| 232 | 32 | r_tip_A_LE | bytes | secp scalar LE |
| 264 | 32 | r_tip_B_LE | bytes | secp scalar LE |

**Arbiter block** (conditionally present, when pool has `inclusion_arbiter_pubkeys`):

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 4 | expected_height_LE | u32 LE | |
| 4 | 32 | qualifying_set_hash | bytes | |
| 36 | 1 | arbiter_m | u8 | = pool.inclusion_arbiter_threshold_m |
| 37 | M | signer_indices | u8[M] | M = arbiter_m, strictly ascending |
| 37+M | 64*M | arbiter_sigs | bytes64 | BIP-340, M = arbiter_m |

**Per-intent block** (repeated n_intents times, in intent_id ascending order):

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | direction | u8 | 0 = A→B, 1 = B→A |
| 1 | 33 | trader_pubkey | bytes | |
| 34 | 33 | C_in_secp | bytes | |
| 67 | 32 | C_in_BJJ | bytes | |
| 99 | 169 | in_xcurve_sigma | bytes | |
| 268 | 8 | min_out_LE | u64 LE | |
| 276 | 8 | tip_amount_LE | u64 LE | |
| 284 | 4 | expiry_height_LE | u32 LE | |
| 288 | 64 | intent_sig | bytes | |

Per-intent block = **352 bytes**.

**Per-receipt block** (repeated n_intents times, same order):

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 33 | C_out_secp | bytes | |
| 33 | 32 | C_out_BJJ | bytes | |
| 65 | 169 | out_xcurve_sigma | bytes | |

Per-receipt block = **234 bytes**.

**Tail:**

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 2 | proof_len_LE | u16 LE | |
| 2 | N | proof | bytes | Groth16 |
| 2+N | 1 | settler_meta_uri_len | u8 | 0..255 |
| 3+N | M | settler_meta_uri | UTF-8 | M = settler_meta_uri_len |

### Constraints
- `n_intents ∈ [1, 16]` (unless POOL_CAP_SOLO_INTENT_ALLOWED, min is 2)
- `fee_bps_at_settle ≤ 1000`
- Per-intent ordering: strict ascending by intent_id
- `expiry_height >= current_height`
- Arbiter block present iff pool has arbiters

### TypeScript

```typescript
export interface SwapBatchIntent {
  direction: number;
  traderPubkey: Uint8Array;
  CInSecp: Uint8Array;
  CInBJJ: Uint8Array;
  inXcurveSigma: Uint8Array;
  minOut: bigint;
  tipAmount: bigint;
  expiryHeight: number;
  intentSig: Uint8Array;
}

export interface SwapBatchReceipt {
  COutSecp: Uint8Array;
  COutBJJ: Uint8Array;
  outXcurveSigma: Uint8Array;
}

export interface SwapBatchArbiter {
  expectedHeight: number;
  qualifyingSetHash: Uint8Array;
  arbiterM: number;
  signerIndices: Uint8Array;
  arbiterSigs: Uint8Array;
}

export interface T_SWAP_BATCH {
  opcode: "T_SWAP_BATCH";
  payload: Uint8Array;
  assetA: string;
  assetB: string;
  nIntents: number;
  deltaANetSign: number;
  deltaANetMag: bigint;
  deltaBNetSign: number;
  deltaBNetMag: bigint;
  RNetA: Uint8Array;
  RNetB: Uint8Array;
  feeBpsAtSettle: number;
  tipAAmount: bigint;
  tipBAmount: bigint;
  tipACSecp: Uint8Array;
  tipBCSecp: Uint8Array;
  rTipA: Uint8Array;
  rTipB: Uint8Array;
  arbiter: SwapBatchArbiter | null;
  intents: SwapBatchIntent[];
  receipts: SwapBatchReceipt[];
  proofLen: number;
  proof: Uint8Array;
  settlerMetaUriLen: number;
  settlerMetaUri: string;
}

---
**Reference:** [Tacit SPEC.md §5.16](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
