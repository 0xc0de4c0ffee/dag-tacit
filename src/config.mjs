import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export function loadEnvFile(path) {
  const env = {}
  if (!existsSync(path)) return env
  const content = readFileSync(path, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

export function loadConfig(root) {
  const env = loadEnvFile(resolve(root, '.env'))
  return {
    bitcoinRpcUrl: process.env.BITCOIN_RPC_URL || env.BITCOIN_RPC_URL || '',
    bitcoinNetwork: process.env.BITCOIN_NETWORK || env.BITCOIN_NETWORK || 'mainnet',
    startHeight: Number(process.env.START_HEIGHT || env.START_HEIGHT || '948242')
  }
}
