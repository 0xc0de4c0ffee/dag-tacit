# 0x27 T_PETCH

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**No supply UTXO is created.** Declares an asset whose supply is issued by anyone via T_PMINT in fixed tranches of `mint_limit`. `vout[0]` of the reveal tx is a regular Bitcoin output (change), not a tacit UTXO.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x27` |
| 1 | 1 | ticker_len | u8 | u8, 1..16 |
| 2 | N | ticker | UTF-8 | UTF-8 |
| 2 | 1 | decimals | u8 | u8, 0..8 |
| 3 | 8 | cap_amount | u64 LE | u64 LE base units, > 0 — lifetime mint cap |
| 11 | 8 | mint_limit | u64 LE | u64 LE base units, > 0 — exact per-T_PMINT amount |
| 19 | 4 | mint_start_height | u32 LE | u32 LE — 0 ⇒ "etch_height + 1" (next confirmed block) |
| 23 | 4 | mint_end_height | u32 LE | u32 LE — 0 ⇒ no end height (open until cap) |
| 27 | 2 | img_len | u16 LE | u16 LE, 0..256 |
| 29 | N | image_uri | UTF-8 | UTF-8 (typically "ipfs://bafk…") |

### Constraints
- `ticker_len ∈ [1, 16]`, `decimals ∈ [0, 8]`
- `cap_amount > 0`, `mint_limit > 0`
- `cap_amount % mint_limit == 0`
- `asset_id = SHA256(reveal_txid_BE || 0_LE)` — same derivation as CETCH
- No commitment, no rangeproof, no kernel sig — permissionless
- `vout[0]` is NOT a tacit UTXO

### TypeScript

```typescript
export interface T_PETCH {
  opcode: "T_PETCH";
  payload: Uint8Array;
  tickerLen: number;
  ticker: string;
  decimals: number;
  capAmount: bigint;
  mintLimit: bigint;
  mintStartHeight: number;
  mintEndHeight: number;
  imgLen: number;
  imageUri: string;
}

---
**Reference:** [Tacit SPEC.md §5.8](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
