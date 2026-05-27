import type { Config } from 'drizzle-kit'

export default {
  schema: './scripts/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './out/sqlite/dag-tacit.sqlite',
  },
} satisfies Config
