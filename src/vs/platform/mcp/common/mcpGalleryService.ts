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
import { GalleryMcpServerStatus, IGalleryMcpServer, IGalleryMcpServerConfiguration, IMcpGalleryService, IMcpServerArgument, IMcpServerInput, IMcpServerKeyValueInput, IMcpServerPackage, IQueryOptions, RegistryType, SseTransport, StreamableHttpTransport, Transport, TransportType } from './mcpManagement.js';
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType, IMcpGalleryManifest } from './mcpGalleryManifest.js';
import { IPageIterator, IPager, PageIteratorPager, singlePagePager } from '../../../base/common/paging.js';
import { CancellationError } from '../../../base/common/errors.js';
import { basename } from '../../../base/common/path.js';

interface IMcpRegistryInfo {
	readonly id: string;
	readonly isLatest: boolean;
	readonly publishedAt?: string;
	readonly updatedAt: string;
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

interface IRawGalleryMcpServersMetadata {
	readonly count: number;
	readonly total?: number;
	readonly next_cursor?: string;
}

interface IRawGalleryMcpServersResult {
	readonly metadata?: IRawGalleryMcpServersMetadata;
	readonly servers: readonly IRawGalleryMcpServer[];
}

interface IGalleryMcpServersResult {
	readonly metadata?: IRawGalleryMcpServersMetadata;
	readonly servers: IGalleryMcpServer[];
}

interface IRawGalleryMcpServer {
	readonly name: string;
	readonly description: string;
	readonly repository?: {
		readonly source: string;
		readonly url: string;
		readonly id?: string;
		readonly readme?: string;
	};
	readonly version: string;
	readonly status?: GalleryMcpServerStatus;
	readonly websiteUrl?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>;
	readonly registryInfo: IMcpRegistryInfo;
	readonly githubInfo?: IGitHubInfo;
}

interface IGalleryMcpServerDataSerializer {
	toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined;
	toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined;
}

namespace McpServerOldSchema {

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

	type RawGalleryMcpServerRemotes = ReadonlyArray<RawGallerySseTransport | RawGalleryStreamableHttpTransport | McpServerDeprecatedRemote>;

	type RawGalleryTransport = RawGalleryStdioTransport | RawGalleryStreamableHttpTransport | RawGallerySseTransport;

	interface RawGalleryStdioTransport {
		readonly type: 'stdio';
	}

	interface RawGalleryStreamableHttpTransport {
		readonly type: 'streamable-http';
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGallerySseTransport {
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
		readonly server: {
			readonly id: string;
			readonly name: string;
			readonly description: string;
			readonly version_detail: {
				readonly version: string;
				readonly release_date: string;
				readonly is_latest: boolean;
			};
			readonly repository?: {
				readonly source: string;
				readonly url: string;
				readonly id?: string;
				readonly subfolder?: string;
				readonly readme?: string;
			};
			readonly created_at: string;
			readonly updated_at: string;
			readonly packages?: readonly RawGalleryMcpServerPackage[];
			readonly remotes?: RawGalleryMcpServerRemotes;
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

	interface RawGalleryMcpServersResult {
		readonly metadata?: {
			readonly count: number;
			readonly total?: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined {
			if (!input || !Array.isArray(input.servers)) {
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
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined {
			if (!input || !input.server) {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;
			const registryInfo = from['x-io.modelcontextprotocol.registry'];

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

			function convertTransport(input: RawGalleryTransport): Transport | undefined {
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
						return undefined;
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

			return {
				name: from.server.name,
				description: from.server.description,
				repository: from.server.repository ? {
					url: from.server.repository.url,
					source: from.server.repository.source,
					id: from.server.repository.id,
					readme: from.server.repository.readme
				} : undefined,
				version: from.server.version_detail.version,
				createdAt: from.server.created_at,
				updatedAt: from.server.updated_at,
				packages: from.server.packages?.map<IMcpServerPackage>(p => ({
					identifier: p.identifier ?? p.name,
					registryType: convertRegistryType(p.registry_type ?? p.registry_name),
					version: p.version,
					fileSha256: p.file_sha256,
					registryBaseUrl: p.registry_base_url,
					transport: p.transport ? convertTransport(p.transport) : undefined,
					packageArguments: p.package_arguments?.map(convertServerArgument),
					runtimeHint: p.runtime_hint,
					runtimeArguments: p.runtime_arguments?.map(convertServerArgument),
					environmentVariables: p.environment_variables?.map(convertKeyValueInput),
				})),
				remotes: from.server.remotes?.map(remote => {
					const type = (<RawGalleryTransport>remote).type ?? (<McpServerDeprecatedRemote>remote).transport_type ?? (<McpServerDeprecatedRemote>remote).transport;
					return {
						type: type === TransportType.SSE ? TransportType.SSE : TransportType.STREAMABLE_HTTP,
						url: remote.url,
						headers: remote.headers?.map(convertKeyValueInput)
					};
				}),
				registryInfo: {
					id: registryInfo.id,
					isLatest: registryInfo.is_latest,
					publishedAt: registryInfo.published_at,
					updatedAt: registryInfo.updated_at,
				},
				githubInfo: from['x-github'],
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServer1ESSchema {

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

	type RawGalleryMcpServerRemotes = ReadonlyArray<RawGallerySseTransport | RawGalleryStreamableHttpTransport | McpServerDeprecatedRemote>;

	type RawGalleryTransport = RawGalleryStdioTransport | RawGalleryStreamableHttpTransport | RawGallerySseTransport;

	interface RawGalleryStdioTransport {
		readonly type: 'stdio';
	}

	interface RawGalleryStreamableHttpTransport {
		readonly type: 'streamable-http';
		readonly url: string;
		readonly headers?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGallerySseTransport {
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
		readonly id: string;
		readonly name: string;
		readonly description: string;
		readonly version_detail: {
			readonly version: string;
			readonly release_date: string;
			readonly is_latest: boolean;
		};
		readonly repository?: {
			readonly source: string;
			readonly url: string;
			readonly id?: string;
			readonly subfolder?: string;
			readonly readme?: string;
		};
		readonly created_at: string;
		readonly updated_at: string;
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
	}

	interface RawGalleryMcpServersResult {
		readonly metadata?: {
			readonly count: number;
			readonly total?: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined {
			if (!input || !Array.isArray(input.servers)) {
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
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined {
			if (!input || input.server || input.$schema) {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;

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

			function convertTransport(input: RawGalleryTransport): Transport | undefined {
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
						return undefined;
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

			return {
				name: from.name,
				description: from.description,
				repository: from.repository ? {
					url: from.repository.url,
					source: from.repository.source,
					id: from.repository.id,
					readme: from.repository.readme
				} : undefined,
				version: from.version_detail.version,
				createdAt: from.created_at,
				updatedAt: from.updated_at,
				packages: from.packages?.map<IMcpServerPackage>(p => ({
					identifier: p.identifier ?? p.name,
					registryType: convertRegistryType(p.registry_type ?? p.registry_name),
					version: p.version,
					fileSha256: p.file_sha256,
					registryBaseUrl: p.registry_base_url,
					transport: p.transport ? convertTransport(p.transport) : undefined,
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
					id: from.id,
					isLatest: true,
					updatedAt: from.updated_at,
				},
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_2025_01_09 {

	export const VERSION = '2025-09-01';
	export const SCHEMA = `https://static.modelcontextprotocol.io/schemas/${VERSION}/server.schema.json`;

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
		readonly version_detail: {
			readonly version: string;
			readonly release_date: string;
			readonly is_latest: boolean;
		};
		readonly created_at: string;
		readonly updated_at: string;
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
		readonly _meta: {
			readonly 'io.modelcontextprotocol.registry': {
				readonly id: string;
				readonly is_latest: boolean;
				readonly published_at: string;
				readonly updated_at: string;
				readonly release_date?: string;
			};
			readonly github?: IGitHubInfo;
		};
	}

	interface RawGalleryMcpServersResult {
		readonly metadata?: {
			readonly count: number;
			readonly total?: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined {
			if (!input || !Array.isArray(input.servers)) {
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
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined {
			if (!input || (<RawGalleryMcpServer>input).$schema !== McpServerSchemaVersion_2025_01_09.SCHEMA) {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;
			const registryInfo = from._meta?.['io.modelcontextprotocol.registry'];

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

			function convertTransport(input: RawGalleryTransport): Transport | undefined {
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
						return undefined;
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

			return {
				name: from.name,
				description: from.description,
				repository: from.repository ? {
					url: from.repository.url,
					source: from.repository.source,
					id: from.repository.id,
					readme: from.repository.readme
				} : undefined,
				version: from.version_detail.version,
				createdAt: from.created_at,
				updatedAt: from.updated_at,
				packages: from.packages?.map<IMcpServerPackage>(p => ({
					identifier: p.identifier ?? p.name,
					registryType: convertRegistryType(p.registry_type ?? p.registry_name),
					version: p.version,
					fileSha256: p.file_sha256,
					registryBaseUrl: p.registry_base_url,
					transport: p.transport ? convertTransport(p.transport) : undefined,
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
					id: registryInfo.id,
					isLatest: registryInfo.is_latest,
					publishedAt: registryInfo.published_at,
					updatedAt: registryInfo.updated_at,
				},
				githubInfo: from._meta.github,
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_2025_07_09 {

	export const VERSION = '2025-07-09';
	export const SCHEMA = `https://static.modelcontextprotocol.io/schemas/${VERSION}/server.schema.json`;

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
			readonly 'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, any>;
		};
	}

	interface RawGalleryMcpServersResult {
		readonly metadata?: {
			readonly count: number;
			readonly total?: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined {
			if (!input || !Array.isArray(input.servers)) {
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
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined {
			if (!input || (<RawGalleryMcpServer>input).$schema !== McpServerSchemaVersion_2025_07_09.SCHEMA) {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;
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

			function convertTransport(input: RawGalleryTransport): Transport | undefined {
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
						return undefined;
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

			return {
				name: from.name,
				description: from.description,
				repository: from.repository ? {
					url: from.repository.url,
					source: from.repository.source,
					id: from.repository.id,
					readme: from.repository.readme
				} : undefined,
				version: from.version,
				createdAt: from.created_at,
				updatedAt: from.updated_at,
				packages: from.packages?.map<IMcpServerPackage>(p => ({
					identifier: p.identifier ?? p.name,
					registryType: convertRegistryType(p.registry_type ?? p.registry_name),
					version: p.version,
					fileSha256: p.file_sha256,
					registryBaseUrl: p.registry_base_url,
					transport: p.transport ? convertTransport(p.transport) : undefined,
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
					id: registryInfo.id,
					isLatest: registryInfo.is_latest,
					publishedAt: registryInfo.published_at,
					updatedAt: registryInfo.updated_at,
				},
				githubInfo: from._meta['io.modelcontextprotocol.registry/publisher-provided']?.github,
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_2025_16_09 {

	export const VERSION = '2025-16-09';
	export const SCHEMA = `https://static.modelcontextprotocol.io/schemas/${VERSION}/server.schema.json`;

	interface RawGalleryMcpServerInput {
		readonly description?: string;
		readonly isRequired?: boolean;
		readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
		readonly value?: string;
		readonly isSecret?: boolean;
		readonly default?: string;
		readonly choices?: readonly string[];
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
		readonly value?: string;
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
		readonly registryName: string;
		readonly registryType: RegistryType;
		readonly registryBaseUrl?: string;
		readonly identifier: string;
		readonly version: string;
		readonly fileSha256?: string;
		readonly transport?: RawGalleryTransport;
		readonly packageArguments?: readonly RawGalleryMcpServerArgument[];
		readonly runtimeHint?: string;
		readonly runtimeArguments?: readonly RawGalleryMcpServerArgument[];
		readonly environmentVariables?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGalleryMcpServer {
		readonly $schema: string;
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
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
		readonly _meta: {
			readonly 'io.modelcontextprotocol.registry/official': {
				readonly id: string;
				readonly isLatest: boolean;
				readonly publishedAt: string;
				readonly updatedAt: string;
				readonly releaseDate?: string;
			};
			readonly 'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, any>;
		};
	}

	interface RawGalleryMcpServersResult {
		readonly metadata?: {
			readonly count: number;
			readonly total?: number;
			readonly next_cursor?: string;
		};
		readonly servers: readonly RawGalleryMcpServer[];
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServerResult(input: any): IRawGalleryMcpServersResult | undefined {
			if (!input || !Array.isArray(input.servers)) {
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
				metadata: from.metadata,
				servers
			};
		}

		public toRawGalleryMcpServer(input: any): IRawGalleryMcpServer | undefined {
			if (!input || (<RawGalleryMcpServer>input).$schema !== McpServerSchemaVersion_2025_16_09.SCHEMA) {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;

			return {
				name: from.name,
				description: from.description,
				repository: from.repository ? {
					url: from.repository.url,
					source: from.repository.source,
					id: from.repository.id,
					readme: from.repository.readme
				} : undefined,
				version: from.version,
				status: from.status,
				websiteUrl: from.websiteUrl,
				createdAt: from.createdAt,
				updatedAt: from.updatedAt,
				packages: from.packages,
				remotes: from.remotes,
				registryInfo: from._meta?.['io.modelcontextprotocol.registry/official'],
				githubInfo: from._meta['io.modelcontextprotocol.registry/publisher-provided']?.github,
			};
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
		this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_2025_07_09.VERSION, McpServerSchemaVersion_2025_07_09.SERIALIZER);
		this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_2025_01_09.VERSION, McpServerSchemaVersion_2025_01_09.SERIALIZER);
		this.galleryMcpServerDataSerializers.set('old', McpServerOldSchema.SERIALIZER);
		this.galleryMcpServerDataSerializers.set('1es', McpServer1ESSchema.SERIALIZER);
		this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_2025_16_09.VERSION, McpServerSchemaVersion_2025_16_09.SERIALIZER);
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

		const result = await asJson(context);
		if (!result) {
			throw new Error(`Failed to fetch configuration from ${gallery.url}`);
		}

		const server = this.serializeMcpServer(result);
		if (!server) {
			throw new Error(`Failed to serialize MCP server data from ${gallery.url}`, result);
		}

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
			isLatest: server.registryInfo.isLatest,
			publishDate: server.registryInfo.publishedAt ? Date.parse(server.registryInfo.publishedAt) : undefined,
			lastUpdated: server.githubInfo?.pushed_at ? Date.parse(server.githubInfo.pushed_at) : server.registryInfo ? Date.parse(server.registryInfo.updatedAt) : undefined,
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

	private toGalleryMcpServerConfiguration(packages?: readonly IMcpServerPackage[], remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>): IGalleryMcpServerConfiguration | undefined {
		if (!packages && !remotes) {
			return undefined;
		}
		return {
			packages,
			remotes
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

		const data = await asJson(context);

		if (!data) {
			return { servers: [] };
		}

		const result = this.serializeMcpServersResult(data);

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

		const server = this.serializeMcpServer(data);
		if (!server) {
			throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
		}

		if (!mcpGalleryManifest) {
			mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
			if (mcpGalleryManifest && mcpServerUrl !== this.getServerUrl(basename(mcpServerUrl), mcpGalleryManifest)) {
				mcpGalleryManifest = null;
			}
		}

		return this.toGalleryMcpServer(server, mcpGalleryManifest);
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

		const data = await asJson(context);
		if (!data) {
			return undefined;
		}

		const server = this.serializeMcpServer(data);
		if (!server) {
			throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
		}

		return this.toGalleryMcpServer(server, mcpGalleryManifest);
	}

	private serializeMcpServer(data: any): IRawGalleryMcpServer | undefined {
		for (const [, serializer] of this.galleryMcpServerDataSerializers) {
			const result = serializer.toRawGalleryMcpServer(data);
			if (result) {
				return result;
			}
		}
		return undefined;
	}

	private serializeMcpServersResult(data: any): IRawGalleryMcpServersResult | undefined {
		for (const [, serializer] of this.galleryMcpServerDataSerializers) {
			const result = serializer.toRawGalleryMcpServerResult(data);
			if (result) {
				return result;
			}
		}
		return undefined;
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
