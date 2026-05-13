export {
  encodeNode,
  link,
  rawCid,
  hexToBytes,
  bytesToHex,
  btcToSatoshis,
  padBytes,
} from './dag-cbor.ts'

export {
  hasTacitEnvelope,
  witnessHasTacitMagicHex,
  decodePayload,
  extractTacitPayload,
} from './envelope.ts'

export {
  buildVinEntry,
  buildVoutEntry,
  buildTxNode,
  processBlock,
} from './nodes.ts'

export {
  buildBlockIndex,
  buildRangeRoot,
  buildBlockCarFile,
  buildCarFile,
} from './car.ts'

export {
  loadConfig,
} from './config.ts'

export {
  createBitcoinRpcClient,
  fetchVerboseBlock,
  fetchBlockHeaderWithTxids,
  fetchVerboseTx,
} from './rpc.ts'

export type {
  BitcoinBlock,
  BitcoinTx,
  BitcoinVin,
  BitcoinVout,
  BitcoinScriptSig,
  BitcoinScriptPubKey,
  BitcoinPrevout,
  ExtractTacitPayloadResult,
  TacitPayloadResult,
  TacitPayloadError,
  DecodePayloadResult,
  DecodedPayloadResult,
  DecodedPayloadError,
  Link,
  RawHash,
  WitnessData,
  VinEntry,
  VoutEntry,
  Tx,
  Block,
  RangeRoot,
  BlockIndex,
  EncodedNode,
  EncodedNodeWithValue,
  CidMap,
  ProcessedBlock,
  CarMeta,
  DagTacitConfig,
  BitcoinRpcClient,
  RpcMethod,
  RpcParams,
} from './types.ts'
