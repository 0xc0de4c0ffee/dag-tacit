# Agent Guidelines for dag-tacit

## Project Overview

**dag-tacit** is an IPLD DAG-CBOR encoding system for the Tacit protocol on Bitcoin. It converts Bitcoin blocks containing Tacit transactions into navigable IPLD DAG structures, serialized as CAR files for IPFS distribution.

- **Language**: TypeScript (Bun runtime)
- **Schema**: IPLD DAG-CBOR with CIDv1, SHA-256 multihash
- **Network**: Bitcoin mainnet, Tacit genesis block height 948242

## Architecture

```
opcodes/               — Per-opcode wire format docs (19 files, one per opcode)
 0x21-cetch.md         — Each file: header → wire table → constraints → TypeScript → SPEC ref
 0x23-cxfer.md
 ...
 0x38-t-wrapper-attest.md

scripts/
  blocks/
    fetch.ts           — Fetch Bitcoin blocks via RPC, filter Tacit txs
    dag.ts             — Build DAG-CBOR nodes from block artifacts
    car.ts             — Create CAR files (block/range/daily)
    import.ts          — Import CAR files into IPFS Kubo
    full.ts            — Pipeline: fetch → dag → car
  assets/
    assets-dag.ts      — Build per-block asset DAG-CBOR JSON references
    assets-car.ts      — Build per-block asset CAR files from DAG JSON
    assets-build.ts    — Build unified asset index from per-block JSON
    assets-full.ts     — Pipeline: dag -> car -> build
  utils.ts             — Shared script helpers (flagValue, loadBlockFile)

src/
  index.ts             — Barrel export for external consumers
  types.ts             — Shared TypeScript interfaces
  config.ts            — ALL constants, opcodes, genesis height, config loader, pin config
  assets/
    assets-parse.ts    — Asset parsing (CETCH payload, extractAssetId, processBlockAssets)
    assets-nodes.ts    — Asset & AssetOp DAG-CBOR node builders
    assets-block.ts    — Per-block asset processing + CAR file builder
  blocks/
    blocks-nodes.ts    — Block, Tx, VinEntry, VoutEntry builders
    blocks-car.ts      — Block CAR assembly, range root, block index
  lib/
    dag-cbor.ts        — Encoding, CID, hex helpers
    envelope.ts        — Tacit envelope detection & payload decoding
    car.ts             — Generic CAR helpers (header, entry, varint, assemble)
    pin.ts             — IPFS/Filecoin pinning services (Kubo, Lighthouse, Pinata, Custom)
    rpc.ts             — Bitcoin JSON-RPC client
    reorg.ts           — Reorg detection logic
    utils.ts           — jsonNode, utcDay

tests/
  *.test.ts            — Bun test suite
  fixtures.test.ts     — Fetches + tests first 25 genesis blocks end-to-end
  fixtures/            — 25 genesis block JSON fixtures

dist/                  — Build output: minified index.js + .d.ts declarations

tacit-spec/            — Git submodule: github.com/z0r0z/tacit (authoritative protocol spec)
                         The canonical opcode table lives at SPEC.md §1.1.
                         Per-opcode wire formats at SPEC.md §§5.1–5.20.
```

## Key Type Definitions

See `src/types.ts` for all interfaces:

- `BitcoinBlock`, `BitcoinTx`, `BitcoinVin`, `BitcoinVout` — RPC data
- `Block`, `Tx`, `VinEntry`, `VoutEntry` — IPLD node schemas
- `Asset`, `AssetOp`, `AssetIndex` — Asset indexer schemas
- `ProcessedBlock`, `CidMap` — Internal builder types
- `RangeRoot`, `BlockIndex` — SPEC Sections 11-12

## Schema Rules (CRITICAL)

1. **`v` field**: Only on `Block` and `RangeRoot`. `Tx`, `VinEntry`, `VoutEntry` do NOT have `v`.
2. **`hash` / `txid` / `pubkey`**: Inline `bytes` fields. `hash` and `txid` are exactly 32 bytes. `pubkey` is the raw `scriptPubKey.hex` bytes (length varies by output type). They are NOT CID links.
3. **`witness`**: In `VinEntry`, `witness` is a CID link to a `WitnessList` array (NOT inline). Each array element is a CID to a DAG-CBOR block containing one witness item byte string.
4. **`vin` / `vout` in Tx**: CID links to arrays of individual entry CIDs.
5. All DAG-CBOR blocks use multicodec `0x71`, CIDv1, SHA-256 `0x12`.

## Coding Conventions

- Use `.ts` extension for all imports (Bun resolves them)
- Explicit return types on exported functions
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` where possible
- Bitcoin values in satoshis: `btcToSatoshis(btc)`

## Common Tasks

### Add a new opcode
1. Update `OPCODES` and `OPCODE_NAMES` in `src/config.ts`
2. Create `opcodes/<hex>-<name>.md` with wire table, constraints, TypeScript interface
3. Add test case in `tests/envelope.test.ts`
4. If adding payload structure parsing, add decode function to `src/lib/envelope.ts`

### Change node schema
1. Update interface in `src/types.ts`
2. Update builder in `src/blocks/blocks-nodes.ts`
3. Update `dag-tacit.md` field tables + `opcodes/` wire format files
4. Update tests in `tests/nodes.test.ts` + `tests/fixtures.test.ts`

### Add a script
1. Create `scripts/<name>.ts` with shebang `#!/usr/bin/env bun`
2. Add entry to `package.json` scripts
3. Export any testable functions
4. Add `--help`/`-h` support with usage text

### Sync with tacit-spec submodule
1. `git submodule update --remote tacit-spec`
2. Recheck `opcodes/` files against `tacit-spec/SPEC.md` wire format sections
3. Check the canonical opcode table at §1.1 for new opcodes or status changes
4. Update any changed wire formats in `opcodes/`
5. Update `src/config.ts` OPCODES/OPCODE_NAMES if new opcodes are added

## Testing

```bash
bun test              # Run all tests
bun run typecheck     # TypeScript type checking
bun run build         # Build dist (minified JS + .d.ts)
```

## IPFS Verification

After importing, verify gateway traversal:

```bash
# Import a block
bun run import --from 948242 --to 948242

# Verify paths
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness/0
```

## Chain Watch / Debug Logs

The `fetch` and `dag` scripts generate **debug metadata** for transactions that pass the Tacit magic-bytes check but fail deeper validation (malformed envelope, unknown opcode, bad version, etc.). These are NOT included in DAG-CBOR nodes — they are JSON-only metadata for chain security monitoring.

- **Per-block JSON**: `out/debug/<height>-debug.json`
- **Append-only log**: `out/debug/debug.log`
- **Fields**: `txid`, `error` (why validation failed), `witness_hex`

This helps detect forks, bad transactions, or protocol-level attacks without polluting the canonical IPLD index.

## Troubleshooting

- **Path not traversable**: Check that array fields (`witness`, `vin`, `vout`, `txs`) are CID links to array nodes, not inline arrays.
