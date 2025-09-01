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
import { IGalleryMcpServer, GalleryMcpServerStatus, IMcpGalleryService, IGalleryMcpServerConfiguration, IMcpServerPackage, IMcpServerRemote, IQueryOptions } from './mcpManagement.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType, IMcpGalleryManifest } from './mcpGalleryManifest.js';
import { IPageIterator, IPager, PageIteratorPager, singlePagePager } from '../../../base/common/paging.js';
import { CancellationError } from '../../../base/common/errors.js';
import { basename } from '../../../base/common/path.js';

interface IRawGalleryServerMetadata {
	readonly count: number;
	readonly next_cursor?: string;
}

interface IRawGalleryServersResult {
	readonly metadata?: IRawGalleryServerMetadata;
	readonly servers: readonly IRawGalleryMcpServer[];
}

interface IRawGalleryMcpServer {
	readonly server: IRawGalleryMcpServerDetail;
	readonly 'x-io.modelcontextprotocol.registry': {
		readonly id: string;
		readonly published_at: string;
		readonly updated_at: string;
		readonly is_latest: boolean;
		readonly release_date?: string;
	};
	readonly 'x-publisher'?: Record<string, any>;
	readonly 'x-github'?: {
		readonly 'name': string;
		readonly 'name_with_owner': string;
		readonly 'is_in_organization'?: boolean;
		readonly 'license'?: string;
		readonly 'opengraph_image_url'?: string;
		readonly 'owner_avatar_url'?: string;
		readonly 'primary_language'?: string;
		readonly 'primary_language_color'?: string;
		readonly 'pushed_at'?: string;
		readonly 'stargazer_count'?: number;
		readonly 'topics'?: readonly string[];
		readonly 'uses_custom_opengraph_image'?: boolean;
	};
}

interface IRawGalleryMcpServerPackage extends IMcpServerPackage {
	readonly registry_name: string;
	readonly name: string;
}

interface IRawGalleryMcpServerDetail {
	readonly name: string;
	readonly description: string;
	readonly version_detail: {
		readonly version: string;
		readonly release_date: string;
		readonly is_latest: boolean;
	};
	readonly status?: GalleryMcpServerStatus;
	readonly repository?: {
		readonly url: string;
		readonly source: string;
		readonly id: string;
	};
	readonly created_at: string;
	readonly updated_at: string;
	readonly packages?: readonly IRawGalleryMcpServerPackage[];
	readonly remotes?: readonly IMcpServerRemote[];
}

interface IVSCodeGalleryMcpServerDetail {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly repository?: {
		readonly url: string;
		readonly source: string;
	};
	readonly codicon?: string;
	readonly iconUrl?: string;
	readonly iconUrlDark?: string;
	readonly iconUrlLight?: string;
	readonly readmeUrl: string;
	readonly publisher?: {
		readonly displayName: string;
		readonly url: string;
		readonly is_verified: boolean;
	};
	readonly manifest: {
		readonly packages?: readonly IRawGalleryMcpServerPackage[];
		readonly remotes?: readonly IMcpServerRemote[];
	};
}

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
		const total = metadata?.count ?? servers.length;

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
			const mcpServerUrl = this.getServerUrl(basename(url), mcpGalleryManifest);
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

	async getMcpServerConfiguration(gallery: IGalleryMcpServer, token: CancellationToken): Promise<IGalleryMcpServerConfiguration> {
		if (gallery.configuration) {
			return gallery.configuration;
		}

		if (!gallery.url) {
			throw new Error(`No manifest URL found for ${gallery.name}`);
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: gallery.url,
		}, token);

		const result = await asJson<IRawGalleryMcpServer>(context);
		if (!result) {
			throw new Error(`Failed to fetch configuration from ${gallery.url}`);
		}

		const configuration = this.toGalleryMcpServerConfiguration(result.server.packages, result.server.remotes);
		if (!configuration) {
			throw new Error(`Failed to fetch configuration for ${gallery.url}`);
		}

		return configuration;
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

	private toGalleryMcpServer(raw: IRawGalleryMcpServer, mcpGalleryManifest: IMcpGalleryManifest): IGalleryMcpServer {
		const serverDetails = raw.server;
		const registryInfo = raw['x-io.modelcontextprotocol.registry'];
		const githubInfo = raw['x-github'];

		let publisher = '';
		let displayName = '';

		if (githubInfo?.name) {
			displayName = githubInfo.name.split('-').map(s => uppercaseFirstLetter(s)).join(' ');
			publisher = githubInfo.name_with_owner.split('/')[0];
		} else {
			const nameParts = serverDetails.name.split('/');
			if (nameParts.length > 0) {
				const domainParts = nameParts[0].split('.');
				if (domainParts.length > 0) {
					publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
				}
			}
			displayName = nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' ');
		}

		const icon: { light: string; dark: string } | undefined = githubInfo?.owner_avatar_url ? {
			light: githubInfo.owner_avatar_url,
			dark: githubInfo.owner_avatar_url
		} : undefined;

		const serverUrl = this.getServerUrl(registryInfo.id, mcpGalleryManifest);

		return {
			id: registryInfo.id,
			name: serverDetails.name,
			displayName,
			url: serverUrl,
			description: serverDetails.description,
			status: serverDetails.status ?? GalleryMcpServerStatus.Active,
			version: serverDetails.version_detail.version,
			isLatest: registryInfo.is_latest,
			releaseDate: Date.parse(registryInfo.release_date ?? serverDetails.version_detail.release_date),
			publishDate: Date.parse(registryInfo.published_at),
			lastUpdated: Date.parse(registryInfo.updated_at),
			repositoryUrl: serverDetails.repository?.url,
			icon,
			publisher,
			license: githubInfo?.license,
			starsCount: githubInfo?.stargazer_count,
			topics: githubInfo?.topics,
			configuration: this.toGalleryMcpServerConfiguration(serverDetails.packages, serverDetails.remotes)
		};
	}

	private toGalleryMcpServerConfiguration(packages?: readonly IRawGalleryMcpServerPackage[], remotes?: readonly IMcpServerRemote[]): IGalleryMcpServerConfiguration | undefined {
		if (!packages && !remotes) {
			return undefined;
		}

		return {
			packages: packages?.map(p => ({
				...p,
				identifier: p.identifier ?? p.name,
				registry_type: p.registry_type ?? p.registry_name
			})),
			remotes
		};
	}

	private async queryGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<{ servers: IGalleryMcpServer[]; metadata?: IRawGalleryServerMetadata }> {
		if (mcpGalleryManifest.url === this.productService.extensionsGallery?.mcpUrl) {
			return {
				servers: await this.fetchMcpServersFromVSCodeGallery()
			};
		}
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

		const server = await asJson<IRawGalleryMcpServer>(context);
		if (!server) {
			return undefined;
		}

		return this.toGalleryMcpServer(server, mcpGalleryManifest);
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

		const result = await asJson<{ servers: IVSCodeGalleryMcpServerDetail[] }>(context);
		if (!result) {
			return [];
		}

		return result.servers.map<IGalleryMcpServer>(item => {
			return {
				id: item.name,
				name: item.name,
				displayName: item.displayName,
				description: item.description,
				version: '0.0.1',
				isLatest: true,
				status: GalleryMcpServerStatus.Active,
				repositoryUrl: item.repository?.url,
				codicon: item.codicon,
				publisher: '',
				publisherDisplayName: item.publisher?.displayName,
				publisherDomain: item.publisher ? {
					link: item.publisher.url,
					verified: item.publisher.is_verified,
				} : undefined,
				readmeUrl: item.readmeUrl,
				configuration: this.toGalleryMcpServerConfiguration(item.manifest.packages, item.manifest.remotes)
			};
		});
	}

	private getServerUrl(id: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
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
