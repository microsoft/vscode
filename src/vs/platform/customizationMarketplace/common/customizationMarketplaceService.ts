/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { LRUCache } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

const maxContinuations = 32;
const defaultPageSize = 30;
const maxPageSize = 100;
const maxQueryLength = 4096;
const maxRelevanceScore = 100;
const continuationLifetimeMs = 30 * 60_000;

export const CustomizationMarketplaceMediaType = {
	Skill: 'application/ai-skill',
	McpServer: 'application/mcp-server+json',
	ClaudePlugin: 'application/vnd.anthropic.claude-plugin+json',
	CopilotPlugin: 'application/vnd.github.copilot-plugin',
	CursorPlugin: 'application/vnd.cursor.cursor-plugin+json',
} as const;

export type CustomizationMarketplaceMediaType = typeof CustomizationMarketplaceMediaType[keyof typeof CustomizationMarketplaceMediaType];

/** Source-validated installation provenance; repository paths name the resource directory, not its manifest. */
export type CustomizationMarketplaceInstallation =
	| { readonly kind: 'skill' | 'plugin'; readonly repository: string; readonly ref: string; readonly path: string }
	| { readonly kind: 'mcp'; readonly name: string };

export interface ICustomizationMarketplaceEntry {
	readonly identifier: string;
	readonly displayName: string;
	readonly description: string;
	readonly mediaType: string;
	readonly tags: readonly string[];
	readonly capabilities: readonly string[];
	readonly representativeQueries: readonly string[];
	readonly url?: URI;
	/** Validated original URL for external opening, preserving escaped path separators. */
	readonly externalUrl?: string;
	readonly repository?: URI;
	readonly icon?: URI;
	readonly publisher?: string;
	readonly version?: string;
	readonly stars?: number;
	/** Source-assigned relevance from 0 to 100, not a quality or trust rating. Unscored search results rank as 0. */
	readonly score?: number;
	readonly installation?: CustomizationMarketplaceInstallation;
}

export interface ICustomizationMarketplaceResource extends ICustomizationMarketplaceEntry {
	readonly sourceId: string;
}

/** Identifiers and versions are opaque and only unique within their source. */
export function getCustomizationMarketplaceResourceKey(resource: ICustomizationMarketplaceResource): string {
	return JSON.stringify([resource.sourceId, resource.identifier, resource.version ?? null]);
}

/** Opaque, short-lived continuation owned by the marketplace that issued it. */
export interface ICustomizationMarketplaceCursor {
	readonly token: string;
}

export interface ICustomizationMarketplaceQuery {
	readonly query?: string;
	readonly mediaType?: CustomizationMarketplaceMediaType;
	/** Limit the query to the listed registered sources. An absent value queries every source. */
	readonly sourceIds?: readonly string[];
	/** Maximum number of entries in the combined page. */
	readonly pageSize?: number;
	/** Continue with the same query, media type, page size, and selected sources. */
	readonly cursor?: ICustomizationMarketplaceCursor;
}

export interface ICustomizationMarketplaceRequest extends ICustomizationMarketplaceQuery {
	readonly sourceIds: readonly string[];
}

export interface ICustomizationMarketplacePage {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly total?: number;
	readonly nextCursor?: ICustomizationMarketplaceCursor;
	/** Failed sources remain suspended throughout this continuation. Retry starts a new combined query. */
	readonly sourceErrors?: readonly ICustomizationMarketplaceSourceError[];
}

export interface ICustomizationMarketplaceSourceError {
	readonly sourceId: string;
	readonly message: string;
}

export interface ICustomizationMarketplaceSourceQuery extends Omit<ICustomizationMarketplaceQuery, 'cursor' | 'sourceIds'> {
	/** Maximum number of entries in a native source page; unchanged throughout pagination. */
	readonly pageSize?: number;
	readonly cursor?: string;
}

export interface ICustomizationMarketplaceSourcePage {
	/** Search results must be in descending score order across all pages, treating absent scores as zero. */
	readonly items: readonly ICustomizationMarketplaceEntry[];
	readonly total?: number;
	readonly nextCursor?: string;
	/** A failure after fetching these items. Preserve them, but do not continue this source until a new query. */
	readonly error?: string;
}

/** A feed with a stable ID that owns transport, response validation, and installation provenance. */
export interface ICustomizationMarketplaceProvider {
	readonly id: string;
	query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage>;
}

export interface ICustomizationMarketplaceSourceInfo {
	readonly id: string;
	readonly displayName?: string;
	readonly enablementSetting: string;
}

export interface ICustomizationMarketplaceSourceRecoveryAction {
	readonly label: string;
	readonly kind?: 'signIn';
	run(token: CancellationToken): Promise<void>;
}

export function createLazyCustomizationMarketplaceProvider(id: string, createProvider: () => ICustomizationMarketplaceProvider): ICustomizationMarketplaceProvider {
	const provider = new Lazy(createProvider);
	return {
		id,
		query: async (options, token) => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const instance = provider.value;
			if (instance.id !== id) {
				throw new Error(`Marketplace provider '${id}' has an unexpected identifier '${instance.id}'.`);
			}
			return instance.query(options, token);
		},
	};
}

export const ICustomizationMarketplaceService = createDecorator<ICustomizationMarketplaceService>('customizationMarketplaceService');

export interface ICustomizationMarketplaceService {
	readonly _serviceBrand: undefined;
	readonly sources: readonly ICustomizationMarketplaceSourceInfo[];
	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage>;
	/** Optional renderer-owned recovery; not part of the catalog transport. */
	getSourceRecoveryAction?(sourceId: string): ICustomizationMarketplaceSourceRecoveryAction | undefined;
}

export interface ICustomizationMarketplaceQueryService {
	query(options: ICustomizationMarketplaceRequest, token: CancellationToken): Promise<ICustomizationMarketplacePage>;
}

interface IMarketplaceSourceState {
	cursor?: string;
	total?: number;
	items: ICustomizationMarketplaceEntry[];
	error?: string;
	exhausted: boolean;
	lastScore: number;
}

interface IMarketplaceContinuation {
	readonly query: string;
	readonly mediaType?: CustomizationMarketplaceMediaType;
	readonly pageSize: number;
	readonly sourceIds: readonly string[];
	readonly states: readonly IMarketplaceSourceState[];
	readonly nextSourceIndex: number;
	readonly expiresAt: number;
}

export class CustomizationMarketplaceService implements ICustomizationMarketplaceQueryService {

	private readonly continuations = new LRUCache<string, IMarketplaceContinuation>(maxContinuations);

	constructor(private readonly sources: readonly ICustomizationMarketplaceProvider[]) {
		if (sources.some(source => !source.id) || new Set(sources.map(source => source.id)).size !== sources.length) {
			throw new Error('Marketplace sources must have unique, nonempty identifiers.');
		}
	}

	async query(options: ICustomizationMarketplaceRequest, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		if (token.isCancellationRequested || options.sourceIds.length === 0) {
			throw new CancellationError();
		}
		const sources = this.sources.filter(source => options.sourceIds.includes(source.id));
		const query = options.query?.trim() ?? '';
		const requestedPageSize = options.pageSize ?? defaultPageSize;
		if (sources.length !== options.sourceIds.length || query.length > maxQueryLength || !Number.isSafeInteger(requestedPageSize) || requestedPageSize <= 0 ||
			(options.mediaType !== undefined && !Object.values(CustomizationMarketplaceMediaType).includes(options.mediaType))) {
			throw new Error(localize('customizationMarketplace.invalidQuery', "The marketplace query is invalid."));
		}
		const pageSize = Math.min(requestedPageSize, maxPageSize);
		for (const [key, value] of [...this.continuations]) {
			if (value.expiresAt <= Date.now()) {
				this.continuations.delete(key);
			}
		}
		const continuation = options.cursor && this.continuations.get(options.cursor.token);
		if (options.cursor && (!continuation || continuation.query !== query || continuation.mediaType !== options.mediaType || continuation.pageSize !== pageSize ||
			continuation.sourceIds.length !== sources.length || continuation.sourceIds.some((id, index) => id !== sources[index].id))) {
			throw new Error(localize('customizationMarketplace.invalidCursor', "The marketplace page is invalid. Start a new search."));
		}
		const states: IMarketplaceSourceState[] = continuation
			? continuation.states.map(state => ({ ...state, items: [...state.items] }))
			: sources.map(() => ({ items: [], exhausted: false, lastScore: maxRelevanceScore }));
		let nextSourceIndex = continuation?.nextSourceIndex ?? 0;
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		try {
			const items: ICustomizationMarketplaceResource[] = [];
			while (items.length < pageSize) {
				await raceCancellationError(Promise.all(states.map(async (state, index) => {
					if (state.items.length || state.exhausted) {
						return;
					}
					let page: ICustomizationMarketplaceSourcePage;
					try {
						page = await sources[index].query({ query, mediaType: options.mediaType, pageSize, cursor: state.cursor }, cancellation.token);
					} catch (error) {
						if (isCancellationError(error) || cancellation.token.isCancellationRequested) {
							throw new CancellationError();
						}
						state.error = getErrorMessage(error);
						state.exhausted = true;
						return;
					}
					if (page.items.length > pageSize ||
						(page.total !== undefined && (!Number.isSafeInteger(page.total) || page.total < page.items.length)) ||
						(page.nextCursor !== undefined && (!page.nextCursor || page.nextCursor === state.cursor || !page.items.length))) {
						throw new Error(localize('customizationMarketplace.invalidSourcePage', "The marketplace source '{0}' returned an invalid page.", sources[index].id));
					}
					let lastScore = state.lastScore;
					for (const item of page.items) {
						const score = item.score ?? 0;
						if ((item.score !== undefined && !Number.isFinite(item.score)) || score < 0 || score > maxRelevanceScore || (query && score > lastScore)) {
							throw new Error(localize('customizationMarketplace.invalidSourceScore', "The marketplace source '{0}' returned invalid relevance ordering.", sources[index].id));
						}
						lastScore = score;
					}
					state.items = [...page.items];
					state.cursor = page.nextCursor;
					state.total = page.total;
					state.error = page.error;
					state.exhausted = page.error !== undefined || page.nextCursor === undefined;
					state.lastScore = lastScore;
				})), cancellation.token);

				let selected = -1;
				for (let offset = 0; offset < states.length; offset++) {
					const index = ((query ? 0 : nextSourceIndex) + offset) % states.length;
					if (states[index].items.length && (selected < 0 ||
						(query && (states[index].items[0].score ?? 0) > (states[selected].items[0].score ?? 0)))) {
						selected = index;
					}
				}
				if (selected < 0) {
					break;
				}
				items.push({ ...states[selected].items.shift()!, sourceId: sources[selected].id });
				nextSourceIndex = (selected + 1) % states.length;
			}
			let nextCursor: ICustomizationMarketplaceCursor | undefined;
			if (states.some(state => state.items.length || !state.exhausted)) {
				nextCursor = { token: generateUuid() };
				this.continuations.set(nextCursor.token, {
					query, mediaType: options.mediaType, pageSize, sourceIds: sources.map(source => source.id),
					states, nextSourceIndex, expiresAt: Date.now() + continuationLifetimeMs,
				});
			}
			const sourceErrors = states.flatMap((state, index) => state.error === undefined ? [] : [{ sourceId: sources[index].id, message: state.error }]);
			return {
				items,
				total: !sourceErrors.length && states.every(state => state.total !== undefined) ? states.reduce((total, state) => total + state.total!, 0) : undefined,
				nextCursor,
				...(sourceErrors.length ? { sourceErrors } : {}),
			};
		} finally {
			cancellation.cancel();
			store.dispose();
		}
	}
}
