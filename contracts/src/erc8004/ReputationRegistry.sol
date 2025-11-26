// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title ReputationRegistry (ERC-8004 Compliant)
 * @author Jolt Atlas + Coinbase AgentKit
 * @notice Feedback and reputation tracking per ERC-8004 standard
 * @dev Enables clients to rate agents with pre-authorized feedback
 *
 * Key Features:
 * - Cryptographic pre-authorization for feedback
 * - Score-based feedback (0-100)
 * - Tag-based categorization
 * - Feedback revocation and response system
 * - On-chain aggregation (average scores)
 */
contract ReputationRegistry {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to the identity registry
    address private immutable identityRegistry;

    /// @notice Feedback data
    struct Feedback {
        uint8 score;        // 0-100
        bytes32 tag1;       // Primary category tag
        bytes32 tag2;       // Secondary tag
        bool isRevoked;     // Whether feedback was revoked
    }

    /// @notice Authorization data for feedback
    struct FeedbackAuth {
        uint256 agentId;
        address clientAddress;
        uint64 indexLimit;
        uint256 expiry;
        uint256 chainId;
        address identityRegistry;
        address signerAddress;
    }

    /// @notice agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;

    /// @notice agentId => clientAddress => lastFeedbackIndex
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;

    /// @notice Response tracking: agentId => client => index => responder => count
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => uint64)))) private _responseCount;

    /// @notice Responders list: agentId => client => index => responders[]
    mapping(uint256 => mapping(address => mapping(uint64 => address[]))) private _responders;

    /// @notice Responder existence check
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => bool)))) private _responderExists;

    /// @notice All clients who gave feedback: agentId => clients[]
    mapping(uint256 => address[]) private _clients;

    /// @notice Client existence check: agentId => client => exists
    mapping(uint256 => mapping(address => bool)) private _clientExists;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint8 score,
        bytes32 indexed tag1,
        bytes32 tag2,
        string feedbackUri,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseUri,
        bytes32 responseHash
    );

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "Invalid identity registry");
        identityRegistry = _identityRegistry;
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW GETTERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get the identity registry address
     */
    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }

    /*//////////////////////////////////////////////////////////////
                          FEEDBACK SUBMISSION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Submit feedback for an agent
     * @param agentId The agent's ID
     * @param score Score 0-100
     * @param tag1 Primary category tag
     * @param tag2 Secondary tag
     * @param feedbackUri Off-chain feedback details URI
     * @param feedbackHash Hash of feedback content
     * @param feedbackAuth Encoded authorization with signature
     */
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata feedbackUri,
        bytes32 feedbackHash,
        bytes calldata feedbackAuth
    ) external {
        require(score <= 100, "Score must be <= 100");
        require(_agentExists(agentId), "Agent does not exist");

        // Verify caller is not the agent owner (no self-feedback)
        IIdentityRegistry registry = IIdentityRegistry(identityRegistry);
        address agentOwner = registry.ownerOf(agentId);

        require(
            msg.sender != agentOwner &&
            !registry.isApprovedForAll(agentOwner, msg.sender) &&
            registry.getApproved(agentId) != msg.sender,
            "Self-feedback not allowed"
        );

        // Verify authorization
        _verifyFeedbackAuth(agentId, msg.sender, feedbackAuth);

        // Store feedback
        uint64 currentIndex = _lastIndex[agentId][msg.sender] + 1;
        _feedback[agentId][msg.sender][currentIndex] = Feedback({
            score: score,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        _lastIndex[agentId][msg.sender] = currentIndex;

        // Track client
        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }

        emit NewFeedback(agentId, msg.sender, score, tag1, tag2, feedbackUri, feedbackHash);
    }

    /**
     * @notice Submit feedback without authorization (for open feedback systems)
     * @dev Only use in controlled environments where spam is managed off-chain
     */
    function giveOpenFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata feedbackUri,
        bytes32 feedbackHash
    ) external {
        require(score <= 100, "Score must be <= 100");
        require(_agentExists(agentId), "Agent does not exist");

        uint64 currentIndex = _lastIndex[agentId][msg.sender] + 1;
        _feedback[agentId][msg.sender][currentIndex] = Feedback({
            score: score,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        _lastIndex[agentId][msg.sender] = currentIndex;

        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }

        emit NewFeedback(agentId, msg.sender, score, tag1, tag2, feedbackUri, feedbackHash);
    }

    /*//////////////////////////////////////////////////////////////
                        FEEDBACK MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Revoke previously submitted feedback
     * @param agentId The agent's ID
     * @param feedbackIndex Index of feedback to revoke
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0, "Index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][msg.sender], "Index out of bounds");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");

        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /**
     * @notice Append a response to feedback
     * @param agentId The agent's ID
     * @param clientAddress Original feedback submitter
     * @param feedbackIndex Index of feedback
     * @param responseUri Off-chain response URI
     * @param responseHash Hash of response content
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0, "Index must be > 0");
        require(feedbackIndex <= _lastIndex[agentId][clientAddress], "Index out of bounds");
        require(bytes(responseUri).length > 0, "Empty URI");

        if (!_responderExists[agentId][clientAddress][feedbackIndex][msg.sender]) {
            _responders[agentId][clientAddress][feedbackIndex].push(msg.sender);
            _responderExists[agentId][clientAddress][feedbackIndex][msg.sender] = true;
        }

        _responseCount[agentId][clientAddress][feedbackIndex][msg.sender]++;

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseUri, responseHash);
    }

    /*//////////////////////////////////////////////////////////////
                           READ FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get the last feedback index for a client
     */
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    /**
     * @notice Read a specific feedback entry
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 index
    ) external view returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked) {
        require(index > 0, "Index must be > 0");
        require(index <= _lastIndex[agentId][clientAddress], "Index out of bounds");
        Feedback storage f = _feedback[agentId][clientAddress][index];
        return (f.score, f.tag1, f.tag2, f.isRevoked);
    }

    /**
     * @notice Get aggregated reputation summary
     * @param agentId The agent's ID
     * @param clientAddresses Filter by specific clients (empty for all)
     * @param tag1 Filter by tag1 (bytes32(0) for no filter)
     * @param tag2 Filter by tag2 (bytes32(0) for no filter)
     * @return count Number of matching feedback entries
     * @return averageScore Average score (0-100)
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view returns (uint64 count, uint8 averageScore) {
        uint256 totalScore = 0;
        count = 0;

        // Use provided clientAddresses if any, otherwise use all clients
        uint256 numClients = clientAddresses.length > 0 ? clientAddresses.length : _clients[agentId].length;

        for (uint256 i = 0; i < numClients; i++) {
            address client = clientAddresses.length > 0 ? clientAddresses[i] : _clients[agentId][i];
            uint64 lastIdx = _lastIndex[agentId][client];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                if (fb.isRevoked) continue;
                if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
                if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;

                totalScore += fb.score;
                count++;
            }
        }

        averageScore = count > 0 ? uint8(totalScore / count) : 0;
    }

    /**
     * @notice Get all clients who submitted feedback
     */
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    /**
     * @notice Get response count for feedback
     */
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        if (clientAddress == address(0)) {
            address[] memory clients = _clients[agentId];
            for (uint256 i = 0; i < clients.length; i++) {
                uint64 lastIdx = _lastIndex[agentId][clients[i]];
                for (uint64 j = 1; j <= lastIdx; j++) {
                    count += _countResponses(agentId, clients[i], j, responders);
                }
            }
        } else if (feedbackIndex == 0) {
            uint64 lastIdx = _lastIndex[agentId][clientAddress];
            for (uint64 j = 1; j <= lastIdx; j++) {
                count += _countResponses(agentId, clientAddress, j, responders);
            }
        } else {
            count = _countResponses(agentId, clientAddress, feedbackIndex, responders);
        }
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _verifyFeedbackAuth(
        uint256 agentId,
        address clientAddress,
        bytes calldata feedbackAuth
    ) internal view {
        require(IIdentityRegistry(identityRegistry).ownerOf(agentId) != address(0), "Unregistered agent");
        require(feedbackAuth.length >= 289, "Invalid auth length");

        FeedbackAuth memory auth;
        (
            auth.agentId,
            auth.clientAddress,
            auth.indexLimit,
            auth.expiry,
            auth.chainId,
            auth.identityRegistry,
            auth.signerAddress
        ) = abi.decode(feedbackAuth[:224], (uint256, address, uint64, uint256, uint256, address, address));

        require(auth.agentId == agentId, "AgentId mismatch");
        require(auth.clientAddress == clientAddress, "Client mismatch");
        require(block.timestamp < auth.expiry, "Auth expired");
        require(auth.chainId == block.chainid, "ChainId mismatch");
        require(auth.identityRegistry == identityRegistry, "Registry mismatch");
        require(auth.indexLimit >= _lastIndex[agentId][clientAddress] + 1, "IndexLimit exceeded");

        _verifySignature(auth, feedbackAuth[224:]);
    }

    function _verifySignature(FeedbackAuth memory auth, bytes calldata signature) internal view {
        bytes32 messageHash = keccak256(
            abi.encode(
                auth.agentId,
                auth.clientAddress,
                auth.indexLimit,
                auth.expiry,
                auth.chainId,
                auth.identityRegistry,
                auth.signerAddress
            )
        ).toEthSignedMessageHash();

        address recoveredSigner = messageHash.recover(signature);
        if (recoveredSigner != auth.signerAddress) {
            if (auth.signerAddress.code.length == 0) {
                revert("Invalid signature");
            }
            require(
                IERC1271(auth.signerAddress).isValidSignature(messageHash, signature) ==
                    IERC1271.isValidSignature.selector,
                "Bad 1271 signature"
            );
        }

        IIdentityRegistry registry = IIdentityRegistry(identityRegistry);
        address owner = registry.ownerOf(auth.agentId);
        require(
            auth.signerAddress == owner ||
                registry.isApprovedForAll(owner, auth.signerAddress) ||
                registry.getApproved(auth.agentId) == auth.signerAddress,
            "Signer not authorized"
        );
    }

    function _countResponses(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) internal view returns (uint64 count) {
        if (responders.length == 0) {
            address[] memory allResponders = _responders[agentId][clientAddress][feedbackIndex];
            for (uint256 k = 0; k < allResponders.length; k++) {
                count += _responseCount[agentId][clientAddress][feedbackIndex][allResponders[k]];
            }
        } else {
            for (uint256 k = 0; k < responders.length; k++) {
                count += _responseCount[agentId][clientAddress][feedbackIndex][responders[k]];
            }
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

