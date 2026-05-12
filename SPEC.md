# DAG-Tacit as an IPLD Data Structure

DAG-Tacit defines a deterministic IPLD representation of Tacit-bearing Bitcoin transactions.

Schemas are grouped by serialized IPLD blocks. Except for the types listed in “Basic Types”, the top-level schema type in each schema block represents a value that is serialized as a single DAG-CBOR block with its own CID.

## Abstract

This document specifies:

- **Tacit transaction inclusion**: how Bitcoin transactions are selected for the index.
- **DAG-CBOR block types**: `Block`, `Tx`, `VinEntry`, `VoutEntry`, range root, and tacit block CID index.
- **Bitcoin Core JSON mapping**: how RPC fields are converted into normalized DAG fields.
- **Deterministic encoding rules**: constraints required for reproducible CIDs.

The Tacit protocol itself, including envelope layout, opcodes, payloads, and balance rules, is defined by the upstream Tacit specification.

Packaging and transport formats, including CAR files, IPFS import flows, RPC capture, and local build pipelines, are out of scope. Such layers MAY wrap these IPLD values, but MUST NOT alter the normative field sets or encoding rules defined here.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) when, and only when, they appear in capitals in this document.

## References

| ID | Reference |
|----|-----------|
| TACIT-SPEC | [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md) |
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

## Common IPLD Encoding

All DAG-Tacit IPLD blocks MUST be serialized with DAG-CBOR, multicodec `0x71`. CID links MUST use CID version 1, SHA-256 multihash code `0x12`, and a 32-octet digest.

DAG-CBOR links are encoded using CBOR tag 42.

The `v` field is the DAG-Tacit schema version. Every `Block`, `Tx`, `VinEntry`, `VoutEntry`, and range root MUST contain `v` with value `1`. This value MUST NOT be confused with CID version.

The tacit block CID index is a string-keyed map to CIDs and does not carry `v`.

## Tacit Transaction Inclusion

A Bitcoin transaction MUST be included in `Block.txs` if and only if all of the following checks succeed:

| Step | Requirement |
|------|-------------|
| 1 | `vin[0]` has a second witness item available as raw bytes (`txinwitness[1]` or `witness[1]`). |
| 2 | Tacit envelope decoding succeeds for that witness item according to TACIT-SPEC. |
| 3 | Tacit payload decoding succeeds for the parsed opcode and payload according to TACIT-SPEC. |

Implementations MUST NOT include a transaction when any check fails.

Implementation note: an indexer MAY prefilter candidates before envelope decoding. For example, when using Bitcoin Core verbose block JSON `getblock(hash, 2)`, an implementation can inspect only `vin[0].txinwitness[1]` and search for the Tacit magic bytes `TACIT` (`5441434954`). This prefilter is non-normative and MUST NOT be treated as proof of inclusion. Every candidate still MUST pass envelope and payload decoding.

## Block IPLD

`Block` represents one Bitcoin block height that contains at least one included Tacit transaction.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `txs` links to a DAG-CBOR array of `Tx` CIDs; `prev` links to the previous `Block` in this DAG-Tacit instance or is null at the tacit-chain head anchor.

```ipldsch
type Block struct {
  bitcoin_block Uint
  block_hash Bytes
  prev nullable &Block
  tacit_block Uint
  tacit_tx_count Uint
  time Uint
  tx_count Uint
  txs &TxList
  v Uint
}

type TxList [&Tx]
```

| Field | Type | Description |
|-------|------|-------------|
| `bitcoin_block` | `uint` | Bitcoin block height. |
| `block_hash` | `bytes[32]` | 32-byte block header hash in the byte order produced by Bitcoin Core before hexadecimal RPC display. |
| `prev` | `CID \| null` | CID of the predecessor `Block`, or null if this is the head anchor in the DAG instance. |
| `tacit_block` | `uint` | Zero-based tacit-only block index within the DAG instance. |
| `tacit_tx_count` | `uint` | Number of transactions in the array referenced by `txs`. |
| `time` | `uint` | Bitcoin block header time in seconds since Unix epoch. |
| `tx_count` | `uint` | Total transaction count for the Bitcoin block (`nTx`). |
| `txs` | `CID` | CID of a DAG-CBOR array of `Tx` CIDs. Array order MUST equal Bitcoin transaction order restricted to included Tacit transactions. |
| `v` | `uint` | Schema version; MUST be `1`. |

Invariants:

1. If a range root is present and its `tacit_block_count` is `N`, `tacit_block` MUST be in `0..N-1`.
2. If the tacit block CID index is present, the decimal string form of `tacit_block` MUST equal the map key under which this `Block` CID is stored.

## Transaction IPLD

`Tx` represents one Bitcoin transaction that satisfies the Tacit inclusion rules.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `vin` links to a DAG-CBOR array of `VinEntry` CIDs; `vout` links to a DAG-CBOR array of `VoutEntry` CIDs.

```ipldsch
type Tx struct {
  fee Uint
  locktime Uint
  tx_index Uint
  txid Bytes
  v Uint
  version Uint
  vin &VinList
  vout &VoutList
}

type VinList [&VinEntry]
type VoutList [&VoutEntry]
```

| Field | Type | Description |
|-------|------|-------------|
| `fee` | `uint` | Transaction fee in satoshis. |
| `locktime` | `uint` | Bitcoin transaction `locktime`. |
| `tx_index` | `uint` | Index of this transaction in the parent Bitcoin block’s `tx` array. |
| `txid` | `bytes[32]` | Transaction identifier. |
| `v` | `uint` | Schema version; MUST be `1`. |
| `version` | `uint` | Bitcoin transaction `version`. |
| `vin` | `CID` | CID of a DAG-CBOR array of `VinEntry` CIDs. Array order MUST equal Bitcoin `vin[]` order. |
| `vout` | `CID` | CID of a DAG-CBOR array of `VoutEntry` CIDs. Array order MUST equal Bitcoin `vout[]` order. |

## VinEntry IPLD

`VinEntry` represents one Bitcoin transaction input.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Source**: Bitcoin Core verbose transaction data or an equivalent chain API.

```ipldsch
type VinEntry struct {
  prevout_script_pubkey Bytes
  script_sig Bytes
  sequence Uint
  txid Bytes
  v Uint
  value Uint
  vout Uint
  witness [Bytes]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prevout_script_pubkey` | `bytes` | Decoded `prevout.scriptPubKey.hex`; MUST be zero length if absent. |
| `script_sig` | `bytes` | Decoded `scriptSig.hex`; MUST be zero length if absent. |
| `sequence` | `uint` | Bitcoin input `sequence`. |
| `txid` | `bytes[32]` | Previous output txid; MUST be 32 zero octets for coinbase. |
| `v` | `uint` | Schema version; MUST be `1`. |
| `value` | `uint` | Previous output value in satoshis; MUST be `0` if `prevout` is absent. |
| `vout` | `uint` | Previous output index. |
| `witness` | `bytes[]` | Witness stack. Each element is the raw bytes of one witness item. MUST be empty when no witness is present. |

Tacit envelope bytes and opcode MUST NOT be duplicated in separate DAG fields. Consumers MUST obtain them by parsing `witness[1]` according to TACIT-SPEC and the inclusion rules above.

## VoutEntry IPLD

`VoutEntry` represents one Bitcoin transaction output.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.

```ipldsch
type VoutEntry struct {
  script_pub_key Bytes
  v Uint
  value Uint
}
```

| Field | Type | Description |
|-------|------|-------------|
| `script_pub_key` | `bytes` | Decoded `scriptPubKey.hex`. |
| `v` | `uint` | Schema version; MUST be `1`. |
| `value` | `uint` | Output value in satoshis. |

## Range Root IPLD

A multi-block DAG-Tacit instance MAY expose a distinguished DAG-CBOR map called the range root. It aggregates navigation metadata for a contiguous tacit-only block sequence within one logical DAG instance.

- **Serialization**: DAG-CBOR map.
- **CID**: CIDv1, dag-cbor multicodec `0x71`, SHA-256 multihash.
- **Links**: `tacit_block_index` links to a `TacitBlockIndex` block.
- **Note**: this object is an index range root and MUST NOT be confused with the Bitcoin network genesis block.

```ipldsch
type RangeRoot struct {
  from Uint
  genesis_height Uint
  tacit_block_count Uint
  tacit_block_index &TacitBlockIndex
  tacit_tx_count Uint
  to Uint
  v Uint
}
```

| Field | Type | Description |
|-------|------|-------------|
| `from` | `uint` | Minimum `bitcoin_block` height among included `Block` nodes. |
| `genesis_height` | `uint` | Fixed Tacit genesis Bitcoin block height. MUST be `948242`. |
| `tacit_block_count` | `uint` | Count of `Block` nodes in this instance. |
| `tacit_block_index` | `CID` | CID of the tacit block CID index. |
| `tacit_tx_count` | `uint` | Sum of each included `Block.tacit_tx_count`. |
| `to` | `uint` | Maximum `bitcoin_block` height among included `Block` nodes. |
| `v` | `uint` | Schema version; MUST be `1`. |

## Tacit Block Index IPLD

The value referenced by `RangeRoot.tacit_block_index` MUST be a single DAG-CBOR map whose keys are decimal strings without leading zeros and whose values are CIDs of `Block` objects.

```ipldsch
type TacitBlockIndex {String:&Block}
```

Invariants:

1. If `tacit_block_count` is `N`, the key set MUST be exactly `{"0", "1", ..., "N-1"}`.
2. For each entry, the key MUST equal the decimal representation of the referenced `Block.tacit_block`.

## Mapping from Bitcoin Core JSON

Decoded transaction JSON from `getrawtransaction(txid, true, blockhash)` or verbose transaction objects from `getblock(hash, 2)` represents monetary amounts as JSON numbers in BTC.

For every such field stored as `uint` satoshis, encoders MUST compute:

```text
satoshis = max(0, floor(btc * 1e8 + 0.5))
```

If the field is missing or non-finite, the stored value MUST be `0`.

## Deterministic Encoding

To maximize reproducibility of CIDs:

1. `Block`, `Tx`, `VinEntry`, `VoutEntry`, and range root objects MUST use exactly the field names listed in this document.
2. Encoders MUST NOT omit keys for those objects.
3. Encoders MUST NOT add fields that are not listed in this document.
4. The tacit block CID index MUST contain only keys specified by the `TacitBlockIndex` invariants.
5. Absent or unknown data MUST use the sentinel values defined by the relevant field: zero `uint`, empty `bytes`, empty `witness` array, or null only where a nullable link or nullable integer is specified.

DAG-CBOR canonical map ordering determines encoded bytes. Human-readable field tables in this document are organized for clarity and do not override DAG-CBOR canonical ordering.

If prevout or other fields are later populated from additional sources, the resulting bytes are a different artifact. Interoperability requires a full rebuild, not in-place mutation of an existing DAG.

## Examples

This section is non-normative. It shows representative decoded `Block` JSON views and CIDs from one generated DAG-Tacit output set. Byte strings are rendered as lowercase hexadecimal strings, and CIDs are rendered in base32 text form.

### Tacit block 0

CID:

```text
bafyreifiyb6xkabgywkuuiwvu4sgs6ph64qe6eyvyu5nixzmowypiuippy
```

Decoded `Block`:

```json
{
  "bitcoin_block": 948242,
  "block_hash": "00000000000000000001faaa331b2bcbb9896e97d0c40ad2b78855a1f769b832",
  "prev": null,
  "tacit_block": 0,
  "tacit_tx_count": 2,
  "time": 1778117538,
  "tx_count": 3562,
  "txs": "bafyreifxobwsdldoqnziiff6jezsxv633hyhysczet3qiyw77acjjpo5fq",
  "v": 1
}
```

`txs` full view:

```json
{
  "cid": "bafyreifxobwsdldoqnziiff6jezsxv633hyhysczet3qiyw77acjjpo5fq",
  "bytes_hex": "82d82a58250001711220097110a3c4eefc10170d76bf4ed106f863b259d2544bf38d1f126445a7bb0775d82a5825000171122081f3210bb038ccde97d5ca4cf6468508c58e90ed958f24abcc8fcaa384e90161"
}
```

### Tacit block 1

CID:

```text
bafyreia2baqjpnkc4firwnchkzonzppdz4n4ejnmujxtnb4ats2oiegovu
```

Decoded `Block`:

```json
{
  "bitcoin_block": 948247,
  "block_hash": "000000000000000000021039112c5e7ae8fa5a34288bd419387cf43be22d8143",
  "prev": "bafyreifiyb6xkabgywkuuiwvu4sgs6ph64qe6eyvyu5nixzmowypiuippy",
  "tacit_block": 1,
  "tacit_tx_count": 1,
  "time": 1778120681,
  "tx_count": 5066,
  "txs": "bafyreibr3rqeom32xvtpedchqilo7fz2utyagvgqelyxywpe6nqsams6dm",
  "v": 1
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
