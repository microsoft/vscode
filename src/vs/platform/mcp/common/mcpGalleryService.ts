/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname, joinPath } from '../../../base/common/resources.js';
import { uppercaseFirstLetter } from '../../../base/common/strings.js';
import { isString } from '../../../base/common/types.js';
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
	readonly id?: string;
	readonly name: string;
	readonly description: string;
	readonly displayName?: string;
	readonly iconUrl?: string;
	readonly iconUrlDark?: string;
	readonly iconUrlLight?: string;
	readonly codicon?: string;
	readonly repository?: {
		readonly url: string;
		readonly source: string;
	};
	readonly version_detail?: {
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
	readonly manifest?: IMcpServerManifest;
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

	async getMcpServers(names: string[]): Promise<IGalleryMcpServer[]> {
		const mcpUrl = this.getMcpGalleryUrl() ?? this.productService.extensionsGallery?.mcpUrl;
		if (!mcpUrl) {
			return [];
		}

		const { servers } = await this.fetchGallery(mcpUrl, CancellationToken.None);
		const filteredServers = servers.filter(item => names.includes(item.name));
		return filteredServers.map(item => this.toGalleryMcpServer(item));
	}

	async getManifest(gallery: IGalleryMcpServer, token: CancellationToken): Promise<IMcpServerManifest> {
		if (gallery.manifest) {
			return gallery.manifest;
		}

		if (!gallery.manifestUrl) {
			throw new Error(`No manifest URL found for ${gallery.name}`);
		}

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

		if (uri.authority !== 'raw.githubusercontent.com') {
			return new MarkdownString(localize('readme.viewInBrowser', "You can find information about this server [here]({0})", readmeUrl)).value;
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

		let icon: { light: string; dark: string } | undefined;
		if (this.productService.extensionsGallery?.mcpUrl !== this.getMcpGalleryUrl()) {
			if (item.iconUrl) {
				icon = {
					light: item.iconUrl,
					dark: item.iconUrl
				};
			}
			if (item.iconUrlLight && item.iconUrlDark) {
				icon = {
					light: item.iconUrlLight,
					dark: item.iconUrlDark
				};
			}
		}

		return {
			id: item.id ?? item.name,
			name: item.name,
			displayName: item.displayName ?? nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' '),
			url: item.repository?.url,
			description: item.description,
			version: item.version_detail?.version,
			lastUpdated: item.version_detail ? Date.parse(item.version_detail.release_date) : undefined,
			repositoryUrl: item.repository?.url,
			codicon: item.codicon,
			icon,
			readmeUrl: item.readmeUrl,
			manifestUrl: this.getManifestUrl(item),
			packageTypes: item.package_types ?? [],
			publisher,
			publisherDisplayName: item.publisher?.displayName,
			publisherDomain: item.publisher ? {
				link: item.publisher.url,
				verified: item.publisher.is_verified,
			} : undefined,
			manifest: item.manifest
		};
	}

	private async fetchGallery(token: CancellationToken): Promise<IRawGalleryServersResult>;
	private async fetchGallery(url: string, token: CancellationToken): Promise<IRawGalleryServersResult>;
	private async fetchGallery(arg1: any, arg2?: any): Promise<IRawGalleryServersResult> {
		const mcpGalleryUrl = isString(arg1) ? arg1 : this.getMcpGalleryUrl();
		if (!mcpGalleryUrl) {
			return Promise.resolve({ servers: [] });
		}

		const token = isString(arg1) ? arg2 : arg1;
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

	private getManifestUrl(item: IRawGalleryMcpServer): string | undefined {
		const mcpGalleryUrl = this.getMcpGalleryUrl();

		if (!mcpGalleryUrl) {
			return undefined;
		}

		const uri = URI.parse(mcpGalleryUrl);
		if (uri.scheme === Schemas.file) {
			return joinPath(dirname(uri), item.id ?? item.name).fsPath;
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
