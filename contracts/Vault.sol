// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProYieldVault
 * @notice ERC4626 vault with hard cap and per-user cap enforcement.
 * The vault accepts deposits of an underlying ERC20 token and issues shares.
 * It enforces a global hard cap on total assets and a per-user cap on deposits.
 * The owner can adjust caps and withdraw protocol fees.
 */
contract ProYieldVault is ERC4626, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public hardCap; // maximum total assets the vault can hold
    uint256 public perUserCap; // maximum assets a single address can deposit

    mapping(address => uint256) public userDeposits; // track user deposits

    event HardCapUpdated(uint256 oldCap, uint256 newCap);
    event PerUserCapUpdated(uint256 oldCap, uint256 newCap);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol,
        uint256 _hardCap,
        uint256 _perUserCap
    ) ERC4626(_asset) {
        hardCap = _hardCap;
        perUserCap = _perUserCap;
    }

    /**
     * @dev Override deposit to enforce caps.
     */
    function deposit(uint256 assets, address receiver) public virtual override nonReentrant returns (uint256 shares) {
        require(assets > 0, "ERC4626: zero assets");
        require(totalAssets() + assets <= hardCap, "ProYieldVault: hard cap exceeded");
        require(userDeposits[msg.sender] + assets <= perUserCap, "ProYieldVault: per-user cap exceeded");

        shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);
        userDeposits[msg.sender] += assets;
    }

    /**
     * @dev Override mint to enforce caps.
     */
    function mint(uint256 shares, address receiver) public virtual override nonReentrant returns (uint256 assets) {
        assets = previewMint(shares);
        require(assets > 0, "ERC4626: zero assets");
        require(totalAssets() + assets <= hardCap, "ProYieldVault: hard cap exceeded");
        require(userDeposits[msg.sender] + assets <= perUserCap, "ProYieldVault: per-user cap exceeded");

        _mint(msg.sender, receiver, shares, assets);
        userDeposits[msg.sender] += assets;
    }

    /**
     * @dev Override withdraw to update user deposit tracking.
     */
    function withdraw(uint256 assets, address receiver, address owner) public virtual override nonReentrant returns (uint256 shares) {
        shares = previewWithdraw(assets);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        userDeposits[owner] -= assets;
    }

    /**
     * @dev Override redeem to update user deposit tracking.
     */
    function redeem(uint256 shares, address receiver, address owner) public virtual override nonReentrant returns (uint256 assets) {
        assets = previewRedeem(shares);
        _redeem(msg.sender, receiver, owner, shares, assets);
        userDeposits[owner] -= assets;
    }

    /**
     * @dev Set a new hard cap. Only callable by owner.
     */
    function setHardCap(uint256 _newCap) external onlyOwner {
        require(_newCap >= totalAssets(), "ProYieldVault: new cap below total assets");
        emit HardCapUpdated(hardCap, _newCap);
        hardCap = _newCap;
    }

    /**
     * @dev Set a new per-user cap. Only callable by owner.
     */
    function setPerUserCap(uint256 _newCap) external onlyOwner {
        emit PerUserCapUpdated(perUserCap, _newCap);
        perUserCap = _newCap;
    }

    /**
     * @dev Withdraw protocol fees (if any) to the owner.
     * This is a placeholder; actual fee logic would be implemented elsewhere.
     */
    function withdrawFees(uint256 amount) external onlyOwner {
        require(amount <= asset.balanceOf(address(this)), "ProYieldVault: insufficient balance");
        asset.safeTransfer(owner(), amount);
    }
}
