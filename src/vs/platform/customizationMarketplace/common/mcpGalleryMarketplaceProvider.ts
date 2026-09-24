/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IGalleryMcpServer, IMcpGalleryService, mcpGalleryServiceUrlConfig } from '../../mcp/common/mcpManagement.js';
import { IMcpGalleryManifestService } from '../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../product/common/productService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourceEntry, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from './customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from './customizationMarketplaceSources.js';

export function normalizeMcpGalleryUrl(value: string | undefined): string | undefined {
	const normalized = typeof value === 'string' ? value.replace(/\/+$/, '') : undefined;
	return normalized || undefined;
}

function getConfiguredCustomMcpGalleryUrl(configurationService: IConfigurationService, productService: IProductService): string | undefined {
	const configuredUrl = normalizeMcpGalleryUrl(configurationService.getValue<string>(mcpGalleryServiceUrlConfig));
	const productUrl = normalizeMcpGalleryUrl(productService.mcpGallery?.serviceUrl);
	return configuredUrl && configuredUrl !== productUrl ? configuredUrl : undefined;
}

export function getCustomizationMarketplaceSourceInfos(configurationService: IConfigurationService, productService: IProductService): readonly ICustomizationMarketplaceSourceInfo[] {
	const sources: readonly ICustomizationMarketplaceSourceInfo[] = Object.values(CustomizationMarketplaceSources);
	return getConfiguredCustomMcpGalleryUrl(configurationService, productService)
		? sources
		: sources.filter(source => source.id !== CustomizationMarketplaceSources.McpGallery.id);
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

function toMarketplaceEntry(server: IGalleryMcpServer, registry: 'custom' | 'default', registryUrl: string): ICustomizationMarketplaceSourceEntry {
	const webUrl = safeWebUri(server.webUrl);
	const repository = safeWebUri(server.repositoryUrl);
	const url = webUrl ?? repository;
	const icon = safeWebUri(server.icon?.light);
	return {
		identifier: server.name,
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
		version: server.version,
		stars: server.starsCount,
		priority: registry === 'custom' ? 1 : 0,
		installation: { kind: 'mcpGallery', name: server.name, registry, registryUrl },
	};
}

export class McpGalleryMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id: string;

	constructor(
		private readonly registry: 'custom' | 'default',
		@IMcpGalleryService private readonly galleryService: IMcpGalleryService,
		@IMcpGalleryManifestService private readonly manifestService: IMcpGalleryManifestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
	) {
		this.id = registry === 'custom' ? CustomizationMarketplaceSources.McpGallery.id : CustomizationMarketplaceSources.McpGalleryDefault.id;
	}

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (options.mediaType && options.mediaType !== CustomizationMarketplaceMediaType.McpServer) {
			return { items: [] };
		}
		const configuredUrl = getConfiguredCustomMcpGalleryUrl(this.configurationService, this.productService);
		const manifest = this.registry === 'default'
			? await this.manifestService.getDefaultMcpGalleryManifest()
			: configuredUrl ? await this.manifestService.getMcpGalleryManifest() : null;
		const registryUrl = normalizeMcpGalleryUrl(manifest?.url);
		if (this.registry === 'custom' && configuredUrl && registryUrl !== configuredUrl) {
			throw new Error(localize('mcpGalleryRegistryChanging', "The configured MCP gallery is changing. Try again."));
		}
		if (!manifest || !registryUrl) {
			return { items: [] };
		}
		let cursor = options.cursor;
		for (let attempt = 0; attempt < 5; attempt++) {
			const page = await this.galleryService.queryPage({
				text: options.query,
				pageSize: options.pageSize ?? 30,
				cursor,
			}, token, manifest);
			if (page.items.length || !page.nextCursor) {
				return {
					items: page.items.map(server => toMarketplaceEntry(server, this.registry, registryUrl)),
					total: page.total,
					nextCursor: page.nextCursor,
				};
			}
			if (page.nextCursor === cursor) {
				break;
			}
			cursor = page.nextCursor;
		}
		throw new Error(localize('mcpGalleryEmptyPages', "The MCP gallery returned too many empty pages. Try the search again."));
	}
}
