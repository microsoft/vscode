/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { LRUCache } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IGalleryMcpServer, IMcpGalleryService, mcpGalleryServiceUrlConfig } from '../../mcp/common/mcpManagement.js';
import { getMcpGalleryServerCardUrl, McpGalleryInvalidCursorError } from '../../mcp/common/mcpGalleryService.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from '../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../product/common/productService.js';
import { createLazyCustomizationMarketplaceProvider, CustomizationMarketplaceIcon, CustomizationMarketplaceMediaType, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourceEntry, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from './customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from './customizationMarketplaceSources.js';

const maxMcpGalleryPageSize = 100;
const fallbackMcpGalleryPageSize = maxMcpGalleryPageSize - 1;
const maxMcpGalleryEmptyPages = 5;
const maxMcpGalleryContinuations = 100;
const mcpGalleryContinuationLifetime = 5 * 60 * 1000;

interface IMcpGalleryMarketplaceContinuation {
	readonly query: string | undefined;
	readonly pageSize: number;
	readonly registryUrl: string;
	readonly buffered: IGalleryMcpServer[];
	readonly seenNames: Set<string>;
	nativePageSize: number;
	nativeCursor: string | undefined;
	hasQueried: boolean;
	recoveryAttempted: boolean;
	total: number | undefined;
	expiresAt: number;
}

function cloneContinuation(continuation: IMcpGalleryMarketplaceContinuation): IMcpGalleryMarketplaceContinuation {
	return {
		...continuation,
		buffered: [...continuation.buffered],
		seenNames: new Set(continuation.seenNames),
	};
}

export function normalizeMcpGalleryUrl(value: string | undefined): string | undefined {
	const normalized = typeof value === 'string' ? value.replace(/\/+$/, '') : undefined;
	return normalized || undefined;
}

function getConfiguredCustomMcpGalleryUrl(configurationService: IConfigurationService, productService: IProductService): string | undefined {
	const configuredUrl = normalizeMcpGalleryUrl(configurationService.getValue<string>(mcpGalleryServiceUrlConfig));
	const productUrl = normalizeMcpGalleryUrl(productService.mcpGallery?.serviceUrl);
	return configuredUrl && configuredUrl !== productUrl ? configuredUrl : undefined;
}

export function getCustomizationMarketplaceSourceInfos(status: McpGalleryManifestStatus): readonly ICustomizationMarketplaceSourceInfo[] {
	return status === McpGalleryManifestStatus.Available ? getAllMcpGalleryMarketplaceSourceInfos() : [];
}

export function getAllMcpGalleryMarketplaceSourceInfos(): readonly ICustomizationMarketplaceSourceInfo[] {
	return [CustomizationMarketplaceSources.McpGallery];
}

export function createMcpGalleryMarketplaceProviders(instantiationService: IInstantiationService): readonly ICustomizationMarketplaceProvider[] {
	return (['custom', 'default'] as const).map(registry => {
		const id = `${CustomizationMarketplaceSources.McpGallery.id}.${registry}`;
		return createLazyCustomizationMarketplaceProvider(
			id,
			() => instantiationService.createInstance(McpGalleryMarketplaceProvider, registry),
			CustomizationMarketplaceSources.McpGallery.id,
		);
	});
}

function safeWebUri(value: string | undefined): URI | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const parsed = new URL(value);
		if ((parsed.protocol !== `${Schemas.https}:` && parsed.protocol !== `${Schemas.http}:`) || parsed.username || parsed.password) {
			return undefined;
		}
		return URI.parse(value);
	} catch {
		return undefined;
	}
}

function toMarketplaceEntry(server: IGalleryMcpServer, registry: 'custom' | 'default', registryUrl: string, manifest: IMcpGalleryManifest): ICustomizationMarketplaceSourceEntry {
	const webUrl = safeWebUri(server.webUrl);
	const repository = safeWebUri(server.repositoryUrl);
	const url = webUrl ?? repository;
	const lightIcon = safeWebUri(server.icon?.light);
	const darkIcon = safeWebUri(server.icon?.dark);
	const publisherUrl = safeWebUri(server.publisherUrl);
	const cardUrl = getMcpGalleryServerCardUrl(server, manifest);
	const icon: CustomizationMarketplaceIcon | undefined = lightIcon && darkIcon
		? { light: lightIcon, dark: darkIcon }
		: lightIcon ?? darkIcon;
	return {
		identifier: `${registry}:${server.name}`,
		displayName: server.displayName || server.name,
		description: server.description,
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		tags: server.topics ?? [],
		capabilities: [],
		representativeQueries: [],
		...(url ? { url, externalUrl: webUrl ? server.webUrl : server.repositoryUrl } : {}),
		...(repository ? { repository } : {}),
		...(icon ? { icon } : {}),
		publisher: server.publisherDisplayName ?? server.publisher,
		...(publisherUrl ? { publisherUrl } : {}),
		version: server.version,
		stars: server.starsCount,
		priority: registry === 'custom' ? 1 : 0,
		installation: { kind: 'mcpGallery', name: server.name, registry, registryUrl, ...(cardUrl ? { cardUrl } : {}) },
	};
}

export class McpGalleryMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id: string;
	readonly sourceId = CustomizationMarketplaceSources.McpGallery.id;
	private readonly continuations = new LRUCache<string, IMcpGalleryMarketplaceContinuation>(maxMcpGalleryContinuations);

	constructor(
		private readonly registry: 'custom' | 'default',
		@IMcpGalleryService private readonly galleryService: IMcpGalleryService,
		@IMcpGalleryManifestService private readonly manifestService: IMcpGalleryManifestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
	) {
		this.id = `${this.sourceId}.${registry}`;
	}

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (options.mediaType && options.mediaType !== CustomizationMarketplaceMediaType.McpServer) {
			return { items: [] };
		}
		const configuredUrl = getConfiguredCustomMcpGalleryUrl(this.configurationService, this.productService);
		const manifest = this.registry === 'default'
			? this.productService.mcpGallery
				? await this.manifestService.getDefaultMcpGalleryManifest()
				: configuredUrl ? null : await this.manifestService.getMcpGalleryManifest()
			: configuredUrl ? await this.manifestService.getMcpGalleryManifest() : null;
		const registryUrl = normalizeMcpGalleryUrl(manifest?.url);
		if (this.registry === 'custom' && configuredUrl && registryUrl !== configuredUrl) {
			throw new Error(localize('mcpGalleryRegistryChanging', "The configured MCP gallery is changing. Try again."));
		}
		if (!manifest || !registryUrl) {
			return { items: [], total: 0 };
		}
		const pageSize = options.pageSize ?? 30;
		const now = Date.now();
		for (const [key, continuation] of [...this.continuations]) {
			if (continuation.expiresAt <= now) {
				this.continuations.delete(key);
			}
		}
		const continuation = options.cursor ? this.continuations.get(options.cursor) : undefined;
		if (options.cursor && (!continuation || continuation.query !== options.query || continuation.pageSize !== pageSize || continuation.registryUrl !== registryUrl)) {
			throw new Error(localize('mcpGalleryInvalidPage', "The MCP gallery page is invalid. Start a new search."));
		}
		const state = continuation ? cloneContinuation(continuation) : {
			query: options.query,
			pageSize,
			registryUrl,
			buffered: [],
			seenNames: new Set<string>(),
			nativePageSize: maxMcpGalleryPageSize,
			nativeCursor: undefined,
			hasQueried: false,
			recoveryAttempted: false,
			total: undefined,
			expiresAt: now + mcpGalleryContinuationLifetime,
		};

		let cursorError: string | undefined;
		let emptyPageCount = 0;
		let recoveryPageCount = 0;
		let maxRecoveryPages = 0;
		while (state.buffered.length < pageSize && (!state.hasQueried || state.nativeCursor)) {
			if (state.recoveryAttempted && recoveryPageCount++ >= maxRecoveryPages) {
				throw new Error(localize('mcpGalleryRecoveryPages', "The MCP gallery could not recover its pagination cursor. Try the search again."));
			}
			if (!state.recoveryAttempted && emptyPageCount >= maxMcpGalleryEmptyPages) {
				throw new Error(localize('mcpGalleryEmptyPages', "The MCP gallery returned too many empty pages. Try the search again."));
			}
			const nativeCursor = state.nativeCursor;
			try {
				const page = await this.galleryService.queryPage({
					text: state.query,
					pageSize: state.nativePageSize,
					cursor: nativeCursor,
				}, token, manifest);
				const seenCount = state.seenNames.size;
				state.hasQueried = true;
				state.nativeCursor = page.nextCursor;
				state.total = page.total;
				for (const server of page.items) {
					if (!state.seenNames.has(server.name)) {
						state.seenNames.add(server.name);
						state.buffered.push(server);
					}
				}
				if (!state.recoveryAttempted) {
					emptyPageCount = state.seenNames.size === seenCount ? emptyPageCount + 1 : 0;
				}
				if (page.nextCursor && page.nextCursor === nativeCursor) {
					throw new Error(localize('mcpGalleryRepeatedCursor', "The MCP gallery returned the same pagination cursor. Try the search again."));
				}
			} catch (error) {
				if (!(error instanceof McpGalleryInvalidCursorError)) {
					throw error;
				}
				if (!state.recoveryAttempted) {
					state.recoveryAttempted = true;
					maxRecoveryPages = Math.ceil(state.seenNames.size / fallbackMcpGalleryPageSize) + maxMcpGalleryEmptyPages;
					state.nativePageSize = fallbackMcpGalleryPageSize;
					state.nativeCursor = undefined;
					state.hasQueried = false;
					continue;
				}
				state.nativeCursor = undefined;
				cursorError = error.message;
				break;
			}
		}

		const servers = state.buffered.splice(0, pageSize);
		let nextCursor: string | undefined;
		if (!cursorError && (state.buffered.length || state.nativeCursor)) {
			nextCursor = generateUuid();
			state.expiresAt = Date.now() + mcpGalleryContinuationLifetime;
			this.continuations.set(nextCursor, state);
		}
		return {
			items: servers.map(server => toMarketplaceEntry(server, this.registry, registryUrl, manifest)),
			total: cursorError ? undefined : state.total,
			nextCursor,
			...(cursorError ? { error: cursorError } : {}),
		};
	}
}
