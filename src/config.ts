import type { DagTacitConfig } from './types.ts'

const DEFAULT_IPFS_API = 'http://127.0.0.1:5001'
const DEFAULT_IPFS_GATEWAY = 'http://127.0.0.1:8080'

export function loadConfig(): DagTacitConfig {
  return {
    bitcoinRpcUrl: process.env.BITCOIN_RPC_URL || '',
    bitcoinNetwork: process.env.BITCOIN_NETWORK || 'mainnet',
    startHeight: Number(process.env.START_HEIGHT || '948242'),
    ipfsApiUrl: process.env.IPFS_API_URL || DEFAULT_IPFS_API,
    ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || DEFAULT_IPFS_GATEWAY,
  }
}
