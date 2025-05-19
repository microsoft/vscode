/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { deepClone } from '../../../base/common/objects.js';
import { uppercaseFirstLetter } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { DidUninstallMcpServerEvent, IGalleryMcpServer, ILocalMcpServer, IMcpGalleryService, IMcpManagementService, IMcpServerInput, IMcpServerManifest, InstallMcpServerEvent, InstallMcpServerResult, PackageType, UninstallMcpServerEvent } from './mcpManagement.js';
import { McpConfigurationServer, IMcpServerVariable, McpServerVariableType, IMcpServersConfiguration, IMcpServerConfiguration } from './mcpPlatformTypes.js';

interface LocalMcpServer {
	readonly name: string;
	readonly version: string;
	readonly id?: string;
	readonly displayName?: string;
	readonly url?: string;
	readonly description?: string;
	readonly repositoryUrl?: string;
	readonly publisher?: string;
	readonly publisherDisplayName?: string;
	readonly iconUrl?: string;
	readonly manifest?: IMcpServerManifest;
}

export class McpManagementService extends Disposable implements IMcpManagementService {

	_serviceBrand: undefined;

	private readonly mcpLocation: URI;

	private readonly _onInstallMcpServer = this._register(new Emitter<InstallMcpServerEvent>());
	readonly onInstallMcpServer = this._onInstallMcpServer.event;

	protected readonly _onDidInstallMcpServers = this._register(new Emitter<InstallMcpServerResult[]>());
	get onDidInstallMcpServers() { return this._onDidInstallMcpServers.event; }

	protected readonly _onUninstallMcpServer = this._register(new Emitter<UninstallMcpServerEvent>());
	get onUninstallMcpServer() { return this._onUninstallMcpServer.event; }

	protected _onDidUninstallMcpServer = this._register(new Emitter<DidUninstallMcpServerEvent>());
	get onDidUninstallMcpServer() { return this._onDidUninstallMcpServer.event; }

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, 'mcp');
	}

	async getInstalled(): Promise<ILocalMcpServer[]> {
		const { userLocal } = this.configurationService.inspect<IMcpServersConfiguration>('mcp');

		if (!userLocal?.value?.servers) {
			return [];
		}

		return Promise.all(Object.entries(userLocal.value.servers).map(([name, config]) => this.scanServer(name, config)));
	}

	private async scanServer(name: string, config: IMcpServerConfiguration): Promise<ILocalMcpServer> {
		let scanned: LocalMcpServer | undefined;
		let readmeUrl: URI | undefined;
		if (config.location) {
			const manifestLocation = this.uriIdentityService.extUri.joinPath(URI.revive(config.location), 'manifest.json');
			try {
				const content = await this.fileService.readFile(manifestLocation);
				scanned = JSON.parse(content.value.toString());
			} catch (e) {
				this.logService.error('MCP Management Service: failed to read manifest', config.location.toString(), e);
			}
			readmeUrl = this.uriIdentityService.extUri.joinPath(URI.revive(config.location), 'README.md');
			if (!await this.fileService.exists(readmeUrl)) {
				readmeUrl = undefined;
			}
		}

		if (!scanned) {
			let publisher = '';
			const nameParts = name.split('/');
			if (nameParts.length > 0) {
				const domainParts = nameParts[0].split('.');
				if (domainParts.length > 0) {
					publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
				}
			}
			scanned = {
				name,
				version: '1.0.0',
				displayName: nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' '),
				publisher
			};
		}

		return {
			name,
			config,
			version: scanned.version,
			location: URI.revive(config.location),
			id: scanned.id,
			displayName: scanned.displayName,
			description: scanned.description,
			publisher: scanned.publisher,
			publisherDisplayName: scanned.publisherDisplayName,
			repositoryUrl: scanned.repositoryUrl,
			readmeUrl,
			iconUrl: scanned.iconUrl,
			manifest: scanned.manifest
		};
	}

	async installFromGallery(server: IGalleryMcpServer, packageType?: PackageType): Promise<void> {
		this.logService.trace('MCP Management Service: installGallery', server.url);
		this._onInstallMcpServer.fire({ name: server.name });

		try {
			const manifest = await this.mcpGalleryService.getManifest(server, CancellationToken.None);
			const location = this.uriIdentityService.extUri.joinPath(this.mcpLocation, `${server.name.replace('/', '.')}-${server.version}`);
			const manifestPath = this.uriIdentityService.extUri.joinPath(location, 'manifest.json');
			await this.fileService.writeFile(manifestPath, VSBuffer.fromString(JSON.stringify({
				id: server.id,
				name: server.name,
				displayName: server.displayName,
				description: server.description,
				version: server.version,
				publisher: server.publisher,
				publisherDisplayName: server.publisherDisplayName,
				repository: server.repositoryUrl,
				licenseUrl: server.licenseUrl,
				...manifest,
			})));

			if (server.readmeUrl) {
				const readme = await this.mcpGalleryService.getReadme(server, CancellationToken.None);
				await this.fileService.writeFile(this.uriIdentityService.extUri.joinPath(location, 'README.md'), VSBuffer.fromString(readme));
			}

			const { userLocal } = this.configurationService.inspect<IMcpServersConfiguration>('mcp');

			const value: IMcpServersConfiguration = deepClone(userLocal?.value ?? { servers: {} });
			if (!value.servers) {
				value.servers = {};
			}
			const serverConfig = this.getServerConfig(manifest, packageType);
			value.servers[server.name] = {
				...serverConfig,
				location: location.toJSON(),
			};
			if (serverConfig.inputs) {
				value.inputs = value.inputs ?? [];
				for (const input of serverConfig.inputs) {
					if (!value.inputs.some(i => (<IMcpServerVariable>i).id === input.id)) {
						value.inputs.push({ ...input, serverName: server.name });
					}
				}
			}

			await this.configurationService.updateValue('mcp', value, ConfigurationTarget.USER_LOCAL);
			const local = await this.scanServer(server.name, value.servers[server.name]);
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, local }]);
		} catch (e) {
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e }]);
			throw e;
		}
	}

	async uninstall(server: ILocalMcpServer): Promise<void> {
		this.logService.trace('MCP Management Service: uninstall', server.name);
		this._onUninstallMcpServer.fire({ name: server.name });

		try {
			const { userLocal } = this.configurationService.inspect<IMcpServersConfiguration>('mcp');

			const value: IMcpServersConfiguration = deepClone(userLocal?.value ?? { servers: {} });
			if (!value.servers) {
				value.servers = {};
			}
			delete value.servers[server.name];

			if (value.inputs) {
				const index = value.inputs.findIndex(i => (<IMcpServerVariable>i).serverName === server.name);
				if (index !== undefined && index >= 0) {
					value.inputs?.splice(index, 1);
				}
			}

			await this.configurationService.updateValue('mcp', value, ConfigurationTarget.USER_LOCAL);
			if (server.location) {
				await this.fileService.del(URI.revive(server.location), { recursive: true });
			}
			this._onDidUninstallMcpServer.fire({ name: server.name });
		} catch (e) {
			this._onDidUninstallMcpServer.fire({ name: server.name, error: e });
			throw e;
		}
	}

	private getServerConfig(manifest: IMcpServerManifest, packageType?: PackageType): McpConfigurationServer & { inputs?: IMcpServerVariable[] } {
		if (packageType === undefined) {
			packageType = manifest.packages?.[0]?.registry_name ?? PackageType.REMOTE;
		}

		if (packageType === PackageType.REMOTE) {
			const inputs: IMcpServerVariable[] = [];
			const headers: Record<string, string> = {};
			for (const input of manifest.remotes[0].headers ?? []) {
				headers[input.name] = input.value;
				if (input.variables) {
					inputs.push(...this.getVariables(input.variables));
				}
			}
			return {
				type: 'http',
				url: manifest.remotes[0].url,
				headers: Object.keys(headers).length ? headers : undefined,
				inputs: inputs.length ? inputs : undefined,
			};
		}

		const serverPackage = manifest.packages.find(p => p.registry_name === packageType) ?? manifest.packages[0];
		const inputs: IMcpServerVariable[] = [];
		const args: string[] = [];
		const env: Record<string, string> = {};

		if (serverPackage.registry_name === PackageType.DOCKER) {
			args.push('run');
			args.push('-i');
			args.push('--rm');
		}

		for (const arg of serverPackage.runtime_arguments ?? []) {
			if (arg.type === 'positional') {
				args.push(arg.value ?? arg.value_hint);
			} else if (arg.type === 'named') {
				args.push(arg.name);
				if (arg.value) {
					args.push(arg.value);
				}
			}
			if (arg.variables) {
				inputs.push(...this.getVariables(arg.variables));
			}
		}

		for (const input of serverPackage.environment_variables ?? []) {
			const variables = input.variables ? this.getVariables(input.variables) : [];
			let value = input.value;
			for (const variable of variables) {
				value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
			}
			env[input.name] = value;
			if (variables.length) {
				inputs.push(...variables);
			}
			if (serverPackage.registry_name === PackageType.DOCKER) {
				args.push('-e');
				args.push(input.name);
			}
		}

		if (serverPackage.registry_name === PackageType.NODE) {
			args.push(`${serverPackage.name}@${serverPackage.version}`);
		}
		else if (serverPackage.registry_name === PackageType.PYTHON) {
			args.push(`${serverPackage.name}==${serverPackage.version}`);
		}
		else if (serverPackage.registry_name === PackageType.DOCKER) {
			args.push(`${serverPackage.name}:${serverPackage.version}`);
		}

		for (const arg of serverPackage.package_arguments ?? []) {
			if (arg.type === 'positional') {
				args.push(arg.value ?? arg.value_hint);
			} else if (arg.type === 'named') {
				args.push(arg.name);
				if (arg.value) {
					args.push(arg.value);
				}
			}
			if (arg.variables) {
				inputs.push(...this.getVariables(arg.variables));
			}
		}

		return {
			type: 'stdio',
			command: this.getCommandName(serverPackage.registry_name),
			args: args.length ? args : undefined,
			env: Object.keys(env).length ? env : undefined,
			inputs: inputs.length ? inputs : undefined,
		};
	}

	private getCommandName(packageType: PackageType): string {
		switch (packageType) {
			case PackageType.NODE: return 'npx';
			case PackageType.DOCKER: return 'docker';
			case PackageType.PYTHON: return 'uvx';
		}
		return packageType;
	}

	private getVariables(variableInputs: Record<string, IMcpServerInput>): IMcpServerVariable[] {
		const variables: IMcpServerVariable[] = [];
		for (const [key, value] of Object.entries(variableInputs)) {
			variables.push({
				id: key,
				type: value.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
				description: value.description ?? '',
				password: !!value.is_secret,
				default: value.default,
				options: value.choices,
			});
		}
		return variables;
	}

}
