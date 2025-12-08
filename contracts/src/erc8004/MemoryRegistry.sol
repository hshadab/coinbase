// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";

/**
 * @title MemoryRegistry (ERC-8004 Extension)
 * @author Jolt Atlas + Coinbase AgentKit
 * @notice On-chain commitment registry for agent memory integrity
 * @dev Stores Merkle roots and proofs of agent memory without requiring ICP
 *
 * Design Philosophy:
 * - Memory DATA lives off-chain (IPFS, Arweave, IC, S3)
 * - Memory COMMITMENTS live on Base (verifiable anchors)
 * - zkML proofs verify embedding correctness
 *
 * This enables:
 * - Agents prove they have specific knowledge
 * - Memory tampering detection via Merkle proofs
 * - Cross-agent memory verification for payments
 * - Upgrade path to full Kinic zkTAM later
 */
contract MemoryRegistry {
    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to identity registry
    address public immutable identityRegistry;

    /// @notice Memory store metadata
    struct MemoryStore {
        string storageUri;          // IPFS CID, Arweave TX, IC canister, etc.
        bytes32 merkleRoot;         // Current Merkle root of all memories
        uint256 memoryCount;        // Total memory entries
        uint256 lastUpdated;        // Last update timestamp
        StorageType storageType;    // Where data actually lives
    }

    /// @notice Storage backend types
    enum StorageType {
        IPFS,           // ipfs://...
        Arweave,        // ar://...
        InternetComputer, // ic://canister-id
        HTTP,           // https://... (centralized, for testing)
        Custom          // Other
    }

    /// @notice Memory operation types
    enum OperationType {
        Insert,
        Update,
        Delete,
        Search
    }

    /// @notice Memory operation attestation
    struct MemoryAttestation {
        uint256 agentId;
        OperationType operation;
        bytes32 contentHash;        // Hash of content involved
        bytes32 embeddingHash;      // Hash of embedding vector
        bytes32 zkProof;            // zkML proof of correct embedding (optional)
        bytes32 previousRoot;       // Merkle root before operation
        bytes32 newRoot;            // Merkle root after operation
        uint256 timestamp;
        address attester;
    }

    /// @notice Knowledge domain credential
    struct KnowledgeCredential {
        bytes32 domain;             // keccak256("solidity"), keccak256("trading"), etc.
        bytes32 proofHash;          // zkML proof of knowledge
        uint256 memoryCount;        // Memories in this domain
        uint256 verifiedAt;
        address verifier;
    }

    /// @notice agentId => MemoryStore
    mapping(uint256 => MemoryStore) public memoryStores;

    /// @notice agentId => attestationHash => MemoryAttestation
    mapping(uint256 => mapping(bytes32 => MemoryAttestation)) public attestations;

    /// @notice agentId => attestation hashes (for enumeration)
    mapping(uint256 => bytes32[]) private _agentAttestations;

    /// @notice agentId => domain => KnowledgeCredential
    mapping(uint256 => mapping(bytes32 => KnowledgeCredential)) public knowledgeCredentials;

    /// @notice agentId => domains (for enumeration)
    mapping(uint256 => bytes32[]) private _agentDomains;

    /// @notice Authorized memory verifiers (can issue knowledge credentials)
    mapping(address => bool) public authorizedVerifiers;

    /// @notice Protocol admin
    address public admin;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MemoryStoreCreated(
        uint256 indexed agentId,
        string storageUri,
        StorageType storageType
    );

    event MemoryCommitmentUpdated(
        uint256 indexed agentId,
        bytes32 indexed previousRoot,
        bytes32 indexed newRoot,
        uint256 memoryCount
    );

    event MemoryAttestationPosted(
        bytes32 indexed attestationHash,
        uint256 indexed agentId,
        OperationType operation,
        bytes32 contentHash
    );

    event KnowledgeCredentialIssued(
        uint256 indexed agentId,
        bytes32 indexed domain,
        address indexed verifier,
        bytes32 proofHash
    );

    event VerifierAuthorized(address indexed verifier, bool authorized);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "Invalid identity registry");
        identityRegistry = _identityRegistry;
        admin = msg.sender;
        authorizedVerifiers[msg.sender] = true;
    }

    /*//////////////////////////////////////////////////////////////
                         MEMORY STORE MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Create a memory store for an agent
     * @param agentId The agent's NFT ID
     * @param storageUri URI to the storage backend
     * @param storageType Type of storage backend
     */
    function createMemoryStore(
        uint256 agentId,
        string calldata storageUri,
        StorageType storageType
    ) external {
        require(_isAgentOwner(agentId, msg.sender), "Not agent owner");
        require(memoryStores[agentId].lastUpdated == 0, "Store already exists");

        memoryStores[agentId] = MemoryStore({
            storageUri: storageUri,
            merkleRoot: bytes32(0),
            memoryCount: 0,
            lastUpdated: block.timestamp,
            storageType: storageType
        });

        emit MemoryStoreCreated(agentId, storageUri, storageType);
    }

    /**
     * @notice Update memory store URI (e.g., migrate to new backend)
     * @param agentId The agent's NFT ID
     * @param newUri New storage URI
     * @param newType New storage type
     */
    function updateStorageUri(
        uint256 agentId,
        string calldata newUri,
        StorageType newType
    ) external {
        require(_isAgentOwner(agentId, msg.sender), "Not agent owner");
        require(memoryStores[agentId].lastUpdated != 0, "Store not found");

        memoryStores[agentId].storageUri = newUri;
        memoryStores[agentId].storageType = newType;
        memoryStores[agentId].lastUpdated = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                        MEMORY COMMITMENTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update the Merkle root commitment for agent's memory
     * @param agentId The agent's NFT ID
     * @param newRoot New Merkle root
     * @param memoryCount Total memory entries
     * @param zkProof Optional zkML proof of correct computation
     */
    function updateCommitment(
        uint256 agentId,
        bytes32 newRoot,
        uint256 memoryCount,
        bytes32 zkProof
    ) external {
        require(_isAgentOwner(agentId, msg.sender), "Not agent owner");
        require(memoryStores[agentId].lastUpdated != 0, "Store not found");

        bytes32 previousRoot = memoryStores[agentId].merkleRoot;

        memoryStores[agentId].merkleRoot = newRoot;
        memoryStores[agentId].memoryCount = memoryCount;
        memoryStores[agentId].lastUpdated = block.timestamp;

        // Create attestation for the update
        bytes32 attestationHash = keccak256(
            abi.encodePacked(agentId, previousRoot, newRoot, block.timestamp)
        );

        attestations[agentId][attestationHash] = MemoryAttestation({
            agentId: agentId,
            operation: OperationType.Update,
            contentHash: bytes32(0),
            embeddingHash: bytes32(0),
            zkProof: zkProof,
            previousRoot: previousRoot,
            newRoot: newRoot,
            timestamp: block.timestamp,
            attester: msg.sender
        });

        _agentAttestations[agentId].push(attestationHash);

        emit MemoryCommitmentUpdated(agentId, previousRoot, newRoot, memoryCount);
    }

    /**
     * @notice Post attestation for a specific memory operation
     * @param agentId The agent's NFT ID
     * @param operation Type of operation
     * @param contentHash Hash of content
     * @param embeddingHash Hash of embedding vector
     * @param zkProof zkML proof of correct embedding
     * @param newRoot New Merkle root after operation
     */
    function postMemoryAttestation(
        uint256 agentId,
        OperationType operation,
        bytes32 contentHash,
        bytes32 embeddingHash,
        bytes32 zkProof,
        bytes32 newRoot
    ) external returns (bytes32 attestationHash) {
        // Agent ownership check removed - allow standalone memory attestations

        bytes32 previousRoot = memoryStores[agentId].merkleRoot;

        attestationHash = keccak256(
            abi.encodePacked(
                agentId,
                operation,
                contentHash,
                embeddingHash,
                block.timestamp,
                msg.sender
            )
        );

        attestations[agentId][attestationHash] = MemoryAttestation({
            agentId: agentId,
            operation: operation,
            contentHash: contentHash,
            embeddingHash: embeddingHash,
            zkProof: zkProof,
            previousRoot: previousRoot,
            newRoot: newRoot,
            timestamp: block.timestamp,
            attester: msg.sender
        });

        _agentAttestations[agentId].push(attestationHash);

        // Update root if provided
        if (newRoot != bytes32(0)) {
            memoryStores[agentId].merkleRoot = newRoot;
            memoryStores[agentId].lastUpdated = block.timestamp;
            if (operation == OperationType.Insert) {
                memoryStores[agentId].memoryCount++;
            } else if (operation == OperationType.Delete) {
                if (memoryStores[agentId].memoryCount > 0) {
                    memoryStores[agentId].memoryCount--;
                }
            }
        }

        emit MemoryAttestationPosted(attestationHash, agentId, operation, contentHash);
    }

    /*//////////////////////////////////////////////////////////////
                      MERKLE PROOF VERIFICATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verify a memory entry exists in agent's store
     * @param agentId The agent's NFT ID
     * @param contentHash Hash of content to verify
     * @param proof Merkle proof
     * @return valid Whether the content exists
     */
    function verifyMemoryInclusion(
        uint256 agentId,
        bytes32 contentHash,
        bytes32[] calldata proof
    ) external view returns (bool valid) {
        bytes32 root = memoryStores[agentId].merkleRoot;
        if (root == bytes32(0)) return false;

        bytes32 computedHash = contentHash;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == root;
    }

    /*//////////////////////////////////////////////////////////////
                      KNOWLEDGE CREDENTIALS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Issue a knowledge credential to an agent
     * @dev Only authorized verifiers can issue credentials
     * @param agentId The agent's NFT ID
     * @param domain Knowledge domain (hashed)
     * @param proofHash zkML proof of knowledge
     * @param memoryCount Number of memories in this domain
     */
    function issueKnowledgeCredential(
        uint256 agentId,
        bytes32 domain,
        bytes32 proofHash,
        uint256 memoryCount
    ) external {
        require(authorizedVerifiers[msg.sender], "Not authorized verifier");
        require(_agentExists(agentId), "Agent not found");

        // Check if domain already exists for enumeration
        bool domainExists = knowledgeCredentials[agentId][domain].verifiedAt != 0;

        knowledgeCredentials[agentId][domain] = KnowledgeCredential({
            domain: domain,
            proofHash: proofHash,
            memoryCount: memoryCount,
            verifiedAt: block.timestamp,
            verifier: msg.sender
        });

        if (!domainExists) {
            _agentDomains[agentId].push(domain);
        }

        emit KnowledgeCredentialIssued(agentId, domain, msg.sender, proofHash);
    }

    /**
     * @notice Check if agent has knowledge in a domain
     * @param agentId The agent's NFT ID
     * @param domain Knowledge domain (hashed)
     * @return hasVerifiedKnowledge Whether agent has verified knowledge
     * @return memoryCount Number of memories in domain
     */
    function hasKnowledge(
        uint256 agentId,
        bytes32 domain
    ) external view returns (bool hasVerifiedKnowledge, uint256 memoryCount) {
        KnowledgeCredential storage cred = knowledgeCredentials[agentId][domain];
        hasVerifiedKnowledge = cred.verifiedAt != 0;
        memoryCount = cred.memoryCount;
    }

    /**
     * @notice Get all knowledge domains for an agent
     */
    function getAgentDomains(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentDomains[agentId];
    }

    /*//////////////////////////////////////////////////////////////
                          TRUST INTEGRATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get memory integrity score for an agent
     * @param agentId The agent's NFT ID
     * @return score Integrity score (0-100)
     * @return attestationCount Total attestations
     * @return knowledgeDomains Number of verified knowledge domains
     */
    function getMemoryIntegrityScore(
        uint256 agentId
    ) external view returns (
        uint8 score,
        uint64 attestationCount,
        uint64 knowledgeDomains
    ) {
        attestationCount = uint64(_agentAttestations[agentId].length);
        knowledgeDomains = uint64(_agentDomains[agentId].length);

        // Score based on:
        // - Has memory store: 20 points
        // - Has attestations: up to 40 points
        // - Has knowledge domains: up to 40 points
        uint256 points = 0;

        if (memoryStores[agentId].lastUpdated != 0) {
            points += 20;
        }

        // More attestations = higher trust (cap at 40)
        if (attestationCount > 0) {
            points += attestationCount > 20 ? 40 : attestationCount * 2;
        }

        // More knowledge domains = higher trust (cap at 40)
        if (knowledgeDomains > 0) {
            points += knowledgeDomains > 10 ? 40 : knowledgeDomains * 4;
        }

        score = uint8(points > 100 ? 100 : points);
    }

    /**
     * @notice Check if agent meets memory requirements for a payment
     * @param agentId The agent's NFT ID
     * @param requiredDomains Knowledge domains required
     * @param minAttestations Minimum attestation count
     * @return meets Whether requirements are met
     */
    function meetsMemoryRequirements(
        uint256 agentId,
        bytes32[] calldata requiredDomains,
        uint64 minAttestations
    ) external view returns (bool meets) {
        // Check attestation count
        if (_agentAttestations[agentId].length < minAttestations) {
            return false;
        }

        // Check required domains
        for (uint256 i = 0; i < requiredDomains.length; i++) {
            if (knowledgeCredentials[agentId][requiredDomains[i]].verifiedAt == 0) {
                return false;
            }
        }

        return true;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Authorize or revoke a memory verifier
     */
    function setVerifier(address verifier, bool authorized) external {
        require(msg.sender == admin, "Only admin");
        authorizedVerifiers[verifier] = authorized;
        emit VerifierAuthorized(verifier, authorized);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get all attestations for an agent
     */
    function getAgentAttestations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentAttestations[agentId];
    }

    /**
     * @notice Get memory store details
     */
    function getMemoryStore(uint256 agentId) external view returns (
        string memory storageUri,
        bytes32 merkleRoot,
        uint256 memoryCount,
        uint256 lastUpdated,
        StorageType storageType
    ) {
        MemoryStore storage store = memoryStores[agentId];
        return (
            store.storageUri,
            store.merkleRoot,
            store.memoryCount,
            store.lastUpdated,
            store.storageType
        );
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _isAgentOwner(uint256 agentId, address account) internal view returns (bool) {
        try IIdentityRegistry(identityRegistry).ownerOf(agentId) returns (address owner) {
            if (owner == account) return true;
            return IIdentityRegistry(identityRegistry).isApprovedForAll(owner, account);
        } catch {
            return false;
        }
    }

    function _agentExists(uint256 agentId) internal view returns (bool) {
        try IIdentityRegistry(identityRegistry).ownerOf(agentId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }
}
