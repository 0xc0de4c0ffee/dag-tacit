# dag-tacit

> **DRAFT** — not yet finalized for v1. Schema and APIs may change.

DAG-CBOR index builder for the Tacit protocol on Bitcoin. Implements the [dag-tacit SPEC](./dag-tacit.md). Authoritative Tacit protocol spec lives in the [tacit-spec submodule](./tacit-spec/SPEC.md) (github.com/z0r0z/tacit).

## Architecture

```
dag-tacit/
├── scripts/
│   ├── blocks/
│   │   ├── fetch.ts        # Fetch Bitcoin blocks with Tacit txns
│   │   ├── dag.ts          # Build DAG-CBOR nodes
│   │   ├── car.ts          # Assemble CAR files (block/range/daily)
│   │   ├── import.ts       # Import CAR into IPFS / pinning services
│   │   └── full.ts         # Pipeline: fetch → dag → car
│   ├── assets/
│   │   ├── assets-dag.ts   # Build per-block asset DAG-CBOR JSON
│   │   ├── assets-car.ts   # Build per-block asset CAR files
│   │   ├── assets-build.ts # Build unified asset index
│   │   └── assets-full.ts  # Pipeline: dag -> car -> build
│   └── utils.ts            # Shared script helpers
├── src/
│   ├── index.ts            # Barrel export for external consumers
│   ├── types.ts            # Shared TypeScript interfaces
│   ├── config.ts           # ALL constants, opcodes, genesis height, config loader
│   ├── assets/
│   │   ├── assets-parse.ts # Asset parsing (CETCH payload, processBlockAssets)
│   │   ├── assets-nodes.ts # Asset & AssetOp DAG-CBOR node builders
│   │   └── assets-block.ts # Per-block asset processing + CAR file builder
│   ├── blocks/
│   │   ├── blocks-nodes.ts # Block/Tx/VinEntry/VoutEntry builders
│   │   └── blocks-car.ts   # Block CAR assembly, range root, block index
│   └── lib/
│       ├── dag-cbor.ts     # Encoding, CID, hex helpers
│       ├── envelope.ts     # Tacit envelope detection & payload decoding
│       ├── car.ts          # Generic CAR helpers
│       ├── pin.ts          # IPFS/Filecoin pinning (Kubo, Lighthouse, Pinata, Custom)
│       ├── rpc.ts          # Bitcoin JSON-RPC client
│       ├── reorg.ts        # Reorg detection logic
│       └── utils.ts        # jsonNode, utcDay
├── tests/
│   ├── *.test.ts            # Bun test suite
│   └── fixtures/            # 25 genesis block JSON fixtures
├── dist/                    # Build output (minified JS + .d.ts)
└── out/
    ├── tacit-blocks/       # Compact per-block Tacit tx artifacts (JSON)
    ├── dag-nodes/          # DAG-CBOR nodes (JSON)
    ├── assets/             # Asset index (JSON + CAR)
    └── car/                # Output CAR files
```

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env and set your BITCOIN_RPC_URL

# Run full pipeline (per-block CARs only)
bun run full

# Or run steps individually:
bun run fetch       # Download blocks with Tacit transactions
bun run dag         # Build DAG-CBOR nodes
bun run car         # Create per-block CAR files
bun run car:range   # Also create range + daily CARs
bun run assets      # Build asset index from Tacit operations
```

## Commands

### `bun run fetch [--from N] [--to N] [-t N] [--force] [--help]`

Fetches Bitcoin blocks containing Tacit envelopes from RPC.

- Fetches each Bitcoin block with one verbose block RPC call (`getblock(hash, 2)`)
- Scans only `vin[0].txinwitness[1]` for the Tacit magic bytes (`TACIT`, hex `5441434954`) as a cheap prefilter
- Fully decodes only matching candidates according to the Tacit protocol envelope and payload rules
- Saves compact per-block artifacts to `out/tacit-blocks/`
- Organizes in UTC day subdirs (`YYYY-MM-DD`)
- Maintains `index.json` for resume capability
- Validates transactions per the SPEC “Tacit Transaction Inclusion” section:
  1. vin[0] has second witness item
  2. Envelope decode succeeds (magic, version)
  3. Payload decode succeeds (valid opcode)
- Tracks opcode statistics
- Supports `-t N`, `--thread N`, or `--threads N` to control concurrent RPC fetches
- On resume, rechecks the last `REORG_DEPTH` blocks for chain reorganizations and auto-repairs

This keeps CPU use low on large Bitcoin blocks: non-Tacit transactions are rejected by a string scan before any witness hex decoding, script parsing, or payload validation. The magic-byte prefilter is only an optimization; a transaction is included only after full Tacit envelope decode and payload decode succeed.

```bash
# Fetch from Tacit genesis to current tip
bun run fetch

# Fetch specific range
bun run fetch --from 948242 --to 949000 -t 5
```

Configuration via `.env`:
- `BITCOIN_RPC_URL` - Required. Bitcoin RPC endpoint
- `BITCOIN_NETWORK` - Network type (mainnet/signet)
- `START_HEIGHT` - Default start height (948242 for mainnet)
- `REORG_DEPTH` - Blocks to recheck for chain reorganizations (default: 6)

### `bun run dag [--from N] [--to N] [--force] [--help]`

Processes compact Tacit block artifacts into DAG-CBOR nodes per the dag-tacit SPEC.

- Saves to `out/dag-nodes/`
- Builds Block, Tx, VinEntry, VoutEntry nodes
- Links nodes via CIDs
- Tracks block index and parent links

### `bun run car [--from N] [--to N] [--force] [--help]`

Assembles DAG nodes into per-block CAR files (blocks only, no range/daily).

- Creates per-block CARs in `out/car/blocks/<YYYY-MM-DD>/`
- Each CAR roots at the Block node with its linked tx/vin/vout nodes
- Maintains `index.json` for import lookup

```bash
# Per-block CARs (default)
bun run car

# Specific Bitcoin-height range
bun run car --from 948242 --to 949069
```

### `bun run car:range [--from N] [--to N] [--force] [--help]`

Creates a single range CAR plus daily CARs in addition to per-block CARs.

```bash
bun run car:range
```

### `bun run assets [--from N] [--to N] [--force] [--help]`

Builds an asset index from Tacit operations found in block artifacts.

- Parses CETCH payloads to extract asset metadata (ticker, decimals, commitment, mint authority, image URI)
- Tracks all asset operations: CXFER, T_MINT, T_BURN, T_AXFER, T_DROP, T_DCLAIM, T_LP_ADD, T_LP_REMOVE, T_SWAP_BATCH, T_SWAP_VAR, T_DEPOSIT, T_WITHDRAW, T_PETCH, T_PMINT, T_INTENT_ATTEST, T_PROTOCOL_FEE_CLAIM, T_AXFER_VAR, T_WRAPPER_ATTEST
- Writes `out/assets/index.json` (global index) and per-asset JSON files
- Output is deterministic: no timestamps, stable field order

```bash
bun run assets
bun run assets --from 948242 --to 949069
```

### `bun run build`

Builds the library for distribution.

- Bundles `src/index.ts` into minified `dist/index.js` with sourcemap
- Emits TypeScript declarations (`dist/*.d.ts`)
- Output is consumable by other libraries, browsers, or bundlers

```bash
bun run build
```

## Output Structure

```
out/
├── tacit-blocks/
│   ├── index.json
│   └── 2026-05-07/
│       ├── dag-tacit-0-948242.json
│       ├── dag-tacit-1-948247.json
│       └── ...................json
├── dag-nodes/
│   ├── index.json
│   └── 2026-05-07/
│       ├── dag-tacit-0-948242.json
│       ├── dag-tacit-1-948247.json
│       └── ...................json
├── assets/
│   ├── index.json
│   └── <asset_id_hex>.json      # per-asset operation history
└── car/
    ├── index.json
    ├── blocks/
    │   ├── index.json
    │   └── 2026-05-07/
    │       ├── index.json
    │       ├── dag-tacit-0-948242.car
    │       ├── dag-tacit-1-948247.car
    │       └── ...................car
    ├── range/
    │   ├── index.json
    │   └── dag-tacit-0-544-948242-949069.car
    └── daily/
        ├── index.json
        └── 2026-05-12/
            └── dag-tacit-514-544-949015-949069.car
```

## Data Model

Implements the normative DAG-CBOR types from [dag-tacit.md](./dag-tacit.md) and the wire format specs in [`opcodes/`](./opcodes/):

| Node | SPEC Section | Fields |
|------|--------------|--------|
| `Block` | Block IPLD | height, hash, parent, block, tx, time, txs, v |
| `Tx` | Transaction IPLD | index, txid, fee, version, locktime, vin, vout |
| `VinEntry` | VinEntry IPLD | txid, vout, sequence, witness, sig, value, prevout |
| `VoutEntry` | VoutEntry IPLD | pubkey, value |
| Range Root | Range Root IPLD | v, genesis, from, to, blocks, tx, index |
| Block Index | Block Index IPLD | `"0" → CID, "1" → CID, ...` |
| `Asset` | Asset IPLD | asset_id, etch_txid, ticker, decimals, commitment, mint_authority, image_uri, block_height, time |
| `AssetOp` | AssetOp IPLD | txid, opcode, asset_id, block_height, time, payload |
| Asset Index | Asset Index IPLD | v, assets, ops, asset_list, op_list |

All monetary values in **satoshis** (uint). All hashes as **bytes[32]**. See [`opcodes/`](./opcodes/) for the complete opcode wire format reference.

## Spec Compliance

### dag-tacit SPEC

| Section | Status | Notes |
|---------|--------|-------|
| Common IPLD Encoding | ✅ | `v: 1`, CIDv1, SHA-256, DAG-CBOR |
| Tacit Transaction Inclusion | ✅ | 3-step validation |
| Block IPLD | ✅ | All fields |
| Transaction IPLD | ✅ | All fields |
| VinEntry IPLD | ✅ | All fields, witness as bytes[] |
| VoutEntry IPLD | ✅ | All fields |
| Range Root IPLD | ✅ | All fields, block index link |
| Block Index IPLD | ✅ | String keys "0", "1", ... |
| Mapping from Bitcoin Core JSON | ✅ | `floor(btc * 1e8 + 0.5)` |
| Deterministic Encoding | ✅ | Exact field sets |

### TACIT.md Protocol

| Opcode | Value | Status |
|--------|-------|--------|
| CETCH | 0x21 | ✅ Detected & validated |
| CXFER | 0x23 | ✅ Detected & validated |
| T_MINT | 0x24 | ✅ Detected & validated |
| T_BURN | 0x25 | ✅ Detected & validated |
| T_AXFER | 0x26 | ✅ Detected & validated |
| T_PETCH | 0x27 | ✅ Detected & validated |
| T_PMINT | 0x28 | ✅ Detected & validated |
| T_DEPOSIT | 0x29 | ✅ Detected & validated |
| T_WITHDRAW | 0x2a | ✅ Detected & validated |
| T_DROP | 0x2b | ✅ Detected & validated |
| T_DCLAIM | 0x2c | ✅ Detected & validated |
| T_LP_ADD | 0x2d | ✅ Detected & validated |
| T_LP_REMOVE | 0x2e | ✅ Detected & validated |
| T_SWAP_BATCH | 0x2f | ✅ Detected & validated |
| T_INTENT_ATTEST | 0x30 | ✅ Detected & validated |
| T_PROTOCOL_FEE_CLAIM | 0x31 | ✅ Detected & validated |
| T_SWAP_VAR | 0x32 | ✅ Detected & validated |
| T_AXFER_VAR | 0x37 | ✅ Detected & validated |
| T_WRAPPER_ATTEST | 0x38 | ✅ Detected & validated |

## Future Plans

### Asset CAR Files

The asset indexer currently writes JSON. Next stage will produce immutable, deterministic CAR files for assets:

- **Per-asset CAR**: Each asset gets its own CAR file containing the `Asset` node + all linked `AssetOp` nodes, rooted at the asset CID
- **Asset range CAR**: Bundles multiple asset CARs into a range root with an asset index map
- **Daily asset CAR**: Grouped by UTC day, same pattern as block daily CARs
- **Unified import**: `bun run import --asset <asset_id>` to import a single asset CAR, or `bun run import --assets` for the full asset index

### Asset Transfer History

Per-asset JSON will expand to include:

- `transfers`: List of CXFER / T_AXFER / T_AXFER_VAR operations with input/output commitment pointers
- `mints`: T_MINT + T_PMINT operations with mint authority verification status
- `burns`: T_BURN operations with public burned amounts
- `pool_ops`: T_LP_ADD, T_LP_REMOVE, T_SWAP_BATCH, T_SWAP_VAR operations linked to AMM pool state
- `shield_ops`: T_DEPOSIT, T_WITHDRAW operations for mixer pool tracking
- `drop_ops`: T_DROP + T_DCLAIM operations for public-claim pools

All additions follow the same deterministic encoding rules: no timestamps in index JSON, stable field order, DAG-CBOR blocks with CIDv1 + SHA-256.

## CAR File Format

The output CAR file contains:

1. **Range Root** - Navigation metadata for the archive
2. **Block Index** - Map of `"0", "1", ...` to Block CIDs
3. **Block Nodes** - One per tacit block
4. **Tx Arrays** - CID-linked arrays of Tx nodes
5. **Tx Nodes** - Individual transactions
6. **Vin/Vout Arrays** - Per-transaction input/output data

CAR files are written to:

```text
out/car/blocks/<YYYY-MM-DD>/dag-tacit-<tacit>-<btc>.car
out/car/range/dag-tacit-<tacit-from>-<tacit-to>-<btc-from>-<btc-to>.car
out/car/daily/<YYYY-MM-DD>/dag-tacit-<tacit-from>-<tacit-to>-<btc-from>-<btc-to>.car
```

Per-block CAR files root directly at the `Block` node and include only that block's linked transaction/input/output nodes. Range and daily CAR files root at the range root and include the block index plus all included blocks. CAR directories include `index.json` files for import lookup and metadata.

Daily CAR files are split by block timestamp at UTC/GMT midnight boundaries.

Import a CAR into a local IPFS/Kubo node:

```bash
bun run import --block 948242
bun run import --range 948242 949069
bun run import --day 2026-05-12

# Short aliases and simple range syntax
bun run import -b 948242
bun run import -r 948242-948245
bun run import -d 2026-05-12

# Batch import individual block CARs by BTC height range
bun run import --from 948242 --to 948272

# Partial ranges: from-only uses chain tip as end; to-only uses last stored block (or genesis) as start
bun run import --from 948242        # import from 948242 up to current chain tip
bun run import --to 948272         # import from last stored block up to 948272
```

The importer reads `IPFS_API_URL` and `IPFS_GATEWAY_URL` from `.env` (defaulting to local Kubo at `http://127.0.0.1:5001` and `http://127.0.0.1:8080`). Override per-run with `--api` and `--gateway` flags.

## Debug / Chain Watch

Transactions that pass the Tacit magic-bytes check but fail deeper validation (malformed envelope, unknown opcode, bad version) are captured as **debug metadata** — they are NOT included in DAG-CBOR nodes.

- **Per-block JSON**: `out/debug/<height>-debug.json`
- **Append-only log**: `out/debug/debug.log`
- **Fields**: `txid`, `error`, `witness_hex`

This is used for chain security monitoring, fork detection, and protocol debugging without polluting the canonical IPLD index. Future work may package debug logs into their own daily/weekly CAR files.

## Development

```bash
# Type check
bun run typecheck

# Run tests
bun test

# Build dist (minified JS + type declarations)
bun run build

# Run full fetch/dag/CAR pipeline
bun run full 948242 949069 --force
```

## Dependencies

- `bun` - Runtime and package manager
- `@ipld/dag-cbor` - DAG-CBOR codec
- `@ipld/car` - CAR file utilities
- `multiformats` - CID handling
- `@noble/hashes` - SHA-256 for CID hashing

## Testing

```bash
# Run all tests (fixtures auto-fetched if BITCOIN_RPC_URL is set)
bun test

# Run specific test file
bun test tests/envelope.test.ts

# Run with coverage
bun test --coverage
```

## License

[WTFPL](./LICENSE) — Do What The Fuck You Want To
