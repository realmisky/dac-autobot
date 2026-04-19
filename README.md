# DAC Quantum Chain Testnet Auto-Bot

Auto-send transactions on DAC Quantum Chain testnet — multi-wallet, proxy support, infinite loop.

---

## Requirements

- Node.js v18+
- npm

---

## Setup

```bash
git clone https://github.com/realmisky/dac-autobot.git
cd dac-autobot
npm install
```

---

## Configuration

Open `index.js` and update the `CONFIG` block at the top:

| Field | Description |
|---|---|
| `RPC_URL` | DAC testnet RPC endpoint (from gitbook docs) |
| `CHAIN_ID` | Chain ID of DAC Quantum Chain testnet |
| `TX_PER_WALLET` | How many txs per wallet per loop |
| `SEND_AMOUNT_ETH` | Amount to send per transaction |
| `RANDOMIZE_AMOUNT` | Slight random variation on amount (avoid pattern detection) |
| `SELF_SEND` | `true` = send to own address; `false` = round-robin to next wallet |
| `LOOP_DELAY_MS` | Wait time (ms) between full loops |
| `LOOPS` | `0` = infinite, or set a number |

Find the RPC and Chain ID from:
👉 https://dacblockchain.gitbook.io/docs

---

## Adding Wallets

Add private keys to `pk.txt`, one per line:

```
abcdef1234567890...  (64 hex chars, with or without 0x)
```

---

## Adding Proxies (optional)

Add proxies to `proxy.txt`, one per line:

```
http://user:pass@host:port
http://host:port
```

Proxies rotate per wallet index automatically.

---

## Run

```bash
npm start
# or
node index.js
```

---

## Workflow

```
For each loop:
  For each wallet in pk.txt:
    1. Check balance
    2. If balance low → attempt faucet claim
    3. Send TX_PER_WALLET transactions
    4. Log results
  Wait LOOP_DELAY_MS
  Repeat
```

---

## Faucet

Testnet faucet: https://faucet.dachain.tech/

The bot will auto-call the faucet API if your balance is below 0.01 DAC.
If the faucet API format is different, adjust `claimFaucet()` in `index.js`.

---

## Notes

- Never share your private keys
- Keep `pk.txt` and `proxy.txt` out of version control (`.gitignore` them)
- This is for testnet only — no real value involved
