// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GuardrailAttestationRegistry.sol";

/**
 * @title AgentIdentityRegistry
 * @author Jolt Atlas
 * @notice On-chain identity and reputation system for autonomous AI agents
 * @dev Enables verifiable agent identity, reputation scoring, and trust networks
 *      for agentic commerce on Coinbase infrastructure
 *
 * Key Features:
 * - Agent DID (Decentralized Identifier) registration
 * - zkML-verified reputation scores
 * - Credential/attestation management
 * - Trust graph for agent-to-agent interactions
 */
contract AgentIdentityRegistry {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event AgentIdentityCreated(
        bytes32 indexed agentDid,
        address indexed wallet,
        address indexed owner,
        bytes32 modelCommitment,
        uint256 timestamp
    );

    event ReputationUpdated(
        bytes32 indexed agentDid,
        uint256 oldScore,
        uint256 newScore,
        bytes32 proofHash
    );

    event CredentialIssued(
        bytes32 indexed agentDid,
        bytes32 indexed credentialType,
        address indexed issuer,
        uint256 expiry
    );

    event CredentialRevoked(
        bytes32 indexed agentDid,
        bytes32 indexed credentialType,
        address indexed revoker
    );

    event TrustEstablished(
        bytes32 indexed fromAgent,
        bytes32 indexed toAgent,
        uint256 trustLevel
    );

    event AgentSuspended(bytes32 indexed agentDid, string reason);
    event AgentReinstated(bytes32 indexed agentDid);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error AgentAlreadyExists();
    error AgentNotFound();
    error NotAgentOwner();
    error InvalidCredential();
    error CredentialExpired();
    error AgentSuspendedError();
    error InsufficientReputation();
    error InvalidProof();
    error NotCredentialIssuer();

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Agent status
    enum AgentStatus {
        Active,
        Suspended,
        Deactivated
    }

    /// @notice Credential types for agents
    enum CredentialType {
        KYCAgent,           // Verified identity
        SpendingLimit,      // Authorized spending limits
        ComplianceVerified, // Compliance checked
        TrustedMerchant,    // Trusted for commerce
        DataProvider,       // Can provide verified data
        OracleOperator,     // Can operate as oracle
        GovernanceVoter     // Can participate in governance
    }

    /// @notice Core agent identity
    struct AgentIdentity {
        bytes32 did;                    // Decentralized identifier
        address wallet;                 // Primary wallet address
        address owner;                  // Human owner/controller
        bytes32 modelCommitment;        // Locked policy model hash
        uint256 reputationScore;        // 0-1000 (scaled)
        uint256 totalTransactions;      // Transaction count
        uint256 totalVolume;            // Total value transacted (in wei)
        uint256 createdAt;              // Registration timestamp
        uint256 lastActiveAt;           // Last activity timestamp
        AgentStatus status;             // Current status
        string metadataUri;             // Off-chain metadata (IPFS)
    }

    /// @notice Credential issued to an agent
    struct Credential {
        bytes32 credentialType;         // Type hash
        address issuer;                 // Who issued it
        uint256 issuedAt;               // When issued
        uint256 expiresAt;              // Expiration (0 = never)
        bytes32 proofHash;              // zkML proof of qualification
        bool revoked;                   // Revocation status
    }

    /// @notice Trust relationship between agents
    struct TrustRelation {
        uint256 trustLevel;             // 0-100
        uint256 establishedAt;          // When trust was established
        uint256 interactions;           // Number of interactions
        uint256 successfulInteractions; // Successful ones
    }

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Attestation registry reference
    GuardrailAttestationRegistry public immutable attestationRegistry;

    /// @notice Mapping from DID to agent identity
    mapping(bytes32 => AgentIdentity) public agents;

    /// @notice Mapping from wallet to DID
    mapping(address => bytes32) public walletToDid;

    /// @notice Mapping from DID to credentials
    mapping(bytes32 => mapping(bytes32 => Credential)) public credentials;

    /// @notice Trust graph: fromDid => toDid => TrustRelation
    mapping(bytes32 => mapping(bytes32 => TrustRelation)) public trustGraph;

    /// @notice Authorized credential issuers
    mapping(address => mapping(bytes32 => bool)) public authorizedIssuers;

    /// @notice Minimum reputation for various actions
    uint256 public constant MIN_REPUTATION_FOR_COMMERCE = 100;
    uint256 public constant MIN_REPUTATION_FOR_A2A = 200;
    uint256 public constant MIN_REPUTATION_FOR_DATA = 300;

    /// @notice Total registered agents
    uint256 public totalAgents;

    /// @notice Protocol admin
    address public admin;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _attestationRegistry) {
        attestationRegistry = GuardrailAttestationRegistry(_attestationRegistry);
        admin = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                          IDENTITY MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Create a new agent identity
     * @param wallet The agent's primary wallet address
     * @param modelCommitment Hash of the agent's policy model
     * @param metadataUri IPFS URI for additional metadata
     * @return did The created agent DID
     */
    function createAgentIdentity(
        address wallet,
        bytes32 modelCommitment,
        string calldata metadataUri
    ) external returns (bytes32 did) {
        if (walletToDid[wallet] != bytes32(0)) revert AgentAlreadyExists();

        // Generate DID: keccak256(chainId, wallet, block.number, msg.sender)
        did = keccak256(abi.encodePacked(
            "did:coinbase:agent:",
            block.chainid,
            wallet,
            block.number,
            msg.sender
        ));

        agents[did] = AgentIdentity({
            did: did,
            wallet: wallet,
            owner: msg.sender,
            modelCommitment: modelCommitment,
            reputationScore: 100, // Start with base reputation
            totalTransactions: 0,
            totalVolume: 0,
            createdAt: block.timestamp,
            lastActiveAt: block.timestamp,
            status: AgentStatus.Active,
            metadataUri: metadataUri
        });

        walletToDid[wallet] = did;
        totalAgents++;

        emit AgentIdentityCreated(did, wallet, msg.sender, modelCommitment, block.timestamp);
    }

    /**
     * @notice Update agent's reputation based on zkML proof
     * @param agentDid The agent's DID
     * @param newScore New reputation score
     * @param proofHash Hash of the zkML proof verifying the score
     * @param transactionCount Transactions to add
     * @param volume Volume to add (in wei)
     */
    function updateReputation(
        bytes32 agentDid,
        uint256 newScore,
        bytes32 proofHash,
        uint256 transactionCount,
        uint256 volume
    ) external {
        AgentIdentity storage agent = agents[agentDid];
        if (agent.createdAt == 0) revert AgentNotFound();
        if (agent.owner != msg.sender && msg.sender != admin) revert NotAgentOwner();

        uint256 oldScore = agent.reputationScore;

        // Score must be backed by attestation in the registry
        if (!attestationRegistry.attestationExists(proofHash)) revert InvalidProof();

        agent.reputationScore = newScore > 1000 ? 1000 : newScore;
        agent.totalTransactions += transactionCount;
        agent.totalVolume += volume;
        agent.lastActiveAt = block.timestamp;

        emit ReputationUpdated(agentDid, oldScore, agent.reputationScore, proofHash);
    }

    /**
     * @notice Update agent metadata
     * @param agentDid The agent's DID
     * @param newMetadataUri New IPFS URI
     */
    function updateMetadata(bytes32 agentDid, string calldata newMetadataUri) external {
        AgentIdentity storage agent = agents[agentDid];
        if (agent.createdAt == 0) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotAgentOwner();

        agent.metadataUri = newMetadataUri;
        agent.lastActiveAt = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                         CREDENTIAL MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Authorize an address to issue a credential type
     * @param issuer Address to authorize
     * @param credentialType Type of credential
     */
    function authorizeIssuer(address issuer, bytes32 credentialType) external {
        require(msg.sender == admin, "Only admin");
        authorizedIssuers[issuer][credentialType] = true;
    }

    /**
     * @notice Issue a credential to an agent
     * @param agentDid The agent's DID
     * @param credentialType Type of credential
     * @param expiresAt Expiration timestamp (0 = never)
     * @param proofHash zkML proof hash backing the credential
     */
    function issueCredential(
        bytes32 agentDid,
        bytes32 credentialType,
        uint256 expiresAt,
        bytes32 proofHash
    ) external {
        if (!authorizedIssuers[msg.sender][credentialType] && msg.sender != admin) {
            revert NotCredentialIssuer();
        }

        AgentIdentity storage agent = agents[agentDid];
        if (agent.createdAt == 0) revert AgentNotFound();

        credentials[agentDid][credentialType] = Credential({
            credentialType: credentialType,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            proofHash: proofHash,
            revoked: false
        });

        emit CredentialIssued(agentDid, credentialType, msg.sender, expiresAt);
    }

    /**
     * @notice Revoke a credential
     * @param agentDid The agent's DID
     * @param credentialType Type of credential to revoke
     */
    function revokeCredential(bytes32 agentDid, bytes32 credentialType) external {
        Credential storage cred = credentials[agentDid][credentialType];
        if (cred.issuer != msg.sender && msg.sender != admin) revert NotCredentialIssuer();

        cred.revoked = true;

        emit CredentialRevoked(agentDid, credentialType, msg.sender);
    }

    /**
     * @notice Check if an agent has a valid credential
     * @param agentDid The agent's DID
     * @param credentialType Type of credential
     * @return valid Whether the credential is valid
     */
    function hasValidCredential(bytes32 agentDid, bytes32 credentialType) public view returns (bool valid) {
        Credential storage cred = credentials[agentDid][credentialType];
        if (cred.issuedAt == 0) return false;
        if (cred.revoked) return false;
        if (cred.expiresAt != 0 && cred.expiresAt < block.timestamp) return false;
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                            TRUST MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Establish trust between two agents
     * @param fromDid Source agent DID (must be owned by caller)
     * @param toDid Target agent DID
     * @param trustLevel Trust level 0-100
     */
    function establishTrust(bytes32 fromDid, bytes32 toDid, uint256 trustLevel) external {
        AgentIdentity storage fromAgent = agents[fromDid];
        if (fromAgent.createdAt == 0) revert AgentNotFound();
        if (fromAgent.owner != msg.sender) revert NotAgentOwner();
        if (agents[toDid].createdAt == 0) revert AgentNotFound();

        require(trustLevel <= 100, "Trust level max 100");

        TrustRelation storage relation = trustGraph[fromDid][toDid];
        relation.trustLevel = trustLevel;
        if (relation.establishedAt == 0) {
            relation.establishedAt = block.timestamp;
        }

        emit TrustEstablished(fromDid, toDid, trustLevel);
    }

    /**
     * @notice Record an interaction between agents
     * @param fromDid Source agent
     * @param toDid Target agent
     * @param successful Whether interaction was successful
     */
    function recordInteraction(bytes32 fromDid, bytes32 toDid, bool successful) external {
        // Can only be called by agent owner or admin
        AgentIdentity storage fromAgent = agents[fromDid];
        if (fromAgent.owner != msg.sender && msg.sender != admin) revert NotAgentOwner();

        TrustRelation storage relation = trustGraph[fromDid][toDid];
        relation.interactions++;
        if (successful) {
            relation.successfulInteractions++;
        }
    }

    /**
     * @notice Get trust level between two agents
     * @param fromDid Source agent
     * @param toDid Target agent
     * @return level Trust level
     * @return successRate Success rate of interactions
     */
    function getTrust(bytes32 fromDid, bytes32 toDid) external view returns (uint256 level, uint256 successRate) {
        TrustRelation storage relation = trustGraph[fromDid][toDid];
        level = relation.trustLevel;
        if (relation.interactions > 0) {
            successRate = (relation.successfulInteractions * 100) / relation.interactions;
        }
    }

    /*//////////////////////////////////////////////////////////////
                          SUSPENSION / MODERATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Suspend an agent
     * @param agentDid The agent's DID
     * @param reason Reason for suspension
     */
    function suspendAgent(bytes32 agentDid, string calldata reason) external {
        require(msg.sender == admin, "Only admin");
        AgentIdentity storage agent = agents[agentDid];
        if (agent.createdAt == 0) revert AgentNotFound();

        agent.status = AgentStatus.Suspended;
        emit AgentSuspended(agentDid, reason);
    }

    /**
     * @notice Reinstate a suspended agent
     * @param agentDid The agent's DID
     */
    function reinstateAgent(bytes32 agentDid) external {
        require(msg.sender == admin, "Only admin");
        AgentIdentity storage agent = agents[agentDid];
        if (agent.createdAt == 0) revert AgentNotFound();

        agent.status = AgentStatus.Active;
        emit AgentReinstated(agentDid);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get full agent identity
     * @param agentDid The agent's DID
     * @return identity The agent identity
     */
    function getAgent(bytes32 agentDid) external view returns (AgentIdentity memory) {
        return agents[agentDid];
    }

    /**
     * @notice Get agent by wallet address
     * @param wallet The wallet address
     * @return identity The agent identity
     */
    function getAgentByWallet(address wallet) external view returns (AgentIdentity memory) {
        bytes32 did = walletToDid[wallet];
        return agents[did];
    }

    /**
     * @notice Check if agent can perform commerce
     * @param agentDid The agent's DID
     * @return canTransact Whether agent can transact
     */
    function canPerformCommerce(bytes32 agentDid) external view returns (bool) {
        AgentIdentity storage agent = agents[agentDid];
        if (agent.status != AgentStatus.Active) return false;
        if (agent.reputationScore < MIN_REPUTATION_FOR_COMMERCE) return false;
        return true;
    }

    /**
     * @notice Check if agent can do A2A transactions
     * @param agentDid The agent's DID
     * @return canTransact Whether agent can do A2A
     */
    function canPerformA2A(bytes32 agentDid) external view returns (bool) {
        AgentIdentity storage agent = agents[agentDid];
        if (agent.status != AgentStatus.Active) return false;
        if (agent.reputationScore < MIN_REPUTATION_FOR_A2A) return false;
        return true;
    }

    /**
     * @notice Verify agent meets requirements for a payment
     * @param agentDid Agent's DID
     * @param minReputation Minimum reputation required
     * @param requiredCredential Required credential (bytes32(0) for none)
     * @return meets Whether agent meets requirements
     */
    function verifyAgentForPayment(
        bytes32 agentDid,
        uint256 minReputation,
        bytes32 requiredCredential
    ) external view returns (bool meets) {
        AgentIdentity storage agent = agents[agentDid];

        if (agent.status != AgentStatus.Active) return false;
        if (agent.reputationScore < minReputation) return false;
        if (requiredCredential != bytes32(0)) {
            if (!hasValidCredential(agentDid, requiredCredential)) return false;
        }

        return true;
    }
}
