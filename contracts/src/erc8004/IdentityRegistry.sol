// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry (ERC-8004 Compliant)
 * @author Trustless AgentKit
 * @notice ERC-721 based agent identity registry per ERC-8004 standard
 * @dev Part of Trustless AgentKit - extends ERC-8004 IdentityRegistry with zkML model commitment tracking
 *
 * Key Features:
 * - NFT-based agent identity (each agent = 1 NFT)
 * - Off-chain metadata via tokenURI (agent registration file)
 * - On-chain key-value metadata storage
 * - zkML model commitment tracking (extension)
 */
contract IdentityRegistry is ERC721URIStorage, Ownable {
    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Auto-incrementing agent ID
    uint256 private _lastId = 0;

    /// @notice agentId => key => value (ERC-8004 standard)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    /// @notice agentId => model commitment hash (zkML extension)
    mapping(uint256 => bytes32) public modelCommitments;

    /// @notice agentId => wallet address (for payment routing)
    mapping(uint256 => address) public agentWallets;

    /// @notice wallet => agentId (reverse lookup)
    mapping(address => uint256) public walletToAgentId;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Metadata entry for batch operations
    struct MetadataEntry {
        string key;
        bytes value;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-8004 standard events
    event Registered(uint256 indexed agentId, string tokenURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string indexed indexedKey, string key, bytes value);
    event UriUpdated(uint256 indexed agentId, string newUri, address indexed updatedBy);

    /// @notice zkML extension events
    event ModelCommitmentSet(uint256 indexed agentId, bytes32 modelCommitment);
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() ERC721("AgentIdentity", "AID") Ownable(msg.sender) {}

    /*//////////////////////////////////////////////////////////////
                         REGISTRATION (ERC-8004)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register a new agent (minimal)
     * @return agentId The new agent's ID
     */
    function register() external returns (uint256 agentId) {
        agentId = _lastId++;
        _safeMint(msg.sender, agentId);
        emit Registered(agentId, "", msg.sender);
    }

    /**
     * @notice Register a new agent with tokenURI
     * @param tokenUri URI pointing to agent registration file
     * @return agentId The new agent's ID
     */
    function register(string memory tokenUri) external returns (uint256 agentId) {
        agentId = _lastId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenUri);
        emit Registered(agentId, tokenUri, msg.sender);
    }

    /**
     * @notice Register a new agent with tokenURI and metadata
     * @param tokenUri URI pointing to agent registration file
     * @param metadata Array of key-value metadata entries
     * @return agentId The new agent's ID
     */
    function register(
        string memory tokenUri,
        MetadataEntry[] memory metadata
    ) external returns (uint256 agentId) {
        agentId = _lastId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenUri);
        emit Registered(agentId, tokenUri, msg.sender);

        for (uint256 i = 0; i < metadata.length; i++) {
            _metadata[agentId][metadata[i].key] = metadata[i].value;
            emit MetadataSet(agentId, metadata[i].key, metadata[i].key, metadata[i].value);
        }
    }

    /**
     * @notice Register with zkML model commitment (extension)
     * @param tokenUri URI pointing to agent registration file
     * @param modelCommitment Hash commitment to the agent's policy model
     * @param wallet Agent's wallet address for payments
     * @return agentId The new agent's ID
     */
    function registerWithModel(
        string memory tokenUri,
        bytes32 modelCommitment,
        address wallet
    ) external returns (uint256 agentId) {
        require(walletToAgentId[wallet] == 0 || !_exists(walletToAgentId[wallet]), "Wallet already registered");

        agentId = _lastId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenUri);

        modelCommitments[agentId] = modelCommitment;
        agentWallets[agentId] = wallet;
        walletToAgentId[wallet] = agentId;

        emit Registered(agentId, tokenUri, msg.sender);
        emit ModelCommitmentSet(agentId, modelCommitment);
        emit AgentWalletSet(agentId, wallet);
    }

    /*//////////////////////////////////////////////////////////////
                         METADATA (ERC-8004)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get metadata value for a key
     * @param agentId The agent's ID
     * @param key The metadata key
     * @return The metadata value
     */
    function getMetadata(uint256 agentId, string memory key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }

    /**
     * @notice Set metadata value for a key
     * @param agentId The agent's ID
     * @param key The metadata key
     * @param value The metadata value
     */
    function setMetadata(uint256 agentId, string memory key, bytes memory value) external {
        require(
            msg.sender == _ownerOf(agentId) ||
            isApprovedForAll(_ownerOf(agentId), msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    /**
     * @notice Update agent's tokenURI
     * @param agentId The agent's ID
     * @param newUri The new URI
     */
    function setAgentUri(uint256 agentId, string calldata newUri) external {
        address owner = ownerOf(agentId);
        require(
            msg.sender == owner ||
            isApprovedForAll(owner, msg.sender) ||
            msg.sender == getApproved(agentId),
            "Not authorized"
        );
        _setTokenURI(agentId, newUri);
        emit UriUpdated(agentId, newUri, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                      ZKML EXTENSIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update agent's model commitment
     * @param agentId The agent's ID
     * @param modelCommitment New model commitment hash
     */
    function setModelCommitment(uint256 agentId, bytes32 modelCommitment) external {
        require(
            msg.sender == _ownerOf(agentId) ||
            isApprovedForAll(_ownerOf(agentId), msg.sender),
            "Not authorized"
        );
        modelCommitments[agentId] = modelCommitment;
        emit ModelCommitmentSet(agentId, modelCommitment);
    }

    /**
     * @notice Update agent's wallet address
     * @param agentId The agent's ID
     * @param wallet New wallet address
     */
    function setAgentWallet(uint256 agentId, address wallet) external {
        require(
            msg.sender == _ownerOf(agentId) ||
            isApprovedForAll(_ownerOf(agentId), msg.sender),
            "Not authorized"
        );

        // Clear old mapping
        address oldWallet = agentWallets[agentId];
        if (oldWallet != address(0)) {
            delete walletToAgentId[oldWallet];
        }

        agentWallets[agentId] = wallet;
        walletToAgentId[wallet] = agentId;
        emit AgentWalletSet(agentId, wallet);
    }

    /**
     * @notice Get agent ID by wallet address
     * @param wallet The wallet address
     * @return agentId The agent's ID (0 if not found)
     */
    function getAgentByWallet(address wallet) external view returns (uint256) {
        return walletToAgentId[wallet];
    }

    /**
     * @notice Check if an agent exists
     * @param agentId The agent's ID
     * @return exists Whether the agent exists
     */
    function agentExists(uint256 agentId) external view returns (bool) {
        return _exists(agentId);
    }

    /**
     * @notice Get total registered agents
     * @return Total number of agents
     */
    function totalAgents() external view returns (uint256) {
        return _lastId;
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Check if a token exists
     * @param tokenId The token ID to check
     * @return Whether the token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
