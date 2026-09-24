import { ethers } from "hardhat";
import { expect } from "chai";
import { ProYieldVault } from "../typechain-types";
import { ERC20Mock } from "../typechain-types";

describe("ProYieldVault", function () {
  let vault: ProYieldVault;
  let asset: ERC20Mock;
  let owner: any;
  let alice: any;
  let bob: any;

  const HARD_CAP = ethers.utils.parseUnits("500", 18);
  const PER_USER_CAP = ethers.utils.parseUnits("500", 18);

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const Asset = await ethers.getContractFactory("ERC20Mock");
    asset = (await Asset.deploy("Mock Token", "MTK", 18, ethers.utils.parseUnits("1000000", 18))) as ERC20Mock;
    await asset.deployed();

    const Vault = await ethers.getContractFactory("ProYieldVault");
    vault = (await Vault.deploy(
      asset.address,
      "ProYield Vault",
      "PYV",
      HARD_CAP,
      PER_USER_CAP
    )) as ProYieldVault;
    await vault.deployed();

    // Mint tokens to users
    await asset.connect(owner).transfer(alice.address, ethers.utils.parseUnits("1000", 18));
    await asset.connect(owner).transfer(bob.address, ethers.utils.parseUnits("1000", 18));
  });

  it("should allow deposit within caps", async () => {
    const depositAmount = ethers.utils.parseUnits("100", 18);
    await asset.connect(alice).approve(vault.address, depositAmount);
    await expect(vault.connect(alice).deposit(depositAmount, alice.address))
      .to.emit(vault, "Deposit")
      .withArgs(alice.address, alice.address, depositAmount, depositAmount);
  });

  it("should revert when deposit exceeds hard cap", async () => {
    const largeDeposit = HARD_CAP.add(ethers.utils.parseUnits("1", 18));
    await asset.connect(alice).approve(vault.address, largeDeposit);
    await expect(vault.connect(alice).deposit(largeDeposit, alice.address)).to.be.revertedWith("ProYieldVault: hard cap exceeded");
  });

  it("should revert when deposit exceeds per-user cap", async () => {
    const largeDeposit = PER_USER_CAP.add(ethers.utils.parseUnits("1", 18));
    await asset.connect(alice).approve(vault.address, largeDeposit);
    await expect(vault.connect(alice).deposit(largeDeposit, alice.address)).to.be.revertedWith("ProYieldVault: per-user cap exceeded");
  });

  it("should update user deposit tracking on withdraw", async () => {
    const depositAmount = ethers.utils.parseUnits("200", 18);
    await asset.connect(alice).approve(vault.address, depositAmount);
    await vault.connect(alice).deposit(depositAmount, alice.address);

    const withdrawAmount = ethers.utils.parseUnits("100", 18);
    await vault.connect(alice).withdraw(withdrawAmount, alice.address, alice.address);

    const remaining = await vault.userDeposits(alice.address);
    expect(remaining).to.equal(depositAmount.sub(withdrawAmount));
  });
});
