# Agent Guidelines for dag-tacit

## Project Overview

**dag-tacit** is an IPLD DAG-CBOR encoding system for the Tacit protocol on Bitcoin. It converts Bitcoin blocks containing Tacit transactions into navigable IPLD DAG structures, serialized as CAR files for IPFS distribution.

- **Language**: TypeScript (Bun runtime)
- **Schema**: IPLD DAG-CBOR with CIDv1, SHA-256 multihash
- **Network**: Bitcoin mainnet, Tacit genesis block height 948242

## Architecture

```
scripts/
  fetch-blocks.ts      — Fetch Bitcoin blocks via RPC, filter Tacit txs
  build-dag.ts         — Build DAG-CBOR nodes from block artifacts
  create-car.ts        — Create CAR files (block/range/daily)
  import-car.ts        — Import CAR files into IPFS Kubo
  full.ts              — Pipeline: fetch → build → car

src/
  index.ts             — Barrel export for external consumers
  types.ts             — Shared TypeScript interfaces
  dag-cbor.ts          — Encoding utilities, rawCid(), hex helpers
  envelope.ts          — Tacit envelope detection & payload decoding
  nodes.ts             — Block, Tx, VinEntry, VoutEntry builders
  car.ts               — CAR file creation, range roots, block index
  config.ts            — .env config loader
  rpc.ts               — Bitcoin JSON-RPC client

tests/
  *.test.ts            — Bun test suite
  fixtures.test.ts     — Fetches + tests first 25 genesis blocks end-to-end
  fixtures/            — 25 genesis block JSON fixtures

dist/                  — Build output: minified index.js + .d.ts declarations
```

## Key Type Definitions

See `src/types.ts` for all interfaces:

- `BitcoinBlock`, `BitcoinTx`, `BitcoinVin`, `BitcoinVout` — RPC data
- `Block`, `Tx`, `VinEntry`, `VoutEntry` — IPLD node schemas
- `ProcessedBlock`, `CidMap` — Internal builder types
- `RangeRoot`, `BlockIndex` — SPEC Sections 11-12

## Schema Rules (CRITICAL)

1. **`v` field**: Only on `Block` and `RangeRoot`. `Tx`, `VinEntry`, `VoutEntry` do NOT have `v`.
2. **`block_hash` / `txid`**: Raw CID links (`0x55` raw multicodec, `0x00` identity multihash, 32 bytes).
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
1. Update `OPCODES` and `OPCODE_NAMES` in `src/envelope.ts`
2. Add test case in `tests/envelope.test.ts`

### Change node schema
1. Update interface in `src/types.ts`
2. Update builder in `src/nodes.ts`
3. Update `SPEC.md` field tables
4. Update tests in `tests/nodes.test.ts`

### Add a script
1. Create `scripts/<name>.ts` with shebang `#!/usr/bin/env bun`
2. Add entry to `package.json` scripts
3. Export any testable functions

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
bun run import -- --from 948242 --to 948242

# Verify paths
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness
curl http://localhost:8080/ipfs/<root>/txs/0/vin/0/witness/0
```

## Troubleshooting

- **"digest too large"**: Identity multihash >128 bytes rejected by Kubo. Only use `rawCid` for exactly 32-byte hashes (txid, block_hash). Never for witness items or variable-length data.
- **Path not traversable**: Check that array fields (`witness`, `vin`, `vout`, `txs`) are CID links to array nodes, not inline arrays.
