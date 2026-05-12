# dag-tacit

DAG-CBOR index builder for the Tacit protocol on Bitcoin. Implements the [dag-tacit SPEC](./SPEC.md).

## Architecture

```
dag-tacit/
├── scripts/
│   ├── fetch-blocks.mjs    # Fetch Bitcoin blocks with Tacit txns
│   ├── build-dag.mjs       # Build DAG-CBOR nodes
│   └── create-car.mjs      # Assemble CAR file
├── src/
│   ├── dag-cbor.mjs        # CID & encoding utilities
│   ├── envelope.mjs        # Tacit envelope detection
│   ├── nodes.mjs           # Block/Tx/VinEntry/VoutEntry builders
│   └── car.mjs             # CAR file assembly
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

# Run full pipeline
bun run full

# Or run steps individually:
bun run fetch    # Download blocks with Tacit transactions
bun run build    # Build DAG-CBOR nodes
bun run car      # Create CAR file
```

## Commands

### `bun run fetch [start] [end] [-t N]`

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

This keeps CPU use low on large Bitcoin blocks: non-Tacit transactions are rejected by a string scan before any witness hex decoding, script parsing, or payload validation. The magic-byte prefilter is only an optimization; a transaction is included only after full Tacit envelope decode and payload decode succeed.

```bash
# Fetch from Tacit genesis to current tip
bun run fetch

# Fetch specific range
bun run fetch 948240 949000 -t 5
```

Configuration via `.env`:
- `BITCOIN_RPC_URL` - Required. Bitcoin RPC endpoint
- `BITCOIN_NETWORK` - Network type (mainnet/signet)
- `START_HEIGHT` - Default start height (948240 for mainnet)

### `bun run build`

Processes compact Tacit block artifacts into DAG-CBOR nodes per the dag-tacit SPEC.

- Saves to `out/dag-nodes/`
- Builds Block, Tx, VinEntry, VoutEntry nodes
- Links nodes via CIDs
- Tracks tacit_block index and prev links

### `bun run car [start] [end]`

Assembles DAG nodes into a CAR file.

- Creates range root (SPEC “Range Root IPLD”)
- Creates tacit block CID index (SPEC “Tacit Block Index IPLD”)
- Outputs CAR v1 with all blocks

```bash
# Default output
bun run car

# Specific Bitcoin-height range
bun run car 948242 949069
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
    │   ├── dag-tacit-0-948242.car
    │   ├── dag-tacit-1-948247.car
    │   └── ...................car
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
| `Block` | Block IPLD | bitcoin_block, block_hash, last_tacit_block, prev, tacit_block, tacit_tx_count, time, tx_count, txs, v |
| `Tx` | Transaction IPLD | v, tx_index, txid, fee, version, locktime, vin, vout |
| `VinEntry` | VinEntry IPLD | v, txid, vout, sequence, witness, script_sig, value, prevout_script_pubkey |
| `VoutEntry` | VoutEntry IPLD | v, value, script_pub_key |
| Range Root | Range Root IPLD | v, genesis_height, from, to, tacit_block_count, tacit_tx_count, tacit_block_index |

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
| Tacit Block Index IPLD | ✅ | String keys "0", "1", ... |
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
2. **Tacit Block CID Index** - Map of `"0", "1", ...` to Block CIDs
3. **Block Nodes** - One per tacit block
4. **Tx Arrays** - CID-linked arrays of Tx nodes
5. **Tx Nodes** - Individual transactions
6. **Vin/Vout Arrays** - Per-transaction input/output data

CAR files are written to:

```text
out/car/blocks/dag-tacit-<tacit>-<btc>.car
out/car/range/dag-tacit-<tacit-from>-<tacit-to>-<btc-from>-<btc-to>.car
out/car/daily/<YYYY-MM-DD>/dag-tacit-<tacit-from>-<tacit-to>-<btc-from>-<btc-to>.car
```

Per-block CAR files root directly at the `Block` node and include only that block's linked transaction/input/output nodes. Range and daily CAR files root at the range root and include the block index plus all included blocks. CAR directories include `index.json` files for import lookup and metadata.

Daily CAR files are split by block timestamp at UTC/GMT midnight boundaries.

Import a CAR into a local IPFS/Kubo node:

```bash
bun run ipfs:import -- --block 948242
bun run ipfs:import -- --range 948242 949069
bun run ipfs:import -- --day 2026-05-12

# Short aliases and simple range syntax
bun run ipfs:import -- -b 948242
bun run ipfs:import -- -r 948242-948245
bun run ipfs:import -- -d 2026-05-12
```

The importer defaults to `http://127.0.0.1:5001` for the IPFS API and prints `dag/get` commands for reading DAG-CBOR roots. It also prints gateway URLs using `http://127.0.0.1:8080`, but local HTTP gateway behavior for raw DAG-CBOR roots depends on the IPFS implementation and requested content negotiation. Override endpoints with `--api`, `--gateway`, or environment variables `IPFS_API_URL` and `IPFS_GATEWAY_URL`.

## Development

```bash
# Type check (no TS, but validates imports)
bun run --check scripts/fetch-blocks.mjs

# Run tests
bun test

# Run full fetch/build/CAR pipeline
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
# Run all tests
bun test

# Fetch mainnet RPC-backed test fixtures
bun run fixtures

# Run specific test file
bun test tests/envelope.test.mjs

# Run with coverage
bun test --coverage
```

## License

MIT - Same as tacitscan
