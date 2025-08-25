/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { format2, uppercaseFirstLetter } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, asText, IRequestService } from '../../request/common/request.js';
import { IGalleryMcpServer, IMcpGalleryService, IMcpServerManifest, IQueryOptions, PackageType } from './mcpManagement.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType, IMcpGalleryManifest } from './mcpGalleryManifest.js';

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
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
	) {
		super();
	}

	isEnabled(): boolean {
		return this.mcpGalleryManifestService.mcpGalleryManifestStatus === McpGalleryManifestStatus.Available;
	}

	async query(options?: IQueryOptions, token: CancellationToken = CancellationToken.None): Promise<IGalleryMcpServer[]> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return [];
		}

		let { servers } = await this.fetchGallery(mcpGalleryManifest, token);

		if (options?.text) {
			const searchText = options.text.toLowerCase();
			servers = servers.filter(item => item.name.toLowerCase().includes(searchText) || item.description.toLowerCase().includes(searchText));
		}

		const galleryServers: IGalleryMcpServer[] = [];
		for (const item of servers) {
			galleryServers.push(this.toGalleryMcpServer(item, mcpGalleryManifest));
		}

		return galleryServers;
	}

	async getMcpServers(names: string[]): Promise<IGalleryMcpServer[]> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return [];
		}

		const { servers } = await this.fetchGallery(mcpGalleryManifest, CancellationToken.None);
		const filteredServers = servers.filter(item => names.includes(item.name));
		return filteredServers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest));
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

	private toGalleryMcpServer(item: IRawGalleryMcpServer, mcpGalleryManifest: IMcpGalleryManifest): IGalleryMcpServer {
		let publisher = '';
		const nameParts = item.name.split('/');
		if (nameParts.length > 0) {
			const domainParts = nameParts[0].split('.');
			if (domainParts.length > 0) {
				publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
			}
		}

		let icon: { light: string; dark: string } | undefined;
		const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
		if (mcpGalleryUrl && this.productService.extensionsGallery?.mcpUrl !== mcpGalleryUrl) {
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
			manifestUrl: this.getManifestUrl(item, mcpGalleryManifest),
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

	private async fetchGallery(mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<IRawGalleryServersResult> {
		const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
		if (!mcpGalleryUrl) {
			return { servers: [] };
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

	private getManifestUrl(item: IRawGalleryMcpServer, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		if (!item.id) {
			return undefined;
		}
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerManifestUri);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { id: item.id });
	}

	private getMcpGalleryUrl(mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpQueryService);
	}

}
