# 0x30 T_INTENT_ATTEST

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**No confidential outputs.** Pure metadata envelope.

### Wire layout

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x30` |
| 1 | 32 | scope_id | bytes | canonical identifier |
| 33 | 32 | intent_pool_hash | bytes | SHA256(sorted intent_ids) |
| 65 | 4 | observed_height_LE | u32 LE | u32 LE |
| 69 | 8 | timestamp_LE | u64 LE | u64 LE — unix seconds |
| 77 | 2 | intent_count_LE | u16 LE | u16 LE |
| 79 | 1 | snapshot_uri_len | u8 | u8, 0..255 |
| 80 | N | snapshot_uri | UTF-8 | UTF-8 |
| 80 | 33 | worker_pubkey | bytes33 | compressed secp256k1 |
| 113 | 64 | worker_sig | bytes64 | BIP-340 |

Total: `177 + snapshot_uri_len` bytes.

### Constraints
- `observed_height ≤ envelope_height` (no future-state claims)
- `worker_sig` verifies under `worker_pubkey`
- No equivocation per `(scope_id, worker_pubkey, observed_height)`

### TypeScript

```typescript
export interface T_INTENT_ATTEST {
  opcode: "T_INTENT_ATTEST";
  payload: Uint8Array;
  scopeId: string;
  intentPoolHash: Uint8Array;
  observedHeight: number;
  timestamp: bigint;
  intentCount: number;
  snapshotUriLen: number;
  snapshotUri: string;
  workerPubkey: Uint8Array;
  workerSig: Uint8Array;
}

---
**Reference:** [Tacit SPEC.md §5.17](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
