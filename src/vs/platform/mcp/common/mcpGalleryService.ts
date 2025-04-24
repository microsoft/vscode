/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IGalleryMcpServer, IMcpGalleryService, IQueryOptions } from './mcpManagement.js';
import { IMcpServerManifest } from './mcpPlatformTypes.js';

interface IRawGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly url: string;
	readonly description: string;
	readonly version: string;
	readonly iconUrl: string;
	readonly publisher: {
		readonly name: string;
		readonly id: string;
		readonly domain?: string;
		readonly verified?: boolean;
	};
	readonly releaseDate: string;
	readonly lastUpdated: string;
	readonly codicon?: string;
	readonly categories?: readonly string[];
	readonly tags?: readonly string[];
	readonly installCount: number;
	readonly rating: number;
	readonly ratingCount: number;
	readonly manifestUrl: string;
	readonly readmeUrl: string;
	readonly repositoryUrl?: string;
	readonly licenseUrl?: string;
	readonly changeLogUrl?: string;
}


export class McpGalleryService extends Disposable implements IMcpGalleryService {

	_serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async query(options?: IQueryOptions, token: CancellationToken = CancellationToken.None): Promise<IGalleryMcpServer[]> {
		let result = await this.fetchGallery(token);

		if (options?.text) {
			const searchText = options.text.toLowerCase();
			result = result.filter(item => item.name.toLowerCase().includes(searchText) || item.description.toLowerCase().includes(searchText));
		}

		return result.map(item => this.toGalleryMcpServer(item));
	}

	async getManifest(gallery: IGalleryMcpServer, token: CancellationToken): Promise<IMcpServerManifest> {
		const uri = URI.parse(gallery.manifestUrl);
		if (uri.scheme === Schemas.file) {
			try {
				const content = await this.fileService.readFile(uri);
				const data = content.value.toString();
				return JSON.parse(data);
			} catch (error) {
				this.logService.error(`Failed to read file from ${uri}: ${error}`);
			}
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: gallery.manifestUrl,
		}, token);

		const result = await asJson<IMcpServerManifest>(context);
		if (!result) {
			throw new Error(`Failed to fetch manifest from ${gallery.manifestUrl}`);
		}
		return result;
	}

	private toGalleryMcpServer(item: IRawGalleryMcpServer): IGalleryMcpServer {
		return {
			id: item.id,
			name: item.name,
			displayName: item.displayName,
			url: item.url,
			description: item.description,
			version: item.version,
			iconUrl: item.iconUrl,
			codicon: item.codicon,
			manifestUrl: item.manifestUrl,
			readmeUrl: item.readmeUrl,
			repositoryUrl: item.repositoryUrl,
			licenseUrl: item.licenseUrl,
			changeLogUrl: item.changeLogUrl,
			publisher: item.publisher.id,
			publisherDisplayName: item.publisher.name,
			publisherDomain: item.publisher.domain ? { link: item.publisher.domain, verified: !!item.publisher.verified } : undefined,
			installCount: item.installCount,
			rating: item.rating,
			ratingCount: item.ratingCount,
			categories: item.categories ?? [],
			tags: item.tags ?? [],
			releaseDate: Date.parse(item.releaseDate),
			lastUpdated: Date.parse(item.lastUpdated)
		};
	}

	private async fetchGallery(token: CancellationToken): Promise<IRawGalleryMcpServer[]> {
		const mcpGalleryUrl = this.getMcpGalleryUrl();
		if (!mcpGalleryUrl) {
			return Promise.resolve([]);
		}

		const uri = URI.parse(mcpGalleryUrl);
		if (uri.scheme === Schemas.file) {
			try {
				const content = await this.fileService.readFile(uri);
				const data = content.value.toString();
				return JSON.parse(data);
			} catch (error) {
				this.logService.error(`Failed to read file from ${uri}: ${error}`);
			}
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: mcpGalleryUrl,
		}, token);

		const result = await asJson<IRawGalleryMcpServer[]>(context);
		return result || [];
	}

	private getMcpGalleryUrl(): string | undefined {
		if (this.productService.quality === 'stable') {
			return undefined;
		}
		return this.configurationService.getValue<string>('mcp.gallery.serviceUrl');
	}

}
