import type { DagTacitConfig, PinServiceConfig } from './types.ts'

// ============================================================================
// Schema & Protocol constants
// ============================================================================

export const SCHEMA_VERSION = 1
export const TACIT_GENESIS_HEIGHT = 948242

// ============================================================================
// Tacit envelope constants
// ============================================================================

export const MAGIC = new Uint8Array([0x54, 0x41, 0x43, 0x49, 0x54]) // "TACIT"
export const VERSION = 0x01

// Opcode status labels per SPEC.md §1.1
export type OpcodeStatus = 'shipped' | 'drafted' | 'reserved' | 'free'

export interface OpcodeInfo {
  value: number
  name: string
  status: OpcodeStatus
  source: string
}

/**
 * Complete opcode table from SPEC.md §1.1 canonical table.
 * Includes all shipped, drafted, and reserved opcodes across the Tacit protocol
 * and all amendments.
 */
export const OPCODES_INFO: Record<string, OpcodeInfo> = {
  // ── Core shipped opcodes (SPEC.md §§5.1–5.13, 5.19) ──
  CETCH:            { value: 0x21, name: 'T_CETCH',      status: 'shipped', source: 'SPEC §5.1' },
  CXFER_BPP:        { value: 0x22, name: 'T_CXFER_BPP',  status: 'shipped', source: 'SPEC §5.21' },
  CXFER:            { value: 0x23, name: 'T_CXFER',      status: 'shipped', source: 'SPEC §5.2' },
  T_MINT:           { value: 0x24, name: 'T_MINT',       status: 'shipped', source: 'SPEC §5.3' },
  T_BURN:           { value: 0x25, name: 'T_BURN',       status: 'shipped', source: 'SPEC §5.4' },
  T_AXFER:          { value: 0x26, name: 'T_AXFER',      status: 'shipped', source: 'SPEC §5.7' },
  T_PETCH:          { value: 0x27, name: 'T_PETCH',      status: 'shipped', source: 'SPEC §5.8' },
  T_PMINT:          { value: 0x28, name: 'T_PMINT',      status: 'shipped', source: 'SPEC §5.9' },
  T_DEPOSIT:        { value: 0x29, name: 'T_DEPOSIT',    status: 'shipped', source: 'SPEC §5.10' },
  T_WITHDRAW:       { value: 0x2A, name: 'T_WITHDRAW',   status: 'shipped', source: 'SPEC §5.11' },
  T_DROP:           { value: 0x2B, name: 'T_DROP',       status: 'shipped', source: 'SPEC §5.12' },
  T_DCLAIM:         { value: 0x2C, name: 'T_DCLAIM',     status: 'shipped', source: 'SPEC §5.13' },
  T_AXFER_VAR:      { value: 0x37, name: 'T_AXFER_VAR',  status: 'shipped', source: 'SPEC §5.7.9' },
  T_WRAPPER_ATTEST: { value: 0x38, name: 'T_WRAPPER_ATTEST', status: 'shipped', source: 'SPEC §5.19' },

  // ── Drafted AMM opcodes (AMM.md / amendments) ──
  T_LP_ADD:         { value: 0x2D, name: 'T_LP_ADD',         status: 'drafted', source: 'AMM.md §5.14' },
  T_LP_REMOVE:      { value: 0x2E, name: 'T_LP_REMOVE',      status: 'drafted', source: 'AMM.md §5.15' },
  T_SWAP_BATCH:     { value: 0x2F, name: 'T_SWAP_BATCH',     status: 'drafted', source: 'AMM.md §5.16' },
  T_INTENT_ATTEST:  { value: 0x30, name: 'T_INTENT_ATTEST',  status: 'drafted', source: 'AMM.md §5.17' },
  T_PROTOCOL_FEE_CLAIM: { value: 0x31, name: 'T_PROTOCOL_FEE_CLAIM', status: 'drafted', source: 'AMM.md §5.18' },
  T_SWAP_VAR:       { value: 0x32, name: 'T_SWAP_VAR',       status: 'drafted', source: 'SPEC-SWAP-VAR-AMENDMENT.md §5.20' },
  T_SWAP_ROUTE:     { value: 0x33, name: 'T_SWAP_ROUTE',     status: 'drafted', source: 'SPEC-SWAP-ROUTE-AMENDMENT.md §5.22' },
  T_FARM_INIT:      { value: 0x34, name: 'T_FARM_INIT',      status: 'drafted', source: 'SPEC-AMM-FARM-AMENDMENT.md §5.40' },
  T_LP_BOND:        { value: 0x35, name: 'T_LP_BOND',        status: 'drafted', source: 'SPEC-AMM-FARM-AMENDMENT.md §5.41' },
  T_LP_UNBOND:      { value: 0x36, name: 'T_LP_UNBOND',      status: 'drafted', source: 'SPEC-AMM-FARM-AMENDMENT.md §5.42' },
  T_TRADE_BATCH:    { value: 0x39, name: 'T_TRADE_BATCH',    status: 'drafted', source: 'SPEC-TRADE-BATCH-AMENDMENT.md §5.20' },
  T_RANGE_ATTEST:   { value: 0x3A, name: 'T_RANGE_ATTEST',   status: 'drafted', source: 'SPEC-RANGE-ATTEST-AMENDMENT.md §5.21' },
  T_LP_HARVEST:     { value: 0x3B, name: 'T_LP_HARVEST',     status: 'drafted', source: 'SPEC-AMM-FARM-AMENDMENT.md §5.43' },
  T_AXFER_BPP:      { value: 0x3C, name: 'T_AXFER_BPP',      status: 'drafted', source: 'SPEC-AXFER-BPP-AMENDMENT.md' },
  T_AXFER_VAR_BPP:  { value: 0x3D, name: 'T_AXFER_VAR_BPP',  status: 'drafted', source: 'SPEC-AXFER-BPP-AMENDMENT.md' },
  T_FARM_REFUND:    { value: 0x3E, name: 'T_FARM_REFUND',    status: 'drafted', source: 'SPEC-AMM-FARM-AMENDMENT.md §5.44' },

  // ── Shipped slot & cBTC.tac opcodes (CBTC-ZK / CBTC-TAC amendments) ──
  T_SLOT_MINT:              { value: 0x43, name: 'T_SLOT_MINT',              status: 'shipped', source: 'SPEC-CBTC-ZK-AMENDMENT.md §5.21' },
  T_SLOT_BURN:              { value: 0x44, name: 'T_SLOT_BURN',              status: 'shipped', source: 'SPEC-CBTC-ZK-AMENDMENT.md §5.22' },
  T_SLOT_ROTATE:            { value: 0x45, name: 'T_SLOT_ROTATE',            status: 'shipped', source: 'SPEC-CBTC-ZK-AMENDMENT.md §5.23' },
  T_SLOT_SPLIT:             { value: 0x46, name: 'T_SLOT_SPLIT',             status: 'shipped', source: 'SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md §5.24' },
  T_SLOT_MERGE:             { value: 0x47, name: 'T_SLOT_MERGE',             status: 'shipped', source: 'SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md §5.25' },
  T_SLOT_NOTE:              { value: 0x48, name: 'T_SLOT_NOTE',              status: 'reserved', source: 'SPEC-CBTC-ZK-FUNGIBILITY-AMENDMENT.md §5.26' },
  T_CBTC_TAC_DEPOSIT:       { value: 0x49, name: 'T_CBTC_TAC_DEPOSIT',       status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.47' },
  T_CBTC_TAC_WITHDRAW:      { value: 0x4A, name: 'T_CBTC_TAC_WITHDRAW',      status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.47' },
  T_CBTC_TAC_FORCE_CLOSE:   { value: 0x4B, name: 'T_CBTC_TAC_FORCE_CLOSE',   status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.47' },
  T_CTAC_LIEN_CLAIM:        { value: 0x4C, name: 'T_CTAC_LIEN_CLAIM',        status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.47' },
  T_SLOT_FRACTIONALIZE:     { value: 0x4D, name: 'T_SLOT_FRACTIONALIZE',     status: 'reserved', source: 'SPEC-CBTC-ZK-AMOUNT-AMENDMENT.md §5.25' },
  T_SLOT_RECONSOLIDATE:     { value: 0x4E, name: 'T_SLOT_RECONSOLIDATE',     status: 'reserved', source: 'SPEC-CBTC-ZK-AMOUNT-AMENDMENT.md §5.26' },
  T_CTAC_LIEN_SPLIT:        { value: 0x4F, name: 'T_CTAC_LIEN_SPLIT',        status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.47' },

  // ── Newer shipped atomic cBTC.tac ops ──
  T_CBTC_TAC_DEPOSIT_ATOMIC:  { value: 0x57, name: 'T_CBTC_TAC_DEPOSIT_ATOMIC',  status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.48' },
  T_CBTC_TAC_WITHDRAW_ATOMIC: { value: 0x58, name: 'T_CBTC_TAC_WITHDRAW_ATOMIC', status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.49' },
  T_CBTC_TAC_TOP_UP:          { value: 0x59, name: 'T_CBTC_TAC_TOP_UP',          status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.50' },
  T_CBTC_TAC_BOND_RELEASE:    { value: 0x5A, name: 'T_CBTC_TAC_BOND_RELEASE',    status: 'shipped', source: 'SPEC-CBTC-TAC-AMENDMENT.md §5.51' },

  // ── Preauth bid opcodes ──
  T_PREAUTH_BID:     { value: 0x5B, name: 'T_PREAUTH_BID',     status: 'shipped', source: 'SPEC-PREAUTH-BID-AMENDMENT.md §5.7.11' },
  T_PREAUTH_BID_VAR: { value: 0x5C, name: 'T_PREAUTH_BID_VAR', status: 'shipped', source: 'SPEC-PREAUTH-BID-VAR-AMENDMENT.md §5.7.12' },

  // ── Bridge opcodes (tentative, declared in dapp but not yet in spec table) ──
  T_BRIDGE_DEPOSIT:  { value: 0x60, name: 'T_BRIDGE_DEPOSIT',  status: 'drafted', source: 'tacit-spec/dapp + worker' },
  T_BRIDGE_BURN:     { value: 0x61, name: 'T_BRIDGE_BURN',     status: 'drafted', source: 'tacit-spec/dapp + worker' },
  T_BRIDGE_ROTATE:   { value: 0x62, name: 'T_BRIDGE_ROTATE',   status: 'drafted', source: 'tacit-spec/dapp + worker' },
  T_BRIDGE_EXPORT:   { value: 0x63, name: 'T_BRIDGE_EXPORT',   status: 'drafted', source: 'tacit-spec/dapp + worker' },
  T_BRIDGE_IMPORT:   { value: 0x64, name: 'T_BRIDGE_IMPORT',   status: 'drafted', source: 'tacit-spec/dapp + worker' },

  // ── Drafted governance opcodes ──
  T_GOV_PROPOSAL:      { value: 0x50, name: 'T_GOV_PROPOSAL',      status: 'drafted', source: 'SPEC-GOVERNANCE-AMENDMENT.md' },
  T_GOV_VOTE:          { value: 0x51, name: 'T_GOV_VOTE',          status: 'drafted', source: 'SPEC-GOVERNANCE-AMENDMENT.md' },
  T_GOV_VETO:          { value: 0x52, name: 'T_GOV_VETO',          status: 'drafted', source: 'SPEC-GOVERNANCE-AMENDMENT.md' },
  T_GOV_EXECUTE:       { value: 0x53, name: 'T_GOV_EXECUTE',       status: 'drafted', source: 'SPEC-GOVERNANCE-AMENDMENT.md' },

  // ── Drafted cUSD.tac ops ──
  T_CUSD_TAC_DEPOSIT:     { value: 0x54, name: 'T_CUSD_TAC_DEPOSIT',     status: 'drafted', source: 'SPEC-CUSD-TAC-AMENDMENT.md §6.3' },
  T_CUSD_TAC_WITHDRAW:    { value: 0x55, name: 'T_CUSD_TAC_WITHDRAW',    status: 'drafted', source: 'SPEC-CUSD-TAC-AMENDMENT.md §6.4' },
  T_CUSD_TAC_FORCE_CLOSE: { value: 0x56, name: 'T_CUSD_TAC_FORCE_CLOSE', status: 'drafted', source: 'SPEC-CUSD-TAC-AMENDMENT.md §6.5' },
} as const

/** Map opcode names to their byte values (for fast lookup) */
export const OPCODES: Record<string, number> = Object.fromEntries(
  Object.entries(OPCODES_INFO).map(([key, info]) => [key, info.value])
) as Record<string, number>

/** Map opcode byte values to their display names */
export const OPCODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(OPCODES_INFO).map(([, info]) => [info.value, info.name])
) as Record<number, string>

/** Array of all shipped opcode entries (for asset indexing) */
export const SHIPPED_OPCODES: OpcodeInfo[] = Object.values(OPCODES_INFO)
  .filter(info => info.status === 'shipped')

// Bitcoin script opcodes used in envelope decoding
export const OP_0 = 0x00
export const OP_PUSHDATA1 = 0x4c
export const OP_PUSHDATA2 = 0x4d
export const OP_PUSHDATA4 = 0x4e
export const OP_1NEGATE = 0x4f
export const OP_1 = 0x51
export const OP_16 = 0x60
export const OP_IF = 0x63
export const OP_NOTIF = 0x64
export const OP_ENDIF = 0x68

// ============================================================================
// IPLD multicodec constants
// ============================================================================

export const DAG_CBOR_CODE = 0x71
export const RAW_CODE = 0x55
export const SHA256_CODE = 0x12

// ============================================================================
// Environment config loader (Node.js — browser consumers pass config objects)
// ============================================================================

const DEFAULT_IPFS_API = 'http://127.0.0.1:5001'
const DEFAULT_IPFS_GATEWAY = 'http://127.0.0.1:8080'

export function loadConfig(): DagTacitConfig {
  return {
    bitcoinRpcUrl: (typeof process !== 'undefined' && process.env?.BITCOIN_RPC_URL) || '',
    bitcoinNetwork: (typeof process !== 'undefined' && process.env?.BITCOIN_NETWORK) || 'mainnet',
    startHeight: Number((typeof process !== 'undefined' && process.env?.START_HEIGHT) || '948242'),
    reorgDepth: Number((typeof process !== 'undefined' && process.env?.REORG_DEPTH) || '6'),
    ipfsApiUrl: (typeof process !== 'undefined' && process.env?.IPFS_API_URL) || DEFAULT_IPFS_API,
    ipfsGatewayUrl: (typeof process !== 'undefined' && process.env?.IPFS_GATEWAY_URL) || DEFAULT_IPFS_GATEWAY,
  }
}

// ============================================================================
// Pinning-service helpers
// ============================================================================

/** Build a PinServiceConfig from environment variables */
export function loadPinConfig(): PinServiceConfig {
  const kind = ((typeof process !== 'undefined' && process.env?.PIN_SERVICE) || 'kubo') as PinServiceConfig['kind']
  const apiKey = (typeof process !== 'undefined' && process.env?.PIN_API_KEY) || ''
  const apiUrl = (typeof process !== 'undefined' && process.env?.PIN_API_URL) || ''
  return { kind, apiKey, apiUrl }
}
