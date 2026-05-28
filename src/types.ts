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

export interface DebugTx extends BitcoinTx {
  error: string
  witness_hex: string
}

export interface BitcoinBlock {
  height: number
  hash: string
  previousblockhash?: string | null
  time: number
  nTx?: number
  tx: BitcoinTx[]
  debugTxs?: DebugTx[]
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

/** Witness data CID: CIDv1, dag-cbor 0x71, SHA-256, contains a single byte string */
export type WitnessData = CID

/** VinEntry per SPEC Section 7 */
export interface VinEntry {
  txid: Uint8Array
  vout: number
  sequence: number
  witness: Link
  sig: Uint8Array
  value: number
  prevout: Uint8Array
}

/** VoutEntry per SPEC Section 8 */
export interface VoutEntry {
  pubkey: Uint8Array
  value: number
}

/** Tx per SPEC Section 6 */
export interface Tx {
  index: number
  txid: Uint8Array
  fee: number
  version: number
  locktime: number
  vin: Link
  vout: Link
}

/** Block per SPEC Section 5 */
export interface Block {
  height: number
  hash: Uint8Array
  parent: Link | null
  block: number
  tx: number
  time: number
  txs: Link
  v: number
  checksum: Uint8Array
}

// ============================================================================
// Asset indexer types
// ============================================================================

/** Asset metadata from a CETCH operation */
export interface Asset {
  asset_id: Uint8Array
  etch_txid: Uint8Array
  ticker: string
  decimals: number
  commitment: Uint8Array
  mint_authority: Uint8Array
  image_uri: string
  block_height: number
  time: number
  amountCt: Uint8Array
}

/** Single operation on an asset */
export interface AssetOp {
  txid: Uint8Array
  opcode: string
  asset_id: Uint8Array | null
  block_height: number
  time: number
  payload: Uint8Array
}

/** T_PETCH cap parameters */
export interface TPetchParams {
  cap_amount: number
  mint_limit: number
}

/** Asset index root node */
export interface AssetIndex {
  v: number
  assets: number
  ops: number
  asset_list: Link
  op_list: Link
}

/** Internal type for a processed asset block */
export interface ProcessedAssetBlock {
  height: number
  time: number
  assetCids: CidMap
  assetListCid: CID
  opListCid: CID
  assetCount: number
  opCount: number
}

// ============================================================================
// Range root & index types (SPEC Sections 11-12)
// ============================================================================

export interface RangeRoot {
  v: number
  genesis: number
  from: number
  to: number
  blocks: number
  tx: number
  index: Link
}

export interface BlockIndex {
  [key: string]: Link
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

export interface VerifyResult {
  commitmentValid: boolean | null
  commitmentError: string | null
  issuerSigValid: boolean | null
  issuerSigError: string | null
}

export interface ProcessedBlock {
  blockCid: CID
  blockBytes: Uint8Array
  tacitTxCount: number
  cids: CidMap
  checksum: Uint8Array
  txVerifyResults: VerifyResult[]
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
  reorgDepth: number
  ipfsApiUrl: string
  ipfsGatewayUrl: string
}

export interface PinServiceConfig {
  kind: 'kubo' | 'lighthouse' | 'pinata' | 'filecoin' | 'custom'
  apiKey: string
  apiUrl: string
}

// ============================================================================
// RPC types
// ============================================================================

export type RpcMethod = string
export type RpcParams = (string | number | boolean | unknown)[]

export type BitcoinRpcClient = (method: RpcMethod, params?: RpcParams) => Promise<unknown>
