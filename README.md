# dag-tacit

> **DRAFT** — not yet finalized for v1. Schema and APIs may change.

DAG-CBOR index builder for the Tacit protocol on Bitcoin. Implements the [dag-tacit SPEC](./SPEC.md).

## Architecture

```
dag-tacit/
├── scripts/
│   ├── fetch-blocks.ts     # Fetch Bitcoin blocks with Tacit txns
│   ├── build-dag.ts        # Build DAG-CBOR nodes
│   ├── create-car.ts       # Assemble CAR files (block/range/daily)
│   ├── import-car.ts       # Import CAR into IPFS
│   └── full.ts             # Pipeline: fetch → build → car
├── src/
│   ├── index.ts            # Barrel export for external consumers
│   ├── types.ts            # Shared TypeScript interfaces
│   ├── dag-cbor.ts         # CID & encoding utilities
│   ├── envelope.ts         # Tacit envelope detection
│   ├── nodes.ts            # Block/Tx/VinEntry/VoutEntry builders
│   ├── car.ts              # CAR file assembly
│   ├── config.ts           # .env config loader
│   ├── reorg.ts            # Reorg detection logic
│   └── rpc.ts              # Bitcoin JSON-RPC client
├── tests/
│   ├── *.test.ts            # Bun test suite
│   └── fixtures/            # 25 genesis block JSON fixtures
├── dist/                    # Build output (minified JS + .d.ts)
└── out/
    ├── tacit-blocks/       # Compact per-block Tacit tx artifacts (JSON)
    ├── dag-nodes/          # DAG-CBOR nodes (JSON)
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

Implements the normative DAG-CBOR types from the SPEC:

| Node | SPEC Type | Fields |
|------|--------------|--------|
| `Block` | Block IPLD | height, hash, parent, block, tx, time, txs, v |
| `Tx` | Transaction IPLD | index, txid, fee, version, locktime, vin, vout |
| `VinEntry` | VinEntry IPLD | txid, vout, sequence, witness, sig, value, prevout |
| `VoutEntry` | VoutEntry IPLD | value, pubkey |
| Range Root | Range Root IPLD | v, genesis, from, to, blocks, tx, index |

All monetary values in **satoshis** (uint). All hashes as **bytes[32]**.

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
