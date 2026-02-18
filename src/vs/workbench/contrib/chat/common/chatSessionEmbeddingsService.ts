/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * A single search result from the conversation embeddings index.
 */
export interface IChatSessionSearchResult {
	/** URI of the session this result belongs to */
	readonly sessionResource: URI;

	/** Display title for the session */
	readonly title: string;

	/** Relevance score (0-1, higher is better) */
	readonly score: number;

	/** The matched text snippet that contributed to the score */
	readonly matchSnippet: string;

	/** Timestamp of the last message in the session */
	readonly lastMessageDate: number;
}

/**
 * Represents an indexed conversation chunk stored in the embeddings index.
 */
export interface IChatSessionEmbeddingEntry {
	/** Session identifier URI */
	readonly sessionResource: URI;

	/** Display title for the session */
	readonly title: string;

	/** Text chunks extracted from conversation turns */
	readonly textChunks: readonly string[];

	/** Timestamp of the last message in the session */
	readonly lastMessageDate: number;
}

export const IChatSessionEmbeddingsService = createDecorator<IChatSessionEmbeddingsService>('chatSessionEmbeddingsService');

/**
 * Service for indexing and searching past coding agent conversation sessions
 * using text embeddings (TF-IDF with optional AI embedding enhancement).
 *
 * This service:
 * - Indexes conversation content from chat sessions for semantic search
 * - Maintains a TF-IDF index updated as sessions are created/modified
 * - Optionally enhances search with AI embedding vectors when available
 * - Provides a query API that returns ranked conversation matches
 */
export interface IChatSessionEmbeddingsService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the index has been updated (sessions added/removed/modified).
	 */
	readonly onDidUpdateIndex: Event<void>;

	/**
	 * Whether the index has been initialized and is ready for queries.
	 */
	readonly isReady: boolean;

	/**
	 * Number of sessions currently indexed.
	 */
	readonly indexedSessionCount: number;

	/**
	 * Search past conversation sessions using a natural language query.
	 * Returns results sorted by relevance score (highest first).
	 *
	 * @param query The search query string
	 * @param maxResults Maximum number of results to return (default: 10)
	 * @param token Cancellation token
	 */
	search(query: string, maxResults: number, token: CancellationToken): Promise<IChatSessionSearchResult[]>;

	/**
	 * Rebuild the full index from scratch. This loads all available sessions
	 * and re-indexes them. Use sparingly as it can be expensive.
	 */
	rebuildIndex(): Promise<void>;

	/**
	 * Index a single session by its resource URI. If already indexed,
	 * the entry will be updated.
	 */
	indexSession(sessionResource: URI): Promise<void>;

	/**
	 * Remove a session from the index.
	 */
	removeSession(sessionResource: URI): void;

	/**
	 * Get indexed search text for a session, if available.
	 * This can be used by views that want to support content-aware filtering.
	 */
	getSearchText(sessionResource: URI): string | undefined;
}
