import { describe, test, expect } from 'bun:test'
import { findReorgCutoff } from '../src/reorg.ts'

describe('reorg', () => {
  test('returns null when all hashes match', () => {
    const stored = [
      { height: 100, hash: 'aaa' },
      { height: 101, hash: 'bbb' },
      { height: 102, hash: 'ccc' }
    ]
    const rpc = new Map([
      [100, 'aaa'],
      [101, 'bbb'],
      [102, 'ccc']
    ])
    expect(findReorgCutoff(stored, rpc, 100, 103)).toBeNull()
  })

  test('returns first mismatched height', () => {
    const stored = [
      { height: 100, hash: 'aaa' },
      { height: 101, hash: 'bbb' },
      { height: 102, hash: 'ccc' }
    ]
    const rpc = new Map([
      [100, 'aaa'],
      [101, 'XXX'],
      [102, 'ccc']
    ])
    expect(findReorgCutoff(stored, rpc, 100, 103)).toBe(101)
  })

  test('only checks within range', () => {
    const stored = [
      { height: 100, hash: 'aaa' },
      { height: 101, hash: 'bbb' }
    ]
    const rpc = new Map([
      [100, 'XXX'],
      [101, 'bbb']
    ])
    // checkFrom=101 skips height 100
    expect(findReorgCutoff(stored, rpc, 101, 102)).toBeNull()
  })

  test('returns null when stored block not found for height', () => {
    const stored = [{ height: 100, hash: 'aaa' }]
    const rpc = new Map([[101, 'bbb']])
    expect(findReorgCutoff(stored, rpc, 100, 102)).toBeNull()
  })

  test('returns null when rpc hash missing for height', () => {
    const stored = [
      { height: 100, hash: 'aaa' },
      { height: 101, hash: 'bbb' }
    ]
    const rpc = new Map([[100, 'aaa']])
    expect(findReorgCutoff(stored, rpc, 100, 102)).toBeNull()
  })

  test('empty stored returns null', () => {
    const rpc = new Map([[100, 'aaa']])
    expect(findReorgCutoff([], rpc, 100, 101)).toBeNull()
  })
})
