# 0x33 T_SWAP_ROUTE

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.
> **STATUS: DRAFTED.** Wire format from SPEC.md §5.22. Full architectural rationale in SPEC-SWAP-ROUTE-AMENDMENT.md.

**Produces 1 receipt UTXO** (vout[1]) **per trader, plus 1 OP_RETURN** (vout[0]). No protocol fee outputs in V1 (self-broadcast only).

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x33` |
| 1 | 1 | n_hops | u8 | u8, `2 ≤ n_hops ≤ 4` |
| 2 | 32 | trader_input_asset_id | bytes32 |  |
| 34 | 32 | trader_output_asset_id | bytes32 |  |
| 66 | 8 | min_out | u64 LE | slippage gate on final hop's output only |
| 74 | 4 | expiry_height | u32 LE | 0 = no expiry |
| 78 | 33 | trader_pubkey | bytes33 | compressed secp256k1 |

#### Per-hop block (67 bytes each, × n_hops)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 32 | pool_id | bytes32 |  |
| 32 | 1 | direction | u8 | 0 = asset_A input, 1 = asset_B input |
| 33 | 2 | fee_bps | u16 LE | pool's fee_bps at settlement |
| 35 | 8 | R_A_pre | u64 LE | pool reserve A pre-hop |
| 43 | 8 | R_B_pre | u64 LE | pool reserve B pre-hop |
| 51 | 8 | delta_a_net_mag | u64 LE | magnitude of pool's net A change |
| 59 | 8 | delta_b_net_mag | u64 LE | magnitude of pool's net B change |

#### Trader chain bindings

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 111 | 32 | txid | bytes32 BE | input outpoint txid (big-endian) |
| 143 | 4 | vout | u32 LE | input outpoint vout |
| 147 | 33 | C_in_secp | bytes33 | Pedersen commitment at input outpoint |
| 180 | 33 | C_receipt_secp | bytes33 | fresh receipt commitment |
| 213 | 32 | r_receipt | bytes32 | receipt blinding scalar |

#### Closures

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 245 | 2 | range_proof_len | u16 LE |  |
| 247 | VAR | range_proof | bytes | aggregated BP m=2 over (SENTINEL, C_receipt_secp) |
| — | 64 | kernel_sig | bytes64 | BIP-340 over kernel_msg |
| — | 64 | intent_sig | bytes64 | BIP-340 over route_msg under trader_pubkey |

### Bitcoin tx layout

| Index | Role |
|---|---|
| vin[0] | Envelope-bearing input (Taproot script-path); witness carries the T_SWAP_ROUTE payload |
| vin[1] | Trader's tacit asset UTXO of `trader_input_asset_id`; signed SIGHASH_ALL |
| vout[0] | `OP_RETURN(envelope_hash)` — 0 sat, 32-byte data; `envelope_hash = SHA256(payload)` |
| vout[1] | Trader's final receipt UTXO (DUST sats; asset is `trader_output_asset_id`) |
| vout[2..] | Optional settler-fee outputs (absent in V1) and settler change |

### Constraints

- `n_hops` MUST be in range `[2, 4]`.
- `trader_input_asset_id` MUST NOT equal `trader_output_asset_id`.
- If `expiry_height ≠ 0`, current height MUST be ≤ `expiry_height`.
- Each hop's `direction` MUST be `0` (A→B) or `1` (B→A).
- `fee_bps` MUST be ≤ 10,000 (100%).
- Asset chain MUST be continuous across hops: hop[k].output_asset === hop[k+1].input_asset.
- Amount chain MUST be continuous: hop[k].delta_out === hop[k+1].delta_in.
- CFMM floor identity MUST hold per hop.
- `delta_out_last ≥ min_out`.
- `r_receipt ≠ 0` AND `pedersenCommit(delta_out_last, r_receipt) == C_receipt_secp`.
- `P = C_receipt_secp − C_in_secp − (delta_out_last − delta_in_0)·H_secp` MUST NOT be ZERO.
- `kernel_sig` MUST verify over `kernel_msg` under `P.x_only` (BIP-340).
- `intent_sig` MUST verify over `route_msg` under `trader_pubkey` (BIP-340).
- Aggregated bulletproof `m=2` over `(ZERO_SENTINEL, C_receipt_secp)` MUST verify.

### Decode stub

```ts
function decodeTSwapRoutePayload(payload: Uint8Array): DecodedEnvelope {
  const v = new DataView(payload.buffer)
  let off = 1
  const n_hops = payload[off++]
  if (n_hops < 2 || n_hops > 4) return { ok: false, error: 'T_SWAP_ROUTE n_hops out of range' }
  const traderInputAssetId = payload.slice(off, off + 32); off += 32
  const traderOutputAssetId = payload.slice(off, off + 32); off += 32
  const minOut = v.getBigUint64(off, true); off += 8
  const expiryHeight = v.getUint32(off, true); off += 4
  const traderPubkey = payload.slice(off, off + 33); off += 33
  const hops: any[] = []
  for (let k = 0; k < n_hops; k++) {
    const poolId = payload.slice(off, off + 32); off += 32
    const direction = payload[off++]
    const feeBps = v.getUint16(off, true); off += 2
    const R_A_pre = v.getBigUint64(off, true); off += 8
    const R_B_pre = v.getBigUint64(off, true); off += 8
    const deltaANetMag = v.getBigUint64(off, true); off += 8
    const deltaBNetMag = v.getBigUint64(off, true); off += 8
    hops.push({ poolId, direction, feeBps, R_A_pre, R_B_pre, deltaANetMag, deltaBNetMag })
  }
  return {
    ok: true,
    opcode: 'T_SWAP_ROUTE',
    payload,
    fields: { n_hops, traderInputAssetId, traderOutputAssetId, minOut, expiryHeight, traderPubkey, hops },
  }
}
```
