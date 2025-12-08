// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/erc8004/MemoryRegistry.sol";

contract DeployMemoryOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Use existing IdentityRegistry
        address identityRegistry = 0x2d92C1171349EE0D3C76ac0e652431ecc3DaEF38;
        
        vm.startBroadcast(deployerPrivateKey);
        
        MemoryRegistry memoryRegistry = new MemoryRegistry(identityRegistry);
        console.log("MemoryRegistry:", address(memoryRegistry));
        
        vm.stopBroadcast();
    }
}
