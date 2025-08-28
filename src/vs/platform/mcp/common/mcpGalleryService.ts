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
import { IPageIterator, IPager, PageIteratorPager, singlePagePager } from '../../../base/common/paging.js';
import { CancellationError } from '../../../base/common/errors.js';
import { basename } from '../../../base/common/path.js';

interface IRawGalleryServerMetadata {
	readonly count: number;
	readonly next_cursor?: string;
	readonly total: number;
}

interface IRawGalleryServersResult {
	readonly metadata?: IRawGalleryServerMetadata;
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

const DefaultPageSize = 50;

interface IQueryState {
	readonly searchText?: string;
	readonly cursor?: string;
	readonly pageSize: number;
}

const DefaultQueryState: IQueryState = {
	pageSize: DefaultPageSize,
};

class Query {

	constructor(private state = DefaultQueryState) { }

	get pageSize(): number { return this.state.pageSize; }
	get searchText(): string | undefined { return this.state.searchText; }


	withPage(cursor: string, pageSize: number = this.pageSize): Query {
		return new Query({ ...this.state, pageSize, cursor });
	}

	withSearchText(searchText: string): Query {
		return new Query({ ...this.state, searchText });
	}
}

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

	async query(options?: IQueryOptions, token: CancellationToken = CancellationToken.None): Promise<IPager<IGalleryMcpServer>> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return singlePagePager([]);
		}

		const query = new Query();
		const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);
		const total = metadata?.total ?? servers.length;

		const getNextPage = async (cursor: string | undefined, ct: CancellationToken): Promise<IPageIterator<IGalleryMcpServer>> => {
			if (ct.isCancellationRequested) {
				throw new CancellationError();
			}
			const { servers, metadata } = cursor ? await this.queryGalleryMcpServers(query.withPage(cursor), mcpGalleryManifest, token) : { servers: [], metadata: undefined };
			return {
				elements: servers,
				total,
				hasNextPage: !!cursor,
				getNextPage: (token) => getNextPage(metadata?.next_cursor, token)
			};
		};

		return new PageIteratorPager({
			elements: servers,
			total,
			hasNextPage: !!metadata?.next_cursor,
			getNextPage: (token) => getNextPage(metadata?.next_cursor, token),

		});
	}

	async getMcpServers(urls: string[]): Promise<IGalleryMcpServer[]> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return [];
		}

		const mcpServers: IGalleryMcpServer[] = [];
		await Promise.allSettled(urls.map(async url => {
			const mcpServerUrl = this.getManifestUrlFromId(basename(url), mcpGalleryManifest);
			if (mcpServerUrl !== url) {
				return;
			}
			const mcpServer = await this.getMcpServer(mcpServerUrl, mcpGalleryManifest);
			if (mcpServer) {
				mcpServers.push(mcpServer);
			}
		}));

		return mcpServers;
	}

	async getMcpServersFromVSCodeGallery(names: string[]): Promise<IGalleryMcpServer[]> {
		const servers = await this.fetchMcpServersFromVSCodeGallery();
		return servers.filter(item => names.includes(item.name));
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
		if (this.productService.extensionsGallery?.mcpUrl !== mcpGalleryManifest.url) {
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

		const manifestUrl = this.getManifestUrl(item, mcpGalleryManifest);

		return {
			id: item.id ?? item.name,
			name: item.name,
			displayName: item.displayName ?? nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' '),
			url: manifestUrl,
			description: item.description,
			version: item.version_detail?.version,
			lastUpdated: item.version_detail ? Date.parse(item.version_detail.release_date) : undefined,
			repositoryUrl: item.repository?.url,
			codicon: item.codicon,
			icon,
			readmeUrl: item.readmeUrl,
			manifestUrl,
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

	private async queryGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<{ servers: IGalleryMcpServer[]; metadata?: IRawGalleryServerMetadata }> {
		const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
		return {
			servers: servers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest)),
			metadata
		};
	}

	private async queryRawGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<IRawGalleryServersResult> {
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

		const url = `${mcpGalleryUrl}?limit=${query.pageSize}`;

		const context = await this.requestService.request({
			type: 'GET',
			url,
		}, token);

		const result = await asJson<IRawGalleryServersResult>(context);
		return result || { servers: [] };
	}

	private async getMcpServer(mcpServerUrl: string, mcpGalleryManifest: IMcpGalleryManifest): Promise<IGalleryMcpServer | undefined> {
		const context = await this.requestService.request({
			type: 'GET',
			url: mcpServerUrl,
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
			return undefined;
		}

		const item = await asJson<IRawGalleryMcpServer>(context);
		if (!item) {
			return undefined;
		}

		return this.toGalleryMcpServer(item, mcpGalleryManifest);
	}

	private async fetchMcpServersFromVSCodeGallery(): Promise<IGalleryMcpServer[]> {
		const mcpGalleryUrl = this.productService.extensionsGallery?.mcpUrl;
		if (!mcpGalleryUrl) {
			return [];
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: mcpGalleryUrl,
		}, CancellationToken.None);

		const result = await asJson<IRawGalleryServersResult>(context);
		const mcpGalleryManifest: IMcpGalleryManifest = { url: mcpGalleryUrl, resources: [] };
		return result?.servers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest)) ?? [];
	}

	private getManifestUrl(item: IRawGalleryMcpServer, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		if (!item.id) {
			return undefined;
		}
		return this.getManifestUrlFromId(item.id, mcpGalleryManifest);
	}

	private getManifestUrlFromId(id: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerManifestUri);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { id });
	}

	private getMcpGalleryUrl(mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpQueryService);
	}

}
