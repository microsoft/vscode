// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Shared configuration constants for the MCP gateway.
 *
 * The vector size MUST match the indexer's `QDRANT_VECTOR_SIZE` env var
 * (see `services/indexer/src/config.ts`). When the gateway constructs a
 * placeholder query vector, its dimensionality has to match the stored
 * vectors or Qdrant rejects the search.
 *
 * Default: 768 (matches the indexer's default and most standard code-search
 * embedding models). Override via `QDRANT_VECTOR_SIZE` for both services
 * together — never one without the other.
 */
export const QDRANT_VECTOR_SIZE = parseInt(
	process.env.QDRANT_VECTOR_SIZE ?? '768',
	10,
);
