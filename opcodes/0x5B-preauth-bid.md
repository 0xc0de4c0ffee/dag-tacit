# 0x5B T_PREAUTH_BID

> Opcode wire format from the [SPEC-PREAUTH-BID-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-PREAUTH-BID-AMENDMENT.md) §5.7.11.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Buyer-offline preauthorized bid. Single-preauth bid with inline cleartext bid-context.**

### Wire layout

```
T_PREAUTH_BID(1)
|| asset_id(32)
|| asset_input_count(1)      N ≥ 1
|| bid_id(16)                matches off-chain bid record
|| recipient_pubkey(33)      compressed secp256k1
|| amount_LE(8)              recipient lot amount
|| blinding(32)              recipient lot blinding
|| price_sats_LE(8)          buyer-committed sats payment
|| kernel_sig(64)            BIP-340 over kernel_msg
|| N_outputs(1)              u8, 1 or 2
|| commitments(N*33)         Pedersen per output
|| encryptedAmounts(N*8)     keystream-encrypted
|| rp_len(2)
|| rangeproof(rp_len)
```

### Constraints
- Inline bid-context: 97 bytes cleartext
- Uses SIGHASH_SINGLE | ANYONECANPAY on buyer sats input
- N_outputs ∈ {1, 2}
- kernel_msg domain: "tacit-kernel-v1"
- OP_RETURN binding: vout[k] = OP_RETURN(32) || bid_context_hash

---
**Reference:** [SPEC-PREAUTH-BID-AMENDMENT.md §5.7.11](../tacit-spec/spec/amendments/SPEC-PREAUTH-BID-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
