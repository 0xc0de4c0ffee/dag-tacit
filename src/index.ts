export {
  encodeNode,
  link,
  hexToBytes,
  bytesToHex,
  btcToSatoshis,
  deriveAssetId,
} from './lib/dag-cbor.ts'

export {
  hasTacitEnvelope,
  witnessHasTacitMagicHex,
  decodePayload,
  extractEnvelopeContent,
  extractTacitPayload,
} from './lib/envelope.ts'

export {
  buildVinEntry,
  buildVoutEntry,
  buildTxNode,
  buildBlockNode,
  processBlock,
} from './blocks/blocks-nodes.ts'

export {
  parseCetchPayload,
  parseTPetchPayload,
  extractAssetId,
  parseAssetOp,
  processBlockAssets,
} from './assets/assets-parse.ts'

export {
  buildAssetNode,
  buildAssetOpNode,
  buildAssetIndex,
} from './assets/assets-nodes.ts'

export {
  buildBlockIndex,
  buildRangeRoot,
  buildBlockCarFile,
  buildCarFile,
} from './blocks/blocks-car.ts'

export {
  processAssetBlock,
  buildAssetBlockCarFile,
} from './assets/assets-block.ts'

export {
  jsonNode,
  utcDay,
  tacitOutputCount,
} from './lib/utils.ts'

export {
  computeBlockChecksum,
  verifyCommitment,
  verifySchnorrSig,
  verifyMintSig,
  verifyPayload,
} from './lib/verify.ts'

export {
  SCHEMA_VERSION,
  TACIT_GENESIS_HEIGHT,
  MAGIC,
  VERSION,
  OPCODES,
  OPCODE_NAMES,
  OPCODES_INFO,
  SHIPPED_OPCODES,
  DAG_CBOR_CODE,
  SHA256_CODE,
  loadConfig,
  loadPinConfig,
} from './config.ts'

export {
  createBitcoinRpcClient,
  fetchVerboseBlock,
  fetchBlockHeaderWithTxids,
} from './lib/rpc.ts'

export {
  createPinService,
  HttpPinService,
} from './lib/pin.ts'

export type {
  PinResult,
  PinService,
} from './lib/pin.ts'

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
  ProcessedAssetBlock,
  Asset,
  AssetOp,
  TPetchParams,
  AssetIndex,
  CarMeta,
  DagTacitConfig,
  BitcoinRpcClient,
  RpcMethod,
  RpcParams,
  PinServiceConfig,
  VerifyResult,
} from './types.ts'
