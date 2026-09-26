
const fs=require("fs");const {ethers}=require("ethers");
for(const f of process.argv.slice(2)){
  try{
    const j=JSON.parse(fs.readFileSync(f,"utf8"));
    let pk=j.private_key||j.privateKey||j.key||j.PRIVATE_KEY;
    if(!pk){ console.log(f.split("/").pop(), "no-key", Object.keys(j).slice(0,6).join(",")); continue; }
    console.log(f.split("/").pop(), new ethers.Wallet(pk).address);
  }catch(e){ console.log(f.split("/").pop(), "ERR", e.message.slice(0,60)); }
}
