/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionEmbeddingModel, ISessionSemanticMatch, MAX_SESSION_EMBEDDING_DIMENSIONS } from '../../../../../../platform/agentHost/common/sessionSemanticSearch.js';
import { IEmbeddingsService } from '../../../../../services/embeddings/common/embeddingsService.js';

export interface ISemanticSessionSearchOptions {
	readonly providerId: string;
	readonly embeddingsService: IEmbeddingsService;
}

/** Consent is owned by one open picker, never by a workspace or a provider. */
export class SemanticSessionSearchConsent extends Disposable {
	private readonly pending = this._register(new MutableDisposable<CancellationTokenSource>());
	private options: ISemanticSessionSearchOptions | undefined;

	get approved(): ISemanticSessionSearchOptions | undefined {
		return this.options;
	}

	async enable(
		embeddingsService: IEmbeddingsService,
		select: (providers: readonly string[], token: CancellationToken) => Promise<string | undefined>,
		confirm: (provider: string, token: CancellationToken) => Promise<boolean>,
	): Promise<'enabled' | 'cancelled' | 'unavailable'> {
		this.revoke();
		const source = new CancellationTokenSource();
		this.pending.value = source;
		const token = source.token;
		try {
			const providers = [...embeddingsService.allProviders].filter(id => id.startsWith('copilot.'));
			if (!providers.length) {
				return 'unavailable';
			}
			const providerId = await select(providers, token);
			if (token.isCancellationRequested || !providerId || !providers.includes(providerId)) {
				return 'cancelled';
			}
			if (!await confirm(providerId, token) || token.isCancellationRequested) {
				return 'cancelled';
			}
			if (![...embeddingsService.allProviders].includes(providerId)) {
				return 'unavailable';
			}
			this.options = { providerId, embeddingsService };
			return 'enabled';
		} finally {
			if (this.pending.value === source) {
				this.pending.clear();
			}
		}
	}

	cancelPending(): void {
		this.pending.value?.cancel();
		this.pending.clear();
	}

	revoke(): void {
		this.options = undefined;
		this.cancelPending();
	}

	override dispose(): void {
		this.revoke();
		super.dispose();
	}
}

const embeddingRequests = new Limiter<{ values: number[] }[]>(2);

export const MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS = 2048;

/** One instance per query generation shares its query vector across all session workers. */
export class SemanticSessionSearch {
	private queryEmbedding: Promise<{ model: ISessionEmbeddingModel; vector: readonly number[] }> | undefined;
	private documentChunks = 0;
	private exhausted = false;

	get documentChunksUsed(): number {
		return this.documentChunks;
	}

	get budgetExhausted(): boolean {
		return this.exhausted;
	}

	constructor(
		private readonly query: string,
		private readonly options: ISemanticSessionSearchOptions,
		private readonly token: CancellationToken,
	) { }

	private checkCancellation(): void {
		if (this.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	private async embed(input: string[], dimensions?: number): Promise<{ values: number[] }[]> {
		this.checkCancellation();
		const result = await raceCancellationError(embeddingRequests.queue(async () => {
			this.checkCancellation();
			if (!this.options.providerId.startsWith('copilot.') || ![...this.options.embeddingsService.allProviders].includes(this.options.providerId)) {
				throw new Error('Semantic embeddings provider unavailable');
			}
			return this.options.embeddingsService.computeEmbeddings(this.options.providerId, input, this.token);
		}), this.token);
		this.checkCancellation();
		if (result.length !== input.length || result.some(embedding => !embedding.values.length
			|| embedding.values.length > MAX_SESSION_EMBEDDING_DIMENSIONS || !embedding.values.some(value => value !== 0)
			|| (dimensions !== undefined && embedding.values.length !== dimensions)
			|| embedding.values.some(value => !Number.isFinite(value)))) {
			throw new Error('Invalid semantic embeddings');
		}
		return result;
	}

	private getQueryEmbedding(): Promise<{ model: ISessionEmbeddingModel; vector: readonly number[] }> {
		return this.queryEmbedding ??= this.embed([this.query]).then(([embedding]) => ({
			model: { id: this.options.providerId, dimensions: embedding.values.length },
			vector: embedding.values,
		}));
	}

	async search(connection: IAgentConnection, session: URI): Promise<{ matches: readonly ISessionSemanticMatch[]; hasMore: boolean; incomplete: boolean }> {
		this.checkCancellation();
		if (!connection.sessionSemanticSearch || !connection.supportsSessionSemanticSearch || !await connection.supportsSessionSemanticSearch()) {
			throw new Error('Semantic session search unavailable');
		}
		this.checkCancellation();
		const { model, vector } = await this.getQueryEmbedding();
		let incomplete = false;
		for (let batch = 0; batch < 32; batch++) {
			this.checkCancellation();
			const pending = await connection.sessionSemanticSearch(session, { kind: 'pending', model });
			this.checkCancellation();
			if (pending.kind !== 'pending') {
				throw new Error('Invalid pending embeddings result');
			}
			if (!pending.chunks.length) {
				incomplete = pending.hasMore;
				break;
			}
			const remaining = MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS - this.documentChunks;
			const chunks = pending.chunks.slice(0, remaining);
			const partial = chunks.length < pending.chunks.length;
			if (partial) {
				this.exhausted = true;
			}
			if (!chunks.length) {
				incomplete = true;
				break;
			}
			// Reserve the shared budget before awaiting other session workers.
			this.documentChunks += chunks.length;
			const embeddings = await this.embed(chunks.map(chunk => chunk.text), model.dimensions);
			this.checkCancellation();
			const stored = await connection.sessionSemanticSearch(session, {
				kind: 'store', model,
				values: chunks.map((chunk, index) => ({ id: chunk.id, contentHash: chunk.contentHash, vector: embeddings[index].values })),
			});
			this.checkCancellation();
			if (stored.kind !== 'store') {
				throw new Error('Invalid stored embeddings result');
			}
			incomplete = pending.hasMore || partial;
			if (!pending.hasMore || partial) {
				break;
			}
		}
		this.exhausted ||= incomplete && this.documentChunks === MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS;
		this.checkCancellation();
		const result = await connection.sessionSemanticSearch(session, { kind: 'search', model, vector });
		this.checkCancellation();
		if (result.kind !== 'search') {
			throw new Error('Invalid semantic search result');
		}
		return { matches: result.matches.filter(match => Number.isFinite(match.score)), hasMore: result.hasMore, incomplete: incomplete || result.incomplete };
	}
}

export type SessionSearchMatchSource = 'keyword' | 'semantic' | 'both';

/** Reciprocal rank fusion uses ranks, not incomparable lexical and vector scores. */
export function mergeSessionSearchResults<T>(keyword: readonly T[], semantic: readonly T[], key: (item: T) => string): { item: T; source: SessionSearchMatchSource }[] {
	const results = new Map<string, { item: T; source: SessionSearchMatchSource; rank: number }>();
	for (const [items, source] of [[keyword, 'keyword'], [semantic, 'semantic']] as const) {
		const seen = new Set<string>();
		let position = 0;
		for (const item of items) {
			const id = key(item);
			if (seen.has(id)) {
				continue;
			}
			seen.add(id);
			const rank = 1 / (60 + ++position);
			const existing = results.get(id);
			if (existing) {
				existing.rank += rank;
				existing.source = 'both';
			} else {
				results.set(id, { item, source, rank });
			}
		}
	}
	return [...results.values()].sort((a, b) => b.rank - a.rank).map(({ item, source }) => ({ item, source }));
}
