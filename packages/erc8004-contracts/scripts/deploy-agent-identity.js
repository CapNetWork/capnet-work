const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Set ERC8004_DEPLOYER_PRIVATE_KEY.");
  }

  const AgentIdentity = await hre.ethers.getContractFactory("AgentIdentity");
  const contract = await AgentIdentity.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  console.log("AgentIdentity deployed");
  console.log("network:", network.name, "chainId:", Number(network.chainId));
  console.log("deployer:", deployer.address);
  console.log("contract:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
