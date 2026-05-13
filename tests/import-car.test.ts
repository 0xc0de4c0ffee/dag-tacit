import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { carPathForArgs, resolveFiles } from '../scripts/import-car.ts'

function tmpRoot(): string {
  return join(tmpdir(), `dag-tacit-import-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

describe('IPFS CAR import selection', () => {
  function writeIndex(root: string): void {
    const dir = join(root, 'out', 'car')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.json'), JSON.stringify({
      blocks: [{ file: 'blocks/dag-tacit-0-948242.car', btc_from: 948242, btc_to: 948242 }],
      range: [{ file: 'range/dag-tacit-0-544-948242-949069.car', btc_from: 948242, btc_to: 949069 }],
      daily: [{ file: 'daily/2026-05-12/dag-tacit-514-544-949015-949069.car', day: '2026-05-12' }]
    }))
  }

  test('resolves block CAR path', () => {
    const root = tmpRoot()
    writeIndex(root)
    expect(carPathForArgs(new Map([['--block', '948242']]), [], root)).toBe(join(root, 'out', 'car', 'blocks', 'dag-tacit-0-948242.car'))
    expect(carPathForArgs(new Map([['-b', '948242']]), [], root)).toBe(join(root, 'out', 'car', 'blocks', 'dag-tacit-0-948242.car'))
    expect(carPathForArgs(new Map(), ['block', '948242'], root)).toBe(join(root, 'out', 'car', 'blocks', 'dag-tacit-0-948242.car'))
  })

  test('resolves range CAR path', () => {
    const root = tmpRoot()
    writeIndex(root)
    expect(carPathForArgs(new Map([['--range', '948242']]), ['949069'], root)).toBe(join(root, 'out', 'car', 'range', 'dag-tacit-0-544-948242-949069.car'))
    expect(carPathForArgs(new Map([['-r', '948242-948245']]), [], root)).toBe(join(root, 'out', 'car', 'range', 'dag-tacit-0-544-948242-949069.car'))
    expect(carPathForArgs(new Map(), ['range', '948242-948245'], root)).toBe(join(root, 'out', 'car', 'range', 'dag-tacit-0-544-948242-949069.car'))
  })

  test('resolves a single daily CAR path', () => {
    const root = tmpRoot()
    writeIndex(root)
    const file = join(root, 'out', 'car', 'daily', '2026-05-12', 'dag-tacit-514-544-949015-949069.car')
    expect(carPathForArgs(new Map([['--day', '2026-05-12']]), [], root)).toBe(file)
    expect(carPathForArgs(new Map([['-d', '2026-05-12']]), [], root)).toBe(file)
    expect(carPathForArgs(new Map(), ['day', '2026-05-12'], root)).toBe(file)
  })

  test('resolves batch block CAR paths with --from and --to', async () => {
    const root = tmpRoot()
    const dir = join(root, 'out', 'car')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.json'), JSON.stringify({
      blocks: [
        { file: 'blocks/dag-tacit-0-948242.car', btc_from: 948242, btc_to: 948242 },
        { file: 'blocks/dag-tacit-1-948247.car', btc_from: 948247, btc_to: 948247 },
        { file: 'blocks/dag-tacit-2-948248.car', btc_from: 948248, btc_to: 948248 }
      ]
    }))
    const files = await resolveFiles(new Map([['--from', '948242'], ['--to', '948247']]), [], root)
    expect(files).toEqual([
      join(root, 'out', 'car', 'blocks', 'dag-tacit-0-948242.car'),
      join(root, 'out', 'car', 'blocks', 'dag-tacit-1-948247.car')
    ])
  })

  test('rejects ambiguous daily CAR selection', () => {
    const root = tmpRoot()
    const dir = join(root, 'out', 'car')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ daily: [
      { file: 'daily/2026-05-12/a.car', day: '2026-05-12' },
      { file: 'daily/2026-05-12/b.car', day: '2026-05-12' }
    ] }))
    expect(() => carPathForArgs(new Map([['--day', '2026-05-12']]), [], root)).toThrow('Expected exactly one daily CAR, found 2')
  })
})
