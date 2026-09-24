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
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry, ICustomizationMarketplaceProvider, ICustomizationMarketplaceSourcePage, ICustomizationMarketplaceSourceQuery } from './customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from './customizationMarketplaceSources.js';

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

function toMarketplaceEntry(server: IGalleryMcpServer, registry: 'custom' | 'default'): ICustomizationMarketplaceEntry {
	const webUrl = safeWebUri(server.webUrl);
	const url = webUrl ?? safeWebUri(server.galleryUrl);
	const repository = safeWebUri(server.repositoryUrl);
	const icon = safeWebUri(server.icon?.light);
	return {
		identifier: server.name,
		displayName: server.displayName || server.name,
		description: server.description,
		mediaType: CustomizationMarketplaceMediaType.McpServer,
		tags: server.topics ?? [],
		capabilities: [],
		representativeQueries: [],
		...(url ? { url, externalUrl: webUrl ? server.webUrl : server.galleryUrl } : {}),
		...(repository ? { repository } : {}),
		...(icon ? { icon } : {}),
		publisher: server.publisherDisplayName ?? server.publisher,
		version: server.version,
		stars: server.starsCount,
		installation: { kind: 'mcpGallery', name: server.name, registry },
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
		const configuredUrl = this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig)?.replace(/\/+$/, '');
		const productUrl = this.productService.mcpGallery?.serviceUrl?.replace(/\/+$/, '');
		const manifest = this.registry === 'default'
			? await this.manifestService.getDefaultMcpGalleryManifest()
			: configuredUrl && configuredUrl !== productUrl ? await this.manifestService.getMcpGalleryManifest() : null;
		if (!manifest || (this.registry === 'custom' && manifest.url !== configuredUrl)) {
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
					items: page.items.map(server => toMarketplaceEntry(server, this.registry)),
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
