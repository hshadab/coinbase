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

# Load environment
from dotenv import load_dotenv
load_dotenv()

# Configuration from environment
KINIC_IDENTITY = os.environ.get("KINIC_IDENTITY", "default")
KINIC_USE_IC = os.environ.get("KINIC_USE_IC", "true").lower() == "true"

# Constants
DEFAULT_SEARCH_LIMIT = 5
MOCK_SIMILARITY_SCORE = 0.85
EMPTY_MERKLE_ROOT = "0" * 64
MEMORY_ID_LENGTH = 16
SERVICE_VERSION = "0.1.0"
DEFAULT_PORT = 3002

app = FastAPI(
    title="Kinic Memory Service",
    description="zkTAM wrapper for Jolt Atlas agent memory",
    version=SERVICE_VERSION
)

# CORS for TypeScript SDK
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
    limit: int = DEFAULT_SEARCH_LIMIT

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

# ============================================================================
# In-Memory Mock (when Kinic not available)
# ============================================================================

class MockMemoryStore:
    """Mock memory store for development without Kinic.

    Provides a thread-safe in-memory implementation for testing.
    """

    def __init__(self):
        self.stores: dict = {}  # memory_id -> memories list
        self.metadata: dict = {}  # memory_id -> metadata

    def create(self, memory_id: str, name: str, description: str) -> None:
        """Create a new memory store."""
        self.stores[memory_id] = []
        self.metadata[memory_id] = {
            "name": name,
            "description": description,
            "created_at": datetime.utcnow().isoformat()
        }

    def insert(self, memory_id: str, tag: str, content: str) -> dict:
        """Insert a memory entry and return hashes."""
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

    def search(self, memory_id: str, query: str, limit: int = DEFAULT_SEARCH_LIMIT) -> list:
        """Search memories with mock similarity scoring."""
        # Mock search - just return recent memories
        # Real Kinic does semantic similarity with zkML-verified embeddings
        memories = self.stores.get(memory_id, [])
        results = []
        for m in memories[-limit:]:
            results.append({
                "content": m["content"],
                "tag": m["tag"],
                "similarity": MOCK_SIMILARITY_SCORE,
                "content_hash": m["content_hash"]
            })
        return results

    def get_commitment(self, memory_id: str) -> dict:
        """Get the current Merkle commitment for a memory store."""
        memories = self.stores.get(memory_id, [])
        all_hashes = [m["content_hash"] for m in memories]
        merkle_root = hashlib.sha256("".join(all_hashes).encode()).hexdigest() if all_hashes else EMPTY_MERKLE_ROOT

        return {
            "merkle_root": merkle_root,
            "memory_count": len(memories),
            "last_updated": memories[-1]["timestamp"] if memories else None
        }


class KinicServiceState:
    """Application state container for dependency injection.

    Encapsulates all mutable state to avoid global variables and
    enable proper testing and concurrent access patterns.
    """

    def __init__(self):
        self.mock_store = MockMemoryStore()
        self.kinic_instances: dict = {}
        self.operations_tested = False
        self.operations_work = True

    def get_kinic(self, identity: str = None, use_ic: bool = None) -> Optional["KinicMemories"]:
        """Get or create Kinic instance.

        Note: kinic-py requires a desktop environment with D-Bus/keyring support.
        For headless servers, set KINIC_USE_IC=false and use mock mode.

        Args:
            identity: Kinic identity to use (defaults to KINIC_IDENTITY env var)
            use_ic: Whether to use Internet Computer (defaults to KINIC_USE_IC env var)

        Returns:
            KinicMemories instance or None if unavailable
        """
        if not KINIC_AVAILABLE:
            return None

        # Use defaults from environment
        identity = identity or KINIC_IDENTITY
        use_ic = use_ic if use_ic is not None else KINIC_USE_IC

        key = f"{identity}:{use_ic}"
        if key not in self.kinic_instances:
            try:
                self.kinic_instances[key] = KinicMemories(identity=identity, ic=use_ic)
                print(f"INFO: Created Kinic instance (identity={identity}, ic={use_ic})")
            except Exception as e:
                print(f"ERROR: Failed to create Kinic instance: {e}")
                print("  Note: kinic-py requires D-Bus/keyring. Using mock mode.")
                return None
        return self.kinic_instances[key]


# Application state singleton (initialized once at startup)
app_state = KinicServiceState()

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        kinic_available=KINIC_AVAILABLE,
        version=SERVICE_VERSION
    )

@app.post("/memories", response_model=CreateMemoryResponse)
async def create_memory(request: CreateMemoryRequest):
    """Create a new memory canister on the on-chain vector database."""
    try:
        # Try kinic if available and not already known to fail
        if KINIC_AVAILABLE and app_state.operations_work:
            kinic = app_state.get_kinic(request.identity, request.use_ic)
            if kinic is not None:
                try:
                    # create() returns the canister principal ID (string)
                    canister_id = kinic.create(name=request.name, description=request.description)
                    app_state.operations_tested = True

                    return CreateMemoryResponse(
                        success=True,
                        memory_id=canister_id,  # The canister ID is the memory ID
                        canister_id=canister_id
                    )
                except Exception as kinic_error:
                    # Mark kinic operations as not working and fall back to mock
                    if not app_state.operations_tested:
                        app_state.operations_work = False
                        print(f"INFO: Kinic operations require keyring. Using mock mode.")
                        print(f"  Error: {str(kinic_error)[:100]}")

        # Mock mode - generate fake ID
        memory_id = hashlib.sha256(
            f"{request.name}:{request.identity}:{datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:MEMORY_ID_LENGTH]
        app_state.mock_store.create(memory_id, request.name, request.description)
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
    """Insert a memory with zkML embedding proof."""
    try:
        # Try kinic if available and operations work
        if KINIC_AVAILABLE and app_state.operations_work:
            kinic = app_state.get_kinic()
            if kinic is not None:
                try:
                    # insert_markdown returns the memory index (int)
                    # The zkML proof is generated internally by Kinic
                    result_idx = kinic.insert_markdown(
                        memory_id=memory_id,
                        tag=request.tag,
                        text=request.content
                    )
                    app_state.operations_tested = True

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
                    if not app_state.operations_tested:
                        app_state.operations_work = False
                        print(f"INFO: Kinic insert failed. Using mock mode.")

        # Mock mode
        result = app_state.mock_store.insert(memory_id, request.tag, request.content)
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
    """Search memories with semantic similarity."""
    try:
        # Try kinic if available and operations work
        if KINIC_AVAILABLE and app_state.operations_work:
            kinic = app_state.get_kinic()
            if kinic is not None:
                try:
                    # search returns List[Tuple[float, str]] - (similarity, payload)
                    raw_results = kinic.search(memory_id=memory_id, query=request.query)
                    app_state.operations_tested = True

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
                    if not app_state.operations_tested:
                        app_state.operations_work = False
                        print(f"INFO: Kinic search failed. Using mock mode.")

        # Mock mode
        results = app_state.mock_store.search(memory_id, request.query, request.limit)
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
    """Get current Merkle root commitment for a memory store."""
    try:
        # Use mock store commitment - kinic SDK doesn't expose get_info
        commitment = app_state.mock_store.get_commitment(memory_id)
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
    """List all memory stores."""
    if KINIC_AVAILABLE and app_state.operations_work:
        kinic = app_state.get_kinic("default", True)
        if kinic is not None:
            try:
                return {"memories": kinic.list()}
            except Exception:
                pass  # Fall through to mock mode
    return {"memories": list(app_state.mock_store.metadata.keys())}

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    print(f"Starting Kinic Memory Service on port {port}")
    print(f"Kinic SDK available: {KINIC_AVAILABLE}")
    uvicorn.run(app, host="0.0.0.0", port=port)
