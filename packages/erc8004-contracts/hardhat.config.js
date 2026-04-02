require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.ERC8004_DEPLOYER_PRIVATE_KEY || "";
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    baseSepolia: {
      url: process.env.ERC8004_BASE_SEPOLIA_RPC_URL || "",
      chainId: 84532,
      accounts,
    },
    base: {
      url: process.env.ERC8004_BASE_RPC_URL || "",
      chainId: 8453,
      accounts,
    },
  },
};
