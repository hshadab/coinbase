// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";

/**
 * @title ValidationRegistry (ERC-8004 Compliant + zkML Extensions)
 * @author Trustless AgentKit
 * @notice Validation request/response registry per ERC-8004 with zkML proof integration
 * @dev Part of Trustless AgentKit - extends ERC-8004 ValidationRegistry with zkML proof verification (Jolt Atlas)
 *
 * Key Features (ERC-8004):
 * - Validation request/response workflow
 * - Validator selection and scoring
 * - Tag-based categorization
 *
 * zkML Extensions:
 * - Model commitment verification
 * - Proof hash attestations
 * - zkML validator type support
 * - Trust score computation based on proofs
 */
contract ValidationRegistry {
    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to the identity registry
    address private immutable identityRegistry;

    /// @notice Validation status for a request
    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response;             // 0-100 score
        bytes32 responseHash;
        bytes32 tag;
        uint256 lastUpdate;
    }

    /// @notice zkML proof attestation (extension)
    struct ZkmlAttestation {
        bytes32 modelCommitment;
        bytes32 inputHash;
        bytes32 outputHash;
        bytes32 proofHash;
        uint8 decision;             // 0=reject, 1=approve, 2=review
        uint96 confidence;          // Scaled by 1e18
        uint256 timestamp;
        address attester;
    }

    /// @notice requestHash => ValidationStatus
    mapping(bytes32 => ValidationStatus) public validations;

    /// @notice agentId => requestHashes[]
    mapping(uint256 => bytes32[]) private _agentValidations;

    /// @notice validatorAddress => requestHashes[]
    mapping(address => bytes32[]) private _validatorRequests;

    /// @notice attestationHash => ZkmlAttestation (extension)
    mapping(bytes32 => ZkmlAttestation) public zkmlAttestations;

    /// @notice agentId => attestationHashes[] (extension)
    mapping(uint256 => bytes32[]) private _agentAttestations;

    /// @notice Registered zkML validators (extension)
    mapping(address => bool) public zkmlValidators;

    /// @notice Protocol admin
    address public admin;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-8004 standard events
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestUri,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseUri,
        bytes32 responseHash,
        bytes32 tag
    );

    /// @notice zkML extension events
    event ZkmlAttestationPosted(
        bytes32 indexed attestationHash,
        uint256 indexed agentId,
        bytes32 modelCommitment,
        uint8 decision,
        uint96 confidence
    );

    event ZkmlValidatorRegistered(address indexed validator, bool active);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "Invalid identity registry");
        identityRegistry = _identityRegistry;
        admin = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW GETTERS
    //////////////////////////////////////////////////////////////*/

    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }

    /*//////////////////////////////////////////////////////////////
                    VALIDATION REQUESTS (ERC-8004)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Request validation from a specific validator
     * @param validatorAddress Address of the validator
     * @param agentId The agent requesting validation
     * @param requestUri Off-chain request details
     * @param requestHash Unique hash for this request
     */
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestUri,
        bytes32 requestHash
    ) external {
        require(validatorAddress != address(0), "Invalid validator");
        require(validations[requestHash].validatorAddress == address(0), "Request exists");

        IIdentityRegistry registry = IIdentityRegistry(identityRegistry);
        address owner = registry.ownerOf(agentId);
        require(
            msg.sender == owner || registry.isApprovedForAll(owner, msg.sender),
            "Not authorized"
        );

        validations[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: bytes32(0),
            lastUpdate: block.timestamp
        });

        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestUri, requestHash);
    }

    /**
     * @notice Submit validation response
     * @param requestHash The request being responded to
     * @param response Score 0-100
     * @param responseUri Off-chain response details
     * @param responseHash Hash of response content
     * @param tag Categorization tag
     */
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseUri,
        bytes32 responseHash,
        bytes32 tag
    ) external {
        ValidationStatus storage s = validations[requestHash];
        require(s.validatorAddress != address(0), "Unknown request");
        require(msg.sender == s.validatorAddress, "Not the validator");
        require(response <= 100, "Response must be <= 100");

        s.response = response;
        s.responseHash = responseHash;
        s.tag = tag;
        s.lastUpdate = block.timestamp;

        emit ValidationResponse(
            s.validatorAddress,
            s.agentId,
            requestHash,
            response,
            responseUri,
            responseHash,
            tag
        );
    }

    /**
     * @notice Get validation status
     */
    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            bytes32 tag,
            uint256 lastUpdate
        )
    {
        ValidationStatus memory s = validations[requestHash];
        require(s.validatorAddress != address(0), "Unknown request");
        return (s.validatorAddress, s.agentId, s.response, s.responseHash, s.tag, s.lastUpdate);
    }

    /**
     * @notice Get aggregated validation summary
     */
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        bytes32 tag
    ) external view returns (uint64 count, uint8 avgResponse) {
        uint256 totalResponse = 0;
        count = 0;

        bytes32[] storage requestHashes = _agentValidations[agentId];

        for (uint256 i = 0; i < requestHashes.length; i++) {
            ValidationStatus storage s = validations[requestHashes[i]];

            bool matchValidator = (validatorAddresses.length == 0);
            if (!matchValidator) {
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (s.validatorAddress == validatorAddresses[j]) {
                        matchValidator = true;
                        break;
                    }
                }
            }

            bool matchTag = (tag == bytes32(0)) || (s.tag == tag);

            if (matchValidator && matchTag && s.response > 0) {
                totalResponse += s.response;
                count++;
            }
        }

        avgResponse = count > 0 ? uint8(totalResponse / count) : 0;
    }

    /**
     * @notice Get all validation requests for an agent
     */
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    /**
     * @notice Get all requests for a validator
     */
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    /*//////////////////////////////////////////////////////////////
                      ZKML EXTENSIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register a zkML validator
     * @param validator Address to register
     * @param active Whether validator is active
     */
    function registerZkmlValidator(address validator, bool active) external {
        require(msg.sender == admin, "Only admin");
        zkmlValidators[validator] = active;
        emit ZkmlValidatorRegistered(validator, active);
    }

    /**
     * @notice Post a zkML proof attestation
     * @param agentId The agent this attestation is for
     * @param modelCommitment Hash of the policy model
     * @param inputHash Hash of input features
     * @param outputHash Hash of output decision
     * @param proofHash Hash of the zkML proof
     * @param decision 0=reject, 1=approve, 2=review
     * @param confidence Confidence score (scaled by 1e18)
     * @return attestationHash The unique hash of this attestation
     */
    function postZkmlAttestation(
        uint256 agentId,
        bytes32 modelCommitment,
        bytes32 inputHash,
        bytes32 outputHash,
        bytes32 proofHash,
        uint8 decision,
        uint96 confidence
    ) external returns (bytes32 attestationHash) {
        require(decision <= 2, "Invalid decision");
        // Agent registration check removed - allow standalone zkML attestations

        // Generate unique attestation hash
        attestationHash = keccak256(
            abi.encodePacked(
                agentId,
                modelCommitment,
                inputHash,
                outputHash,
                proofHash,
                block.timestamp,
                msg.sender
            )
        );

        require(zkmlAttestations[attestationHash].timestamp == 0, "Attestation exists");

        zkmlAttestations[attestationHash] = ZkmlAttestation({
            modelCommitment: modelCommitment,
            inputHash: inputHash,
            outputHash: outputHash,
            proofHash: proofHash,
            decision: decision,
            confidence: confidence,
            timestamp: block.timestamp,
            attester: msg.sender
        });

        _agentAttestations[agentId].push(attestationHash);

        emit ZkmlAttestationPosted(attestationHash, agentId, modelCommitment, decision, confidence);
    }

    /**
     * @notice Verify a zkML attestation exists and matches expected values
     * @param attestationHash The attestation to verify
     * @param expectedModel Expected model commitment
     * @param expectedDecision Expected decision
     * @return valid Whether attestation is valid
     */
    function verifyZkmlAttestation(
        bytes32 attestationHash,
        bytes32 expectedModel,
        uint8 expectedDecision
    ) external view returns (bool valid) {
        ZkmlAttestation storage att = zkmlAttestations[attestationHash];
        if (att.timestamp == 0) return false;
        if (att.modelCommitment != expectedModel) return false;
        if (att.decision != expectedDecision) return false;
        return true;
    }

    /**
     * @notice Get zkML attestation details
     */
    function getZkmlAttestation(bytes32 attestationHash)
        external
        view
        returns (ZkmlAttestation memory)
    {
        return zkmlAttestations[attestationHash];
    }

    /**
     * @notice Get all zkML attestations for an agent
     */
    function getAgentAttestations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentAttestations[agentId];
    }

    /**
     * @notice Get aggregated zkML trust score for an agent
     * @param agentId The agent's ID
     * @param modelCommitment Filter by model (bytes32(0) for all)
     * @return attestationCount Number of attestations
     * @return approvalRate Percentage of approve decisions (0-100)
     * @return avgConfidence Average confidence (scaled by 1e18)
     */
    function getZkmlTrustScore(
        uint256 agentId,
        bytes32 modelCommitment
    ) external view returns (
        uint64 attestationCount,
        uint8 approvalRate,
        uint96 avgConfidence
    ) {
        bytes32[] storage hashes = _agentAttestations[agentId];
        uint256 approvals = 0;
        uint256 totalConfidence = 0;

        for (uint256 i = 0; i < hashes.length; i++) {
            ZkmlAttestation storage att = zkmlAttestations[hashes[i]];

            if (modelCommitment != bytes32(0) && att.modelCommitment != modelCommitment) {
                continue;
            }

            attestationCount++;
            if (att.decision == 1) {
                approvals++;
            }
            totalConfidence += att.confidence;
        }

        if (attestationCount > 0) {
            approvalRate = uint8((approvals * 100) / attestationCount);
            avgConfidence = uint96(totalConfidence / attestationCount);
        }
    }

    /**
     * @notice Check if an agent meets zkML trust requirements
     * @param agentId The agent's ID
     * @param minAttestations Minimum number of attestations
     * @param minApprovalRate Minimum approval rate (0-100)
     * @param requiredModel Required model commitment (bytes32(0) for any)
     * @return meets Whether agent meets requirements
     */
    function meetsZkmlTrustRequirements(
        uint256 agentId,
        uint64 minAttestations,
        uint8 minApprovalRate,
        bytes32 requiredModel
    ) external view returns (bool meets) {
        (uint64 count, uint8 rate, ) = this.getZkmlTrustScore(agentId, requiredModel);
        return count >= minAttestations && rate >= minApprovalRate;
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _agentExists(uint256 agentId) internal view returns (bool) {
        try IIdentityRegistry(identityRegistry).ownerOf(agentId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }
}

