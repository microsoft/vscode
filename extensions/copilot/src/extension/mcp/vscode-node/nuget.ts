/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import path from 'path';
import { l10n } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { randomPath } from '../../../util/vs/base/common/extpath';
import { isObject } from '../../../util/vs/base/common/types';
import { ValidatePackageErrorType, ValidatePackageResult } from './commands';
import { CommandExecutor, ICommandExecutor } from './util';

interface NuGetServiceIndexResponse {
	resources?: Array<{ '@id': string; '@type': string }>;
}

interface DotnetPackageSearchOutput {
	searchResult?: Array<SourceResult>;
}

interface SourceResult {
	sourceName: string;
	packages?: Array<LatestPackageResult>;
}

interface LatestPackageResult {
	id: string;
	latestVersion: string;
	owners?: string;
}

interface DotnetCli {
	command: string;
	args: Array<string>;
}

const MCP_SERVER_SCHEMA_2025_07_09_GH = 'https://modelcontextprotocol.io/schemas/draft/2025-07-09/server.json';

export class NuGetMcpSetup {
	constructor(
		public readonly logService: ILogService,
		public readonly fetcherService: IFetcherService,

		public readonly commandExecutor: ICommandExecutor = new CommandExecutor(),

		public readonly dotnet: DotnetCli = { command: 'dotnet', args: [] },

		// use NuGet.org central registry
		// see https://github.com/microsoft/vscode/issues/259901 for future options
		public readonly source: string = 'https://api.nuget.org/v3/index.json'
	) { }

	async getNuGetPackageMetadata(id: string): Promise<ValidatePackageResult> {
		// use the home directory, which is the default for MCP servers
		// see https://github.com/microsoft/vscode/issues/259901 for future options
		const cwd = os.homedir();

		// check for .NET CLI version for a quick "is dotnet installed?" check
		let dotnetVersion;
		try {
			dotnetVersion = await this.getDotnetVersion(cwd);
		} catch (error) {
			const errorCode = error.hasOwnProperty('code') ? String((error as any).code) : undefined;
			if (errorCode === 'ENOENT') {
				return {
					state: 'error',
					error: l10n.t("The '{0}' command was not found. .NET SDK 10 or newer must be installed and available in PATH.", this.dotnet.command),
					errorType: ValidatePackageErrorType.MissingCommand,
					helpUri: 'https://aka.ms/vscode-mcp-install/dotnet',
					helpUriLabel: l10n.t("Install .NET SDK"),
				};
			} else {
				throw error;
			}
		}

		// dnx is used for running .NET MCP servers and it was shipped with .NET 10
		const dotnetMajorVersion = parseInt(dotnetVersion.split('.')[0]);
		if (dotnetMajorVersion < 10) {
			return {
				state: 'error',
				error: l10n.t("The installed .NET SDK must be version 10 or newer. Found {0}.", dotnetVersion),
				errorType: ValidatePackageErrorType.BadCommandVersion,
				helpUri: 'https://aka.ms/vscode-mcp-install/dotnet',
				helpUriLabel: l10n.t("Update .NET SDK"),
			};
		}

		// check if the package exists, using .NET CLI
		const latest = await this.getLatestPackageVersion(cwd, id);
		if (!latest) {
			return {
				state: 'error',
				errorType: ValidatePackageErrorType.NotFound,
				error: l10n.t("Package {0} does not exist on NuGet.org.", id)
			};
		}

		// read the package readme from NuGet.org, using the HTTP API
		const readme = await this.getPackageReadmeFromNuGetOrgAsync(latest.id, latest.version);

		return {
			state: 'ok',
			publisher: latest.owners ?? 'unknown',
			name: latest.id,
			version: latest.version,
			readme,
			getMcpServer: async (installConsent) => {
				// getting the server.json downloads the package, so wait for consent
				await installConsent;
				const manifest = await this.getServerManifest(latest.id, latest.version);
				return mapServerJsonToMcpServer(manifest, RegistryType.NUGET);
			},
		};
	}

	async getServerManifest(id: string, version: string): Promise<string | undefined> {
		this.logService.info(`Reading .mcp/server.json from NuGet package ${id}@${version}.`);
		const installDir = randomPath(os.tmpdir(), 'vscode-nuget-mcp');
		try {
			// perform a local tool install using the .NET CLI
			// this warms the cache (user packages folder) so dnx will be fast
			// this also makes the server.json available which will be mapped to VS Code MCP config
			await fs.mkdir(installDir, { recursive: true });

			// the cwd must be the install directory or a child directory for local tool install to work
			const cwd = installDir;

			const packagesDir = await this.getGlobalPackagesPath(id, version, cwd);
			if (!packagesDir) { return undefined; }

			// explicitly create a tool manifest in the off chance one already exists in a parent directory
			const createManifestSuccess = await this.createToolManifest(id, version, cwd);
			if (!createManifestSuccess) { return undefined; }

			const localInstallSuccess = await this.installLocalTool(id, version, cwd);
			if (!localInstallSuccess) { return undefined; }

			return await this.readServerManifest(packagesDir, id, version);
		} catch (e) {
			this.logService.warn(`
Failed to install NuGet package ${id}@${version}. Proceeding without server.json.
Error: ${e}`);
		} finally {
			try {
				await fs.rm(installDir, { recursive: true, force: true });
			} catch (e) {
				this.logService.warn(`Failed to clean up temporary .NET tool install directory ${installDir}.
Error: ${e}`);
			}
		}
	}

	async getDotnetVersion(cwd: string): Promise<string> {
		const args = this.dotnet.args.concat(['--version']);
		const result = await this.commandExecutor.executeWithTimeout(this.dotnet.command, args, cwd);
		const version = result.stdout.trim();
		if (result.exitCode !== 0 || !version) {
			this.logService.warn(`Failed to check for .NET version while checking if a NuGet MCP server exists.
stdout: ${result.stdout}
stderr: ${result.stderr}`);
			throw new Error(`Failed to check for .NET version using '${this.dotnet.command} --version'.`);
		}

		return version;
	}

	async getLatestPackageVersion(cwd: string, id: string): Promise<{ id: string; version: string; owners?: string } | undefined> {
		// we don't use --exact-match here because it does not return owner information on NuGet.org
		const args = this.dotnet.args.concat(['package', 'search', id, '--source', this.source, '--prerelease', '--format', 'json']);
		const searchResult = await this.commandExecutor.executeWithTimeout(this.dotnet.command, args, cwd);
		const searchData: DotnetPackageSearchOutput = JSON.parse(searchResult.stdout.trim());
		for (const result of searchData.searchResult ?? []) {
			for (const pkg of result.packages ?? []) {
				if (pkg.id.toUpperCase() === id.toUpperCase()) {
					return { id: pkg.id, version: pkg.latestVersion, owners: pkg.owners };
				}
			}
		}
	}

	async getPackageReadmeFromNuGetOrgAsync(id: string, version: string): Promise<string | undefined> {
		try {
			const sourceUrl = URL.parse(this.source);
			if (sourceUrl?.protocol !== 'https:' || !sourceUrl.pathname.endsWith('.json')) {
				this.logService.warn(`NuGet package source is not an HTTPS V3 source URL. Cannot fetch a readme for ${id}@${version}.`);
				return;
			}

			// download the service index to locate services
			// https://learn.microsoft.com/en-us/nuget/api/service-index
			const serviceIndexResponse = await this.fetcherService.fetch(this.source, { method: 'GET', callSite: 'mcp-nuget-service-index' });
			if (serviceIndexResponse.status !== 200) {
				this.logService.warn(`Unable to read the service index for NuGet.org while fetching readme for ${id}@${version}.
HTTP status: ${serviceIndexResponse.status}`);
				return;
			}

			const serviceIndex = await serviceIndexResponse.json() as NuGetServiceIndexResponse;

			// try to fetch the package readme using the URL template
			// https://learn.microsoft.com/en-us/nuget/api/readme-template-resource
			const readmeTemplate = serviceIndex.resources?.find(resource => resource['@type'] === 'ReadmeUriTemplate/6.13.0')?.['@id'];
			if (!readmeTemplate) {
				this.logService.warn(`No readme URL template found for ${id}@${version} on NuGet.org.`);
				return;
			}

			const readmeUrl = readmeTemplate
				.replace('{lower_id}', encodeURIComponent(id.toLowerCase()))
				.replace('{lower_version}', encodeURIComponent(version.toLowerCase()));
			const readmeResponse = await this.fetcherService.fetch(readmeUrl, { method: 'GET', callSite: 'mcp-nuget-readme' });
			if (readmeResponse.status === 200) {
				return readmeResponse.text();
			} else if (readmeResponse.status === 404) {
				this.logService.info(`No package readme exists for ${id}@${version} on NuGet.org.`);
			} else {
				this.logService.warn(`Failed to read package readme for ${id}@${version} from NuGet.org.
HTTP status: ${readmeResponse.status}`);
			}
		} catch (error) {
			this.logService.warn(`Failed to read package readme for ${id}@${version} from NuGet.org.
Error: ${error}`);
		}
	}

	async getGlobalPackagesPath(id: string, version: string, cwd: string): Promise<string | undefined> {
		const args = this.dotnet.args.concat(['nuget', 'locals', 'global-packages', '--list', '--force-english-output']);
		const globalPackagesResult = await this.commandExecutor.executeWithTimeout(this.dotnet.command, args, cwd);

		if (globalPackagesResult.exitCode !== 0) {
			this.logService.warn(`Failed to discover the NuGet global packages folder. Proceeding without server.json for ${id}@${version}.
stdout: ${globalPackagesResult.stdout}
stderr: ${globalPackagesResult.stderr}`);
			return undefined;
		}

		// output looks like:
		// global-packages: C:\Users\username\.nuget\packages\
		return globalPackagesResult.stdout.trim().split(' ', 2).at(-1)?.trim();
	}

	async createToolManifest(id: string, version: string, cwd: string): Promise<boolean> {
		const args = this.dotnet.args.concat(['new', 'tool-manifest']);
		const result = await this.commandExecutor.executeWithTimeout(this.dotnet.command, args, cwd);

		if (result.exitCode !== 0) {
			this.logService.warn(`Failed to create tool manifest.Proceeding without server.json for ${id}@${version}.
stdout: ${result.stdout}
stderr: ${result.stderr}`);
			return false;
		}

		return true;
	}

	async installLocalTool(id: string, version: string, cwd: string): Promise<boolean> {
		const args = this.dotnet.args.concat(['tool', 'install', `${id}@${version}`, '--source', this.source, '--local', '--create-manifest-if-needed']);
		const installResult = await this.commandExecutor.executeWithTimeout(this.dotnet.command, args, cwd);

		if (installResult.exitCode !== 0) {
			this.logService.warn(`Failed to install local tool ${id} @${version}. Proceeding without server.json for ${id}@${version}.
stdout: ${installResult.stdout}
stderr: ${installResult.stderr}`);
			return false;
		}

		return true;
	}

	prepareServerJson(manifest: any, id: string, version: string): any {
		// Force the ID and version of matching NuGet package in the server.json to the one we installed.
		// This handles cases where the server.json in the package is stale.
		// The ID should match generally, but we'll protect against unexpected package IDs.
		// We handle old and new schema formats:
		// - https://modelcontextprotocol.io/schemas/draft/2025-07-09/server.json (only hosted in GitHub)
		// - https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json (had several breaking changes over time)
		// - https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json
		if (manifest?.packages) {
			for (const pkg of manifest.packages) {
				if (!pkg) { continue; }
				const registryType = pkg.registryType ?? pkg.registry_type ?? pkg.registry_name;
				if (registryType === 'nuget') {
					if (pkg.name && pkg.name !== id) {
						this.logService.warn(`Package name mismatch in NuGet.mcp / server.json: expected ${id}, found ${pkg.name}.`);
						pkg.name = id;
					}

					if (pkg.identifier && pkg.identifier !== id) {
						this.logService.warn(`Package identifier mismatch in NuGet.mcp / server.json: expected ${id}, found ${pkg.identifier}.`);
						pkg.identifier = id;
					}

					if (pkg.version !== version) {
						this.logService.warn(`Package version mismatch in NuGet.mcp / server.json: expected ${version}, found ${pkg.version}.`);
						pkg.version = version;
					}
				}
			}
		}

		// the original .NET MCP server project template used a schema URL that is deprecated
		if (manifest['$schema'] === MCP_SERVER_SCHEMA_2025_07_09_GH || !manifest['$schema']) {
			manifest['$schema'] = McpServerSchemaVersion_v2025_07_09.SCHEMA;
		}

		// add missing properties to improve mapping
		if (!manifest.name) { manifest.name = id; }
		if (!manifest.description) { manifest.description = id; }
		if (!manifest.version) { manifest.version = version; }

		return manifest;
	}

	async readServerManifest(packagesDir: string, id: string, version: string): Promise<string | undefined> {
		const serverJsonPath = path.join(packagesDir, id.toLowerCase(), version.toLowerCase(), '.mcp', 'server.json');
		try {
			await fs.access(serverJsonPath, fs.constants.R_OK);
		} catch {
			this.logService.info(`No server.json found at ${serverJsonPath}. Proceeding without server.json for ${id}@${version}.`);
			return undefined;
		}

		const json = await fs.readFile(serverJsonPath, 'utf8');
		let manifest;
		try {
			manifest = JSON.parse(json);
		} catch {
			this.logService.warn(`Invalid JSON in NuGet package server.json at ${serverJsonPath}. Proceeding without server.json for ${id}@${version}.`);
			return undefined;
		}
		if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
			this.logService.warn(`Invalid JSON in NuGet package server.json at ${serverJsonPath}. Proceeding without server.json for ${id}@${version}.`);
			return undefined;
		}

		return this.prepareServerJson(manifest, id, version);
	}
}

export function mapServerJsonToMcpServer(input: unknown, registryType: RegistryType): Omit<IInstallableMcpServer, 'name'> | undefined {
	let data: any = input;

	if (!data || typeof data !== 'object' || typeof data.$schema !== 'string') {
		return undefined;
	}

	// starting from 2025-09-29, the server.json is wrapped in a "server" property
	if (data.$schema !== McpServerSchemaVersion_v2025_07_09.SCHEMA) {
		data = { server: data };
	}

	const raw = McpServerSchemaVersion_v0.SERIALIZER.toRawGalleryMcpServer(data);
	if (!raw) {
		return undefined;
	}

	const utility = new McpMappingUtility();
	const result = utility.getMcpServerConfigurationFromManifest(raw, registryType);
	return result.mcpServerConfiguration;
}

// Copied from https://github.com/microsoft/vscode/blob/f8e2f71c2f78ac1ce63389e761e2aefc724646fc/src/vs/platform/mcp/common/mcpGalleryService.ts

interface IGalleryMcpServerDataSerializer {
	toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined;
}

interface IRawGalleryMcpServer {
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>;
}

export namespace McpServerSchemaVersion_v2025_07_09 {

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
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined {
			if (!input || typeof input !== 'object') {
				return undefined;
			}

			const from = <RawGalleryMcpServer>input;

			if (from.$schema && from.$schema !== McpServerSchemaVersion_v2025_07_09.SCHEMA) {
				return undefined;
			}

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

			return {
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
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

namespace McpServerSchemaVersion_v0_1 {

	export const VERSION = 'v0.1';
	export const SCHEMA = `https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json`;

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
		readonly registryType: RegistryType;
		readonly identifier: string;
		readonly version: string;
		readonly transport: RawGalleryTransport;
		readonly registryBaseUrl?: string;
		readonly fileSha256?: string;
		readonly packageArguments?: readonly RawGalleryMcpServerArgument[];
		readonly runtimeHint?: string;
		readonly runtimeArguments?: readonly RawGalleryMcpServerArgument[];
		readonly environmentVariables?: ReadonlyArray<RawGalleryMcpServerKeyValueInput>;
	}

	interface RawGalleryMcpServer {
		readonly $schema: string;
		readonly packages?: readonly RawGalleryMcpServerPackage[];
		readonly remotes?: RawGalleryMcpServerRemotes;
	}

	interface RawGalleryMcpServerInfo {
		readonly server: RawGalleryMcpServer;
	}

	class Serializer implements IGalleryMcpServerDataSerializer {

		public toRawGalleryMcpServer(input: unknown): IRawGalleryMcpServer | undefined {
			if (!input || typeof input !== 'object') {
				return undefined;
			}

			const from = <RawGalleryMcpServerInfo>input;

			if (
				(!from.server || !isObject(from.server))
			) {
				return undefined;
			}

			if (from.server.$schema && from.server.$schema !== McpServerSchemaVersion_v0_1.SCHEMA) {
				return undefined;
			}

			return {
				packages: from.server.packages,
				remotes: from.server.remotes,
			};
		}
	}

	export const SERIALIZER = new Serializer();
}

export namespace McpServerSchemaVersion_v0 {

	export const VERSION = 'v0';

	class Serializer implements IGalleryMcpServerDataSerializer {

		private readonly galleryMcpServerDataSerializers: IGalleryMcpServerDataSerializer[] = [];

		constructor() {
			this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v0_1.SERIALIZER);
			this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v2025_07_09.SERIALIZER);
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


export interface IMcpServerInput {
	readonly description?: string;
	readonly isRequired?: boolean;
	readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
	readonly value?: string;
	readonly isSecret?: boolean;
	readonly default?: string;
	readonly choices?: readonly string[];
}

export interface IMcpServerVariableInput extends IMcpServerInput {
	readonly variables?: Record<string, IMcpServerInput>;
}

export interface IMcpServerPositionalArgument extends IMcpServerVariableInput {
	readonly type: 'positional';
	readonly valueHint?: string;
	readonly isRepeated?: boolean;
}

export interface IMcpServerNamedArgument extends IMcpServerVariableInput {
	readonly type: 'named';
	readonly name: string;
	readonly isRepeated?: boolean;
}

export interface IMcpServerKeyValueInput extends IMcpServerVariableInput {
	readonly name: string;
	readonly value?: string;
}

export type IMcpServerArgument = IMcpServerPositionalArgument | IMcpServerNamedArgument;

export const enum RegistryType {
	NODE = 'npm',
	PYTHON = 'pypi',
	DOCKER = 'oci',
	NUGET = 'nuget',
	MCPB = 'mcpb',
	REMOTE = 'remote'
}

export const enum TransportType {
	STDIO = 'stdio',
	STREAMABLE_HTTP = 'streamable-http',
	SSE = 'sse'
}

export interface StdioTransport {
	readonly type: TransportType.STDIO;
}

export interface StreamableHttpTransport {
	readonly type: TransportType.STREAMABLE_HTTP;
	readonly url: string;
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface SseTransport {
	readonly type: TransportType.SSE;
	readonly url: string;
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export type Transport = StdioTransport | StreamableHttpTransport | SseTransport;

export interface IMcpServerPackage {
	readonly registryType: RegistryType;
	readonly identifier: string;
	readonly version: string;
	readonly transport?: Transport;
	readonly registryBaseUrl?: string;
	readonly fileSha256?: string;
	readonly packageArguments?: readonly IMcpServerArgument[];
	readonly runtimeHint?: string;
	readonly runtimeArguments?: readonly IMcpServerArgument[];
	readonly environmentVariables?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IGalleryMcpServerConfiguration {
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>;
}

export const enum GalleryMcpServerStatus {
	Active = 'active',
	Deprecated = 'deprecated'
}

export interface IInstallableMcpServer {
	readonly name: string;
	readonly config: IMcpServerConfiguration;
	readonly inputs?: IMcpServerVariable[];
}

export type McpServerConfiguration = Omit<IInstallableMcpServer, 'name'>;
export interface McpServerConfigurationParseResult {
	readonly mcpServerConfiguration: McpServerConfiguration;
	readonly notices: string[];
}


// Copied from https://github.com/microsoft/vscode/blob/f8e2f71c2f78ac1ce63389e761e2aefc724646fc/src/vs/platform/mcp/common/mcpManagementService.ts

export class McpMappingUtility {
	getMcpServerConfigurationFromManifest(manifest: IGalleryMcpServerConfiguration, packageType: RegistryType): McpServerConfigurationParseResult {

		// remote
		if (packageType === RegistryType.REMOTE && manifest.remotes?.length) {
			const { inputs, variables } = this.processKeyValueInputs(manifest.remotes[0].headers ?? []);
			return {
				mcpServerConfiguration: {
					config: {
						type: McpServerType.REMOTE,
						url: manifest.remotes[0].url,
						headers: Object.keys(inputs).length ? inputs : undefined,
					},
					inputs: variables.length ? variables : undefined,
				},
				notices: [],
			};
		}

		// local
		const serverPackage = manifest.packages?.find(p => p.registryType === packageType) ?? manifest.packages?.[0];
		if (!serverPackage) {
			throw new Error(`No server package found`);
		}

		const args: string[] = [];
		const inputs: IMcpServerVariable[] = [];
		const env: Record<string, string> = {};
		const notices: string[] = [];

		if (serverPackage.registryType === RegistryType.DOCKER) {
			args.push('run');
			args.push('-i');
			args.push('--rm');
		}

		if (serverPackage.runtimeArguments?.length) {
			const result = this.processArguments(serverPackage.runtimeArguments ?? []);
			args.push(...result.args);
			inputs.push(...result.variables);
			notices.push(...result.notices);
		}

		if (serverPackage.environmentVariables?.length) {
			const { inputs: envInputs, variables: envVariables, notices: envNotices } = this.processKeyValueInputs(serverPackage.environmentVariables ?? []);
			inputs.push(...envVariables);
			notices.push(...envNotices);
			for (const [name, value] of Object.entries(envInputs)) {
				env[name] = value;
				if (serverPackage.registryType === RegistryType.DOCKER) {
					args.push('-e');
					args.push(name);
				}
			}
		}

		switch (serverPackage.registryType) {
			case RegistryType.NODE:
				args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
				break;
			case RegistryType.PYTHON:
				args.push(serverPackage.version ? `${serverPackage.identifier}==${serverPackage.version}` : serverPackage.identifier);
				break;
			case RegistryType.DOCKER:
				args.push(serverPackage.version ? `${serverPackage.identifier}:${serverPackage.version}` : serverPackage.identifier);
				break;
			case RegistryType.NUGET:
				args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
				args.push('--yes'); // installation is confirmed by the UI, so --yes is appropriate here
				if (serverPackage.packageArguments?.length) {
					args.push('--');
				}
				break;
		}

		if (serverPackage.packageArguments?.length) {
			const result = this.processArguments(serverPackage.packageArguments);
			args.push(...result.args);
			inputs.push(...result.variables);
			notices.push(...result.notices);
		}

		return {
			notices,
			mcpServerConfiguration: {
				config: {
					type: McpServerType.LOCAL,
					command: this.getCommandName(serverPackage.registryType),
					args: args.length ? args : undefined,
					env: Object.keys(env).length ? env : undefined,
				},
				inputs: inputs.length ? inputs : undefined,
			}
		};
	}

	protected getCommandName(packageType: RegistryType): string {
		switch (packageType) {
			case RegistryType.NODE: return 'npx';
			case RegistryType.DOCKER: return 'docker';
			case RegistryType.PYTHON: return 'uvx';
			case RegistryType.NUGET: return 'dnx';
		}
		return packageType;
	}

	protected getVariables(variableInputs: Record<string, IMcpServerInput>): IMcpServerVariable[] {
		const variables: IMcpServerVariable[] = [];
		for (const [key, value] of Object.entries(variableInputs)) {
			variables.push({
				id: key,
				type: value.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
				description: value.description ?? '',
				password: !!value.isSecret,
				default: value.default,
				options: value.choices,
			});
		}
		return variables;
	}

	private processKeyValueInputs(keyValueInputs: ReadonlyArray<IMcpServerKeyValueInput>): { inputs: Record<string, string>; variables: IMcpServerVariable[]; notices: string[] } {
		const notices: string[] = [];
		const inputs: Record<string, string> = {};
		const variables: IMcpServerVariable[] = [];

		for (const input of keyValueInputs) {
			const inputVariables = input.variables ? this.getVariables(input.variables) : [];
			let value = input.value || '';

			// If explicit variables exist, use them regardless of value
			if (inputVariables.length) {
				for (const variable of inputVariables) {
					value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
				}
				variables.push(...inputVariables);
			} else if (!value && (input.description || input.choices || input.default !== undefined)) {
				// Only create auto-generated input variable if no explicit variables and no value
				variables.push({
					id: input.name,
					type: input.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
					description: input.description ?? '',
					password: !!input.isSecret,
					default: input.default,
					options: input.choices,
				});
				value = `\${input:${input.name}}`;
			}

			inputs[input.name] = value;
		}

		return { inputs, variables, notices };
	}

	private processArguments(argumentsList: readonly IMcpServerArgument[]): { args: string[]; variables: IMcpServerVariable[]; notices: string[] } {
		const args: string[] = [];
		const variables: IMcpServerVariable[] = [];
		const notices: string[] = [];
		for (const arg of argumentsList) {
			const argVariables = arg.variables ? this.getVariables(arg.variables) : [];

			if (arg.type === 'positional') {
				let value = arg.value;
				if (value) {
					for (const variable of argVariables) {
						value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
					}
					args.push(value);
					if (argVariables.length) {
						variables.push(...argVariables);
					}
				} else if (arg.valueHint && (arg.description || arg.default !== undefined)) {
					// Create input variable for positional argument without value
					variables.push({
						id: arg.valueHint,
						type: McpServerVariableType.PROMPT,
						description: arg.description ?? '',
						password: false,
						default: arg.default,
					});
					args.push(`\${input:${arg.valueHint}}`);
				} else {
					// Fallback to value_hint as literal
					args.push(arg.valueHint ?? '');
				}
			} else if (arg.type === 'named') {
				if (!arg.name) {
					notices.push(`Named argument is missing a name. ${JSON.stringify(arg)}`);
					continue;
				}
				args.push(arg.name);
				if (arg.value) {
					let value = arg.value;
					for (const variable of argVariables) {
						value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
					}
					args.push(value);
					if (argVariables.length) {
						variables.push(...argVariables);
					}
				} else if (arg.description || arg.default !== undefined) {
					// Create input variable for named argument without value
					const variableId = arg.name.replace(/^--?/, '');
					variables.push({
						id: variableId,
						type: McpServerVariableType.PROMPT,
						description: arg.description ?? '',
						password: false,
						default: arg.default,
					});
					args.push(`\${input:${variableId}}`);
				}
			}
		}
		return { args, variables, notices };
	}
}


// Copied from https://github.com/microsoft/vscode/blob/f8e2f71c2f78ac1ce63389e761e2aefc724646fc/src/vs/platform/mcp/common/mcpPlatformTypes.ts

export interface IMcpDevModeConfig {
	/** Pattern or list of glob patterns to watch relative to the workspace folder. */
	watch?: string | string[];
	/** Whether to debug the MCP server when it's started. */
	debug?: { type: 'node' } | { type: 'debugpy'; debugpyPath?: string };
}

export const enum McpServerVariableType {
	PROMPT = 'promptString',
	PICK = 'pickString',
}

export interface IMcpServerVariable {
	readonly id: string;
	readonly type: McpServerVariableType;
	readonly description: string;
	readonly password: boolean;
	readonly default?: string;
	readonly options?: readonly string[];
	readonly serverName?: string;
}

export const enum McpServerType {
	LOCAL = 'stdio',
	REMOTE = 'http',
}

export interface ICommonMcpServerConfiguration {
	readonly type: McpServerType;
	readonly version?: string;
	readonly gallery?: boolean | string;
}

export interface IMcpStdioServerConfiguration extends ICommonMcpServerConfiguration {
	readonly type: McpServerType.LOCAL;
	readonly command: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string | number | null>;
	readonly envFile?: string;
	readonly cwd?: string;
	readonly dev?: IMcpDevModeConfig;
}

export interface IMcpRemoteServerConfiguration extends ICommonMcpServerConfiguration {
	readonly type: McpServerType.REMOTE;
	readonly url: string;
	readonly headers?: Record<string, string>;
	readonly dev?: IMcpDevModeConfig;
}

export type IMcpServerConfiguration = IMcpStdioServerConfiguration | IMcpRemoteServerConfiguration;

export interface IMcpServersConfiguration {
	servers?: IStringDictionary<IMcpServerConfiguration>;
	inputs?: IMcpServerVariable[];
}