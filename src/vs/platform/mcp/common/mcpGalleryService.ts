/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { uppercaseFirstLetter } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, asText, IRequestService } from '../../request/common/request.js';
import { IGalleryMcpServer, IMcpGalleryService, IMcpServerManifest, IQueryOptions, mcpGalleryServiceUrlConfig, PackageType } from './mcpManagement.js';

interface IRawGalleryServersResult {
	readonly servers: readonly IRawGalleryMcpServer[];
}


interface IRawGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly displayName?: string;
	readonly repository: {
		readonly url: string;
		readonly source: string;
	};
	readonly version_detail: {
		readonly version: string;
		readonly release_date: string;
		readonly is_latest: boolean;
	};
	readonly readmeUrl: string;
	readonly publisher?: {
		readonly displayName: string;
		readonly url: string;
		readonly is_verified: boolean;
	};
	readonly package_types?: readonly PackageType[];
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

	isEnabled(): boolean {
		return this.getMcpGalleryUrl() !== undefined;
	}

	async query(options?: IQueryOptions, token: CancellationToken = CancellationToken.None): Promise<IGalleryMcpServer[]> {
		let { servers } = await this.fetchGallery(token);

		if (options?.text) {
			const searchText = options.text.toLowerCase();
			servers = servers.filter(item => item.name.toLowerCase().includes(searchText) || item.description.toLowerCase().includes(searchText));
		}

		const galleryServers: IGalleryMcpServer[] = [];
		for (const item of servers) {
			galleryServers.push(this.toGalleryMcpServer(item));
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

	async getReadme(gallery: IGalleryMcpServer, token: CancellationToken): Promise<string> {
		const readmeUrl = gallery.readmeUrl;
		if (!readmeUrl) {
			return Promise.resolve(localize('noReadme', 'No README available'));
		}

		const uri = URI.parse(readmeUrl);
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
			url: readmeUrl,
		}, token);

		const result = await asText(context);
		if (!result) {
			throw new Error(`Failed to fetch README from ${readmeUrl}`);
		}

		return result;
	}

	private toGalleryMcpServer(item: IRawGalleryMcpServer): IGalleryMcpServer {
		let publisher = '';
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
			displayName: item.displayName ?? nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' '),
			url: item.repository.url,
			description: item.description,
			version: item.version_detail.version,
			lastUpdated: Date.parse(item.version_detail.release_date),
			repositoryUrl: item.repository.url,
			readmeUrl: item.readmeUrl,
			manifestUrl: this.getManifestUrl(item),
			packageTypes: item.package_types ?? [],
			publisher,
			publisherDisplayName: item.publisher?.displayName,
			publisherDomain: item.publisher ? {
				link: item.publisher.url,
				verified: item.publisher.is_verified,
			} : undefined,
		};
	}

	private async fetchGallery(token: CancellationToken): Promise<IRawGalleryServersResult> {
		const mcpGalleryUrl = this.getMcpGalleryUrl();
		if (!mcpGalleryUrl) {
			return Promise.resolve({ servers: [] });
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

		const result = await asJson<IRawGalleryServersResult>(context);
		return result || { servers: [] };
	}

	private getManifestUrl(item: IRawGalleryMcpServer): string {
		const mcpGalleryUrl = this.getMcpGalleryUrl();

		if (!mcpGalleryUrl) {
			return item.repository.url;
		}

		const uri = URI.parse(mcpGalleryUrl);
		if (uri.scheme === Schemas.file) {
			return joinPath(dirname(uri), item.id).fsPath;
		}

		return `${mcpGalleryUrl}/${item.id}`;
	}

	private getMcpGalleryUrl(): string | undefined {
		if (this.productService.quality === 'stable') {
			return undefined;
		}
		return this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig);
	}

}
