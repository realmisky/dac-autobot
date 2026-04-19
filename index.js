const { ethers } = require("ethers");
const fs = require("fs");
const { HttpsProxyAgent } = require("https-proxy-agent");
const fetch = require("node-fetch");

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Fill these in from https://dacblockchain.gitbook.io/docs
const CONFIG = {
  RPC_URL: "https://rpctest.dachain.tech",
  CHAIN_ID: 21894,
  SYMBOL: "DACC",
  FAUCET_URL: "https://faucet.dachain.tech",

  // Bot behavior
  DELAY_BETWEEN_TX_MS: 3000,       // ms between each tx
  DELAY_BETWEEN_WALLETS_MS: 2000,  // ms between wallets
  LOOP_DELAY_MS: 60000,            // ms between full loops (1 min)
  LOOPS: 0,                        // 0 = infinite loop
  TX_PER_WALLET: 5,                // transactions per wallet per loop
  SEND_AMOUNT_ETH: "0.001",        // amount to send per tx
  RANDOMIZE_AMOUNT: true,          // slight random variation on amount
  SELF_SEND: false,                // true = send to self; false = send to next wallet
};
// ───────────────────────────────────────────────────────────────────────────

// ─── COLORS ────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function log(level, msg) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const prefix = {
    info:    `${c.cyan}[INFO]${c.reset}`,
    success: `${c.green}[OK]${c.reset}  `,
    warn:    `${c.yellow}[WARN]${c.reset}`,
    error:   `${c.red}[ERR]${c.reset} `,
    tx:      `${c.magenta}[TX]${c.reset}  `,
    wallet:  `${c.blue}[WLT]${c.reset} `,
    loop:    `${c.bright}${c.cyan}[LOOP]${c.reset}`,
  }[level] || `[LOG]`;
  console.log(`${c.gray}${ts}${c.reset} ${prefix} ${msg}`);
}
// ───────────────────────────────────────────────────────────────────────────

// ─── HELPERS ───────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomAmount(base) {
  const variation = (Math.random() * 0.0005 - 0.00025).toFixed(8);
  const amount = (parseFloat(base) + parseFloat(variation)).toFixed(6);
  return ethers.parseEther(Math.max(0.0001, parseFloat(amount)).toString());
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function loadLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function buildProvider(proxyUrl) {
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    const fetchWithProxy = (url, opts = {}) =>
      fetch(url, { ...opts, agent });
    return new ethers.JsonRpcProvider(
      CONFIG.RPC_URL,
      { chainId: CONFIG.CHAIN_ID, name: "dac-testnet" },      { fetchFunc: fetchWithProxy }
    );
  }
  return new ethers.JsonRpcProvider(CONFIG.RPC_URL, {
    chainId: CONFIG.CHAIN_ID,
    name: "DAC Testnet",
  });
}
// ───────────────────────────────────────────────────────────────────────────

// ─── BANNER ────────────────────────────────────────────────────────────────
function banner() {
  console.log(`
${c.cyan}${c.bright}
  ██████╗  █████╗  ██████╗    ██████╗  ██████╗ ████████╗
  ██╔══██╗██╔══██╗██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
  ██║  ██║███████║██║         ██████╔╝██║   ██║   ██║   
  ██║  ██║██╔══██║██║         ██╔══██╗██║   ██║   ██║   
  ██████╔╝██║  ██║╚██████╗    ██████╔╝╚██████╔╝   ██║   
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝    ╚═════╝  ╚═════╝    ╚═╝   
${c.reset}${c.gray}  DAC Quantum Chain Testnet Auto-Bot  |  by Danu${c.reset}
  `);
}
// ───────────────────────────────────────────────────────────────────────────

// ─── FAUCET (optional) ─────────────────────────────────────────────────────
async function claimFaucet(address, proxyUrl) {
  try {
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
    // Attempt POST to faucet — adjust body format per actual faucet API
    const res = await fetch(CONFIG.FAUCET_URL + "/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      agent,
    });
    if (res.ok) {
      log("success", `Faucet claimed for ${shortAddr(address)}`);
      return true;
    } else {
      const txt = await res.text().catch(() => "");
      log("warn", `Faucet skip ${shortAddr(address)}: ${res.status} ${txt.slice(0, 60)}`);
      return false;
    }
  } catch (e) {
    log("warn", `Faucet error for ${shortAddr(address)}: ${e.message}`);
    return false;
  }
}
// ───────────────────────────────────────────────────────────────────────────

// ─── CORE TX LOGIC ─────────────────────────────────────────────────────────
async function sendTx(wallet, toAddress, txIndex) {
  try {
    const amount = CONFIG.RANDOMIZE_AMOUNT
      ? randomAmount(CONFIG.SEND_AMOUNT_ETH)
      : ethers.parseEther(CONFIG.SEND_AMOUNT_ETH);

    const feeData = await wallet.provider.getFeeData();
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amount,
      gasLimit: 21000n,
      maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || feeData.gasPrice,
    });

    log(
      "tx",
      `#${txIndex} ${shortAddr(wallet.address)} → ${shortAddr(toAddress)} | ${ethers.formatEther(amount)} ${CONFIG.SYMBOL} | hash: ${c.cyan}${tx.hash.slice(0, 18)}...${c.reset}`
    );

    const receipt = await tx.wait(1);
    if (receipt && receipt.status === 1) {
      log("success", `Confirmed in block ${receipt.blockNumber}`);
      return true;
    } else {
      log("warn", `TX reverted: ${tx.hash}`);
      return false;
    }
  } catch (e) {
    const msg = e?.shortMessage || e?.message || String(e);
    log("error", `TX failed: ${msg.slice(0, 120)}`);
    return false;
  }
}

async function processWallet(pk, index, wallets, proxy) {
  const provider = buildProvider(proxy || null);

  let wallet;
  try {
    wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
  } catch (e) {
    log("error", `Invalid private key at index ${index}: ${e.message}`);
    return;
  }

  log("wallet", `[${index + 1}] ${wallet.address}`);

  // Check balance
  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
    log("info", `Balance: ${ethers.formatEther(balance)} ${CONFIG.SYMBOL}`);
  } catch (e) {
    log("error", `Could not fetch balance: ${e.message}`);
    return;
  }

  // Try faucet if balance is low
  if (balance < ethers.parseEther("0.01")) {
    log("info", `Low balance, attempting faucet claim...`);
    await claimFaucet(wallet.address, proxy);
    await sleep(3000);
    balance = await provider.getBalance(wallet.address).catch(() => 0n);
  }

  if (balance < ethers.parseEther("0.0001")) {
    log("warn", `Insufficient balance to send. Skipping.`);
    return;
  }

  // Determine recipient
  const toAddress = CONFIG.SELF_SEND
    ? wallet.address
    : wallets[(index + 1) % wallets.length]; // send to next wallet

  // Execute transactions
  let txOk = 0;
  for (let i = 0; i < CONFIG.TX_PER_WALLET; i++) {
    const ok = await sendTx(wallet, toAddress, i + 1);
    if (ok) txOk++;
    await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
  }

  log("info", `Done: ${txOk}/${CONFIG.TX_PER_WALLET} txs succeeded for ${shortAddr(wallet.address)}`);
}
// ───────────────────────────────────────────────────────────────────────────

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  banner();

  const privateKeys = loadLines("pk.txt");
  const proxies = loadLines("proxy.txt");

  if (privateKeys.length === 0) {
    log("error", "No private keys found in pk.txt");
    process.exit(1);
  }

  // Derive wallet addresses for round-robin sending
  const walletAddresses = privateKeys.map((pk) => {
    try {
      const w = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
      return w.address;
    } catch {
      return null;
    }
  }).filter(Boolean);

  log("info", `Loaded ${c.bright}${privateKeys.length}${c.reset} wallets, ${proxies.length} proxies`);
  log("info", `Chain: ${c.cyan}DAC Testnet (Chain ID: 21894)${c.reset} | RPC: ${CONFIG.RPC_URL}`);
  log("info", `Mode: ${CONFIG.SELF_SEND ? "Self-send" : "Round-robin"} | ${CONFIG.TX_PER_WALLET} tx/wallet/loop`);
  log("info", `Loop delay: ${CONFIG.LOOP_DELAY_MS / 1000}s | ${CONFIG.LOOPS === 0 ? "∞ loops" : CONFIG.LOOPS + " loops"}`);
  console.log();

  // Network connectivity check
  try {
    const provider = buildProvider(null);
    const blockNum = await provider.getBlockNumber();
    log("success", `Connected! Current block: ${c.green}${blockNum}${c.reset}`);
  } catch (e) {
    log("error", `Cannot connect to RPC: ${e.message}`);
    log("warn", `Check CONFIG.RPC_URL and CONFIG.CHAIN_ID in index.js`);
    process.exit(1);
  }

  console.log();

  let loop = 0;
  while (CONFIG.LOOPS === 0 || loop < CONFIG.LOOPS) {
    loop++;
    log("loop", `─── Loop #${loop} started ─── ${new Date().toLocaleString("id-ID")}`);
    console.log();

    for (let i = 0; i < privateKeys.length; i++) {
      const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
      if (proxy) log("info", `Using proxy: ${proxy}`);

      await processWallet(privateKeys[i], i, walletAddresses, proxy);
      console.log();

      if (i < privateKeys.length - 1) {
        await sleep(CONFIG.DELAY_BETWEEN_WALLETS_MS);
      }
    }

    log("loop", `─── Loop #${loop} complete ───`);

    if (CONFIG.LOOPS === 0 || loop < CONFIG.LOOPS) {
      log("info", `Waiting ${CONFIG.LOOP_DELAY_MS / 1000}s before next loop...`);
      console.log();
      await sleep(CONFIG.LOOP_DELAY_MS);
    }
  }

  log("success", "All loops complete. Bot done.");
}

main().catch((e) => {
  log("error", `Fatal: ${e.message}`);
  process.exit(1);
});
