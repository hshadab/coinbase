/**
 * Agent Memory Module
 *
 * Verifiable agent memory with Kinic zkTAM + Base commitments.
 *
 * @module memory
 */

export {
  AgentMemory,
  createAgentMemory,
  StorageType,
  OperationType,
  KNOWLEDGE_DOMAINS,
  type AgentMemoryConfig,
  type MemoryStoreConfig,
  type MemoryStore,
  type MemoryEntry,
  type InsertResult,
  type SearchResult,
  type KnowledgeCredential,
  type MemoryIntegrityScore,
} from "./agent-memory.js";
