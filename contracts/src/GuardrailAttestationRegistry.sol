// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GuardrailAttestationRegistry
 * @author Jolt Atlas
 * @notice Lightweight onchain registry for zkML guardrail attestations
 * @dev Phase 1: Stores attestation hashes + signatures without full ZK verification
 *      Full ZK proof verification will be added in Phase 2
 *
 * This contract allows agents to post attestations of their guardrail decisions
 * onchain, creating an immutable audit trail of policy compliance.
 */
contract GuardrailAttestationRegistry {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when an attestation is posted
    event AttestationPosted(
        bytes32 indexed attestationHash,
        address indexed agent,
        address indexed signer,
        bytes32 modelCommitment,
        uint8 decision,
        uint256 timestamp
    );

    /// @notice Emitted when an agent is registered
    event AgentRegistered(
        address indexed agent,
        address indexed owner,
        bytes32 modelCommitment
    );

    /// @notice Emitted when an agent's model is updated
    event AgentModelUpdated(
        address indexed agent,
        bytes32 oldModel,
        bytes32 newModel
    );

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidSignature();
    error AttestationAlreadyPosted();
    error AgentNotRegistered();
    error NotAgentOwner();
    error InvalidDecision();

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Decision types from guardrail
    enum Decision {
        Reject,  // 0
        Approve, // 1
        Review   // 2
    }

    /// @notice Stored attestation data
    struct Attestation {
        bytes32 modelCommitment;
        bytes32 inputHash;
        bytes32 outputHash;
        Decision decision;
        uint96 confidence; // Scaled by 1e18
        uint256 timestamp;
        address signer;
    }

    /// @notice Registered agent info
    struct AgentInfo {
        address owner;
        bytes32 modelCommitment;
        uint256 attestationCount;
        bool registered;
    }

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice EIP-712 domain separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice Typehash for attestation
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "GuardrailAttestation(bytes32 modelCommitment,bytes32 inputHash,bytes32 outputHash,string decision,uint256 confidence,uint256 timestamp,bytes32 nonce)"
    );

    /// @notice Mapping from attestation hash to attestation data
    mapping(bytes32 => Attestation) public attestations;

    /// @notice Mapping from agent address to agent info
    mapping(address => AgentInfo) public agents;

    /// @notice Total attestations posted
    uint256 public totalAttestations;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("JoltAtlasGuardrail"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /*//////////////////////////////////////////////////////////////
                            AGENT MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register an agent with its policy model
     * @param agent The agent address
     * @param modelCommitment Hash commitment to the policy model
     */
    function registerAgent(address agent, bytes32 modelCommitment) external {
        agents[agent] = AgentInfo({
            owner: msg.sender,
            modelCommitment: modelCommitment,
            attestationCount: 0,
            registered: true
        });

        emit AgentRegistered(agent, msg.sender, modelCommitment);
    }

    /**
     * @notice Update an agent's policy model
     * @param agent The agent address
     * @param newModelCommitment New model commitment
     */
    function updateAgentModel(address agent, bytes32 newModelCommitment) external {
        AgentInfo storage info = agents[agent];
        if (!info.registered) revert AgentNotRegistered();
        if (info.owner != msg.sender) revert NotAgentOwner();

        bytes32 oldModel = info.modelCommitment;
        info.modelCommitment = newModelCommitment;

        emit AgentModelUpdated(agent, oldModel, newModelCommitment);
    }

    /*//////////////////////////////////////////////////////////////
                          ATTESTATION POSTING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Post an attestation onchain
     * @param attestationHash The hash of the full attestation data
     * @param modelCommitment Hash of the policy model
     * @param inputHash Hash of the input features
     * @param outputHash Hash of the output decision
     * @param decision The decision (0=reject, 1=approve, 2=review)
     * @param confidence Confidence score (scaled by 1e18)
     * @param signature EIP-712 signature from the signer
     */
    function postAttestation(
        bytes32 attestationHash,
        bytes32 modelCommitment,
        bytes32 inputHash,
        bytes32 outputHash,
        uint8 decision,
        uint96 confidence,
        bytes calldata signature
    ) external {
        if (decision > 2) revert InvalidDecision();
        if (attestations[attestationHash].timestamp != 0) revert AttestationAlreadyPosted();

        // Recover signer from signature
        address signer = _recoverSigner(attestationHash, signature);
        if (signer == address(0)) revert InvalidSignature();

        // Store attestation
        attestations[attestationHash] = Attestation({
            modelCommitment: modelCommitment,
            inputHash: inputHash,
            outputHash: outputHash,
            decision: Decision(decision),
            confidence: confidence,
            timestamp: block.timestamp,
            signer: signer
        });

        // Update agent stats if registered
        if (agents[msg.sender].registered) {
            agents[msg.sender].attestationCount++;
        }

        totalAttestations++;

        emit AttestationPosted(
            attestationHash,
            msg.sender,
            signer,
            modelCommitment,
            decision,
            block.timestamp
        );
    }

    /**
     * @notice Post an attestation without signature (for self-attested)
     * @dev Used when the agent itself is posting and doesn't need external signature
     */
    function postSelfAttestation(
        bytes32 attestationHash,
        bytes32 modelCommitment,
        bytes32 inputHash,
        bytes32 outputHash,
        uint8 decision,
        uint96 confidence
    ) external {
        if (decision > 2) revert InvalidDecision();
        if (attestations[attestationHash].timestamp != 0) revert AttestationAlreadyPosted();

        attestations[attestationHash] = Attestation({
            modelCommitment: modelCommitment,
            inputHash: inputHash,
            outputHash: outputHash,
            decision: Decision(decision),
            confidence: confidence,
            timestamp: block.timestamp,
            signer: msg.sender
        });

        if (agents[msg.sender].registered) {
            agents[msg.sender].attestationCount++;
        }

        totalAttestations++;

        emit AttestationPosted(
            attestationHash,
            msg.sender,
            msg.sender,
            modelCommitment,
            decision,
            block.timestamp
        );
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Check if an attestation exists
     * @param attestationHash The attestation hash to check
     * @return exists Whether the attestation exists
     */
    function attestationExists(bytes32 attestationHash) external view returns (bool exists) {
        return attestations[attestationHash].timestamp != 0;
    }

    /**
     * @notice Get attestation data
     * @param attestationHash The attestation hash
     * @return attestation The attestation data
     */
    function getAttestation(bytes32 attestationHash) external view returns (Attestation memory) {
        return attestations[attestationHash];
    }

    /**
     * @notice Get agent info
     * @param agent The agent address
     * @return info The agent info
     */
    function getAgent(address agent) external view returns (AgentInfo memory) {
        return agents[agent];
    }

    /**
     * @notice Verify that an attestation matches expected values
     * @param attestationHash The attestation hash
     * @param expectedModel Expected model commitment
     * @param expectedDecision Expected decision
     * @return valid Whether attestation is valid and matches
     */
    function verifyAttestation(
        bytes32 attestationHash,
        bytes32 expectedModel,
        Decision expectedDecision
    ) external view returns (bool valid) {
        Attestation storage att = attestations[attestationHash];
        if (att.timestamp == 0) return false;
        if (att.modelCommitment != expectedModel) return false;
        if (att.decision != expectedDecision) return false;
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Recover signer from attestation hash and signature
     * @param attestationHash The hash that was signed
     * @param signature The signature bytes
     * @return signer The recovered signer address
     */
    function _recoverSigner(
        bytes32 attestationHash,
        bytes calldata signature
    ) internal pure returns (address signer) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);

        return ecrecover(attestationHash, v, r, s);
    }
}
