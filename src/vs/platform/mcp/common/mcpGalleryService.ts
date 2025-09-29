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
import { asJson, asText, IRequestService } from '../../request/common/request.js';
import { IGalleryMcpServer, GalleryMcpServerStatus, IMcpGalleryService, IGalleryMcpServerConfiguration, IMcpServerPackage, IQueryOptions, SseTransport, StreamableHttpTransport, IMcpServerKeyValueInput, Transport, TransportType } from './mcpManagement.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType, IMcpGalleryManifest } from './mcpGalleryManifest.js';
import { IPageIterator, IPager, PageIteratorPager, singlePagePager } from '../../../base/common/paging.js';
import { CancellationError } from '../../../base/common/errors.js';
import { basename } from '../../../base/common/path.js';

interface McpServerDeprecatedRemote {
	readonly transport_type?: 'streamable' | 'sse';
	readonly transport?: 'streamable' | 'sse';
	readonly url: string;
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

type McpServerRemotes = ReadonlyArray<SseTransport | StreamableHttpTransport | McpServerDeprecatedRemote>;

interface IRawGalleryMcpServerPackage extends IMcpServerPackage {
	readonly registry_name: string;
	readonly name: string;
}

interface IRawGalleryServerListMetadata {
	readonly count: number;
	readonly total?: number;
	readonly next_cursor?: string;
}

interface IMcpRegistryInfo {
	readonly id: string;
	readonly is_latest: boolean;
	readonly published_at: string;
	readonly updated_at: string;
	readonly release_date?: string;
}

interface IGitHubInfo {
	readonly name: string;
	readonly name_with_owner: string;
	readonly display_name?: string;
	readonly is_in_organization?: boolean;
	readonly license?: string;
	readonly opengraph_image_url?: string;
	readonly owner_avatar_url?: string;
	readonly primary_language?: string;
	readonly primary_language_color?: string;
	readonly pushed_at?: string;
	readonly stargazer_count?: number;
	readonly topics?: readonly string[];
	readonly uses_custom_opengraph_image?: boolean;
}

function isIRawGalleryOldMcpServer(obj: any): obj is IRawGalleryOldMcpServer {
	return obj && obj.server !== undefined;
}

interface IRawGalleryOldMcpServer {
	readonly server: {
		readonly id: string;
		readonly name: string;
		readonly description: string;
		readonly version_detail: {
			readonly version: string;
			readonly release_date: string;
			readonly is_latest: boolean;
		};
		readonly status?: GalleryMcpServerStatus;
		readonly repository?: {
			readonly source: string;
			readonly url: string;
			readonly id?: string;
			readonly subfolder?: string;
			readonly readme?: string;
		};
		readonly created_at: string;
		readonly updated_at: string;
		readonly packages?: readonly IRawGalleryMcpServerPackage[];
		readonly remotes?: McpServerRemotes;
	};
	readonly 'x-io.modelcontextprotocol.registry': {
		readonly id: string;
		readonly is_latest: boolean;
		readonly published_at: string;
		readonly updated_at: string;
		readonly release_date?: string;
	};
	readonly 'x-github'?: IGitHubInfo;
}

interface IRawGalleryServersOldResult {
	readonly metadata?: IRawGalleryServerListMetadata;
	readonly servers: readonly IRawGalleryOldMcpServer[];
}

const enum McpServerSchemaVersion {
	v2025_01_09 = 'https://static.modelcontextprotocol.io/schemas/2025-09-01/server.schema.json',
	v2025_07_09 = 'https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json',
	v2025_09_16 = 'https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json',
}

interface IRawGalleryMcpServer_2025_01_09 {
	readonly $schema?: McpServerSchemaVersion.v2025_01_09;
	readonly name: string;
	readonly description: string;
	readonly status?: GalleryMcpServerStatus;
	readonly repository?: {
		readonly source: string;
		readonly url: string;
		readonly id?: string;
		readonly readme?: string;
	};
	readonly version_detail: {
		readonly version: string;
		readonly release_date: string;
		readonly is_latest: boolean;
	};
	readonly created_at: string;
	readonly updated_at: string;
	readonly packages?: readonly IRawGalleryMcpServerPackage[];
	readonly remotes?: McpServerRemotes;
	readonly _meta: {
		readonly 'io.modelcontextprotocol.registry': IMcpRegistryInfo;
		readonly github?: IGitHubInfo;
	};
}

interface IRawGalleryMcpServer_2025_07_09 {
	readonly $schema?: McpServerSchemaVersion.v2025_07_09;
	readonly name: string;
	readonly description: string;
	readonly status?: GalleryMcpServerStatus;
	readonly repository?: {
		readonly source: string;
		readonly url: string;
		readonly id?: string;
		readonly readme?: string;
	};
	readonly version: string;
	readonly website_url?: string;
	readonly created_at: string;
	readonly updated_at: string;
	readonly packages?: readonly IRawGalleryMcpServerPackage[];
	readonly remotes?: McpServerRemotes;
	readonly _meta: {
		readonly 'io.modelcontextprotocol.registry/official': IMcpRegistryInfo;
		readonly 'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, any>;
	};
}

type IRawGalleryVersionedMcpServer =
	| IRawGalleryMcpServer_2025_01_09
	| IRawGalleryMcpServer_2025_07_09
	;

interface IRawGalleryVersionedServersResult {
	readonly metadata?: IRawGalleryServerListMetadata;
	readonly servers: readonly IRawGalleryVersionedMcpServer[];
}

interface IRawGalleryMcpServer {
	readonly name: string;
	readonly description: string;
	readonly status?: GalleryMcpServerStatus;
	readonly repository?: {
		readonly source: string;
		readonly url: string;
		readonly id?: string;
		readonly readme?: string;
	};
	readonly version: string;
	readonly websiteUrl?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly packages?: readonly IRawGalleryMcpServerPackage[];
	readonly remotes?: McpServerRemotes;
	readonly registryInfo: IMcpRegistryInfo;
	readonly githubInfo?: IGitHubInfo;
}

interface IRawGalleryServersResult {
	readonly metadata?: IRawGalleryServerListMetadata;
	readonly servers: readonly IRawGalleryMcpServer[];
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
	get cursor(): string | undefined { return this.state.cursor; }

	withPage(cursor: string, pageSize: number = this.pageSize): Query {
		return new Query({ ...this.state, pageSize, cursor });
	}

	withSearchText(searchText: string | undefined): Query {
		return new Query({ ...this.state, searchText });
	}
}

export class McpGalleryService extends Disposable implements IMcpGalleryService {

	_serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService,
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

		let query = new Query();
		if (options?.text) {
			query = query.withSearchText(options.text.trim());
		}

		const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);
		const total = metadata?.total ?? metadata?.count ?? servers.length;

		const getNextPage = async (cursor: string | undefined, ct: CancellationToken): Promise<IPageIterator<IGalleryMcpServer>> => {
			if (ct.isCancellationRequested) {
				throw new CancellationError();
			}
			const { servers, metadata } = cursor ? await this.queryGalleryMcpServers(query.withPage(cursor).withSearchText(undefined), mcpGalleryManifest, token) : { servers: [], metadata: undefined };
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

	async getMcpServersFromGallery(urls: string[]): Promise<IGalleryMcpServer[]> {
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
			const mcpServer = await this.getMcpServer(mcpServerUrl);
			if (mcpServer) {
				mcpServers.push(mcpServer);
			}
		}));

		return mcpServers;
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

		const result = await asJson<IRawGalleryVersionedMcpServer | IRawGalleryOldMcpServer>(context);
		if (!result) {
			throw new Error(`Failed to fetch configuration from ${gallery.url}`);
		}

		const server = this.toIRawGalleryMcpServer(result);
		const configuration = this.toGalleryMcpServerConfiguration(server.packages, server.remotes);
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

	private toGalleryMcpServer(server: IRawGalleryMcpServer, manifest: IMcpGalleryManifest | null): IGalleryMcpServer {
		let publisher = '';
		let displayName = '';

		if (server.githubInfo?.name) {
			displayName = server.githubInfo.name.split('-').map(s => s.toLowerCase() === 'mcp' ? 'MCP' : s.toLowerCase() === 'github' ? 'GitHub' : uppercaseFirstLetter(s)).join(' ');
			publisher = server.githubInfo.name_with_owner.split('/')[0];
		} else {
			const nameParts = server.name.split('/');
			if (nameParts.length > 0) {
				const domainParts = nameParts[0].split('.');
				if (domainParts.length > 0) {
					publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
				}
			}
			displayName = nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' ');
		}

		if (server.githubInfo?.display_name) {
			displayName = server.githubInfo.display_name;
		}

		const icon: { light: string; dark: string } | undefined = server.githubInfo?.owner_avatar_url ? {
			light: server.githubInfo.owner_avatar_url,
			dark: server.githubInfo.owner_avatar_url
		} : undefined;

		const serverUrl = manifest ? this.getServerUrl(server.registryInfo.id, manifest) : undefined;
		const webUrl = manifest ? this.getWebUrl(server.name, manifest) : undefined;
		const publisherUrl = manifest ? this.getPublisherUrl(publisher, manifest) : undefined;

		return {
			id: server.registryInfo.id,
			name: server.name,
			displayName,
			url: serverUrl,
			webUrl,
			description: server.description,
			status: server.status ?? GalleryMcpServerStatus.Active,
			version: server.version,
			isLatest: server.registryInfo.is_latest,
			publishDate: server.registryInfo.published_at ? Date.parse(server.registryInfo.published_at) : undefined,
			lastUpdated: server.githubInfo?.pushed_at ? Date.parse(server.githubInfo.pushed_at) : server.registryInfo ? Date.parse(server.registryInfo.updated_at) : undefined,
			repositoryUrl: server.repository?.url,
			readme: server.repository?.readme,
			icon,
			publisher,
			publisherUrl,
			license: server.githubInfo?.license,
			starsCount: server.githubInfo?.stargazer_count,
			topics: server.githubInfo?.topics,
			configuration: this.toGalleryMcpServerConfiguration(server.packages, server.remotes)
		};
	}

	private toGalleryMcpServerConfiguration(packages?: readonly IRawGalleryMcpServerPackage[], remotes?: McpServerRemotes): IGalleryMcpServerConfiguration | undefined {
		if (!packages && !remotes) {
			return undefined;
		}

		return {
			packages: packages?.map(p => ({
				...p,
				identifier: p.identifier ?? p.name,
				registry_type: p.registry_type ?? p.registry_name
			})),
			remotes: remotes?.map(remote => {
				const type = (<Transport>remote).type ?? (<McpServerDeprecatedRemote>remote).transport_type ?? (<McpServerDeprecatedRemote>remote).transport;
				return {
					type: type === TransportType.SSE ? TransportType.SSE : TransportType.STREAMABLE_HTTP,
					url: remote.url,
					headers: remote.headers
				};
			})
		};
	}

	private async queryGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<{ servers: IGalleryMcpServer[]; metadata?: IRawGalleryServerListMetadata }> {
		const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
		return {
			servers: servers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest)),
			metadata
		};
	}

	private async queryRawGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<IRawGalleryServersResult> {
		const mcpGalleryUrl = query.searchText ? this.getSearchUrl(mcpGalleryManifest) : this.getMcpGalleryUrl(mcpGalleryManifest);
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

		let url = `${mcpGalleryUrl}?limit=${query.pageSize}`;
		if (query.cursor) {
			url += `&cursor=${query.cursor}`;
		}
		if (query.searchText) {
			const text = encodeURIComponent(query.searchText);
			url += `&q=${text}`;
		}

		const context = await this.requestService.request({
			type: 'GET',
			url,
		}, token);

		const result = await asJson<IRawGalleryVersionedServersResult | IRawGalleryServersOldResult>(context);

		if (!result) {
			return { servers: [] };
		}

		return {
			servers: result.servers.map(server => this.toIRawGalleryMcpServer(server)),
			metadata: result.metadata
		};
	}

	async getMcpServer(mcpServerUrl: string, mcpGalleryManifest?: IMcpGalleryManifest | null): Promise<IGalleryMcpServer | undefined> {
		const context = await this.requestService.request({
			type: 'GET',
			url: mcpServerUrl,
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
			return undefined;
		}

		const server = await asJson<IRawGalleryVersionedMcpServer | IRawGalleryOldMcpServer>(context);
		if (!server) {
			return undefined;
		}

		if (!mcpGalleryManifest) {
			mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
			if (mcpGalleryManifest && mcpServerUrl !== this.getServerUrl(basename(mcpServerUrl), mcpGalleryManifest)) {
				mcpGalleryManifest = null;
			}
		}

		return this.toGalleryMcpServer(this.toIRawGalleryMcpServer(server), mcpGalleryManifest);
	}

	async getMcpServerByName(name: string): Promise<IGalleryMcpServer | undefined> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return undefined;
		}

		const mcpServerUrl = this.getNamedServerUrl(name, mcpGalleryManifest);
		if (!mcpServerUrl) {
			return undefined;
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: mcpServerUrl,
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
			return undefined;
		}

		const server = await asJson<IRawGalleryVersionedMcpServer | IRawGalleryOldMcpServer>(context);
		if (!server) {
			return undefined;
		}

		return this.toGalleryMcpServer(this.toIRawGalleryMcpServer(server), mcpGalleryManifest);
	}

	private toIRawGalleryMcpServer(from: IRawGalleryOldMcpServer | IRawGalleryVersionedMcpServer): IRawGalleryMcpServer {
		if (isIRawGalleryOldMcpServer(from)) {
			return {
				name: from.server.name,
				description: from.server.description,
				status: from.server.status,
				repository: from.server.repository ? {
					url: from.server.repository.url,
					source: from.server.repository.source,
					id: from.server.repository.id,
					readme: from.server.repository.readme
				} : undefined,
				version: from.server.version_detail.version,
				createdAt: from.server.created_at,
				updatedAt: from.server.updated_at,
				packages: from.server.packages,
				remotes: from.server.remotes,
				registryInfo: from['x-io.modelcontextprotocol.registry'],
				githubInfo: from['x-github'],
			};
		}

		if (from.$schema === McpServerSchemaVersion.v2025_01_09) {
			const server = <IRawGalleryMcpServer_2025_01_09>from;
			return {
				name: server.name,
				description: server.description,
				status: server.status,
				repository: server.repository,
				version: server.version_detail.version,
				createdAt: server.created_at,
				updatedAt: server.updated_at,
				packages: server.packages,
				remotes: server.remotes,
				registryInfo: server._meta['io.modelcontextprotocol.registry'],
				githubInfo: server._meta.github
			};
		}

		if (from.$schema === McpServerSchemaVersion.v2025_07_09) {
			const server = <IRawGalleryMcpServer_2025_07_09>from;
			return {
				name: server.name,
				description: server.description,
				status: server.status,
				repository: server.repository,
				version: server.version,
				createdAt: server.created_at,
				updatedAt: server.updated_at,
				packages: server.packages,
				remotes: server.remotes,
				registryInfo: server._meta['io.modelcontextprotocol.registry/official'],
				githubInfo: server._meta['io.modelcontextprotocol.registry/publisher-provided']?.github
			};
		}

		throw new Error('Unsupported MCP server schema version');
	}

	private getServerUrl(id: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerResourceUri);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { id });
	}

	private getNamedServerUrl(name: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const namedResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerNamedResourceUri);
		if (!namedResourceUriTemplate) {
			return undefined;
		}
		return format2(namedResourceUriTemplate, { name });
	}

	private getSearchUrl(mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServersSearchService);
	}

	private getWebUrl(name: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerWebUri);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { name });
	}

	private getPublisherUrl(name: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.PublisherUriTemplate);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { name });
	}

	private getMcpGalleryUrl(mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServersQueryService);
	}

}
