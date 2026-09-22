/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

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
	readonly installation?: CustomizationMarketplaceInstallation;
}

export interface ICustomizationMarketplaceResource extends ICustomizationMarketplaceEntry {
	readonly sourceId: string;
}

/** Identifiers and versions are opaque and only unique within their source. */
export function getCustomizationMarketplaceResourceKey(resource: ICustomizationMarketplaceResource): string {
	return JSON.stringify([resource.sourceId, resource.identifier, resource.version ?? null]);
}

interface ICustomizationMarketplaceSourceCursor {
	readonly id: string;
	/** An absent cursor means this source is exhausted. */
	readonly cursor?: string;
	readonly total?: number;
}

export interface ICustomizationMarketplaceCursor {
	readonly query: string;
	readonly mediaType?: CustomizationMarketplaceMediaType;
	readonly pageSize: number;
	readonly sources: readonly ICustomizationMarketplaceSourceCursor[];
}

export interface ICustomizationMarketplaceQuery {
	readonly query?: string;
	readonly mediaType?: CustomizationMarketplaceMediaType;
	/** Maximum number of entries to request from each source. */
	readonly pageSize?: number;
	/** Continue with the same query, media type, page size, and registered sources. */
	readonly cursor?: ICustomizationMarketplaceCursor;
}

export interface ICustomizationMarketplaceRequest extends ICustomizationMarketplaceQuery {
	readonly sourceIds: readonly string[];
}

export interface ICustomizationMarketplacePage {
	readonly items: readonly ICustomizationMarketplaceResource[];
	readonly total?: number;
	readonly nextCursor?: ICustomizationMarketplaceCursor;
}

export interface ICustomizationMarketplaceSourceQuery extends Omit<ICustomizationMarketplaceQuery, 'cursor'> {
	readonly cursor?: string;
}

export interface ICustomizationMarketplaceSourcePage {
	readonly items: readonly ICustomizationMarketplaceEntry[];
	readonly total?: number;
	readonly nextCursor?: string;
}

/** Owns transport, response validation, and normalization, including any installation provenance. */
export interface ICustomizationMarketplaceProvider {
	query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage>;
}

export interface ICustomizationMarketplaceSource extends ICustomizationMarketplaceProvider {
	readonly id: string;
}

export interface ICustomizationMarketplaceSourceInfo {
	readonly id: string;
	readonly enablementSetting: string;
}

export function createLazyCustomizationMarketplaceSource(id: string, createProvider: () => ICustomizationMarketplaceProvider): ICustomizationMarketplaceSource {
	const provider = new Lazy(createProvider);
	return {
		id,
		query: async (options, token) => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return provider.value.query(options, token);
		},
	};
}

export const ICustomizationMarketplaceService = createDecorator<ICustomizationMarketplaceService>('customizationMarketplaceService');

export interface ICustomizationMarketplaceService {
	readonly _serviceBrand: undefined;
	readonly sources: readonly ICustomizationMarketplaceSourceInfo[];
	query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage>;
}

export interface ICustomizationMarketplaceQueryService {
	query(options: ICustomizationMarketplaceRequest, token: CancellationToken): Promise<ICustomizationMarketplacePage>;
}

export class CustomizationMarketplaceService implements ICustomizationMarketplaceQueryService {

	constructor(private readonly sources: readonly ICustomizationMarketplaceSource[]) {
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
		const requestedPageSize = options.pageSize ?? 30;
		if (sources.length !== options.sourceIds.length || query.length > 4096 || !Number.isSafeInteger(requestedPageSize) || requestedPageSize <= 0 ||
			(options.mediaType !== undefined && !Object.values(CustomizationMarketplaceMediaType).includes(options.mediaType))) {
			throw new Error(localize('customizationMarketplace.invalidQuery', "The marketplace query is invalid."));
		}
		const pageSize = Math.min(requestedPageSize, 100);
		const cursor = options.cursor;
		if (cursor && (cursor.query !== query || cursor.mediaType !== options.mediaType || cursor.pageSize !== pageSize ||
			cursor.sources.length !== sources.length || cursor.sources.some((source, index) => source.id !== sources[index].id))) {
			throw new Error(localize('customizationMarketplace.invalidCursor', "The marketplace page is invalid. Start a new search."));
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		try {
			const pages = await raceCancellationError(Promise.all(sources.map((source, index): ICustomizationMarketplaceSourcePage | Promise<ICustomizationMarketplaceSourcePage> => {
				const previous = cursor?.sources[index];
				return previous && previous.cursor === undefined
					? { items: [], total: previous.total }
					: source.query({ query, mediaType: options.mediaType, pageSize, cursor: previous?.cursor }, cancellation.token);
			})), cancellation.token);
			const cursors = pages.map((page, index) => ({
				id: sources[index].id,
				cursor: page.nextCursor,
				total: page.total,
			}));
			return {
				items: pages.flatMap((page, index) => page.items.map(item => ({ ...item, sourceId: sources[index].id }))),
				total: pages.every(page => page.total !== undefined) ? pages.reduce((total, page) => total + page.total!, 0) : undefined,
				nextCursor: cursors.some(source => source.cursor !== undefined) ? { query, mediaType: options.mediaType, pageSize, sources: cursors } : undefined,
			};
		} finally {
			cancellation.cancel();
			store.dispose();
		}
	}
}
