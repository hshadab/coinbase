// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GuardrailAttestationRegistry.sol";
import "../src/erc8004/IdentityRegistry.sol";
import "../src/erc8004/ReputationRegistry.sol";
import "../src/erc8004/ValidationRegistry.sol";
import "../src/erc8004/MemoryRegistry.sol";
import "../src/erc8004/AgentEscrow.sol";

/**
 * @title Deploy
 * @notice Deploy all Jolt Atlas contracts to Base Sepolia
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
 */
contract Deploy is Script {
    // Deployed contract addresses (populated after deployment)
    address public guardrailRegistry;
    address public identityRegistry;
    address public reputationRegistry;
    address public validationRegistry;
    address public memoryRegistry;
    address public agentEscrow;

    function run() external {
        // Load deployer private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying Jolt Atlas contracts...");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy GuardrailAttestationRegistry (legacy, for backwards compatibility)
        GuardrailAttestationRegistry _guardrailRegistry = new GuardrailAttestationRegistry();
        guardrailRegistry = address(_guardrailRegistry);
        console.log("GuardrailAttestationRegistry:", guardrailRegistry);

        // 2. Deploy ERC-8004 IdentityRegistry
        IdentityRegistry _identityRegistry = new IdentityRegistry();
        identityRegistry = address(_identityRegistry);
        console.log("IdentityRegistry:", identityRegistry);

        // 3. Deploy ERC-8004 ReputationRegistry
        ReputationRegistry _reputationRegistry = new ReputationRegistry(identityRegistry);
        reputationRegistry = address(_reputationRegistry);
        console.log("ReputationRegistry:", reputationRegistry);

        // 4. Deploy ERC-8004 ValidationRegistry (with zkML extensions)
        ValidationRegistry _validationRegistry = new ValidationRegistry(identityRegistry);
        validationRegistry = address(_validationRegistry);
        console.log("ValidationRegistry:", validationRegistry);

        // 5. Deploy MemoryRegistry (Kinic integration)
        MemoryRegistry _memoryRegistry = new MemoryRegistry(identityRegistry);
        memoryRegistry = address(_memoryRegistry);
        console.log("MemoryRegistry:", memoryRegistry);

        // 6. Deploy AgentEscrow (zkML-gated payments)
        AgentEscrow _agentEscrow = new AgentEscrow(identityRegistry, validationRegistry);
        agentEscrow = address(_agentEscrow);
        console.log("AgentEscrow:", agentEscrow);

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n========================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("========================================");
        console.log("Network: Base Sepolia (Chain ID:", block.chainid, ")");
        console.log("----------------------------------------");
        console.log("GuardrailAttestationRegistry:", guardrailRegistry);
        console.log("IdentityRegistry:            ", identityRegistry);
        console.log("ReputationRegistry:          ", reputationRegistry);
        console.log("ValidationRegistry:          ", validationRegistry);
        console.log("MemoryRegistry:              ", memoryRegistry);
        console.log("AgentEscrow:                 ", agentEscrow);
        console.log("----------------------------------------");
        console.log("\nUpdate your .env with these addresses:");
        console.log("IDENTITY_REGISTRY=", identityRegistry);
        console.log("REPUTATION_REGISTRY=", reputationRegistry);
        console.log("VALIDATION_REGISTRY=", validationRegistry);
        console.log("MEMORY_REGISTRY=", memoryRegistry);
        console.log("AGENT_ESCROW=", agentEscrow);
    }
}

/**
 * @title DeployIdentityOnly
 * @notice Deploy only the IdentityRegistry (for quick testing)
 */
contract DeployIdentityOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying IdentityRegistry only...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        IdentityRegistry identityRegistry = new IdentityRegistry();
        console.log("IdentityRegistry:", address(identityRegistry));

        vm.stopBroadcast();
    }
}

/**
 * @title DeployERC8004
 * @notice Deploy all ERC-8004 registries (Identity, Reputation, Validation)
 */
contract DeployERC8004 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying ERC-8004 registries...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy in order (dependencies first)
        IdentityRegistry identityRegistry = new IdentityRegistry();
        console.log("IdentityRegistry:", address(identityRegistry));

        ReputationRegistry reputationRegistry = new ReputationRegistry(address(identityRegistry));
        console.log("ReputationRegistry:", address(reputationRegistry));

        ValidationRegistry validationRegistry = new ValidationRegistry(address(identityRegistry));
        console.log("ValidationRegistry:", address(validationRegistry));

        vm.stopBroadcast();
    }
}
