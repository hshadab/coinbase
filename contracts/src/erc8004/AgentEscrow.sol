// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentEscrow (ERC-8004 Extension)
 * @author Jolt Atlas + Coinbase AgentKit
 * @notice zkML-gated escrow for agent-to-agent payments
 *
 * Enables trustless payments between agents with programmable release conditions:
 * - Time-based release
 * - zkML attestation requirements
 * - Multi-party approval
 * - Dispute resolution
 */
contract AgentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Structs ============

    enum EscrowStatus {
        Created,       // Escrow created, awaiting deposit
        Funded,        // Funds deposited, awaiting conditions
        Released,      // Funds released to recipient
        Refunded,      // Funds returned to sender
        Disputed,      // Under dispute resolution
        Cancelled      // Cancelled before funding
    }

    enum ReleaseCondition {
        TimeOnly,          // Release after timeout
        ZkmlAttestation,   // Requires zkML proof attestation
        MultiParty,        // Requires multiple approvals
        ZkmlAndTime        // Both zkML and time condition
    }

    struct EscrowConfig {
        uint256 senderAgentId;      // NFT ID of sender agent
        uint256 recipientAgentId;   // NFT ID of recipient agent
        address token;              // ERC20 token (address(0) for ETH)
        uint256 amount;             // Amount to escrow
        ReleaseCondition condition; // Release condition type
        uint256 timeout;            // Timeout timestamp
        bytes32 zkmlModelCommitment;// Required model for zkML condition
        uint96 minConfidence;       // Minimum confidence for zkML
        string description;         // Human-readable description
    }

    struct Escrow {
        EscrowConfig config;
        EscrowStatus status;
        address sender;             // Actual sender address
        address recipient;          // Actual recipient address
        uint256 fundedAt;           // When funds were deposited
        uint256 resolvedAt;         // When escrow was resolved
        bytes32 releaseProof;       // zkML proof hash if required
        uint8 approvalCount;        // For multi-party
        mapping(address => bool) approvers; // Who has approved
    }

    // ============ State ============

    address public immutable identityRegistry;
    address public immutable validationRegistry;

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;

    // Agent ID => active escrow IDs (as sender or recipient)
    mapping(uint256 => uint256[]) public agentEscrows;

    // Required approvers for multi-party escrows
    mapping(uint256 => address[]) public requiredApprovers;

    // ============ Events ============

    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed senderAgentId,
        uint256 indexed recipientAgentId,
        address token,
        uint256 amount,
        ReleaseCondition condition
    );

    event EscrowFunded(
        uint256 indexed escrowId,
        address indexed funder,
        uint256 amount
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed recipient,
        uint256 amount,
        bytes32 proofHash
    );

    event EscrowRefunded(
        uint256 indexed escrowId,
        address indexed sender,
        uint256 amount
    );

    event EscrowDisputed(
        uint256 indexed escrowId,
        address indexed disputant,
        string reason
    );

    event EscrowApproved(
        uint256 indexed escrowId,
        address indexed approver,
        uint8 totalApprovals
    );

    // ============ Errors ============

    error NotAgent(address caller);
    error NotEscrowParty(address caller);
    error InvalidStatus(EscrowStatus current, EscrowStatus expected);
    error InvalidCondition();
    error TimeoutNotReached();
    error ZkmlNotVerified();
    error InsufficientApprovals();
    error AlreadyApproved();
    error InvalidAmount();
    error TransferFailed();

    // ============ Constructor ============

    constructor(address _identityRegistry, address _validationRegistry) {
        identityRegistry = _identityRegistry;
        validationRegistry = _validationRegistry;
    }

    // ============ Core Functions ============

    /**
     * @notice Create a new escrow between two agents
     * @param config Escrow configuration
     * @return escrowId The new escrow ID
     */
    function createEscrow(EscrowConfig calldata config) external returns (uint256 escrowId) {
        if (config.amount == 0) revert InvalidAmount();

        // Verify sender agent exists
        address senderWallet = _getAgentWallet(config.senderAgentId);
        if (senderWallet != msg.sender) revert NotAgent(msg.sender);

        // Verify recipient agent exists
        address recipientWallet = _getAgentWallet(config.recipientAgentId);
        if (recipientWallet == address(0)) revert NotAgent(recipientWallet);

        escrowId = nextEscrowId++;

        Escrow storage e = escrows[escrowId];
        e.config = config;
        e.status = EscrowStatus.Created;
        e.sender = msg.sender;
        e.recipient = recipientWallet;

        // Track escrow for both agents
        agentEscrows[config.senderAgentId].push(escrowId);
        agentEscrows[config.recipientAgentId].push(escrowId);

        emit EscrowCreated(
            escrowId,
            config.senderAgentId,
            config.recipientAgentId,
            config.token,
            config.amount,
            config.condition
        );
    }

    /**
     * @notice Fund an escrow with tokens
     * @param escrowId The escrow to fund
     */
    function fund(uint256 escrowId) external payable nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Created) {
            revert InvalidStatus(e.status, EscrowStatus.Created);
        }
        if (msg.sender != e.sender) revert NotEscrowParty(msg.sender);

        if (e.config.token == address(0)) {
            // ETH escrow
            if (msg.value != e.config.amount) revert InvalidAmount();
        } else {
            // ERC20 escrow
            IERC20(e.config.token).safeTransferFrom(
                msg.sender,
                address(this),
                e.config.amount
            );
        }

        e.status = EscrowStatus.Funded;
        e.fundedAt = block.timestamp;

        emit EscrowFunded(escrowId, msg.sender, e.config.amount);
    }

    /**
     * @notice Release escrow funds to recipient
     * @param escrowId The escrow to release
     * @param zkmlProofHash Optional zkML proof hash (if required)
     */
    function release(uint256 escrowId, bytes32 zkmlProofHash) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Funded) {
            revert InvalidStatus(e.status, EscrowStatus.Funded);
        }

        // Verify release conditions
        _verifyReleaseConditions(e, zkmlProofHash);

        e.status = EscrowStatus.Released;
        e.resolvedAt = block.timestamp;
        e.releaseProof = zkmlProofHash;

        // Transfer funds
        _transferFunds(e.config.token, e.recipient, e.config.amount);

        emit EscrowReleased(escrowId, e.recipient, e.config.amount, zkmlProofHash);
    }

    /**
     * @notice Refund escrow to sender (only after timeout)
     * @param escrowId The escrow to refund
     */
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Funded) {
            revert InvalidStatus(e.status, EscrowStatus.Funded);
        }
        if (msg.sender != e.sender) revert NotEscrowParty(msg.sender);

        // Must be past timeout for refund
        if (block.timestamp < e.config.timeout) revert TimeoutNotReached();

        e.status = EscrowStatus.Refunded;
        e.resolvedAt = block.timestamp;

        // Transfer funds back
        _transferFunds(e.config.token, e.sender, e.config.amount);

        emit EscrowRefunded(escrowId, e.sender, e.config.amount);
    }

    /**
     * @notice Approve multi-party escrow
     * @param escrowId The escrow to approve
     */
    function approve(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Funded) {
            revert InvalidStatus(e.status, EscrowStatus.Funded);
        }
        if (e.config.condition != ReleaseCondition.MultiParty) {
            revert InvalidCondition();
        }
        if (e.approvers[msg.sender]) revert AlreadyApproved();

        // Verify caller is a required approver
        bool isApprover = false;
        address[] storage approvers = requiredApprovers[escrowId];
        for (uint256 i = 0; i < approvers.length; i++) {
            if (approvers[i] == msg.sender) {
                isApprover = true;
                break;
            }
        }
        if (!isApprover) revert NotEscrowParty(msg.sender);

        e.approvers[msg.sender] = true;
        e.approvalCount++;

        emit EscrowApproved(escrowId, msg.sender, e.approvalCount);
    }

    /**
     * @notice Open a dispute on an escrow
     * @param escrowId The escrow to dispute
     * @param reason Dispute reason
     */
    function dispute(uint256 escrowId, string calldata reason) external {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Funded) {
            revert InvalidStatus(e.status, EscrowStatus.Funded);
        }
        if (msg.sender != e.sender && msg.sender != e.recipient) {
            revert NotEscrowParty(msg.sender);
        }

        e.status = EscrowStatus.Disputed;

        emit EscrowDisputed(escrowId, msg.sender, reason);
    }

    /**
     * @notice Cancel unfunded escrow
     * @param escrowId The escrow to cancel
     */
    function cancel(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Created) {
            revert InvalidStatus(e.status, EscrowStatus.Created);
        }
        if (msg.sender != e.sender) revert NotEscrowParty(msg.sender);

        e.status = EscrowStatus.Cancelled;
        e.resolvedAt = block.timestamp;
    }

    // ============ View Functions ============

    /**
     * @notice Get escrow details
     */
    function getEscrow(uint256 escrowId)
        external
        view
        returns (
            EscrowConfig memory config,
            EscrowStatus status,
            address sender,
            address recipient,
            uint256 fundedAt,
            uint256 resolvedAt,
            bytes32 releaseProof,
            uint8 approvalCount
        )
    {
        Escrow storage e = escrows[escrowId];
        return (
            e.config,
            e.status,
            e.sender,
            e.recipient,
            e.fundedAt,
            e.resolvedAt,
            e.releaseProof,
            e.approvalCount
        );
    }

    /**
     * @notice Get all escrows for an agent
     */
    function getAgentEscrows(uint256 agentId) external view returns (uint256[] memory) {
        return agentEscrows[agentId];
    }

    /**
     * @notice Check if escrow can be released
     */
    function canRelease(uint256 escrowId) external view returns (bool, string memory reason) {
        Escrow storage e = escrows[escrowId];

        if (e.status != EscrowStatus.Funded) {
            return (false, "Not funded");
        }

        if (e.config.condition == ReleaseCondition.TimeOnly) {
            if (block.timestamp >= e.config.timeout) {
                return (true, "Timeout reached");
            }
            return (false, "Timeout not reached");
        }

        if (e.config.condition == ReleaseCondition.MultiParty) {
            uint256 required = requiredApprovers[escrowId].length;
            if (e.approvalCount >= required) {
                return (true, "All approvals received");
            }
            return (false, "Insufficient approvals");
        }

        // zkML conditions checked at release time
        return (true, "Check zkML at release");
    }

    // ============ Internal Functions ============

    function _verifyReleaseConditions(Escrow storage e, bytes32 zkmlProofHash) internal view {
        ReleaseCondition condition = e.config.condition;

        if (condition == ReleaseCondition.TimeOnly) {
            if (block.timestamp < e.config.timeout) revert TimeoutNotReached();
        } else if (condition == ReleaseCondition.ZkmlAttestation) {
            _verifyZkmlAttestation(e, zkmlProofHash);
        } else if (condition == ReleaseCondition.MultiParty) {
            uint256 required = requiredApprovers[e.config.senderAgentId].length;
            if (e.approvalCount < required) revert InsufficientApprovals();
        } else if (condition == ReleaseCondition.ZkmlAndTime) {
            if (block.timestamp < e.config.timeout) revert TimeoutNotReached();
            _verifyZkmlAttestation(e, zkmlProofHash);
        }
    }

    function _verifyZkmlAttestation(Escrow storage e, bytes32 zkmlProofHash) internal view {
        if (zkmlProofHash == bytes32(0)) revert ZkmlNotVerified();

        // Query ValidationRegistry for the attestation
        (bool success, bytes memory data) = validationRegistry.staticcall(
            abi.encodeWithSignature(
                "getAttestation(bytes32)",
                zkmlProofHash
            )
        );

        if (!success) revert ZkmlNotVerified();

        // Decode attestation and verify it matches requirements
        (
            uint256 agentId,
            bytes32 modelCommitment,
            ,  // inputHash
            ,  // outputHash
            ,  // proofHash
            bool decision,
            uint96 confidence,
            uint256 timestamp
        ) = abi.decode(data, (uint256, bytes32, bytes32, bytes32, bytes32, bool, uint96, uint256));

        // Verify attestation is for the recipient agent
        if (agentId != e.config.recipientAgentId) revert ZkmlNotVerified();

        // Verify model commitment matches
        if (e.config.zkmlModelCommitment != bytes32(0) &&
            modelCommitment != e.config.zkmlModelCommitment) {
            revert ZkmlNotVerified();
        }

        // Verify decision was approve
        if (!decision) revert ZkmlNotVerified();

        // Verify confidence meets minimum
        if (confidence < e.config.minConfidence) revert ZkmlNotVerified();

        // Verify attestation is fresh (within 1 hour)
        if (block.timestamp - timestamp > 1 hours) revert ZkmlNotVerified();
    }

    function _getAgentWallet(uint256 agentId) internal view returns (address) {
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSignature("agentWallets(uint256)", agentId)
        );
        if (!success || data.length == 0) return address(0);
        return abi.decode(data, (address));
    }

    function _transferFunds(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool success,) = to.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Set required approvers for multi-party escrow
     * @param escrowId The escrow ID
     * @param approvers Array of required approver addresses
     */
    function setRequiredApprovers(uint256 escrowId, address[] calldata approvers) external {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.sender) revert NotEscrowParty(msg.sender);
        if (e.status != EscrowStatus.Created) {
            revert InvalidStatus(e.status, EscrowStatus.Created);
        }

        requiredApprovers[escrowId] = approvers;
    }

    /**
     * @notice Resolve disputed escrow (simplified - in production would use arbitration)
     * @param escrowId The escrow ID
     * @param releaseToRecipient True to release to recipient, false to refund sender
     */
    function resolveDispute(uint256 escrowId, bool releaseToRecipient) external {
        Escrow storage e = escrows[escrowId];
        if (e.status != EscrowStatus.Disputed) {
            revert InvalidStatus(e.status, EscrowStatus.Disputed);
        }

        // In production, this would be a DAO vote or arbitrator
        // For MVP, sender can resolve
        if (msg.sender != e.sender) revert NotEscrowParty(msg.sender);

        e.resolvedAt = block.timestamp;

        if (releaseToRecipient) {
            e.status = EscrowStatus.Released;
            _transferFunds(e.config.token, e.recipient, e.config.amount);
            emit EscrowReleased(escrowId, e.recipient, e.config.amount, bytes32(0));
        } else {
            e.status = EscrowStatus.Refunded;
            _transferFunds(e.config.token, e.sender, e.config.amount);
            emit EscrowRefunded(escrowId, e.sender, e.config.amount);
        }
    }

    // Allow receiving ETH
    receive() external payable {}
}
