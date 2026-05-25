# 0x43 T_SLOT_MINT

> Opcode wire format from the [SPEC-CBTC-ZK-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) §5.21.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Self-custody-slot wrapper atomic mint. Locks BTC at K_btc = recipient_commit − denom_sats·H.**

### Wire layout

```
T_SLOT_MINT(1)
|| network_tag(1)            u8, 0x00=mainnet, 0x01=signet, 0x02=regtest
|| asset_id(32)              wrapper asset's CETCH-derived asset_id
|| denom_sats_LE(8)          u64; MUST match metadata.custody.denom_sats
|| recipient_commit(33)      compressed secp256k1; leaf Pedersen commit
|| leaf_hash(32)             Poseidon₃(secret, ν, denom)
|| payment_asset_id(32)      tacit asset_id of LP payment (e.g., TAC)
|| payment_amount_LE(8)      u64; LP payment in payment_asset base units
|| minter_pubkey(33)         compressed; minter BIP-340 pubkey
|| minter_sig(64)            BIP-340 over slot_mint_msg
```

### Constraints
- Total payload: 244 bytes + standard envelope wrapping
- slot_mint_msg domain: "tacit-slot-mint-v1"
- BTC tx must produce P2TR at K_btc
- Must be registered as self_custody_slot wrapper

---
**Reference:** [SPEC-CBTC-ZK-AMENDMENT.md §5.21](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
