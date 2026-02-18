/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { normalizeTfIdfScores, TfIdfCalculator, TfIdfDocument } from '../../../../base/common/tfIdf.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService, IChatDetail } from '../common/chatService/chatService.js';
import { IChatSessionEmbeddingsService, IChatSessionSearchResult } from '../common/chatSessionEmbeddingsService.js';
import { IAiEmbeddingVectorService } from '../../../services/aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { chatSessionResourceToId } from '../common/model/chatUri.js';

export class ChatSessionEmbeddingsService extends Disposable implements IChatSessionEmbeddingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidUpdateIndex = this._register(new Emitter<void>());
	readonly onDidUpdateIndex: Event<void> = this._onDidUpdateIndex.event;

	private readonly _tfIdfCalculator = new TfIdfCalculator();

	/**
	 * Map from session resource URI string to indexed metadata.
	 */
	private readonly _indexedSessions = new Map<string, {
		title: string;
		lastMessageDate: number;
		textChunks: string[];
	}>();
	private readonly _indexedSessionTextById = new Map<string, string>();

	private _isReady = false;
	private _initPromise: Promise<void> | undefined;

	get isReady(): boolean { return this._isReady; }
	get indexedSessionCount(): number { return this._indexedSessions.size; }

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IAiEmbeddingVectorService private readonly aiEmbeddingVectorService: IAiEmbeddingVectorService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Listen for session disposal to remove from index
		this._register(this.chatService.onDidDisposeSession(e => {
			if (e.reason === 'cleared') {
				for (const sessionResource of e.sessionResource) {
					this.removeSession(sessionResource);
				}
			}
		}));

		// Auto-initialize in the background
		this._initPromise = this.rebuildIndex().then(() => {
			this._isReady = true;
			this._initPromise = undefined;
		});
	}

	async search(query: string, maxResults: number = 10, token: CancellationToken): Promise<IChatSessionSearchResult[]> {
		if (!this._isReady && this._initPromise) {
			await this._initPromise;
		}

		if (this._indexedSessions.size === 0 || !query.trim()) {
			return [];
		}

		// Try AI embeddings first if available, fall back to TF-IDF
		const useAiEmbeddings = this.aiEmbeddingVectorService.isEnabled();
		if (useAiEmbeddings) {
			try {
				return await this._searchWithAiEmbeddings(query, maxResults, token);
			} catch (e) {
				this.logService.trace('[ChatSessionEmbeddingsService] AI embedding search failed, falling back to TF-IDF:', e);
			}
		}

		const results = this._searchWithTfIdf(query, maxResults, token);
		this.logService.info(`[ChatSessionEmbeddingsService] Search for "${query}": ${results.length} results from ${this._indexedSessions.size} indexed sessions`);
		return results;
	}

	private _searchWithTfIdf(query: string, maxResults: number, token: CancellationToken): IChatSessionSearchResult[] {
		const rawScores = this._tfIdfCalculator.calculateScores(query, token);
		if (rawScores.length === 0) {
			return [];
		}

		const normalizedScores = normalizeTfIdfScores(rawScores);

		// Deduplicate by session (TF-IDF returns per-chunk scores, take max per session)
		const sessionScores = new Map<string, { score: number; matchSnippet: string }>();
		for (const result of normalizedScores) {
			if (result.score < 0.1) {
				continue; // Filter low-quality matches
			}
			const existing = sessionScores.get(result.key);
			if (!existing || result.score > existing.score) {
				const meta = this._indexedSessions.get(result.key);
				const matchSnippet = meta?.textChunks[0]?.substring(0, 200) ?? '';
				sessionScores.set(result.key, { score: result.score, matchSnippet });
			}
		}

		// Build results
		const results: IChatSessionSearchResult[] = [];
		for (const [key, { score, matchSnippet }] of sessionScores) {
			const meta = this._indexedSessions.get(key);
			if (!meta) {
				continue;
			}

			results.push({
				sessionResource: URI.parse(key),
				title: meta.title,
				score,
				matchSnippet,
				lastMessageDate: meta.lastMessageDate,
			});
		}

		// Sort by score descending, then by date descending
		results.sort((a, b) => b.score - a.score || b.lastMessageDate - a.lastMessageDate);

		return results.slice(0, maxResults);
	}

	private async _searchWithAiEmbeddings(query: string, maxResults: number, token: CancellationToken): Promise<IChatSessionSearchResult[]> {
		// Collect all session texts for embedding comparison
		const sessionKeys: string[] = [];
		const sessionTexts: string[] = [];

		for (const [key, meta] of this._indexedSessions) {
			sessionKeys.push(key);
			// Combine all chunks into a single text for embedding (limited)
			sessionTexts.push(meta.textChunks.join('\n').substring(0, 2000));
		}

		if (sessionTexts.length === 0) {
			return [];
		}

		// Get embeddings for query and all sessions
		const allTexts = [query, ...sessionTexts];
		const embeddings = await this.aiEmbeddingVectorService.getEmbeddingVector(allTexts, token);
		const queryEmbedding = embeddings[0];

		// Compute cosine similarity
		const results: IChatSessionSearchResult[] = [];
		for (let i = 0; i < sessionKeys.length; i++) {
			const similarity = cosineSimilarity(queryEmbedding, embeddings[i + 1]);
			if (similarity < 0.3) {
				continue;
			}

			const key = sessionKeys[i];
			const meta = this._indexedSessions.get(key);
			if (!meta) {
				continue;
			}

			results.push({
				sessionResource: URI.parse(key),
				title: meta.title,
				score: similarity,
				matchSnippet: meta.textChunks[0]?.substring(0, 200) ?? '',
				lastMessageDate: meta.lastMessageDate,
			});
		}

		results.sort((a, b) => b.score - a.score || b.lastMessageDate - a.lastMessageDate);
		return results.slice(0, maxResults);
	}

	async rebuildIndex(): Promise<void> {
		this.logService.trace('[ChatSessionEmbeddingsService] Rebuilding index...');

		// Clear existing index
		this._indexedSessions.clear();
		this._indexedSessionTextById.clear();

		// Get all sessions (live + history)
		const allItems = await this.chatService.getLocalSessionHistory();

		const documents: TfIdfDocument[] = [];

		this.logService.info(`[ChatSessionEmbeddingsService] Found ${allItems.length} sessions to index`);

		for (const item of allItems) {
			try {
				await this._indexSessionFromDetail(item, documents);
			} catch (e) {
				this.logService.info(`[ChatSessionEmbeddingsService] Failed to index session ${item.sessionResource}: ${e}`);
			}
		}

		// Batch update TF-IDF calculator
		if (documents.length > 0) {
			this._tfIdfCalculator.updateDocuments(documents);
		}

		this.logService.info(`[ChatSessionEmbeddingsService] Index rebuilt with ${this._indexedSessions.size} sessions, ${documents.length} documents`);
		this._onDidUpdateIndex.fire();
	}

	async indexSession(sessionResource: URI): Promise<void> {
		const detail = await this.chatService.getMetadataForSession(sessionResource);
		if (!detail) {
			return;
		}

		const documents: TfIdfDocument[] = [];
		await this._indexSessionFromDetail(detail, documents);

		if (documents.length > 0) {
			this._tfIdfCalculator.updateDocuments(documents);
			this._onDidUpdateIndex.fire();
		}
	}

	private async _indexSessionFromDetail(item: IChatDetail, documents: TfIdfDocument[]): Promise<void> {
		const sessionResource = item.sessionResource;
		const key = sessionResource.toString();

		// Try to get session data for text extraction
		const sessionRef = await this.chatService.getOrRestoreSession(sessionResource);
		if (!sessionRef) {
			this.logService.info(`[ChatSessionEmbeddingsService] Could not restore session: ${sessionResource}`);
			return;
		}

		const disposables = new DisposableStore();
		try {
			const model = sessionRef.object;
			const requests = model.getRequests();

			if (requests.length === 0) {
				return;
			}

			const textChunks: string[] = [];

			// Add title
			if (model.title) {
				textChunks.push(model.title);
			}

			// Build text from each request/response
			for (const request of requests) {
				const parts: string[] = [];

				// User message
				const userMessage = request.message.text || request.message.parts.map(part => part.text).join('');
				if (userMessage) {
					parts.push(userMessage);
				}

				// Response markdown content
				if (request.response?.response) {
					for (const part of request.response.response.value) {
						if (part.kind === 'markdownContent' && part.content.value) {
							parts.push(part.content.value);
						} else if (hasKey(part, { message: true }) && typeof part.message === 'string' && part.message.length > 0) {
							parts.push(part.message);
						} else if (hasKey(part, { content: true })) {
							const candidateContent = part.content as unknown;
							if (typeof candidateContent === 'string' && candidateContent.length > 0) {
								parts.push(candidateContent);
							}
						}
					}
				}

				const chunkText = parts.join('\n');
				if (chunkText.length > 0) {
					textChunks.push(chunkText.substring(0, 5000));
				}
			}

			if (textChunks.length > 0) {
				this._indexedSessions.set(key, {
					title: model.title || localize('untitledSession', "Untitled Session"),
					lastMessageDate: item.lastMessageDate,
					textChunks,
				});

				const sessionId = chatSessionResourceToId(sessionResource);
				this._indexedSessionTextById.set(sessionId, textChunks.join('\n'));
				this.logService.info(`[ChatSessionEmbeddingsService] Indexed session "${model.title || 'Untitled Session'}" with ${textChunks.length} text chunks`);

				documents.push({
					key,
					textChunks,
				});
			}
		} finally {
			disposables.dispose();
			sessionRef.dispose();
		}
	}

	removeSession(sessionResource: URI): void {
		const key = sessionResource.toString();
		if (this._indexedSessions.delete(key)) {
			const sessionId = chatSessionResourceToId(sessionResource);
			this._indexedSessionTextById.delete(sessionId);
			this._tfIdfCalculator.deleteDocument(key);
			this._onDidUpdateIndex.fire();
		}
	}

	getSearchText(sessionResource: URI): string | undefined {
		const entry = this._indexedSessions.get(sessionResource.toString());
		if (!entry) {
			const sessionId = chatSessionResourceToId(sessionResource);
			return this._indexedSessionTextById.get(sessionId);
		}

		return entry.textChunks.join('\n');
	}
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) {
		return 0;
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) {
		return 0;
	}

	return dotProduct / denominator;
}
