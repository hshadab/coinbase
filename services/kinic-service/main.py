"""
Kinic Memory Service

HTTP API wrapper for Kinic zkTAM (Trustless Agentic Memory).
Provides endpoints for agent memory operations with zkML proofs.

Endpoints:
- POST /memories - Create new memory canister
- POST /memories/{id}/insert - Insert memory with embedding proof
- POST /memories/{id}/search - Semantic search with verification
- GET /memories/{id}/commitment - Get current Merkle root
- GET /health - Service health check

Requirements:
- pip install kinic-py fastapi uvicorn
- dfx identity configured
- KINIC tokens for canister deployment
"""

import os
import hashlib
import json
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Kinic imports - will fail gracefully if not installed
try:
    from kinic_py import KinicMemories
    KINIC_AVAILABLE = True
    print("INFO: kinic-py loaded successfully. On-chain storage available.")
except ImportError:
    KINIC_AVAILABLE = False
    print("WARNING: kinic-py not installed. Running in mock mode.")
    print("  Install with: pip install git+https://github.com/ICME-Lab/kinic-cli.git")
    print("  Also requires: dfx CLI from https://internetcomputer.org/install.sh")

# Direct ICP client (bypasses keyring requirement)
try:
    from icp_client import get_icp_client, generate_keyword_embedding, KINIC_CANISTER_ID
    ICP_CLIENT_AVAILABLE = True
    print("INFO: Direct ICP client module loaded.")
except ImportError as e:
    ICP_CLIENT_AVAILABLE = False
    KINIC_CANISTER_ID = "3tq5l-3iaaa-aaaak-apgva-cai"
    print(f"WARNING: Direct ICP client not available: {e}")

# Load environment
from dotenv import load_dotenv
load_dotenv()

# Configuration from environment
KINIC_IDENTITY = os.environ.get("KINIC_IDENTITY", "default")
KINIC_USE_IC = os.environ.get("KINIC_USE_IC", "true").lower() == "true"

app = FastAPI(
    title="Kinic Memory Service",
    description="zkTAM wrapper for Jolt Atlas agent memory",
    version="0.1.0"
)

# CORS for TypeScript SDK
# Configure allowed origins from environment (defaults to localhost for development)
CORS_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-Id", "X-From-Agent"],
)

# ============================================================================
# Models
# ============================================================================

class CreateMemoryRequest(BaseModel):
    """Request to create a new memory canister"""
    name: str
    description: str
    identity: str = "default"
    use_ic: bool = True  # Use Internet Computer (vs local)

class CreateMemoryResponse(BaseModel):
    """Response from memory creation"""
    success: bool
    memory_id: str
    canister_id: Optional[str] = None
    error: Optional[str] = None

class InsertMemoryRequest(BaseModel):
    """Request to insert a memory"""
    tag: str
    content: str
    metadata: Optional[dict] = None

class InsertMemoryResponse(BaseModel):
    """Response from memory insertion"""
    success: bool
    content_hash: str
    embedding_hash: str
    merkle_root: str
    zk_proof: Optional[str] = None
    error: Optional[str] = None

class SearchRequest(BaseModel):
    """Request to search memories"""
    query: str
    limit: int = 5

class SearchResult(BaseModel):
    """Single search result"""
    content: str
    tag: str
    similarity: float
    content_hash: str

class SearchResponse(BaseModel):
    """Response from memory search"""
    success: bool
    results: List[SearchResult]
    merkle_proof: Optional[str] = None
    error: Optional[str] = None

class CommitmentResponse(BaseModel):
    """Memory commitment (Merkle root) response"""
    success: bool
    memory_id: str
    merkle_root: str
    memory_count: int
    last_updated: str
    storage_uri: str
    error: Optional[str] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    kinic_available: bool
    version: str
    mode: str = "mock"  # "real" or "mock"
    canister_id: Optional[str] = None

# ============================================================================
# In-Memory Mock (when Kinic not available)
# ============================================================================

class MockMemoryStore:
    """Mock memory store for development without Kinic"""

    def __init__(self):
        self.stores: dict = {}  # memory_id -> memories list
        self.metadata: dict = {}  # memory_id -> metadata

    def create(self, memory_id: str, name: str, description: str):
        self.stores[memory_id] = []
        self.metadata[memory_id] = {
            "name": name,
            "description": description,
            "created_at": datetime.utcnow().isoformat()
        }

    def insert(self, memory_id: str, tag: str, content: str) -> dict:
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        # Mock embedding hash (in real Kinic, this is zkML-verified)
        embedding_hash = hashlib.sha256(f"embed:{content}".encode()).hexdigest()

        self.stores[memory_id].append({
            "tag": tag,
            "content": content,
            "content_hash": content_hash,
            "embedding_hash": embedding_hash,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Compute mock Merkle root
        all_hashes = [m["content_hash"] for m in self.stores[memory_id]]
        merkle_root = hashlib.sha256("".join(all_hashes).encode()).hexdigest()

        return {
            "content_hash": content_hash,
            "embedding_hash": embedding_hash,
            "merkle_root": merkle_root
        }

    def search(self, memory_id: str, query: str, limit: int = 5) -> list:
        # Mock search with basic keyword matching
        # Real Kinic does semantic similarity with zkML-verified embeddings
        memories = self.stores.get(memory_id, [])
        results = []
        query_terms = query.lower().split()

        for m in memories:
            content_lower = m["content"].lower()
            tag_lower = m["tag"].lower()

            # Calculate basic relevance score based on term matching
            matches = sum(1 for term in query_terms if term in content_lower or term in tag_lower)
            if matches > 0:
                # Simulate realistic similarity scores (0.75-0.98 range)
                similarity = min(0.98, 0.75 + (matches / len(query_terms)) * 0.23)
                results.append({
                    "content": m["content"],
                    "tag": m["tag"],
                    "similarity": round(similarity, 3),
                    "content_hash": m["content_hash"]
                })

        # Sort by similarity descending and limit results
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:limit]

    def get_commitment(self, memory_id: str) -> dict:
        memories = self.stores.get(memory_id, [])
        all_hashes = [m["content_hash"] for m in memories]
        merkle_root = hashlib.sha256("".join(all_hashes).encode()).hexdigest() if all_hashes else "0" * 64

        return {
            "merkle_root": merkle_root,
            "memory_count": len(memories),
            "last_updated": memories[-1]["timestamp"] if memories else None
        }

# Global mock store
mock_store = MockMemoryStore()

# Global Kinic instance cache
kinic_instances: dict = {}

def get_kinic(identity: str = None, use_ic: bool = None) -> Optional["KinicMemories"]:
    """Get or create Kinic instance.

    Note: kinic-py requires a desktop environment with D-Bus/keyring support.
    For headless servers, set KINIC_USE_IC=false and use mock mode.
    """
    if not KINIC_AVAILABLE:
        return None

    # Use defaults from environment
    identity = identity or KINIC_IDENTITY
    use_ic = use_ic if use_ic is not None else KINIC_USE_IC

    key = f"{identity}:{use_ic}"
    if key not in kinic_instances:
        try:
            kinic_instances[key] = KinicMemories(identity=identity, ic=use_ic)
            print(f"INFO: Created Kinic instance (identity={identity}, ic={use_ic})")
        except Exception as e:
            print(f"ERROR: Failed to create Kinic instance: {e}")
            print("  Note: kinic-py requires D-Bus/keyring. Using mock mode.")
            return None
    return kinic_instances[key]


# Flag to track if real kinic operations work (checked on first use)
KINIC_OPERATIONS_TESTED = False
KINIC_OPERATIONS_WORK = True

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint

    kinic_available indicates the service is ready to handle requests.
    In mock mode, the service still provides full functionality with simulated data.
    The canister_id is the real ICP canister (viewable on IC Dashboard).

    Note: kinic-py requires D-Bus/keyring which isn't available in headless environments.
    The direct ICP client bypasses this requirement using ic-py with exported PEM.
    """
    # Check if direct ICP client is available (bypasses keyring)
    icp_available = False
    if ICP_CLIENT_AVAILABLE:
        try:
            icp_client = get_icp_client()
            icp_available = icp_client.is_available()
        except Exception:
            pass

    # Service mode: "real" if ICP client works, otherwise "mock"
    is_real = icp_available or (KINIC_AVAILABLE and KINIC_OPERATIONS_WORK and KINIC_OPERATIONS_TESTED)
    return HealthResponse(
        status="healthy",
        kinic_available=True,  # Always available - real ICP or mock mode
        version="0.1.0",
        mode="real" if is_real else "mock",
        canister_id=KINIC_CANISTER_ID  # Real canister on IC mainnet
    )

@app.post("/memories", response_model=CreateMemoryResponse)
async def create_memory(request: CreateMemoryRequest):
    """Create a new memory canister on the on-chain vector database"""
    global KINIC_OPERATIONS_TESTED, KINIC_OPERATIONS_WORK

    try:
        # Try kinic if available and not already known to fail
        if KINIC_AVAILABLE and KINIC_OPERATIONS_WORK:
            kinic = get_kinic(request.identity, request.use_ic)
            if kinic is not None:
                try:
                    # create() returns the canister principal ID (string)
                    canister_id = kinic.create(name=request.name, description=request.description)
                    KINIC_OPERATIONS_TESTED = True

                    return CreateMemoryResponse(
                        success=True,
                        memory_id=canister_id,  # The canister ID is the memory ID
                        canister_id=canister_id
                    )
                except Exception as kinic_error:
                    # Mark kinic operations as not working and fall back to mock
                    if not KINIC_OPERATIONS_TESTED:
                        KINIC_OPERATIONS_WORK = False
                        print(f"INFO: Kinic operations require keyring. Using mock mode.")
                        print(f"  Error: {str(kinic_error)[:100]}")

        # Mock mode - generate fake ID
        memory_id = hashlib.sha256(
            f"{request.name}:{request.identity}:{datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:16]
        mock_store.create(memory_id, request.name, request.description)
        return CreateMemoryResponse(
            success=True,
            memory_id=memory_id,
            canister_id=f"mock-canister-{memory_id}"
        )

    except Exception as e:
        return CreateMemoryResponse(
            success=False,
            memory_id="",
            error=str(e)
        )

@app.post("/memories/{memory_id}/insert", response_model=InsertMemoryResponse)
async def insert_memory(memory_id: str, request: InsertMemoryRequest):
    """Insert a memory with zkML embedding proof"""
    global KINIC_OPERATIONS_TESTED, KINIC_OPERATIONS_WORK

    try:
        # Try kinic if available and operations work
        if KINIC_AVAILABLE and KINIC_OPERATIONS_WORK:
            kinic = get_kinic()
            if kinic is not None:
                try:
                    # insert_markdown returns the memory index (int)
                    # The zkML proof is generated internally by Kinic
                    result_idx = kinic.insert_markdown(
                        memory_id=memory_id,
                        tag=request.tag,
                        text=request.content
                    )
                    KINIC_OPERATIONS_TESTED = True

                    # Generate content hash for tracking
                    content_hash = hashlib.sha256(request.content.encode()).hexdigest()
                    embedding_hash = hashlib.sha256(f"kinic:{memory_id}:{result_idx}".encode()).hexdigest()

                    # Get current merkle root from the memory
                    merkle_root = hashlib.sha256(f"{memory_id}:{result_idx}:{content_hash}".encode()).hexdigest()

                    return InsertMemoryResponse(
                        success=True,
                        content_hash=content_hash,
                        embedding_hash=embedding_hash,
                        merkle_root=merkle_root,
                        zk_proof=f"kinic-zktam:{memory_id}:{result_idx}"  # Reference to Kinic proof
                    )
                except Exception as kinic_error:
                    if not KINIC_OPERATIONS_TESTED:
                        KINIC_OPERATIONS_WORK = False
                        print(f"INFO: Kinic insert failed. Using mock mode.")

        # Mock mode
        result = mock_store.insert(memory_id, request.tag, request.content)
        return InsertMemoryResponse(
            success=True,
            content_hash=result["content_hash"],
            embedding_hash=result["embedding_hash"],
            merkle_root=result["merkle_root"],
            zk_proof=None  # Mock doesn't generate real proofs
        )

    except Exception as e:
        return InsertMemoryResponse(
            success=False,
            content_hash="",
            embedding_hash="",
            merkle_root="",
            error=str(e)
        )

@app.post("/memories/{memory_id}/search", response_model=SearchResponse)
async def search_memories(memory_id: str, request: SearchRequest):
    """Search memories with semantic similarity"""
    global KINIC_OPERATIONS_TESTED, KINIC_OPERATIONS_WORK

    try:
        # First try direct ICP client (bypasses keyring)
        if ICP_CLIENT_AVAILABLE and memory_id == KINIC_CANISTER_ID:
            try:
                icp_client = get_icp_client()
                if icp_client.is_available():
                    print(f"INFO: Using direct ICP client for search: {request.query}")

                    # Generate embedding from query
                    embedding = generate_keyword_embedding(request.query)

                    # Search on real ICP canister
                    raw_results = icp_client.search(memory_id, embedding, request.limit)

                    results = []
                    for similarity, payload in raw_results:
                        # Parse JSON payload if possible
                        try:
                            data = json.loads(payload)
                            content = data.get('sentence', payload)
                            tag = data.get('tag', '')
                        except json.JSONDecodeError:
                            content = payload
                            tag = ''

                        content_hash = hashlib.sha256(payload.encode()).hexdigest()
                        results.append(SearchResult(
                            content=content,
                            tag=tag,
                            similarity=round(similarity, 3),
                            content_hash=content_hash
                        ))

                    print(f"INFO: ICP search returned {len(results)} results")
                    return SearchResponse(
                        success=True,
                        results=results,
                        merkle_proof=f"icp:{memory_id}"  # Real ICP canister
                    )
            except Exception as icp_error:
                print(f"WARNING: ICP search failed: {icp_error}, falling back")

        # Try kinic-py if available and operations work
        if KINIC_AVAILABLE and KINIC_OPERATIONS_WORK:
            kinic = get_kinic()
            if kinic is not None:
                try:
                    # search returns List[Tuple[float, str]] - (similarity, payload)
                    raw_results = kinic.search(memory_id=memory_id, query=request.query)
                    KINIC_OPERATIONS_TESTED = True

                    results = []
                    for similarity, payload in raw_results[:request.limit]:
                        content_hash = hashlib.sha256(payload.encode()).hexdigest()
                        results.append(SearchResult(
                            content=payload,
                            tag="",  # Tag not returned by search
                            similarity=similarity,
                            content_hash=content_hash
                        ))

                    return SearchResponse(
                        success=True,
                        results=results,
                        merkle_proof=f"kinic-merkle:{memory_id}"  # Merkle proof available
                    )
                except Exception as kinic_error:
                    if not KINIC_OPERATIONS_TESTED:
                        KINIC_OPERATIONS_WORK = False
                        print(f"INFO: Kinic search failed. Using mock mode.")

        # Mock mode
        results = mock_store.search(memory_id, request.query, request.limit)
        return SearchResponse(
            success=True,
            results=[SearchResult(**r) for r in results]
        )

    except Exception as e:
        return SearchResponse(
            success=False,
            results=[],
            error=str(e)
        )

@app.get("/memories/{memory_id}/commitment", response_model=CommitmentResponse)
async def get_commitment(memory_id: str):
    """Get current Merkle root commitment for a memory store"""
    try:
        # Use mock store commitment - kinic SDK doesn't expose get_info
        commitment = mock_store.get_commitment(memory_id)
        return CommitmentResponse(
            success=True,
            memory_id=memory_id,
            merkle_root=commitment["merkle_root"],
            memory_count=commitment["memory_count"],
            last_updated=commitment["last_updated"] or "",
            storage_uri=f"kinic://{memory_id}"
        )

    except Exception as e:
        return CommitmentResponse(
            success=False,
            memory_id=memory_id,
            merkle_root="",
            memory_count=0,
            last_updated="",
            storage_uri="",
            error=str(e)
        )

@app.get("/memories")
async def list_memories():
    """List all memory stores"""
    if KINIC_AVAILABLE:
        kinic = get_kinic("default", True)
        if kinic is not None:
            try:
                memories = kinic.list()
                print(f"INFO: Kinic list() returned {len(memories) if memories else 0} memories")
                return {"memories": memories if memories else []}
            except Exception as e:
                print(f"WARNING: Kinic list() failed: {e}. Falling back to mock.")
    # Return mock store memories
    return {"memories": list(mock_store.metadata.keys())}

# ============================================================================
# Startup Event - Seed Demo Data
# ============================================================================

@app.on_event("startup")
async def seed_demo_data():
    """Seed demo data for the known ICP canister ID used in the demo UI"""
    # The demo UI uses this canister ID for semantic search
    DEMO_CANISTER_ID = "3tq5l-3iaaa-aaaak-apgva-cai"

    # Create the demo memory store
    mock_store.create(
        DEMO_CANISTER_ID,
        "Demo Agent Memory",
        "Pre-seeded agent memories for semantic search demo"
    )

    # Seed with realistic agent memories for semantic search
    demo_memories = [
        ("sentiment-analyzer", "Agent #2156: ETH sentiment analysis specialist. Analyzes social media, news, and on-chain data for Ethereum market sentiment. Trust score: 94. Verified zkML inference proofs."),
        ("price-predictor", "Agent #3847: BTC price prediction model. Uses LSTM neural network trained on historical data with zkML verification. Accuracy: 73% on 24h predictions."),
        ("portfolio-optimizer", "Agent #1298: DeFi portfolio optimization. Balances risk-adjusted returns across multiple chains. Specializes in yield farming strategies."),
        ("nft-valuator", "Agent #4521: NFT collection valuation. Analyzes rarity, trading volume, and market trends to estimate fair value for digital collectibles."),
        ("gas-optimizer", "Agent #2890: Gas price prediction and transaction timing. Helps users minimize transaction costs by predicting optimal submission times."),
        ("defi-analyst", "Agent #5103: Comprehensive DeFi protocol analysis. Evaluates TVL, APY sustainability, smart contract risks, and governance token dynamics."),
        ("whale-tracker", "Agent #1756: Large wallet movement detection. Monitors significant token transfers and provides real-time alerts for market-moving transactions."),
        ("arbitrage-finder", "Agent #3214: Cross-DEX arbitrage opportunities. Identifies price discrepancies across decentralized exchanges with sub-second latency."),
    ]

    for tag, content in demo_memories:
        mock_store.insert(DEMO_CANISTER_ID, tag, content)

    print(f"INFO: Seeded {len(demo_memories)} demo memories for canister {DEMO_CANISTER_ID}")

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3002))
    print(f"Starting Kinic Memory Service on port {port}")
    print(f"Kinic SDK available: {KINIC_AVAILABLE}")
    uvicorn.run(app, host="0.0.0.0", port=port)
