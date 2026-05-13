import type { CID } from 'multiformats/cid'

// ============================================================================
// Bitcoin RPC types
// ============================================================================

export interface BitcoinScriptSig {
  asm?: string
  hex?: string
}

export interface BitcoinScriptPubKey {
  asm?: string
  hex?: string
  type?: string
  address?: string
  addresses?: string[]
}

export interface BitcoinPrevout {
  value: number
  scriptPubKey: BitcoinScriptPubKey
}

export interface BitcoinVin {
  txid?: string
  vout?: number
  coinbase?: string
  scriptSig?: BitcoinScriptSig
  txinwitness?: string[]
  sequence?: number
  prevout?: BitcoinPrevout
}

export interface BitcoinVout {
  value: number
  n?: number
  scriptPubKey: BitcoinScriptPubKey
}

export interface BitcoinTx {
  txid: string
  hash?: string
  version?: number
  size?: number
  weight?: number
  locktime?: number
  fee?: number
  vin: BitcoinVin[]
  vout: BitcoinVout[]
  tx_index?: number
}

export interface BitcoinBlock {
  height: number
  hash: string
  previousblockhash?: string | null
  time: number
  nTx: number
  tx: BitcoinTx[]
}

// ============================================================================
// Tacit envelope types
// ============================================================================

export interface TacitPayloadResult {
  ok: true
  payload: Uint8Array
  opcode: string
}

export interface TacitPayloadError {
  ok: false
  error: string
}

export type ExtractTacitPayloadResult = TacitPayloadResult | TacitPayloadError

export interface DecodedPayloadResult {
  ok: true
  opcode: string
}

export interface DecodedPayloadError {
  ok: false
  error: string
}

export type DecodePayloadResult = DecodedPayloadResult | DecodedPayloadError

// ============================================================================
// DAG node types (IPLD schema)
// ============================================================================

/** CID link alias for schema readability */
export type Link = CID

/** Raw-hash CID: CIDv1, raw multicodec 0x55, identity multihash 0x00 */
export type RawHash = CID

/** Witness data CID: CIDv1, dag-cbor 0x71, SHA-256, contains a single byte string */
export type WitnessData = CID

/** VinEntry per SPEC Section 7 */
export interface VinEntry {
  txid: RawHash
  vout: number
  sequence: number
  witness: Link
  script_sig: Uint8Array
  value: number
  prevout_script_pubkey: Uint8Array
}

/** VoutEntry per SPEC Section 8 */
export interface VoutEntry {
  value: number
  script_pub_key: Uint8Array
}

/** Tx per SPEC Section 6 */
export interface Tx {
  tx_index: number
  txid: RawHash
  fee: number
  version: number
  locktime: number
  vin: Link
  vout: Link
}

/** Block per SPEC Section 5 */
export interface Block {
  bitcoin_block: number
  block_hash: RawHash
  prev: Link | null
  tacit_block: number
  tacit_tx_count: number
  time: number
  tx_count: number
  txs: Link
  v: number
}

// ============================================================================
// Range root & index types (SPEC Sections 11-12)
// ============================================================================

export interface RangeRoot {
  v: number
  genesis_height: number
  from: number
  to: number
  tacit_block_count: number
  tacit_tx_count: number
  tacit_block_index: Link
}

export interface BlockIndex {
  [tacitBlock: string]: Link
}

// ============================================================================
// CAR & internal types
// ============================================================================

export interface EncodedNode {
  cid: CID
  bytes: Uint8Array
}

export interface EncodedNodeWithValue extends EncodedNode {
  node: unknown
}

export type CidMap = Map<string, EncodedNode | EncodedNodeWithValue>

export interface ProcessedBlock {
  blockCid: CID
  blockBytes: Uint8Array
  tacitTxCount: number
  cids: CidMap
}

export interface CarMeta {
  kind: 'block' | 'range' | 'daily'
  file: string
  tacit_from: number
  tacit_to: number
  btc_from: number
  btc_to: number
  day?: string
  blocks: number
}

// ============================================================================
// Config types
// ============================================================================

export interface DagTacitConfig {
  bitcoinRpcUrl: string
  bitcoinNetwork: string
  startHeight: number
  ipfsApiUrl: string
  ipfsGatewayUrl: string
}

// ============================================================================
// RPC types
// ============================================================================

export type RpcMethod = string
export type RpcParams = (string | number | boolean | unknown)[]

export type BitcoinRpcClient = (method: RpcMethod, params?: RpcParams) => Promise<unknown>
