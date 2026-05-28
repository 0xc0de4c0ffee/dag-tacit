# Agent Guidelines for dag-tacit

## Project Overview

**dag-tacit** is an IPLD DAG-CBOR encoding system for the Tacit protocol on Bitcoin. It converts Bitcoin blocks containing Tacit transactions into navigable IPLD DAG structures, serialized as CAR files for IPFS distribution.

- **Language**: TypeScript (Bun runtime)
- **Schema**: IPLD DAG-CBOR with CIDv1, SHA-256 multihash
- **Network**: Bitcoin mainnet, Tacit genesis block height 948242

## Architecture

```
opcodes/               — Per-opcode wire format docs (36 files, one per opcode)
scripts/
  blocks/
    fetch.ts           — Fetch Bitcoin blocks via RPC, filter Tacit txs → raw JSON
    dag.ts             — Build DAG-CBOR nodes from raw JSON artifacts
    car.ts             — Create CAR files (block/range/daily) from DAG nodes
    import.ts          — Import CAR files into IPFS Kubo
    full.ts            — Pipeline: fetch → dag → car
  assets/
    assets-dag.ts      — Build per-block asset DAG-CBOR JSON references
    assets-car.ts      — Build per-block asset CAR files from DAG JSON
    assets-build.ts    — Build unified asset index from per-block JSON
    assets-full.ts     — Pipeline: dag -> car -> build
  db/
    schema.ts          — Drizzle ORM schema (5 tables: blocks, assets, txs, vins, vouts)
    client.ts          — Bun SQLite Drizzle client factory
    migrate.ts         — Apply drizzle-kit SQL migrations
    init.ts            — Create DB + run migrations
    import.ts          — Populate DB from out/tacit-blocks/ JSON (supports --from/--to/--force)
    query.ts           — UTXO/envelope/address query CLI (bun run db:utxo)
    export.ts          — Export DB as SQL dump or JSON snapshot
    drizzle/           — Auto-generated migration files (drizzle-kit generate)
  utils.ts             — Shared CLI helpers

src/
  index.ts             — Barrel export for external consumers
  types.ts             — Shared TypeScript interfaces
  config.ts            — ALL constants, opcodes, genesis height, config loader, pin config
  assets/              — Asset parsing + DAG-CBOR node builders
  blocks/
    blocks-nodes.ts    — Block, Tx, VinEntry, VoutEntry builders + processBlock()
    blocks-car.ts      — Block CAR assembly, range root, block index
  lib/
    dag-cbor.ts        — Encoding, CID, hex helpers, btcToSatoshis
    envelope.ts        — Tacit envelope detection (magic bytes + OP_IF frame)
    car.ts             — Generic CAR helpers (header, entry, varint, assemble)
    pin.ts             — IPFS/Filecoin pinning services
    rpc.ts             — Bitcoin JSON-RPC client
    reorg.ts           — Reorg detection logic
    utils.ts           — jsonNode, utcDay

tests/                 — Bun test suite (nodes, envelope, car, fixtures)
  fixtures/            — 25 genesis block JSON fixtures

dist/                  — Build output: minified index.js + .d.ts declarations

tacit-spec/            — Git submodule: github.com/z0r0z/tacit (authoritative protocol spec)
```

## Pipeline Architecture

The system uses a **two-pass pipeline**:

### Pass 1: Fetch & Filter
Input: Bitcoin block height
Output: Raw tacit-block JSON (`out/tacit-blocks/`)
         CAR files (with `--car` flag, recommended)
         DAG-CBOR JSON (with `--dag` flag, debug/testing only)

```
RPC getblock(hash, 2) → scan tx.vin[0].txinwitness[1] for "TACIT" (5441434954)
  → extractEnvelopeContent() → OP_0 OP_IF magic(5B) version(1B) payload OP_ENDIF
  → store only blocks with ≥1 tacit envelope
  → JSON: { height, hash, time, tacitCount, txs: [{ txid, vin, vout }] }
```

### Pass 2: DAG-CBOR + CAR
Input: Raw tacit-block JSON
Output: CAR file (`out/car/`) — primary output, no DAG JSON required

```
processBlock(block, tacitBlockIndex, prevCid) → ProcessedBlock
  → iterate tacit txs, build VinEntry/VoutEntry/Tx/Block DAG-CBOR nodes
  → each node: dagCbor.encode() → sha256 → CIDv1 (0x71/0x12)
  → CIDs linked via CBOR tag 42

buildBlockCarFile(processed) → Uint8Array
  → collect all CIDs, deduplicate, create CAR entries
  → CAR = [header: {roots:[cid], version:1}] [entry_0]...[entry_N]
  → Block node is root CID
```

CAR files are the **canonical output** format. DAG-CBOR JSON (`--dag`) is a
debug/testing artifact that can be regenerated from raw JSON at any time.

### Deterministic CIDs
Same block data → same SHA-256 hash → same CID.

## DB ↔ CAR Roundtrip

```
            processBlock() + buildBlockCarFile()
  JSON ──────────────────────────────────────────────► CAR
   │                                                    │
   │ db:import                                          │ db:car-import
   ▼                                                    ▼
  SQLite DB ◄───────────────────────────────────────────┘
          db:car-export (processBlock + buildBlockCarFile from DB)
```

The system has two parallel data paths that converge on the same DAG-CBOR structure:

- **CAR ← JSON**: `processBlock()` + `buildBlockCarFile()` from raw tacit-block JSON
- **CAR ← DB**: Same processBlock/buildBlockCarFile pipeline, reading block data from the SQLite DB (envelopes table has raw witness bytes)
- **DB ← CAR**: Reverse — parse CAR file with `CarReader`, decode DAG-CBOR blocks, extract envelope/commitment data, insert into DB (uses parent CID chain for block ordering)

## Key Type Definitions

See `src/types.ts` for all interfaces:

- `BitcoinBlock`, `BitcoinTx`, `BitcoinVin`, `BitcoinVout` — RPC data
- `Block`, `Tx`, `VinEntry`, `VoutEntry` — IPLD node schemas
- `Asset`, `AssetOp`, `AssetIndex` — Asset indexer schemas
- `ProcessedBlock`, `CidMap` — Internal builder types
- `RangeRoot`, `BlockIndex` — SPEC Sections 11-12
- `VerifyResult` — Cryptographic validation results per tx

## Schema Rules (CRITICAL)

1. **`v` field**: Only on `Block` and `RangeRoot`. `Tx`, `VinEntry`, `VoutEntry` do NOT have `v`.
2. **`hash` / `txid` / `pubkey`**: Inline `bytes` fields. 32 bytes for hash/txid. NOT CID links.
3. **`witness`**: In `VinEntry`, `witness` is a CID link to a `WitnessList` array. Each array element is a CID to a DAG-CBOR block containing one witness item byte string.
4. **`vin` / `vout` in Tx**: CID links to arrays of individual entry CIDs.
5. All DAG-CBOR blocks use multicodec `0x71`, CIDv1, SHA-256 `0x12`.

## Coding Conventions

- Use `.ts` extension for all imports (Bun resolves them)
- Explicit return types on exported functions
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` where possible
- Bitcoin values in satoshis: `btcToSatoshis(btc)` — input must be in BTC (float)
- Fee/value normalization: Esplora returns satoshis, RPC returns BTC. Detect: `val > 1e6 → val / 1e8`

## Testing

```bash
bun test                # Run all dag-tacit tests (162 tests, scoped to tests/*.test.ts)
bun run build           # Build dist (minified JS + .d.ts)
```

## Database (SQLite + Drizzle ORM)

Local SQLite via `bun:sqlite` with Drizzle ORM. Schema declared in `scripts/db/schema.ts`. Migrations managed by `drizzle-kit`.

### Schema — 5 tables mirroring the IPLD DAG-CBOR structure

| Table | Columns | PK | FKs |
|-------|---------|-----|-----|
| `blocks` | 6 | height | — |
| `assets` | 16 | auto-increment id | etchTxId → txs.id |
| `txs` | 14 | auto-increment id | height → blocks.height, assetId → assets.id |
| `vins` | 13 | auto-increment id | txId → txs.id |
| `vouts` | 13 | auto-increment id | txId → txs.id, assetId → assets.id |

### Commands

```bash
bun run db:import                     # Import all blocks into DB
bun run db:import --from 948242 --to 948247  # Import a range for testing
bun run db:import --force             # Re-import (clear + repopulate)
bun run db:utxo stats                 # Show DB summary stats
bun run db:utxo envelope <txid>       # Show envelope details
bun run db:utxo address <addr>        # Show txs for an address
bun run db:utxo asset <asset_id>      # Show asset details, cap, mint status
bun run db:utxo commitments <asset_id> # Show Pedersen commitments (vouts)
bun run db:db:export --sql            # Export as SQL dump (for D1/browser)
bun run db:export --json              # Export as JSON snapshot
bun run drizzle-kit generate          # Generate new migration after schema change
bun run db:migrate                    # Apply pending migrations
```

### Replication

- **Browser**: SQL.js WASM loads the SQL dump (`out/dag-tacit-export.sql`)
- **D1**: Same SQL dump feeds `wrangler d1 execute`
- **Schema is D1-compatible** — SQLite dialect, no PostgreSQL-specific features

## Common Tasks

### Add a new opcode
1. Update `OPCODES` and `OPCODE_NAMES` in `src/config.ts`
2. Create `opcodes/<hex>-<name>.md` with wire table, constraints, TypeScript interface
3. Add test case in `tests/envelope.test.ts`
4. If adding payload structure parsing, add decode function to `src/lib/envelope.ts` and validation in `src/lib/verify.ts`

## Update an opcode from drafted → shipped
1. Change status in `src/config.ts` `OPCODES_INFO`
2. Update `opcodes/index.md` status table (counts and hex ranges)
3. Add `tacitOutputCount` case in `src/lib/utils.ts`
4. Add `verifyPayload` case in `src/lib/verify.ts`
5. The canonical spec status table is `tacit-spec/SPEC.md §1.1`

### Change node schema
1. Update interface in `src/types.ts`
2. Update builder in `src/blocks/blocks-nodes.ts`
3. Update `dag-tacit.md` field tables + `opcodes/` wire format files
4. Update tests in `tests/nodes.test.ts` + `tests/fixtures.test.ts`

### Sync with tacit-spec submodule
1. `git submodule update --remote tacit-spec`
2. Recheck `opcodes/` files against `tacit-spec/SPEC.md` wire format sections
3. Check the canonical opcode table at §1.1 for new opcodes or status changes
4. Update any changed wire formats in `opcodes/`
5. Update `src/config.ts` OPCODES/OPCODE_NAMES if new opcodes are added

## IPFS Verification

After importing via CLI, verify gateway traversal:

```bash
bun run import --from 948242 --to 948242
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness/0
```

## Chain Watch / Debug Logs

The `fetch` and `dag` scripts generate **debug metadata** for transactions that pass the Tacit magic-bytes check but fail deeper validation. These are NOT included in DAG-CBOR nodes — they are JSON-only metadata for chain security monitoring.

- **Per-block JSON**: `out/debug/<height>-debug.json`
- **Append-only log**: `out/debug/debug.log`
- **Fields**: `txid`, `error` (why validation failed), `witness_hex`

## Troubleshooting

- **CID mismatch**: check that `normalizeTx` isn't mutating fields used by `processBlock`
- **Path not traversable**: array fields (`witness`, `vin`, `vout`, `txs`) must be CID links to array nodes
- **Fee off by 8 orders**: Esplora returns satoshis, RPC returns BTC — normalize in `normalizeTx`
