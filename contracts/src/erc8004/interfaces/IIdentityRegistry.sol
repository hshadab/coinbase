// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IIdentityRegistry
 * @notice Interface for the ERC-8004 IdentityRegistry
 */
interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function agentWallets(uint256 agentId) external view returns (address);
    function modelCommitments(uint256 agentId) external view returns (bytes32);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function getApproved(uint256 tokenId) external view returns (address);
}
