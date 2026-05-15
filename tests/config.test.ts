import { describe, test, expect } from 'bun:test'
import { loadConfig } from '../src/config.ts'

describe('config', () => {
  test('loadConfig returns defaults when env is empty', () => {
    const config = loadConfig()
    expect(config.startHeight).toBeGreaterThan(0)
    expect(config.reorgDepth).toBeGreaterThanOrEqual(1)
    expect(config.bitcoinNetwork).toBe('mainnet')
    expect(config.ipfsApiUrl).toContain('127.0.0.1')
    expect(config.ipfsGatewayUrl).toContain('127.0.0.1')
  })

  test('reorgDepth respects REORG_DEPTH env var', () => {
    process.env.REORG_DEPTH = '12'
    const config = loadConfig()
    expect(config.reorgDepth).toBe(12)
    delete process.env.REORG_DEPTH
  })

  test('reorgDepth defaults to 6 when not set', () => {
    delete process.env.REORG_DEPTH
    const config = loadConfig()
    expect(config.reorgDepth).toBe(6)
  })

  test('startHeight respects START_HEIGHT env var', () => {
    process.env.START_HEIGHT = '999999'
    const config = loadConfig()
    expect(config.startHeight).toBe(999999)
    delete process.env.START_HEIGHT
  })
})
