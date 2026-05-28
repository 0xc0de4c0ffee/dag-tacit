# DAG-Tacit as an IPLD Data Structure

DAG-Tacit defines a deterministic IPLD representation of Tacit-bearing Bitcoin transactions.

Schemas are grouped by serialized IPLD blocks. Except for the types listed in "Basic Types", the top-level schema type in each schema block represents a value that is serialized as a single DAG-CBOR block with its own CID.

## Abstract

This document specifies:

- **Tacit transaction inclusion**: how Bitcoin transactions are selected for the index.
- **DAG-CBOR block types**: `Block`, `Tx`, `VinEntry`, `VoutEntry`, RangeRoot, BlockIndex, `Asset`, `AssetOp`, `AssetIndex`.
- **Bitcoin Core JSON mapping**: how RPC fields are converted into normalized DAG fields.
- **Deterministic encoding rules**: constraints required for reproducible CIDs.

The Tacit protocol itself, including envelope layout, opcodes, payloads, and balance rules, is defined by the upstream Tacit specification. Per-opcode wire formats are documented in the [opcode index](./opcodes/index.md) with [individual files](./opcodes/0x21-cetch.md) for each opcode. The complete opcode constant table is maintained in [`src/config.ts`](./src/config.ts) as `OPCODES_INFO`.

**Implementation pipeline.** The dag-tacit system processes Tacit-bearing Bitcoin blocks in three stages:

1. **Fetch** ([`scripts/blocks/blocks-fetch.ts`](./scripts/blocks/blocks-fetch.ts)): Fetches blocks via Bitcoin RPC, filters by Tacit magic bytes (`5441434954`) and envelope structure. Stores only filtered transactions with block metadata. No opcode validation at this layer.

2. **DAG** ([`src/blocks/blocks-nodes.ts`](./src/blocks/blocks-nodes.ts)): Reads filtered artifacts, validates envelope structure (magic + version + pushdata framing). Builds DAG-CBOR nodes. No opcode validation at this layer.

3. **Assets** ([`src/assets/assets-parse.ts`](./src/assets/)): Full opcode validation and payload parsing. Extracts asset definitions (CETCH, T_PETCH), tracks operations, builds asset index. This is the only layer that validates opcodes.

Packaging and transport formats, including CAR files, IPFS import flows, RPC capture, and local build pipelines, are out of scope for the IPLD schema. Such layers MAY wrap these IPLD values, but MUST NOT alter the normative field sets or encoding rules defined here.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) when, and only when, they appear in capitals in this document.

## References

| ID | Reference |
|----|-----------|
| TACIT-SPEC | [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md) |
| OPCODES | [Per-opcode wire format files](./opcodes/index.md) — 30 shipped, 28 drafted, 9 reserved |
| CONFIG | [`src/config.ts`](./src/config.ts) — `OPCODES_INFO` with all opcode constants |
| IPLD-DAG-CBOR | [DAG-CBOR](https://ipld.io/docs/codecs/known/dag-cbor/) |
| IPLD-SCHEMA | [IPLD Schema](https://ipld.io/docs/schemas/) |

## Basic Types

These types are used throughout DAG-Tacit data structures, but are not themselves serialized as independent IPLD blocks.

```ipldsch
type Bytes bytes
type CID link
type Uint int
```

| Type | Constraint |
|------|------------|
| `Bytes` | Byte string. |
| `CID` | CIDv1 link. |
| `Uint` | Non-negative integer encoded as a DAG-CBOR unsigned integer in shortest form. |

Additional notation used below:

| Notation | Constraint |
|----------|------------|
| `bytes[N]` | Byte string of exactly `N` octets. |
| `CID \| null` | Either a CID link or CBOR null. |
| `bytes[]` | DAG-CBOR array of byte strings. |
| `&WitnessData` | CID link to a DAG-CBOR block containing a single witness item as a byte string. Used for witness stack elements. |

## Common IPLD Encoding

All DAG-Tacit IPLD blocks MUST be serialized with DAG-CBOR, multicodec `0x71`. CID links MUST use CID version 1, SHA-256 multihash code `0x12`, and a 32-octet digest.

DAG-CBOR links are encoded using CBOR tag 42.

The `v` field is the DAG-Tacit schema version. `Block` and range root MUST contain `v` with value `1`. `Tx`, `VinEntry`, and `VoutEntry` do not carry `v`. This value MUST NOT be confused with CID version.

The block index is a string-keyed map to CIDs and does not carry `v`.

## Tacit Transaction Inclusion

A Bitcoin transaction MUST be included in `Block.txs` if and only if all of the following checks succeed:

| Step | Requirement | Layer |
|------|-------------|-------|
| 1 | `vin[0]` has a second witness item available as raw bytes (`txinwitness[1]` or `witness[1]`). | Fetch |
| 2 | Tacit envelope decode succeeds for that witness item: `<pubkey=32B> OP_CHECKSIG OP_0 OP_IF <magic=5B> <version=1B> <payload> OP_ENDIF`. Magic bytes MUST be `TACIT` (`0x5441434954`). Version MUST be `0x01`. The 32-byte pubkey is a BIP-341 NUMS point. | Fetch / DAG |
| 3 | Tacit payload opcode is recognized (opcode byte exists in `OPCODES_INFO`). | Assets |

Implementations MUST NOT include a transaction when any check fails.

**Layered validation.** The dag-tacit system splits these checks across three stages:
- **Fetch** (`scripts/blocks/blocks-fetch.ts`): Fast hex-string scan for magic bytes, then full envelope structure validation via `extractEnvelopeContent()`. Stores filtered transaction data.
- **DAG** (`scripts/blocks/blocks-dag.ts`): Re-validates envelope structure via `extractEnvelopeContent()` before building DAG-CBOR nodes. No opcode validation.
- **Assets** (`src/assets/assets-parse.ts`): Full validation via `extractTacitPayload()` which adds opcode recognition and payload parsing.

Implementation note: an indexer MAY prefilter candidates before envelope decoding. For example, when using Bitcoin Core verbose block JSON `getblock(hash, 2)`, an implementation can inspect only `vin[0].txinwitness[1]` and search for the Tacit magic bytes `TACIT` (`5441434954`). This prefilter is non-normative and MUST NOT be treated as proof of inclusion. Every candidate still MUST pass envelope and payload decoding.

## Block IPLD

`Block` represents one Bitcoin block height that contains at least one included Tacit transaction.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `txs` links to a DAG-CBOR array of `Tx` CIDs; `parent` links to the previous `Block` or is null at the head anchor.

```ipldsch
type Block struct {
  height Uint
  hash bytes[32]
  parent nullable &Block
  block Uint
  tx Uint
  time Uint
  txs &TxList
  v Uint
  checksum bytes[32]
}

type TxList [&Tx]
```

| Field | Type | Description |
|-------|------|-------------|
| `height` | `uint` | Bitcoin block height. |
| `hash` | `bytes[32]` | 32-octet block header hash. |
| `parent` | `CID \| null` | CID of the predecessor `Block`, or null at the head anchor. |
| `block` | `uint` | Zero-based tacit block index. |
| `tx` | `uint` | Number of Tacit transactions in `txs`. |
| `time` | `uint` | Block header time in seconds since Unix epoch. |
| `txs` | `CID` | CID of a DAG-CBOR array of `Tx` CIDs in Bitcoin tx order. |
| `v` | `uint` | Schema version; MUST be `1`. |
| `checksum` | `bytes[32]` | SHA256 chain checksum: `SHA256(prev_checksum \|\| SHA256(txs_canonical_json))`. Genesis uses 32 zero bytes as prev. Links each block's tacit tx set into a verifiable chain. |

Invariants:

1. If a range root is present and its `blocks` is `N`, `block` MUST be in `0..N-1`.
2. If the block index is present, the decimal string form of `block` MUST equal the map key for this `Block` CID.

## Transaction IPLD

`Tx` represents one Bitcoin transaction that satisfies the Tacit inclusion rules.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `vin` links to a DAG-CBOR array of `VinEntry` CIDs; `vout` links to a DAG-CBOR array of `VoutEntry` CIDs.

```ipldsch
type Tx struct {
  fee Uint
  index Uint
  locktime Uint
  txid bytes[32]
  version Uint
  vin &VinList
  vout &VoutList
  valid bool
}

type VinList [&VinEntry]
type VoutList [&VoutEntry]
```

| Field | Type | Description |
|-------|------|-------------|
| `fee` | `uint` | Fee in satoshis. |
| `index` | `uint` | Index in the parent block's `tx` array. |
| `locktime` | `uint` | Transaction `locktime`. |
| `txid` | `bytes[32]` | 32-octet transaction id. |
| `version` | `uint` | Transaction `version`. |
| `vin` | `CID` | CID of DAG-CBOR array of `VinEntry` CIDs in `vin[]` order. |
| `vout` | `CID` | CID of DAG-CBOR array of `VoutEntry` CIDs in `vout[]` order. |
| `valid` | `bool` | Cryptographic validity: `false` if commitment or signature checks fail, `true` otherwise (unchecked opcodes are treated as valid). |

## VinEntry IPLD

`VinEntry` represents one Bitcoin transaction input.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Source**: Bitcoin Core verbose transaction data or an equivalent chain API.

```ipldsch
type VinEntry struct {
  prevout Bytes
  sig Bytes
  sequence Uint
  txid bytes[32]
  value Uint
  vout Uint
  witness &WitnessList
}

type WitnessList [&WitnessData]
```

| Field | Type | Description |
|-------|------|-------------|
| `prevout` | `bytes` | Decoded `prevout.scriptPubKey.hex`; zero length if absent. |
| `sig` | `bytes` | Decoded `scriptSig.hex`; zero length if absent. |
| `sequence` | `uint` | Input `sequence`. |
| `txid` | `bytes[32]` | 32-octet previous output txid; 32 zero octets for coinbase. |
| `value` | `uint` | Previous output value in satoshis; `0` if absent. |
| `vout` | `uint` | Previous output index. |
| `witness` | `&WitnessList` | CID link to DAG-CBOR array of witness item CIDs. Empty array if no witness. |

Tacit envelope bytes and opcode MUST NOT be duplicated in separate DAG fields. Consumers MUST obtain them by parsing `witness[1]` according to TACIT-SPEC and the inclusion rules above.

## VoutEntry IPLD

`VoutEntry` represents one Bitcoin transaction output.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.

```ipldsch
type VoutEntry struct {
  pubkey bytes
  value Uint
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pubkey` | `bytes` | Decoded `scriptPubKey.hex`. |
| `value` | `uint` | Output value in satoshis. |

## Range Root IPLD

A multi-block DAG-Tacit instance MAY expose a distinguished DAG-CBOR map called the range root. It aggregates navigation metadata for a contiguous tacit-only block sequence within one logical DAG instance.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `index` links to a `BlockIndex` block.
- **Note**: this is an index range root, NOT the Bitcoin genesis block.

```ipldsch
type RangeRoot struct {
  from Uint
  genesis Uint
  blocks Uint
  index &BlockIndex
  tx Uint
  to Uint
  v Uint
}
```

| Field | Type | Description |
|-------|------|-------------|
| `from` | `uint` | Minimum `height` among included `Block` nodes. |
| `genesis` | `uint` | Tacit genesis height. MUST be `948242`. |
| `blocks` | `uint` | Count of `Block` nodes. |
| `index` | `CID` | CID of the block index. |
| `tx` | `uint` | Sum of all `Block.tx`. |
| `to` | `uint` | Maximum `height` among included `Block` nodes. |
| `v` | `uint` | Schema version; MUST be `1`. |

## Block Index IPLD

The value referenced by `RangeRoot.index` MUST be a DAG-CBOR map with decimal string keys (no leading zeros) and `Block` CID values.

```ipldsch
type BlockIndex {String:&Block}
```

Invariants:

1. If `blocks` is `N`, the key set MUST be exactly `{"0", "1", ..., "N-1"}`.
2. Each key MUST equal the decimal representation of the referenced `Block.block`.

## Asset IPLD

`Asset` represents a CETCH-deployed token with its metadata. One `Asset` node per unique token. T_PETCH tokens use the same `asset_id` derivation but carry additional fields (`cap_amount`, `mint_limit`) not shown here — the `Asset` IPLD type covers CETCH-only metadata; T_PETCH metadata lives in the asset index layer.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: none — all fields are inline bytes or integers.

```ipldsch
type Asset struct {
  asset_id bytes[32]
  etch_txid bytes[32]
  ticker String
  decimals Uint
  commitment bytes[33]
  mint_authority bytes[32]
  image_uri String
  block_height Uint
  time Uint
  amount_ct bytes[8]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | `bytes[32]` | `SHA256(reveal_txid_BE \|\| vout_LE(4))` where `vout = 0` for CETCH and T_PETCH (per TACIT-SPEC §4). Canonical asset identifier. |
| `etch_txid` | `bytes[32]` | Bitcoin txid of the reveal that created the CETCH token. |
| `ticker` | `string` | UTF-8 ticker symbol. 1–16 characters. |
| `decimals` | `uint` | Decimal places. MUST be ≤ 8. |
| `commitment` | `bytes[33]` | Pedersen commitment (compressed secp256k1 point). |
| `mint_authority` | `bytes[32]` | X-only pubkey for T_MINT authorization. All-zero = non-mintable. |
| `image_uri` | `string` | Optional IPFS/image URI. Empty string if absent. |
| `block_height` | `uint` | Bitcoin block height of the CETCH reveal. |
| `time` | `uint` | Block header timestamp at CETCH reveal. |
| `amount_ct` | `bytes[8]` | Encrypted supply commitment (8-byte Pedersen amount ciphertext). |

## AssetOp IPLD

`AssetOp` represents one operation on an asset (CETCH, CXFER, T_MINT, T_BURN, etc.).

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: none — `asset_id` is an inline bytes field, not a CID link.

```ipldsch
type AssetOp struct {
  txid bytes[32]
  opcode String
  asset_id nullable bytes[32]
  block_height Uint
  time Uint
  payload Bytes
}
```

| Field | Type | Description |
|-------|------|-------------|
| `txid` | `bytes[32]` | Bitcoin txid of the operation. |
| `opcode` | `string` | Opcode name (e.g. `"CXFER"`, `"T_MINT"`, `"T_DROP"`). |
| `asset_id` | `bytes[32] \| null` | Referenced asset ID. `null` for CETCH (which defines a new asset). |
| `block_height` | `uint` | Bitcoin block height. |
| `time` | `uint` | Block header timestamp. |
| `payload` | `bytes` | Raw envelope payload (opcode byte + fields). |

## Asset Index IPLD

The asset index is a DAG-CBOR map referencing all indexed assets and operations.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `asset_list` links to a CID array of `Asset` CIDs; `op_list` links to a CID array of `AssetOp` CIDs.

```ipldsch
type AssetIndex struct {
  v Uint
  assets Uint
  ops Uint
  asset_list &AssetList
  op_list &OpList
}

type AssetList [&Asset]
type OpList [&AssetOp]
```

| Field | Type | Description |
|-------|------|-------------|
| `v` | `uint` | Schema version; MUST be `1`. |
| `assets` | `uint` | Count of indexed assets. |
| `ops` | `uint` | Count of indexed operations. |
| `asset_list` | `CID` | CID of DAG-CBOR array of `Asset` CIDs in discovery order. |
| `op_list` | `CID` | CID of DAG-CBOR array of `AssetOp` CIDs in block-height order. |

## Mapping from Bitcoin Core JSON

Decoded transaction JSON from `getrawtransaction(txid, true, blockhash)` or verbose transaction objects from `getblock(hash, 2)` represents monetary amounts as JSON numbers in BTC.

For every such field stored as `uint` satoshis, encoders MUST compute:

```text
satoshis = max(0, floor(btc * 1e8 + 0.5))
```

If the field is missing or non-finite, the stored value MUST be `0`.

## Deterministic Encoding

To maximize reproducibility of CIDs:

1. `Block`, `Tx`, `VinEntry`, `VoutEntry`, `RangeRoot`, `Asset`, `AssetOp`, and `AssetIndex` objects MUST use exactly the field names listed in this document.
2. Encoders MUST NOT omit keys for those objects. Nullable fields (`Block.parent`, `AssetOp.asset_id`) MUST be present with value `null` rather than omitted.
3. Encoders MUST NOT add fields that are not listed in this document.
4. The block index MUST contain only keys specified by the `BlockIndex` invariants.
5. Absent or unknown data MUST use the sentinel values defined by the relevant field: zero `uint`, empty `bytes`, empty `witness` array, or null only where a nullable link or nullable integer is specified.

DAG-CBOR canonical map ordering determines encoded bytes. Human-readable field tables in this document are organized for clarity and do not override DAG-CBOR canonical ordering.

If prevout or other fields are later populated from additional sources, the resulting bytes are a different artifact. Interoperability requires a full rebuild, not in-place mutation of an existing DAG.

## Examples

This section is non-normative. It shows representative decoded `Block` JSON views and CIDs from one generated DAG-Tacit output set. Byte strings are rendered as lowercase hexadecimal strings, and CIDs are rendered in base32 text form. Actual CIDs vary based on the specific block data and pipeline version.

### Block 0

CID:

```text
bafyreifiyb6xkabgywkuuiwvu4sgs6ph64qe6eyvyu5nixzmowypiuippy
```

Decoded `Block`:

```json
{
  "height": 948242,
  "hash": "0000000000000000000282b8c1f3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2",
  "parent": null,
  "block": 0,
  "tx": 2,
  "time": 1778117538,
  "txs": "bafyreifxobwsdldoqnziiff6jezsxv633hyhysczet3qiyw77acjjpo5fq",
  "v": 1,
  "checksum": "bafyreian6pf2z5qxfx5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5q"
}
```

`txs` full view:

```json
{
  "cid": "bafyreifxobwsdldoqnziiff6jezsxv633hyhysczet3qiyw77acjjpo5fq",
  "bytes_hex": "82d82a58250001711220097110a3c4eefc10170d76bf4ed106f863b259d2544bf38d1f126445a7bb0775d82a5825000171122081f3210bb038ccde97d5ca4cf6468508c58e90ed958f24abcc8fcaa384e90161"
}
```

### Block 1

CID:

```text
bafyreia2baqjpnkc4firwnchkzonzppdz4n4ejnmujxtnb4ats2oiegovu
```

Decoded `Block`:

```json
{
  "height": 948247,
  "hash": "00000000000000000001a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
  "parent": "bafyreifiyb6xkabgywkuuiwvu4sgs6ph64qe6eyvyu5nixzmowypiuippy",
  "block": 1,
  "tx": 1,
  "time": 1778120681,
  "txs": "bafyreibr3rqeom32xvtpedchqilo7fz2utyagvgqelyxywpe6nqsams6dm",
  "v": 1,
  "checksum": "bafyreian6pf2z5qxfx5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5q"
}
```

`txs` full view:

```json
{
  "cid": "bafyreibr3rqeom32xvtpedchqilo7fz2utyagvgqelyxywpe6nqsams6dm",
  "bytes_hex": "81d82a58250001711220fe47a96bdaa9a9f28d5b7a650590fb0453c8c2e7538e141cee499cd925f25472"
}
```

## Security Considerations

This index is a cache of public chain data. Implementations MUST NOT treat it as authoritative for value transfer without validating against a Bitcoin full node and appropriate user approval of spends.

## CAR Import/Export & Backward Flow

CAR files are self-contained — every CID referenced by the root Block node is included as an entry in the same CAR. This enables:

- **Import**: External CAR files can be verified by reading all entries and checking CIDs against the IPLD schema.
- **Export**: Any CAR file writer can produce dag-tacit-compatible CARs using the IPLD node builders in `src/`.
- **Reverse resolution**: Given a CAR file, consumers can extract the root Block CID, iterate all entries, and reconstruct the raw tacit-block JSON. This enables third-party indexers to distribute verified CAR files as "trusted sources" without exposing RPC endpoints.

## Debug Metadata (Non-normative)

The build pipeline MAY emit **debug metadata** for transactions that pass the Tacit magic-bytes check (`0x5441434954` in `vin[0].witness[1]`) but fail deeper validation (malformed envelope frame, bad version, unknown opcode, payload decode error). This metadata is **NOT** part of the IPLD DAG-CBOR schema and MUST NOT be included in CAR files or the block index.

- **Purpose**: Chain security monitoring, fork detection, protocol debugging.
- **Format**: Per-block JSON files (`out/debug/<height>-debug.json`) and append-only log (`out/debug/debug.log`).
- **Fields**: `txid` (string), `error` (string), `witness_hex` (string).
- **Stages**: Envelope failures (bad magic/version) are caught at fetch stage; opcode failures are caught at assets stage.

Debug metadata is implementation-specific and MAY be collected by indexers separately for further analysis and future upgrades.