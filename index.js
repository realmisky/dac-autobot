const { ethers } = require("ethers");
const fs = require("fs");
const { HttpsProxyAgent } = require("https-proxy-agent");
const fetch = require("node-fetch");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  RPC_URL: "https://rpctest.dachain.tech",
  CHAIN_ID: 21894,
  SYMBOL: "DACC",
  FAUCET_URL: "https://faucet.dachain.tech",

  DELAY_BETWEEN_TX_MS: 3000,
  DELAY_BETWEEN_WALLETS_MS: 2000,
  LOOP_DELAY_MS: 60000,
  LOOPS: 0,
  TX_PER_WALLET: 5,
  SEND_AMOUNT_ETH: "0.001",
  RANDOMIZE_AMOUNT: true,
  FAUCET_INTERVAL_MS: 7 * 60 * 60 * 1000, // 7 hours
};

// ─── COLORS ────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bright: "\x1b[1m", cyan: "\x1b[36m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  blue: "\x1b[34m", magenta: "\x1b[35m", gray: "\x1b[90m",
};

function log(level, msg) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const prefix = {
    info:    `${c.cyan}[INFO]${c.reset} `,
    success: `${c.green}[OK]${c.reset}   `,
    warn:    `${c.yellow}[WARN]${c.reset} `,
    error:   `${c.red}[ERR]${c.reset}  `,
    tx:      `${c.magenta}[TX]${c.reset}   `,
    wallet:  `${c.blue}[WLT]${c.reset}  `,
    loop:    `${c.bright}${c.cyan}[LOOP]${c.reset}`,
    faucet:  `${c.yellow}[FCT]${c.reset}  `,
  }[level] || `[LOG]  `;
  console.log(`${c.gray}${ts}${c.reset} ${prefix} ${msg}`);
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomAmount(base) {
  const v = (Math.random() * 0.0005 - 0.00025).toFixed(8);
  const a = (parseFloat(base) + parseFloat(v)).toFixed(6);
  return ethers.parseEther(Math.max(0.0001, parseFloat(a)).toString());
}

const shortAddr = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function loadLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8")
    .split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
}

function randomRecipient(addresses, excludeAddr) {
  const filtered = addresses.filter(
    (a) => a.toLowerCase() !== excludeAddr.toLowerCase()
  );
  const pool = filtered.length > 0 ? filtered : addresses;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatCountdown(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function isValidProxy(p) {
  try { new URL(p); return p.startsWith("http"); } catch { return false; }
}

function buildProvider(proxyUrl) {
  if (proxyUrl && isValidProxy(proxyUrl)) {
    const agent = new HttpsProxyAgent(proxyUrl);
    const fp = (url, opts = {}) => fetch(url, { ...opts, agent });
    return new ethers.JsonRpcProvider(
      CONFIG.RPC_URL,
      { chainId: CONFIG.CHAIN_ID, name: "DAC Testnet" },
      { fetchFunc: fp }
    );
  }
  return new ethers.JsonRpcProvider(CONFIG.RPC_URL, {
    chainId: CONFIG.CHAIN_ID, name: "DAC Testnet",
  });
}

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
${c.reset}${c.gray}  DAC Testnet Auto-Bot  |  by Danu  |  Chain ID: 21894${c.reset}
  `);
}

// ─── FAUCET ────────────────────────────────────────────────────────────────
const lastFaucetClaim = {};

async function claimFaucet(address, proxyUrl, force = false) {
  const now = Date.now();
  const last = lastFaucetClaim[address] || 0;
  const elapsed = now - last;

  if (!force && elapsed < CONFIG.FAUCET_INTERVAL_MS) {
    const remaining = CONFIG.FAUCET_INTERVAL_MS - elapsed;
    log("faucet", `${shortAddr(address)} cooldown: ${formatCountdown(remaining)} left`);
    return false;
  }

  try {
    const agent = (proxyUrl && isValidProxy(proxyUrl)) ? new HttpsProxyAgent(proxyUrl) : undefined;
    // ⚠️ Update endpoint & body setelah inspect di browser DevTools
    const res = await fetch(CONFIG.FAUCET_URL + "/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      ...(agent ? { agent } : {}),
    });

    if (res.ok) {
      lastFaucetClaim[address] = now;
      log("success", `Faucet claimed → ${shortAddr(address)} ✓`);
      return true;
    } else {
      const txt = await res.text().catch(() => "");
      log("warn", `Faucet failed ${shortAddr(address)}: ${res.status} ${txt.slice(0, 80)}`);
      return false;
    }
  } catch (e) {
    log("warn", `Faucet error ${shortAddr(address)}: ${e.message}`);
    return false;
  }
}

async function claimFaucetAllWallets(privateKeys, proxies) {
  log("faucet", `─── Auto faucet: ${privateKeys.length} wallets ───`);
  for (let i = 0; i < privateKeys.length; i++) {
    try {
      const pk = privateKeys[i].startsWith("0x") ? privateKeys[i] : `0x${privateKeys[i]}`;
      const wallet = new ethers.Wallet(pk);
      const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
      await claimFaucet(wallet.address, proxy, true);
      await sleep(1500);
    } catch (e) {
      log("error", `Faucet wallet[${i}]: ${e.message}`);
    }
  }
  log("faucet", `Next auto-claim in ${formatCountdown(CONFIG.FAUCET_INTERVAL_MS)}`);
}

// ─── TX LOGIC ──────────────────────────────────────────────────────────────
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

    log("tx", `#${txIndex} ${shortAddr(wallet.address)} → ${shortAddr(toAddress)} | ${ethers.formatEther(amount)} ${CONFIG.SYMBOL} | ${c.cyan}${tx.hash.slice(0, 20)}...${c.reset}`);

    const receipt = await tx.wait(1);
    if (receipt && receipt.status === 1) {
      log("success", `Confirmed block #${receipt.blockNumber}`);
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

async function processWallet(pk, index, targetAddresses, proxy) {
  const provider = buildProvider(proxy || null);
  let wallet;
  try {
    wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
  } catch (e) {
    log("error", `Invalid PK at index ${index}: ${e.message}`);
    return;
  }

  log("wallet", `[${index + 1}] ${wallet.address}`);

  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
    log("info", `Balance: ${ethers.formatEther(balance)} ${CONFIG.SYMBOL}`);
  } catch (e) {
    log("error", `Balance check failed: ${e.message}`);
    return;
  }

  // Low balance → try faucet (respects 7h cooldown)
  if (balance < ethers.parseEther("0.01")) {
    log("info", `Low balance, checking faucet cooldown...`);
    await claimFaucet(wallet.address, proxy);
    await sleep(3000);
    balance = await provider.getBalance(wallet.address).catch(() => 0n);
  }

  if (balance < ethers.parseEther("0.0001")) {
    log("warn", `Still insufficient balance. Skipping.`);
    return;
  }

  // Send TX_PER_WALLET txs, each to a random address from address.txt
  let txOk = 0;
  for (let i = 0; i < CONFIG.TX_PER_WALLET; i++) {
    const toAddress = randomRecipient(targetAddresses, wallet.address);
    const ok = await sendTx(wallet, toAddress, i + 1);
    if (ok) txOk++;
    await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
  }

  log("info", `Done: ${txOk}/${CONFIG.TX_PER_WALLET} txs OK for ${shortAddr(wallet.address)}`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  banner();

  const privateKeys     = loadLines("pk.txt");
  const proxies         = loadLines("proxy.txt");
  const targetAddresses = loadLines("address.txt");

  if (privateKeys.length === 0) {
    log("error", "pk.txt is empty — add your private keys");
    process.exit(1);
  }
  if (targetAddresses.length === 0) {
    log("error", "address.txt is empty — add target addresses");
    process.exit(1);
  }

  log("info", `Wallets    : ${c.bright}${privateKeys.length}${c.reset}`);
  log("info", `Targets    : ${c.bright}${targetAddresses.length}${c.reset} addresses (random per tx)`);
  log("info", `Proxies    : ${proxies.length}`);
  log("info", `Chain      : ${c.cyan}DAC Testnet${c.reset} | ID: 21894`);
  log("info", `TX/wallet  : ${CONFIG.TX_PER_WALLET} | Amount: ~${CONFIG.SEND_AMOUNT_ETH} ${CONFIG.SYMBOL}`);
  log("info", `Loop delay : ${CONFIG.LOOP_DELAY_MS / 1000}s | Faucet: every 7h (3x/day)`);
  log("info", `Loops      : ${CONFIG.LOOPS === 0 ? "∞ infinite" : CONFIG.LOOPS}`);
  console.log();

  // Network check
  try {
    const provider = buildProvider(null);
    const blockNum = await provider.getBlockNumber();
    log("success", `Connected! Block: ${c.green}#${blockNum}${c.reset}`);
  } catch (e) {
    log("error", `RPC connection failed: ${e.message}`);
    process.exit(1);
  }
  console.log();

  // ── Faucet scheduler: claim immediately, then every 7h ──
  await claimFaucetAllWallets(privateKeys, proxies);
  console.log();

  setInterval(async () => {
    console.log();
    await claimFaucetAllWallets(privateKeys, proxies);
    console.log();
  }, CONFIG.FAUCET_INTERVAL_MS);

  // ── TX loop ──
  let loop = 0;
  while (CONFIG.LOOPS === 0 || loop < CONFIG.LOOPS) {
    loop++;
    log("loop", `─── Loop #${loop} | ${new Date().toLocaleString("id-ID")} ───`);
    console.log();

    for (let i = 0; i < privateKeys.length; i++) {
      const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
      if (proxy) log("info", `Proxy: ${proxy}`);
      await processWallet(privateKeys[i], i, targetAddresses, proxy);
      console.log();
      if (i < privateKeys.length - 1) await sleep(CONFIG.DELAY_BETWEEN_WALLETS_MS);
    }

    log("loop", `─── Loop #${loop} complete ───`);

    if (CONFIG.LOOPS === 0 || loop < CONFIG.LOOPS) {
      log("info", `Waiting ${CONFIG.LOOP_DELAY_MS / 1000}s...`);
      console.log();
      await sleep(CONFIG.LOOP_DELAY_MS);
    }
  }

  log("success", "All loops done.");
}

main().catch((e) => {
  log("error", `Fatal: ${e.message}`);
  process.exit(1);
});
