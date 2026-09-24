// dev_topup.js — send testnet HYPE from a well-known anvil dev account to a
// target address (paper-shadow housekeeping; TESTNET ONLY). Dev accounts are
// derived from the public "test test ... junk" mnemonic that
// hypervault/hardhat.config.js already uses for tests ("funded signers").
// Usage: node scripts/dev_topup.js <toAddress> <amountHype> [fromIndex=1]
const { HDNodeWallet, Mnemonic, JsonRpcProvider } = require("ethers");
const RPC = "https://rpc.hyperliquid-testnet.xyz/evm";
(async () => {
  const to = process.argv[2];
  const amount = process.argv[3] || "0.05";
  const idx = parseInt(process.argv[4] || "1", 10);
  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
    console.error("usage: node scripts/dev_topup.js <to> <amountHype> [fromIndex]");
    process.exit(1);
  }
  const mnemonic = Mnemonic.fromPhrase("test test test test test test test test test test test junk");
  const w = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${idx}`);
  const p = new JsonRpcProvider(RPC);
  const bal = await p.getBalance(w.address);
  console.log(`dev acct #${idx} ${w.address} balance ${bal} wei`);
  const v = BigInt(Math.round(parseFloat(amount) * 1e18));
  if (bal < v + 2n * 10n ** 15n) {
    console.error("insufficient dev balance (need amount + 0.002 HYPE fee headroom)");
    process.exit(1);
  }
  const tx = await w.connect(p).sendTransaction({ to, value: v });
  console.log("tx", tx.hash);
  await tx.wait();
  console.log("to balance now", await p.getBalance(to));
})().catch(e => { console.error(String(e).slice(0, 300)); process.exit(1); });
