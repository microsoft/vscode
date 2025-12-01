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
import { GalleryMcpServerStatus, IGalleryMcpServer, IMcpGalleryService, IMcpServerArgument, IMcpServerInput, IMcpServerKeyValueInput, IMcpServerPackage, IQueryOptions, RegistryType, SseTransport, StreamableHttpTransport, Transport, TransportType } from './mcpManagement.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType, IMcpGalleryManifest } from './mcpGalleryManifest.js';
import { IIterativePager, IIterativePage } from '../../../base/common/paging.js';
import { CancellationError } from '../../../base/common/errors.js';
import { isObject, isString } from '../../../base/common/types.js';

interface IMcpRegistryInfo {
	readonly isLatest?: boolean;
	readonly publishedAt?: string;
	readonly updatedAt?: string;
}

interface IGitHubInfo {
	readonly name: string;
	readonly nameWithOwner: string;
	readonly displayName?: string;
	readonly isInOrganization?: boolean;
	readonly license?: string;
	readonly opengraphImageUrl?: string;
	readonly ownerAvatarUrl?: string;
	readonly preferredImage?: string;
	readonly primaryLanguage?: string;
	readonly primaryLanguageColor?: string;
	readonly pushedAt?: string;
	readonly readme?: string;
	readonly stargazerCount?: number;
	readonly topics?: readonly string[];
	readonly usesCustomOpengraphImage?: boolean;
}

interface IAzureAPICenterInfo {
	readonly 'x-ms-icon'?: string;
}

interface IRawGalleryMcpServersMetadata {
	readonly count: number;
	readonly nextCursor?: string;
}

interface IRawGalleryMcpServersResult {
	readonly metadata: IRawGalleryMcpServersMetadata;
	readonly servers: readonly IRawGalleryMcpServer[];
}

interface IGalleryMcpServersResult {
	readonly metadata: IRawGalleryMcpServersMetadata;
	readonly servers: IGalleryMcpServer[];
}

interface IRawGalleryMcpServer {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly id?: string;
	readonly title?: string;
	readonly repository?: {
		readonly source: string;
		readonly url: string;
		readonly id?: string;
	};
	readonly readme?: string;
	readonly icons?: readonly IRawGalleryMcpServerIcon[];
	readonly status?: GalleryMcpServerStatus;
	readonly websiteUrl?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>;
	readonly registryInfo?: IMcpRegistryInfo;
	readonly githubInfo?: IGitHubInfo;
	readonly apicInfo?: IAzureAPICenterInfo;
}

interface IGalleryMcpServerDataSerializer {
	toRawGalleryMcpServerResult(input: unknown): IRawGalleryMcpServersResult | undefined;
	toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined;
}

interface IRawGalleryMcpServerIcon {
	readonly src: string;
	readonly theme?: IconTheme;
	readonly sizes?: string[];
	readonly mimeType?: IconMimeType;
}

const enum IconMimeType {
	PNG = 'image/png',
	JPEG = 'image/jpeg',
	JPG = 'image/jpg',
	SVG = 'image/svg+xml',
	WEBP = 'image/webp',
}

const enum IconTheme {
	LIGHT = 'light',
	DARK = 'dark',
}

namespace McpServerSchemaVersion_v2025_07_09 {

	export const VERSION = 'v0-2025-07-09';
	export const SCHEMA = `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`;

	interface RawGalleryMcpServerInput {
		readonly description?: string;
		readonly is_required?: boolean;
		readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
		readonly value?: string;
		readonly is_secret?: boolean;
		readonly default?: string;
		readonly choices?: readonly string[];
	}

	interface RawGalleryMcpServerVariableInput extends RawGalleryMcpServerInput {
		readonly variables?: Record<string, RawGalleryMcpServerInput>;
	}

	interface RawGalleryMcpServerPositionalArgument extends RawGalleryMcpServerVariableInput {
		readonly type: 'positional';
		readonly value_hint?: string;
		readonly is_repeated?: boolean;
	}

	interface RawGalleryMcpServerNamedArgument extends RawGalleryMcpServerVariableInput {
		readonly type: 'named';
		readonly name: string;
		readonly is_repeated?: boolean;
	}

	interface RawGalleryMcpServerKeyValueInput extends RawGalleryMcpServerVariableInput {
		readonly name: string;
		readonly value?: string;
	}

	type RawGalleryMcpServerArgument = RawGalleryMcpServerPositionalArgument | RawGalleryMcpServerNamedArgument;

	interface McpServerDeprecatedRemote {
		readonly transport_type?: 'streamable' | 'sse';
		readonly transport?: 'streamable' | 'sse';
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	type RawGalleryMcpServerRemotes = ReadonlyArray<SseTransport | StreamableHttpTransport | McpServerDeprecatedRemote>;

	type RawGalleryTransport = StdioTransport | StreamableHttpTransport | SseTransport;

	interface StdioTransport {
		readonly type: 'stdio';
	}

	interface StreamableHttpTransport {
		readonly type: 'streamable-http' | 'sse';
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface SseTransport {
		readonly type: 'sse';
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGalleryMcpServerPackage {
		readonly registry_name: string;
		readonly name: string;
		readonly registry_type: 'npm' | 'pypi' | 'docker-hub' | 'nuget' | 'remote' | 'mcpb';
		readonly registry_base_url?: string;
		readonly identifier: string;
		readonly version: string;
		readonly file_sha256?: string;
		readonly transport?: RawGalleryTransport;
		readonly package_arguments?: readonly RawGalleryMcpServerArgument[];
		readonly runtime_hint?: string;
		readonly runtime_arguments?: readonly RawGalleryMcpServerArgument[];
		readonly environment_variables?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGalleryMcpServer {
		readonly $schema: string;
		readonly name: string;
		readonly description: string;
		readonly status?: 'active' | 'deprecated';
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
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
		readonly _meta: {
			readonly 'io.modelcontextprotocol.registry/official': {
				readonly id: string;
				readonly is_latest: boolean;
				readonly published_at: string;
				readonly updated_at: string;
				readonly release_date?: string;
			};
			readonly 'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, unknown>;
		};
	}

	interface RawGalleryMcpServersResult {
		readonly metadata: {
			readonly count: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	interface RawGitHubInfo {
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

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: unknown): IRawGalleryMcpServersResult | undefined {
			if (!input || typeof input !== 'object' || !Array.isArray((input as RawGalleryMcpServersResult).servers)) {
				return undefined;
			}

			const from = <RawGalleryMcpServersResult>input;

			const servers: IRawGalleryMcpServer[] = [];
			for (const server of from.servers) {
				const rawServer = this.toRawGalleryMcpServer(server);
				if (!rawServer) {
					return undefined;
				}
				servers.push(rawServer);
			}

			return {
				metadata: {
					count: from.metadata.count ?? 0,
					nextCursor: from.metadata?.next_cursor
				},
				servers
			};
		}

		public toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined {
			if (!input || typeof input !== 'object') {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;

			if (
				(!from.name || !isString(from.name))
				|| (!from.description || !isString(from.description))
				|| (!from.version || !isString(from.version))
			) {
				return undefined;
			}

			if (from.$schema && from.$schema !== McpServerSchemaVersion_v2025_07_09.SCHEMA) {
				return undefined;
			}

			const registryInfo = from._meta?.['io.modelcontextprotocol.registry/official'];

			function convertServerInput(input: RawGalleryMcpServerInput): IMcpServerInput {
				return {
					...input,
					isRequired: input.is_required,
					isSecret: input.is_secret,
				};
			}

			function convertVariables(variables: Record<string, RawGalleryMcpServerInput>): Record<string, IMcpServerInput> {
				const result: Record<string, IMcpServerInput> = {};
				for (const [key, value] of Object.entries(variables)) {
					result[key] = convertServerInput(value);
				}
				return result;
			}

			function convertServerArgument(arg: RawGalleryMcpServerArgument): IMcpServerArgument {
				if (arg.type === 'positional') {
					return {
						...arg,
						valueHint: arg.value_hint,
						isRepeated: arg.is_repeated,
						isRequired: arg.is_required,
						isSecret: arg.is_secret,
						variables: arg.variables ? convertVariables(arg.variables) : undefined,
					};
				}
				return {
					...arg,
					isRepeated: arg.is_repeated,
					isRequired: arg.is_required,
					isSecret: arg.is_secret,
					variables: arg.variables ? convertVariables(arg.variables) : undefined,
				};
			}

			function convertKeyValueInput(input: RawGalleryMcpServerKeyValueInput): IMcpServerKeyValueInput {
				return {
					...input,
					isRequired: input.is_required,
					isSecret: input.is_secret,
					variables: input.variables ? convertVariables(input.variables) : undefined,
				};
			}

			function convertTransport(input: RawGalleryTransport): Transport {
				switch (input.type) {
					case 'stdio':
						return {
							type: TransportType.STDIO,
						};
					case 'streamable-http':
						return {
							type: TransportType.STREAMABLE_HTTP,
							url: input.url,
							headers: input.headers?.map(convertKeyValueInput),
						};
					case 'sse':
						return {
							type: TransportType.SSE,
							url: input.url,
							headers: input.headers?.map(convertKeyValueInput),
						};
					default:
						return {
							type: TransportType.STDIO,
						};
				}
			}

			function convertRegistryType(input: string): RegistryType {
				switch (input) {
					case 'npm':
						return RegistryType.NODE;
					case 'docker':
					case 'docker-hub':
					case 'oci':
						return RegistryType.DOCKER;
					case 'pypi':
						return RegistryType.PYTHON;
					case 'nuget':
						return RegistryType.NUGET;
					case 'mcpb':
						return RegistryType.MCPB;
					default:
						return RegistryType.NODE;
				}
			}

			const gitHubInfo: RawGitHubInfo | undefined = from._meta['io.modelcontextprotocol.registry/publisher-provided']?.github as RawGitHubInfo | undefined;

			return {
				id: registryInfo.id,
				name: from.name,
				description: from.description,
				repository: from.repository ? {
					url: from.repository.url,
					source: from.repository.source,
					id: from.repository.id,
				} : undefined,
				readme: from.repository?.readme,
				version: from.version,
				createdAt: from.created_at,
				updatedAt: from.updated_at,
				packages: from.packages?.map<IMcpServerPackage>(p => ({
					identifier: p.identifier ?? p.name,
					registryType: convertRegistryType(p.registry_type ?? p.registry_name),
					version: p.version,
					fileSha256: p.file_sha256,
					registryBaseUrl: p.registry_base_url,
					transport: p.transport ? convertTransport(p.transport) : { type: TransportType.STDIO },
					packageArguments: p.package_arguments?.map(convertServerArgument),
					runtimeHint: p.runtime_hint,
					runtimeArguments: p.runtime_arguments?.map(convertServerArgument),
					environmentVariables: p.environment_variables?.map(convertKeyValueInput),
				})),
				remotes: from.remotes?.map(remote => {
					const type = (<RawGalleryTransport>remote).type ?? (<McpServerDeprecatedRemote>remote).transport_type ?? (<McpServerDeprecatedRemote>remote).transport;
					return {
						type: type === TransportType.SSE ? TransportType.SSE : TransportType.STREAMABLE_HTTP,
						url: remote.url,
						headers: remote.headers?.map(convertKeyValueInput)
					};
				}),
				registryInfo: {
					isLatest: registryInfo.is_latest,
					publishedAt: registryInfo.published_at,
					updatedAt: registryInfo.updated_at,
				},
				githubInfo: gitHubInfo ? {
					name: gitHubInfo.name,
					nameWithOwner: gitHubInfo.name_with_owner,
					displayName: gitHubInfo.display_name,
					isInOrganization: gitHubInfo.is_in_organization,
					license: gitHubInfo.license,
					opengraphImageUrl: gitHubInfo.opengraph_image_url,
					ownerAvatarUrl: gitHubInfo.owner_avatar_url,
					primaryLanguage: gitHubInfo.primary_language,
					primaryLanguageColor: gitHubInfo.primary_language_color,
					pushedAt: gitHubInfo.pushed_at,
					stargazerCount: gitHubInfo.stargazer_count,
					topics: gitHubInfo.topics,
					usesCustomOpengraphImage: gitHubInfo.uses_custom_opengraph_image
				} : undefined
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_v0_1 {

	export const VERSION = 'v0.1';

	interface RawGalleryMcpServerInput {
		readonly choices?: readonly string[];
		readonly default?: string;
		readonly description?: string;
		readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
		readonly isRequired?: boolean;
		readonly isSecret?: boolean;
		readonly placeholder?: string;
		readonly value?: string;
	}

	interface RawGalleryMcpServerVariableInput extends RawGalleryMcpServerInput {
		readonly variables?: Record<string, RawGalleryMcpServerInput>;
	}

	interface RawGalleryMcpServerPositionalArgument extends RawGalleryMcpServerVariableInput {
		readonly type: 'positional';
		readonly valueHint?: string;
		readonly isRepeated?: boolean;
	}

	interface RawGalleryMcpServerNamedArgument extends RawGalleryMcpServerVariableInput {
		readonly type: 'named';
		readonly name: string;
		readonly isRepeated?: boolean;
	}

	interface RawGalleryMcpServerKeyValueInput extends RawGalleryMcpServerVariableInput {
		readonly name: string;
	}

	type RawGalleryMcpServerArgument = RawGalleryMcpServerPositionalArgument | RawGalleryMcpServerNamedArgument;

	type RawGalleryMcpServerRemotes = ReadonlyArray<SseTransport | StreamableHttpTransport>;

	type RawGalleryTransport = StdioTransport | StreamableHttpTransport | SseTransport;

	interface StdioTransport {
		readonly type: TransportType.STDIO;
	}

	interface StreamableHttpTransport {
		readonly type: TransportType.STREAMABLE_HTTP;
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface SseTransport {
		readonly type: TransportType.SSE;
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGalleryMcpServerPackage {
		readonly identifier: string;
		readonly registryType: RegistryType;
		readonly transport: RawGalleryTransport;
		readonly fileSha256?: string;
		readonly environmentVariables?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
		readonly packageArguments?: readonly RawGalleryMcpServerArgument[];
		readonly registryBaseUrl?: string;
		readonly runtimeArguments?: readonly RawGalleryMcpServerArgument[];
		readonly runtimeHint?: string;
		readonly version?: string;
	}

	interface RawGalleryMcpServer {
		readonly name: string;
		readonly description: string;
		readonly version: string;
		readonly $schema: string;
		readonly title?: string;
		readonly icons?: IRawGalleryMcpServerIcon[];
		readonly repository?: {
			readonly source: string;
			readonly url: string;
			readonly subfolder?: string;
			readonly id?: string;
		};
		readonly websiteUrl?: string;
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
		readonly _meta?: {
			readonly 'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, unknown>;
		} & IAzureAPICenterInfo;
	}

	interface RawGalleryMcpServerInfo {
		readonly server: RawGalleryMcpServer;
		readonly _meta: {
			readonly 'io.modelcontextprotocol.registry/official'?: {
				readonly status: GalleryMcpServerStatus;
				readonly isLatest: boolean;
				readonly publishedAt: string;
				readonly updatedAt?: string;
			};
		};
	}

	interface RawGalleryMcpServersResult {
		readonly metadata: {
			readonly count: number;
			readonly nextCursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServerInfo[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: unknown): IRawGalleryMcpServersResult | undefined {
			if (!input || typeof input !== 'object' || !Array.isArray((input as RawGalleryMcpServersResult).servers)) {
				return undefined;
			}

			const from = <RawGalleryMcpServersResult>input;

			const servers: IRawGalleryMcpServer[] = [];
			for (const server of from.servers) {
				const rawServer = this.toRawGalleryMcpServer(server);
				if (!rawServer) {
					if (servers.length === 0) {
						return undefined;
					} else {
						continue;
					}
				}
				servers.push(rawServer);
			}

			return {
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined {
			if (!input || typeof input !== 'object') {
				return undefined;
			}

			const from = <RawGalleryMcpServerInfo>input;

			if (
				(!from.server || !isObject(from.server))
				|| (!from.server.name || !isString(from.server.name))
				|| (!from.server.description || !isString(from.server.description))
				|| (!from.server.version || !isString(from.server.version))
			) {
				return undefined;
			}

			const { 'io.modelcontextprotocol.registry/official': registryInfo, ...apicInfo } = from._meta;
			const githubInfo = from.server._meta?.['io.modelcontextprotocol.registry/publisher-provided']?.github as IGitHubInfo | undefined;

			return {
				name: from.server.name,
				description: from.server.description,
				version: from.server.version,
				title: from.server.title,
				repository: from.server.repository ? {
					url: from.server.repository.url,
					source: from.server.repository.source,
					id: from.server.repository.id,
				} : undefined,
				readme: githubInfo?.readme,
				icons: from.server.icons,
				websiteUrl: from.server.websiteUrl,
				packages: from.server.packages,
				remotes: from.server.remotes,
				status: registryInfo?.status,
				registryInfo,
				githubInfo,
				apicInfo
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_v0 {

	export const VERSION = 'v0';

	class Serializer implements IGalleryMcpServerDataSerializer {

		private readonly galleryMcpServerDataSerializers: IGalleryMcpServerDataSerializer[] = [];

		constructor() {
			this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v0_1.SERIALIZER);
			this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v2025_07_09.SERIALIZER);
		}

		public toRawGalleryMcpServerResult(input: unknown): IRawGalleryMcpServersResult | undefined {
			for (const serializer of this.galleryMcpServerDataSerializers) {
				const result = serializer.toRawGalleryMcpServerResult(input);
				if (result) {
					return result;
				}
			}
			return undefined;
		}

		public toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined {
			for (const serializer of this.galleryMcpServerDataSerializers) {
				const result = serializer.toRawGalleryMcpServer(input);
				if (result) {
					return result;
				}
			}
			return undefined;
		}
	}

	export const SERIALIZER = new Serializer();
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

	private galleryMcpServerDataSerializers: Map<string, IGalleryMcpServerDataSerializer>;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
	) {
		super();
		this.galleryMcpServerDataSerializers = new Map();
		this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0.VERSION, McpServerSchemaVersion_v0.SERIALIZER);
		this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0_1.VERSION, McpServerSchemaVersion_v0_1.SERIALIZER);
	}

	isEnabled(): boolean {
		return this.mcpGalleryManifestService.mcpGalleryManifestStatus === McpGalleryManifestStatus.Available;
	}

	async query(options?: IQueryOptions, token: CancellationToken = CancellationToken.None): Promise<IIterativePager<IGalleryMcpServer>> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return {
				firstPage: { items: [], hasMore: false },
				getNextPage: async () => ({ items: [], hasMore: false })
			};
		}

		let query = new Query();
		if (options?.text) {
			query = query.withSearchText(options.text.trim());
		}

		const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);

		let currentCursor = metadata.nextCursor;
		return {
			firstPage: { items: servers, hasMore: !!metadata.nextCursor },
			getNextPage: async (ct: CancellationToken): Promise<IIterativePage<IGalleryMcpServer>> => {
				if (ct.isCancellationRequested) {
					throw new CancellationError();
				}
				if (!currentCursor) {
					return { items: [], hasMore: false };
				}
				const { servers, metadata: nextMetadata } = await this.queryGalleryMcpServers(query.withPage(currentCursor).withSearchText(undefined), mcpGalleryManifest, ct);
				currentCursor = nextMetadata.nextCursor;
				return { items: servers, hasMore: !!nextMetadata.nextCursor };
			}
		};
	}

	async getMcpServersFromGallery(infos: { name: string; id?: string }[]): Promise<IGalleryMcpServer[]> {
		const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!mcpGalleryManifest) {
			return [];
		}

		const mcpServers: IGalleryMcpServer[] = [];
		await Promise.allSettled(infos.map(async info => {
			const mcpServer = await this.getMcpServerByName(info, mcpGalleryManifest);
			if (mcpServer) {
				mcpServers.push(mcpServer);
			}
		}));

		return mcpServers;
	}

	private async getMcpServerByName({ name, id }: { name: string; id?: string }, mcpGalleryManifest: IMcpGalleryManifest): Promise<IGalleryMcpServer | undefined> {
		const mcpServerUrl = this.getLatestServerVersionUrl(name, mcpGalleryManifest);
		if (mcpServerUrl) {
			const mcpServer = await this.getMcpServer(mcpServerUrl);
			if (mcpServer) {
				return mcpServer;
			}
		}

		const byNameUrl = this.getNamedServerUrl(name, mcpGalleryManifest);
		if (byNameUrl) {
			const mcpServer = await this.getMcpServer(byNameUrl);
			if (mcpServer) {
				return mcpServer;
			}
		}

		const byIdUrl = id ? this.getServerIdUrl(id, mcpGalleryManifest) : undefined;
		if (byIdUrl) {
			const mcpServer = await this.getMcpServer(byIdUrl);
			if (mcpServer) {
				return mcpServer;
			}
		}

		return undefined;
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
		let displayName = server.title;

		if (server.githubInfo?.name) {
			if (!displayName) {
				displayName = server.githubInfo.name.split('-').map(s => s.toLowerCase() === 'mcp' ? 'MCP' : s.toLowerCase() === 'github' ? 'GitHub' : uppercaseFirstLetter(s)).join(' ');
			}
			publisher = server.githubInfo.nameWithOwner.split('/')[0];
		} else {
			const nameParts = server.name.split('/');
			if (nameParts.length > 0) {
				const domainParts = nameParts[0].split('.');
				if (domainParts.length > 0) {
					publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
				}
			}
			if (!displayName) {
				displayName = nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' ');
			}
		}

		if (server.githubInfo?.displayName) {
			displayName = server.githubInfo.displayName;
		}

		let icon: { light: string; dark: string } | undefined;

		if (server.githubInfo?.preferredImage) {
			icon = {
				light: server.githubInfo.preferredImage,
				dark: server.githubInfo.preferredImage
			};
		}

		else if (server.githubInfo?.ownerAvatarUrl) {
			icon = {
				light: server.githubInfo.ownerAvatarUrl,
				dark: server.githubInfo.ownerAvatarUrl
			};
		}

		else if (server.apicInfo?.['x-ms-icon']) {
			icon = {
				light: server.apicInfo['x-ms-icon'],
				dark: server.apicInfo['x-ms-icon']
			};
		}

		else if (server.icons && server.icons.length > 0) {
			const lightIcon = server.icons.find(icon => icon.theme === 'light') ?? server.icons[0];
			const darkIcon = server.icons.find(icon => icon.theme === 'dark') ?? lightIcon;
			icon = {
				light: lightIcon.src,
				dark: darkIcon.src
			};
		}

		const webUrl = manifest ? this.getWebUrl(server.name, manifest) : undefined;
		const publisherUrl = manifest ? this.getPublisherUrl(publisher, manifest) : undefined;

		return {
			id: server.id,
			name: server.name,
			displayName,
			galleryUrl: manifest?.url,
			webUrl,
			description: server.description,
			status: server.status ?? GalleryMcpServerStatus.Active,
			version: server.version,
			isLatest: server.registryInfo?.isLatest ?? true,
			publishDate: server.registryInfo?.publishedAt ? Date.parse(server.registryInfo.publishedAt) : undefined,
			lastUpdated: server.githubInfo?.pushedAt ? Date.parse(server.githubInfo.pushedAt) : server.registryInfo?.updatedAt ? Date.parse(server.registryInfo.updatedAt) : undefined,
			repositoryUrl: server.repository?.url,
			readme: server.readme,
			icon,
			publisher,
			publisherUrl,
			license: server.githubInfo?.license,
			starsCount: server.githubInfo?.stargazerCount,
			topics: server.githubInfo?.topics,
			configuration: {
				packages: server.packages,
				remotes: server.remotes
			}
		};
	}

	private async queryGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<IGalleryMcpServersResult> {
		const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
		return {
			servers: servers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest)),
			metadata
		};
	}

	private async queryRawGalleryMcpServers(query: Query, mcpGalleryManifest: IMcpGalleryManifest, token: CancellationToken): Promise<IRawGalleryMcpServersResult> {
		const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
		if (!mcpGalleryUrl) {
			return { servers: [], metadata: { count: 0 } };
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

		let url = `${mcpGalleryUrl}?limit=${query.pageSize}&version=latest`;
		if (query.cursor) {
			url += `&cursor=${query.cursor}`;
		}
		if (query.searchText) {
			const text = encodeURIComponent(query.searchText);
			url += `&search=${text}`;
		}

		const context = await this.requestService.request({
			type: 'GET',
			url,
		}, token);

		const data = await asJson(context);

		if (!data) {
			return { servers: [], metadata: { count: 0 } };
		}

		const result = this.serializeMcpServersResult(data, mcpGalleryManifest);

		if (!result) {
			throw new Error(`Failed to serialize MCP servers result from ${mcpGalleryUrl}`, data);
		}

		return result;
	}

	async getMcpServer(mcpServerUrl: string, mcpGalleryManifest?: IMcpGalleryManifest | null): Promise<IGalleryMcpServer | undefined> {
		const context = await this.requestService.request({
			type: 'GET',
			url: mcpServerUrl,
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
			return undefined;
		}

		const data = await asJson(context);
		if (!data) {
			return undefined;
		}

		if (!mcpGalleryManifest) {
			mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		}
		mcpGalleryManifest = mcpGalleryManifest && mcpServerUrl.startsWith(mcpGalleryManifest.url) ? mcpGalleryManifest : null;

		const server = this.serializeMcpServer(data, mcpGalleryManifest);
		if (!server) {
			throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
		}

		return this.toGalleryMcpServer(server, mcpGalleryManifest);
	}

	private serializeMcpServer(data: unknown, mcpGalleryManifest: IMcpGalleryManifest | null): IRawGalleryMcpServer | undefined {
		return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServer(data);
	}

	private serializeMcpServersResult(data: unknown, mcpGalleryManifest: IMcpGalleryManifest | null): IRawGalleryMcpServersResult | undefined {
		return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServerResult(data);
	}

	private getSerializer(mcpGalleryManifest: IMcpGalleryManifest | null): IGalleryMcpServerDataSerializer | undefined {
		const version = mcpGalleryManifest?.version ?? 'v0';
		return this.galleryMcpServerDataSerializers.get(version);
	}

	private getNamedServerUrl(name: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const namedResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerNamedResourceUri);
		if (!namedResourceUriTemplate) {
			return undefined;
		}
		return format2(namedResourceUriTemplate, { name });
	}

	private getServerIdUrl(id: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerIdUri);
		if (!resourceUriTemplate) {
			return undefined;
		}
		return format2(resourceUriTemplate, { id });
	}

	private getLatestServerVersionUrl(name: string, mcpGalleryManifest: IMcpGalleryManifest): string | undefined {
		const latestVersionResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerLatestVersionUri);
		if (!latestVersionResourceUriTemplate) {
			return undefined;
		}
		return format2(latestVersionResourceUriTemplate, { name: encodeURIComponent(name) });
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
