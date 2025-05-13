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
import { asJson, asText, IRequestService } from '../../request/common/request.js';
import { IGalleryMcpServer, IMcpGalleryService, IMcpServerManifest, IQueryOptions, mcpGalleryServiceUrlConfig } from './mcpManagement.js';

interface IRawGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly repository: {
		readonly url: string;
		readonly source: string;
		readonly readmeUrl: string;
	};
	readonly version_detail: {
		readonly version: string;
		readonly releaseData: string;
		readonly is_latest: boolean;
	};
}

type RawGalleryMcpServerManifest = IRawGalleryMcpServer & IMcpServerManifest;

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

		// Process items sequentially to get publisher info
		const galleryServers: IGalleryMcpServer[] = [];
		for (const item of result) {
			galleryServers.push(await this.toGalleryMcpServer(item));
		}

		return galleryServers;
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

		const result = await asJson<RawGalleryMcpServerManifest>(context);
		if (!result) {
			throw new Error(`Failed to fetch manifest from ${gallery.manifestUrl}`);
		}

		return {
			packages: result.packages,
			remotes: result.remotes,
		};
	}

	async getReadme(gallery: IGalleryMcpServer, token: CancellationToken): Promise<string | null> {
		if (!gallery.readmeUrl) {
			return null;
		}
		const uri = URI.parse(gallery.readmeUrl);
		if (uri.scheme === Schemas.file) {
			try {
				const content = await this.fileService.readFile(uri);
				return content.value.toString();
			} catch (error) {
				this.logService.error(`Failed to read file from ${uri}: ${error}`);
			}
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: gallery.readmeUrl,
		}, token);

		const result = await asText(context);
		if (!result) {
			throw new Error(`Failed to fetch manifest from ${gallery.manifestUrl}`);
		}

		return result;
	}

	private async toGalleryMcpServer(item: IRawGalleryMcpServer): Promise<IGalleryMcpServer> {
		let publisher;
		const nameParts = item.name.split('/');
		if (nameParts.length > 0) {
			const domainParts = nameParts[0].split('.');
			if (domainParts.length > 0) {
				publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
			}
		}

		return {
			id: item.id,
			name: item.name,
			displayName: nameParts[nameParts.length - 1],
			url: item.repository.url,
			description: item.description,
			version: item.version_detail.version,
			lastUpdated: Date.parse(item.version_detail.releaseData),
			repositoryUrl: item.repository.url,
			readmeUrl: item.repository.readmeUrl,
			manifestUrl: this.getManifestUrl(item),
			publisher
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

	private getManifestUrl(item: IRawGalleryMcpServer): string {
		return `${this.getMcpGalleryUrl()}/${item.id}`;
	}

	private getMcpGalleryUrl(): string | undefined {
		if (this.productService.quality === 'stable') {
			return undefined;
		}
		return this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig);
	}

}
