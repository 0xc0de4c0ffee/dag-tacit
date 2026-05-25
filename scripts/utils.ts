import { readFileSync } from 'fs'

/** Parse a CLI flag value from argv */
export function flagValue(argv: string[], ...names: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    for (const name of names) {
      if (arg === name) return argv[i + 1]
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
    }
  }
  return null
}

/** Load a block JSON file */
export function loadBlockFile(path: string): { txs?: unknown[]; tx?: unknown[]; time?: number; [key: string]: unknown } {
  return JSON.parse(readFileSync(path, 'utf8'))
}
