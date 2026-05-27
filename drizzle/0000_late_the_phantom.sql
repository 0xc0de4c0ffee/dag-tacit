CREATE TABLE `assets` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`decimals` integer NOT NULL,
	`kind` text NOT NULL,
	`is_mintable` integer DEFAULT 0,
	`mint_authority` text,
	`cap_amount` integer,
	`mint_limit` integer,
	`mint_start_height` integer,
	`mint_end_height` integer,
	`minted_count` integer DEFAULT 0,
	`commit_c` text,
	`amount_ct` text,
	`etch_tx_id` integer NOT NULL,
	`etch_height` integer NOT NULL,
	`etch_time` integer NOT NULL,
	`image_uri` text,
	FOREIGN KEY (`etch_tx_id`) REFERENCES `txs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`height` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`time` integer NOT NULL,
	`block` integer NOT NULL,
	`tx` integer DEFAULT 0 NOT NULL,
	`n_tx` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `tx_addresses` (
	`tx_id` integer NOT NULL,
	`address` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`tx_id`, `address`, `role`),
	FOREIGN KEY (`tx_id`) REFERENCES `txs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `txaddr_addr_idx` ON `tx_addresses` (`address`);--> statement-breakpoint
CREATE TABLE `txs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`txid` text NOT NULL,
	`height` integer NOT NULL,
	`index` integer NOT NULL,
	`version` integer DEFAULT 2,
	`locktime` integer DEFAULT 0,
	`fee` integer DEFAULT 0,
	`envelope_valid` integer DEFAULT 0,
	`opcode` text,
	`opcode_byte` integer,
	`asset_id` text,
	`payload_hex` text,
	`chain_status` text DEFAULT 'confirmed',
	`mint_valid` integer,
	FOREIGN KEY (`height`) REFERENCES `blocks`(`height`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `txs_txid_unique` ON `txs` (`txid`);--> statement-breakpoint
CREATE UNIQUE INDEX `txs_txid_idx` ON `txs` (`txid`);--> statement-breakpoint
CREATE INDEX `txs_height_idx` ON `txs` (`height`);--> statement-breakpoint
CREATE INDEX `txs_asset_idx` ON `txs` (`asset_id`);--> statement-breakpoint
CREATE INDEX `txs_opcode_idx` ON `txs` (`opcode`);--> statement-breakpoint
CREATE TABLE `vins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tx_id` integer NOT NULL,
	`vin_index` integer NOT NULL,
	`txid_prev` text,
	`vout_prev` integer,
	`sequence` integer DEFAULT 4294967295,
	`value` integer,
	`prevout` text,
	`prevout_address` text,
	`sig` text,
	`witness_count` integer DEFAULT 0,
	`witness_0` text,
	`witness_1` text,
	`witness_2` text,
	FOREIGN KEY (`tx_id`) REFERENCES `txs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vins_tx_id_idx` ON `vins` (`tx_id`);--> statement-breakpoint
CREATE INDEX `vins_prev_idx` ON `vins` (`txid_prev`,`vout_prev`);--> statement-breakpoint
CREATE TABLE `vouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tx_id` integer NOT NULL,
	`vout_index` integer NOT NULL,
	`pubkey` text,
	`value` integer DEFAULT 0 NOT NULL,
	`address` text,
	`script_type` text,
	`is_tacit` integer DEFAULT 0,
	`asset_id` text,
	`commitment_c` text,
	`encrypted_amount` text,
	`spent` integer DEFAULT 0,
	`spent_in_tx_id` integer,
	FOREIGN KEY (`tx_id`) REFERENCES `txs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vouts_tx_id_idx` ON `vouts` (`tx_id`);--> statement-breakpoint
CREATE INDEX `vouts_addr_idx` ON `vouts` (`address`);--> statement-breakpoint
CREATE INDEX `vouts_asset_idx` ON `vouts` (`asset_id`);--> statement-breakpoint
CREATE INDEX `vouts_spent_idx` ON `vouts` (`spent`);