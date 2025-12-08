"""
Direct ICP Canister Client for Kinic Memory

Bypasses kinic-py's keyring requirement by using ic-py directly
with PEM-exported identity from dfx.
"""

import subprocess
import json
from typing import List, Tuple, Optional
from ic.client import Client
from ic.identity import Identity
from ic.agent import Agent
from ic.candid import encode, decode, Types

# Constants
KINIC_CANISTER_ID = "3tq5l-3iaaa-aaaak-apgva-cai"
IC_URL = "https://ic0.app"
EMBEDDING_DIM = 1024  # Kinic uses 1024-dim embeddings

class ICPKinicClient:
    """Direct ICP client for Kinic canister queries."""

    def __init__(self, identity_name: str = "jolt-atlas"):
        """Initialize client with a dfx identity.

        Args:
            identity_name: Name of dfx identity to use (must be exportable)
        """
        self.identity_name = identity_name
        self.agent = None
        self._initialized = False
        self._init_error = None

    def _ensure_initialized(self) -> bool:
        """Lazy initialization of ICP agent."""
        if self._initialized:
            return self.agent is not None

        self._initialized = True
        try:
            # Export PEM from dfx
            result = subprocess.run(
                ["dfx", "identity", "export", self.identity_name],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                self._init_error = f"Failed to export identity: {result.stderr}"
                return False

            pem_data = result.stdout
            if not pem_data or "BEGIN" not in pem_data:
                self._init_error = "Invalid PEM data from dfx"
                return False

            # Create ic-py agent
            identity = Identity.from_pem(pem_data)
            client = Client(url=IC_URL)
            self.agent = Agent(identity, client)
            print(f"INFO: ICP client initialized with identity {self.identity_name}")
            print(f"  Principal: {identity.sender()}")
            return True

        except Exception as e:
            self._init_error = str(e)
            print(f"WARNING: Failed to initialize ICP client: {e}")
            return False

    def search(self, canister_id: str, embedding: List[float], limit: int = 10) -> List[Tuple[float, str]]:
        """Search the Kinic canister with an embedding vector.

        Args:
            canister_id: The canister principal ID
            embedding: 1024-dimension embedding vector
            limit: Maximum results to return

        Returns:
            List of (similarity_score, payload) tuples
        """
        if not self._ensure_initialized():
            raise RuntimeError(f"ICP client not initialized: {self._init_error}")

        if len(embedding) != EMBEDDING_DIM:
            raise ValueError(f"Embedding must be {EMBEDDING_DIM} dimensions, got {len(embedding)}")

        # Encode embedding as vec float32
        encoded = encode([{
            "type": Types.Vec(Types.Float32),
            "value": embedding
        }])

        # Query canister
        result = self.agent.query_raw(canister_id, "search", encoded)

        # Parse result - it returns a list with a record containing results
        if isinstance(result, list) and len(result) > 0:
            record = result[0]
            if isinstance(record, dict) and 'value' in record:
                raw_results = record['value']
                # Each result is [similarity, payload]
                parsed = []
                for item in raw_results[:limit]:
                    if isinstance(item, list) and len(item) >= 2:
                        similarity = float(item[0])
                        payload = str(item[1])
                        parsed.append((similarity, payload))
                return parsed

        return []

    def is_available(self) -> bool:
        """Check if the ICP client is available."""
        return self._ensure_initialized()

    def get_error(self) -> Optional[str]:
        """Get initialization error if any."""
        return self._init_error


# Simple embedding generator using keyword matching
# This is a fallback when sentence-transformers is not available
def generate_keyword_embedding(text: str, dim: int = EMBEDDING_DIM) -> List[float]:
    """Generate a simple keyword-based embedding.

    This is a fallback that creates embeddings based on keyword hashing.
    Not as good as real semantic embeddings but allows basic search.
    """
    import hashlib

    # Normalize text
    text = text.lower()
    words = text.split()

    # Initialize embedding
    embedding = [0.0] * dim

    # Hash each word and scatter into embedding
    for word in words:
        h = hashlib.sha256(word.encode()).digest()
        for i in range(min(32, dim)):
            idx = (h[i % len(h)] + i * 37) % dim
            embedding[idx] += 0.1

    # Normalize
    magnitude = sum(x*x for x in embedding) ** 0.5
    if magnitude > 0:
        embedding = [x / magnitude for x in embedding]

    return embedding


# Singleton instance
_icp_client: Optional[ICPKinicClient] = None

def get_icp_client() -> ICPKinicClient:
    """Get or create the global ICP client instance."""
    global _icp_client
    if _icp_client is None:
        _icp_client = ICPKinicClient(identity_name="jolt-atlas")
    return _icp_client
