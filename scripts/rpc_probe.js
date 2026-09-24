// rpc_probe.js — print which chain the hyperTestnet network actually reaches.
const hre = require("hardhat");
(async () => {
  const p = hre.ethers.provider;
  const net = await p.getNetwork();
  const blk = await p.getBlockNumber();
  const code = await p.getCode("0x42237e98aD8918401F898cb453ef714B64e5B3Bf");
  let url = "(n/a)";
  try { url = p._getConnection ? p._getConnection().url : url; } catch (e) {}
  console.log(JSON.stringify({ chainId: Number(net.chainId), url, block: blk, vaultCodeBytes: (code.length - 2) / 2 }));
})().catch(e => { console.error(e); process.exit(1); });
