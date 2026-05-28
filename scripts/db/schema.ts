import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { InferSelectModel } from 'drizzle-orm'

// ── Blocks ──
export const blocks = sqliteTable('blocks', {
  height: integer('height').primaryKey(),
  hash: text('hash').notNull(),
  time: integer('time').notNull(),
  block: integer('block').notNull(),
  tx: integer('tx').notNull().default(0),
  nTx: integer('n_tx').default(0),
})

// ── Assets (CETCH/T_PETCH definitions) ──
export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetId: text('asset_id').notNull().unique(),
  ticker: text('ticker').notNull(),
  decimals: integer('decimals').notNull(),
  kind: text('kind').notNull(),
  isMintable: integer('is_mintable').default(0),
  mintAuthority: text('mint_authority'),
  capAmount: integer('cap_amount'),
  mintLimit: integer('mint_limit'),
  mintStartHeight: integer('mint_start_height'),
  mintEndHeight: integer('mint_end_height'),
  mintedCount: integer('minted_count').default(0),
  commitC: text('commit_c'),
  amountCt: text('amount_ct'),
  etchTxId: integer('etch_tx_id').notNull().references(() => txs.id),
  imageUri: text('image_uri'),
})

// ── Transactions ──
export const txs = sqliteTable('txs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  txid: text('txid').notNull(),
  height: integer('height').notNull().references(() => blocks.height),
  index: integer('index').notNull(),
  version: integer('version').default(2),
  locktime: integer('locktime').default(0),
  fee: integer('fee').default(0),
  envelopeValid: integer('envelope_valid').default(0),
  opcode: text('opcode'),
  opcodeByte: integer('opcode_byte'),
  assetId: integer('asset_id').references(() => assets.id),
  payloadHex: text('payload_hex'),
  chainStatus: text('chain_status').default('confirmed'),
  mintValid: integer('mint_valid'),
}, t => ({
  txidIdx: uniqueIndex('txs_txid_idx').on(t.txid),
  heightIdx: index('txs_height_idx').on(t.height),
  assetIdx: index('txs_asset_idx').on(t.assetId),
  opcodeIdx: index('txs_opcode_idx').on(t.opcode),
}))

// ── Transaction inputs (one per vin[]) ──
export const vins = sqliteTable('vins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  txId: integer('tx_id').notNull().references(() => txs.id),
  vinIndex: integer('vin_index').notNull(),
  txidPrev: text('txid_prev'),
  voutPrev: integer('vout_prev'),
  sequence: integer('sequence').default(0xffffffff),
  value: integer('value'),
  prevout: text('prevout'),
  prevoutAddress: text('prevout_address'),
  sig: text('sig'),
  witness0: text('witness_0'),
  witness1: text('witness_1'),
  witness2: text('witness_2'),
}, t => ({
  txIdIdx: index('vins_tx_id_idx').on(t.txId),
  prevIdx: index('vins_prev_idx').on(t.txidPrev, t.voutPrev),
}))

// ── Transaction outputs (one per vout[]) ──
export const vouts = sqliteTable('vouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  txId: integer('tx_id').notNull().references(() => txs.id),
  voutIndex: integer('vout_index').notNull(),
  pubkey: text('pubkey'),
  value: integer('value').notNull().default(0),
  address: text('address'),
  scriptType: text('script_type'),
  isTacit: integer('is_tacit').default(0),
  assetId: integer('asset_id').references(() => assets.id),
  commitmentC: text('commitment_c'),
  encryptedAmount: text('encrypted_amount'),
  spent: integer('spent').default(0),
  spentInTxId: integer('spent_in_tx_id'),
}, t => ({
  txIdIdx: index('vouts_tx_id_idx').on(t.txId),
  addrIdx: index('vouts_addr_idx').on(t.address),
  assetIdx: index('vouts_asset_idx').on(t.assetId),
  spentIdx: index('vouts_spent_idx').on(t.spent),
}))

// ── Types ──
export type Block = InferSelectModel<typeof blocks>
export type Asset = InferSelectModel<typeof assets>
export type Tx = InferSelectModel<typeof txs>
export type Vin = InferSelectModel<typeof vins>
export type Vout = InferSelectModel<typeof vouts>
