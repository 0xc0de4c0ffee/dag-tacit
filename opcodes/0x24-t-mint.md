# 0x24 T_MINT

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Produces 1 confidential UTXO at `vout[0]` of the reveal tx.** Requires issuer Schnorr signature under the `mint_authority` pubkey from the original CETCH.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x24` |
| 1 | 32 | asset_id | bytes | must equal SHA256(etch_txid_BE || 0_LE) for canonical bind |
| 33 | 32 | etch_txid | bytes | reference to the original CETCH reveal tx |
| 65 | 33 | commitment | bytes33 | Pedersen C = mint_amount·H + r_m·G |
| 98 | 8 | amount_ct | u64 LE | u64 LE mint_amount XOR HMAC-keystream (issuer-only) |
| 106 | 2 | rp_len | u16 LE | |
| 108 | N | rangeproof | bytes | aggregated bulletproof, m=1, n=64 |
| 108 | 64 | issuer_sig | bytes64 | Schnorr sig under mint_authority pubkey |

### Mint authorization message

mint_msg = SHA256(
    "tacit-mint-v1"
    || asset_id(32)
    || commit_anchor(36)    // commit_tx.vin[0].txid_BE || commit_tx.vin[0].vout_LE
    || commitment(33)
    || amount_ct(8)
)

### Constraints
- `asset_id == SHA256(etch_txid_BE || 0_LE)`
- Parent CETCH must exist and have non-zero `mint_authority`
- `issuer_sig` verifies under `mint_authority` over `mint_msg`
- `vout[0]` of reveal tx holds the new supply UTXO

### TypeScript

```typescript
export interface T_MINT {
  opcode: "T_MINT";
  payload: Uint8Array;
  assetId: string;
  etchTxid: string;
  commitment: Uint8Array;
  amountCt: Uint8Array;
  rpLen: number;
  rangeproof: Uint8Array;
  issuerSig: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.3](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
