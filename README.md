# dag-tacit

DAG-CBOR index builder + SQLite query layer for the [Tacit protocol](https://github.com/z0r0z/tacit) on Bitcoin.

## Architecture

```
dag-tacit/
├── src/                  # Core library (no I/O, no CLI, no DB)
│   ├── lib/              # Envelope parsing, DAG-CBOR, CAR, RPC, reorg, verify, utils
│   ├── blocks/           # Block/Tx/VinEntry/VoutEntry IPLD node builders + CAR assembly
│   └── assets/           # CETCH/T_PETCH payload parsing + asset IPLD node builders
├── scripts/              # Pipeline scripts
│   ├── blocks/           # Fetch RPC, DAG-CBOR, CAR assembly, Kubo import
│   ├── assets/           # Per-block asset DAG-CBOR + CAR + unified index
│   └── db/               # SQLite schema, import, query, export, migration
├── ceremony/             # Groth16 ceremony artifacts (mixer + AMM VKs)
├── tacit-spec/           # git submodule: github.com/z0r0z/tacit
├── opcodes/              # Per-opcode wire format docs (30 shipped)
└── dag-tacit.md          # IPLD schema specification
```

## Pipeline

### Pass 1: Fetch & Filter
```
bun run fetch                       # Scan Bitcoin RPC from resume height
bun run fetch --from N              # Start from height N
bun run fetch --to M                # Scan up to height M
bun run fetch --force               # Wipe output dir, re-fetch from genesis
bun run fetch --car                 # Also build CAR files per block
bun run fetch --dag                 # Also build DAG-CBOR JSON (debug)
bun run fetch --debug               # Write debug logs for failed envelopes
bun run fetch -t 10                 # Concurrency (default: 5)
```
Output: `out/tacit-blocks/<day>/dag-tacit-<N>-<height>.json`

### Pass 2: DAG-CBOR + CAR
```
bun run dag                         # Build DAG-CBOR nodes from JSON
bun run car                         # Build CAR files from DAG nodes
bun run full                        # Pipeline: fetch → dag → car
```
Output: `out/car/blocks/<day>/dag-tacit-<cid>-<height>.car`

### Pass 3: SQLite Import
```
bun run db:import                   # Import all tacit blocks
bun run db:import --from N --to M   # Import a range
bun run db:import --force           # Re-import (drops and recreates)
```
Output: `out/sqlite/dag-tacit.sqlite`

### Assets
```
bun run assets:dag                  # Build per-block asset DAG-CBOR JSON
bun run assets:car                  # Build per-block asset CAR files
bun run assets:build                # Build unified asset index
bun run assets:full                 # Pipeline: dag → car → build
```

### Queries
```
bun run db:utxo stats               # DB summary
bun run db:utxo tx <txid>           # Tx details + vins/vouts
bun run db:utxo address <addr>      # Address activity
bun run db:utxo asset <asset_id>    # Asset details, cap, mint status
bun run db:export --sql             # SQL dump (for D1/browser)
bun run db:export --json            # JSON snapshot
bun run db:car-export               # Export DB → CAR files
bun run db:car-import <file.car>    # Import CAR → DB
```

## Ceremony Artifacts

Groth16 verification keys for protocol circuits are in `ceremony/`:

| Circuit | VK file | IPFS CID |
|---------|---------|----------|
| Mixer (T_WITHDRAW) | `ceremony/mixer/verification_key.json` | `bafybeidq2ahzte4sfiqjsmhqta62ufenpppzpch5ppry55tzxzlvltxy2u` |
| AMM (T_LP_ADD/REMOVE, T_SWAP_BATCH) | `ceremony/amm/amm_verification_key.json` | `bafkreibjpe4xfqtq2ziki4uupydnkeiakqi76m674xtdhmxnfbrn4iomp4` |

## Cryptographic Validation

All 30 shipped opcodes are validated in `src/lib/verify.ts`:

- **Commitment**: secp256k1 point validity (CETCH, CXFER, T_MINT, T_BURN, T_AXFER, T_PMINT, T_DCLAIM, T_AXFER_VAR)
- **Blinding**: non-zero check (T_PMINT, T_DCLAIM)
- **BIP-340 Schnorr**: issuer sig (T_MINT), kernel sig (CXFER, T_AXFER, T_BURN)
- **Groth16**: structural proof check (T_WITHDRAW via ceremony VK)
- **Cap**: divisibility (T_PETCH), burn amount (T_BURN)

Results propagate to the `Tx.valid` field in DAG-CBOR nodes.

## Key Design Decisions

- **src/ is pure** — no I/O, no CLI, no DB. All concrete pipelines in scripts/.
- **Fetch stores all envelope-valid txs** — unknown opcodes kept for future protocol upgrades. Opcode validation is parallel debug channel.
- **Asset IDs** — `SHA256(reveal_txid_LE || vout_LE(4))` per TACIT-SPEC §4. CETCH and T_PETCH both use vout = 0.
- **Idempotent import** — re-running without `--force` skips already-imported blocks via height Set checkpoint.
- **Reorg-safe** — fetch checks `last_hash` before scanning. Reorg resets index and removes affected files.
- **CAR determinism** — same block data produces identical CIDs.
