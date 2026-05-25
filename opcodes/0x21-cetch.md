# 0x21 CETCH

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Creates 1 confidential UTXO at `vout[0]`.** Defines a new token with ticker, decimals, supply commitment, and optional mint authority. `mint_authority = 0x00..00` means non-mintable (fixed supply).

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x21` |
| 1 | 1 | ticker_len | u8 | u8, 1..16 |
| 2 | N | ticker | UTF-8 | UTF-8 |
| 2 | 1 | decimals | u8 | u8, 0..8 |
| 3 | 33 | commitment | bytes33 | Pedersen C = supply·H + r·G (compressed) |
| 36 | 8 | amount_ct | u64 LE | u64 LE supply XOR HMAC-keystream |
| 44 | 2 | rp_len | u16 LE | u16 LE rangeproof length |
| 46 | N | rangeproof | bytes | aggregated bulletproof, m=1, n=64 |
| 46 | 32 | mint_authority | bytes32 | x-only Schnorr pubkey, OR all-zero (=non-mintable) |
| 78 | 2 | img_len | u16 LE | u16 LE, 0..256 |
| 80 | N | image_uri | UTF-8 | UTF-8 (typically "ipfs://bafk…") |

### Constraints
- `ticker_len ∈ [1, 16]`, `decimals ∈ [0, 8]`
- `mint_authority`: all-zero = non-mintable (fixed supply)
- `asset_id = SHA256(reveal_txid_BE || 0_LE)` per §4
- No kernel_sig — the mint_authority pubkey is stored for future T_MINT verification

### TypeScript

```typescript
export interface CETCH {
  opcode: "CETCH";
  payload: Uint8Array;
  tickerLen: number;
  ticker: string;
  decimals: number;
  commitment: Uint8Array;
  amountCt: Uint8Array;
  rpLen: number;
  rangeproof: Uint8Array;
  mintAuthority: Uint8Array;
  imgLen: number;
  imageUri: string;
}

---
**Reference:** [Tacit SPEC.md §5.1](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
