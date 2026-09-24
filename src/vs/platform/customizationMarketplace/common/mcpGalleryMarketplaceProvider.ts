/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IGalleryMcpServer, IMcpGalleryService } from '../../mcp/common/mcpManagement.js';
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

function toMarketplaceEntry(server: IGalleryMcpServer): ICustomizationMarketplaceEntry {
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
		installation: { kind: 'mcpGallery', name: server.name },
	};
}

export class McpGalleryMarketplaceProvider implements ICustomizationMarketplaceProvider {
	readonly id = CustomizationMarketplaceSources.McpGallery.id;

	constructor(@IMcpGalleryService private readonly galleryService: IMcpGalleryService) { }

	async query(options: ICustomizationMarketplaceSourceQuery, token: CancellationToken): Promise<ICustomizationMarketplaceSourcePage> {
		if (options.mediaType && options.mediaType !== CustomizationMarketplaceMediaType.McpServer) {
			return { items: [] };
		}
		let cursor = options.cursor;
		for (let attempt = 0; attempt < 5; attempt++) {
			const page = await this.galleryService.queryPage({
				text: options.query,
				pageSize: options.pageSize ?? 30,
				cursor,
			}, token);
			if (page.items.length || !page.nextCursor) {
				return {
					items: page.items.map(toMarketplaceEntry),
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
