# dag-tacit

DAG-CBOR index builder + SQLite query layer for the [Tacit protocol](https://github.com/z0r0z/tacit) on Bitcoin.

## Architecture

```
dag-tacit/
├── src/                  # Core library (no I/O, no CLI, no DB)
│   ├── lib/              # Envelope parsing, DAG-CBOR, CAR, RPC, reorg, utils
│   ├── blocks/           # Block/Tx/VinEntry/VoutEntry IPLD node builders + CAR assembly
│   └── assets/           # CETCH/T_PETCH payload parsing + asset IPLD node builders
├── scripts/              # Pipeline scripts (CLI, JSON artifacts, SQLite, Kubo)
│   ├── blocks/           # Fetch, DAG-CBOR JSON, CAR assembly, IPFS import
│   ├── assets/           # Per-block asset DAG-CBOR + CAR + unified index
│   └── db/               # SQLite schema, import, query, export, migration
├── tacit-spec/           # git submodule: github.com/z0r0z/tacit
├── opcodes/              # Per-opcode wire format docs (30 shipped + drafted)
├── dag-tacit.md          # IPLD schema specification
└── AGENTS.md             # Developer guidelines
```

## Pipeline

### Pass 1: Fetch & Filter (scripts/blocks/blocks-fetch.ts)
- Fetches blocks via Bitcoin RPC
- Scans `vin[0].txinwitness[1]` for TACIT magic bytes
- Validates envelope structure (magic + version + OP_0 OP_IF frame)
- **Stores ALL envelope-valid txs** regardless of opcode (unknown opcodes go to debug)
- Output: `out/tacit-blocks/<day>/dag-tacit-<N>-<height>.json`
- Debug: `out/debug/<height>-debug.json`

### Pass 2: DAG-CBOR + CAR (src/blocks/)
- Builds IPLD DAG-CBOR nodes (Block, Tx, VinEntry, VoutEntry)
- Assembles deterministic CAR files (CIDv1, SHA-256, DAG-CBOR 0x71)
- Output: `out/car/blocks/<day>/dag-tacit-<cid>-<height>.car`

### Pass 3: SQLite Import (scripts/db/import.ts)
- Reads tacit-block JSON → populates 5 tables
- Parses T_PETCH payloads (cap_amount, mint_limit, mint window)
- Validates T_PMINTs against cap (first-come-first-serve by tx_index)
- Idempotent: safe to re-run, skips already-imported txs

## Database (SQLite)

Local SQLite via `bun:sqlite` + Drizzle ORM.

### Tables

| Table | PK | Purpose |
|-------|-----|---------|
| `blocks` | height | Block metadata ledger |
| `assets` | auto-increment id | Asset defs with cap tracking, mint count |
| `txs` | auto-increment id | Tacit tx envelope data, asset FK, mint validation |
| `vins` | auto-increment id | One row per tx input (vin[]) |
| `vouts` | auto-increment id | One row per tx output (vout[]) |

### Commands

```bash
bun run db:import                    # Import all blocks
bun run db:import --from N --to M    # Import a range
bun run db:import --force            # Re-import (drops and recreates)
bun run db:utxo stats                # DB summary
bun run db:utxo tx <txid>            # Tx details + vins/vouts
bun run db:utxo address <addr>       # Address activity
bun run db:utxo asset <asset_id>     # Asset details, cap, mint status
bun run db:export --sql              # SQL dump (for D1/browser)
bun run db:export --json             # JSON snapshot
```

## Key Design Decisions

- **src/ is pure** — No I/O, no CLI, no DB. All concrete pipelines live in scripts/.
- **Fetch stores all envelope-valid txs** — Unknown opcodes are kept in JSON for future protocol upgrades. Opcode validation is a parallel debug channel.
- **Asset IDs** — `SHA256(reveal_txid_LE \|\| vout_LE(4))` per TACIT-SPEC §4. CETCH and T_PETCH both use vout = 0.
- **Idempotent import** — Re-running import without `--force` skips already-imported blocks via height Set checkpoint.
- **Reorg-safe** — Fetch checks `last_hash` against chain tip before scanning. Reorg resets index and removes affected files.
- **CAR determinism** — Same block data produces identical CIDs.
