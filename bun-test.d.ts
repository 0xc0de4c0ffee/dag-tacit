declare module 'bun:test' {
  export function describe(label: string, fn: () => void): void
  export function test(label: string, fn: () => void | Promise<void>): void
  export namespace test {
    export function skipIf(condition: boolean): (label: string, fn: () => void | Promise<void>) => void
  }
  export const expect: <T>(value: T) => {
    toBe(expected: unknown): void
    toBeNull(): void
    toBeInstanceOf(constructor: unknown): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toEqual(expected: unknown): void
    toHaveLength(n: number): void
    toContain(expected: string): void
    toThrow(expected?: string): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeTruthy(): void
    not: {
      toBeNull(): void
      toBe(expected: unknown): void
    }
  }
}

declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function writeFileSync(path: string, data: string | Uint8Array): void
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding?: string): string | Uint8Array
}

declare module 'node:path' {
  export function join(...paths: string[]): string
  export function resolve(...paths: string[]): string
  export function dirname(path: string): string
  export function basename(path: string): string
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare const Bun: {
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer>; size: number; text(): Promise<string> }
}

declare interface FormData {
  append(name: string, value: unknown, filename?: string): void
}
