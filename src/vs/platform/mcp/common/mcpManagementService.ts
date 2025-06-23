/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { uppercaseFirstLetter } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { DidUninstallMcpServerEvent, IGalleryMcpServer, ILocalMcpServer, IMcpGalleryService, IMcpManagementService, IMcpServerInput, IMcpServerManifest, InstallMcpServerEvent, InstallMcpServerResult, PackageType, UninstallMcpServerEvent, IScannedMcpServer, InstallOptions, UninstallOptions, IMcpServer } from './mcpManagement.js';
import { IMcpServerVariable, McpServerVariableType, IMcpServerConfiguration } from './mcpPlatformTypes.js';
import { IMcpResourceScannerService } from './mcpResourceScannerService.js';

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
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IMcpResourceScannerService private readonly mcpResourceScannerService: IMcpResourceScannerService,
	) {
		super();
		this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, 'mcp');
	}

	async getInstalled(mcpResource?: URI): Promise<ILocalMcpServer[]> {
		const mcpResourceUri = mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
		this.logService.info('MCP Management Service: getInstalled', mcpResourceUri.toString());

		try {
			const scannedMcpServers = await this.mcpResourceScannerService.scanMcpServers(mcpResourceUri);

			if (!scannedMcpServers.servers) {
				return [];
			}

			return Promise.all(Object.entries(scannedMcpServers.servers).map(([, scannedServer]) => this.scanServer(scannedServer, mcpResourceUri)));
		} catch (error) {
			this.logService.debug('Could not read user MCP servers:', error);
			return [];
		}
	}

	private async scanServer(scannedMcpServer: IScannedMcpServer, mcpResource: URI): Promise<ILocalMcpServer> {
		let scanned: LocalMcpServer | undefined;
		let location: URI | undefined;
		let readmeUrl: URI | undefined;
		if (scannedMcpServer.gallery) {
			location = this.getLocation(scannedMcpServer.name, scannedMcpServer.version);
			const manifestLocation = this.uriIdentityService.extUri.joinPath(location, 'manifest.json');
			try {
				const content = await this.fileService.readFile(manifestLocation);
				scanned = JSON.parse(content.value.toString());
			} catch (e) {
				this.logService.error('MCP Management Service: failed to read manifest', location.toString(), e);
			}
			readmeUrl = this.uriIdentityService.extUri.joinPath(location, 'README.md');
			if (!await this.fileService.exists(readmeUrl)) {
				readmeUrl = undefined;
			}
		}

		if (!scanned) {
			let publisher = '';
			const nameParts = scannedMcpServer.name.split('/');
			if (nameParts.length > 0) {
				const domainParts = nameParts[0].split('.');
				if (domainParts.length > 0) {
					publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
				}
			}
			scanned = {
				name: scannedMcpServer.name,
				version: '1.0.0',
				displayName: nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' '),
				publisher
			};
		}

		return {
			name: scannedMcpServer.name,
			config: scannedMcpServer.config,
			version: scanned.version,
			mcpResource,
			location,
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

	async install(server: IMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		this.logService.trace('MCP Management Service: install', server.name);
		this._onInstallMcpServer.fire({ name: server.name });
		try {
			const mcpResourceUri = options?.mcpResource ?? this.userDataProfilesService.defaultProfile.mcpResource;
			const scannedServer: IScannedMcpServer = {
				id: server.name,
				name: server.name,
				version: '0.0.1',
				config: server.config
			};

			await this.mcpResourceScannerService.addMcpServers([{ server: scannedServer, inputs: server.inputs }], mcpResourceUri);

			const local = await this.scanServer(scannedServer, mcpResourceUri);
			this._onDidInstallMcpServers.fire([{ name: server.name, local }]);
			return local;
		} catch (e) {
			this._onDidInstallMcpServers.fire([{ name: server.name, error: e }]);
			throw e;
		}
	}

	async installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		this.logService.trace('MCP Management Service: installGallery', server.url);
		this._onInstallMcpServer.fire({ name: server.name });

		try {
			const manifest = await this.mcpGalleryService.getManifest(server, CancellationToken.None);
			const location = this.getLocation(server.name, server.version);
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
			const mcpResourceUri = options?.mcpResource ?? this.userDataProfilesService.defaultProfile.mcpResource;
			const { config, inputs } = this.toScannedMcpServerAndInputs(manifest, options?.packageType);

			const scannedServer: IScannedMcpServer = {
				id: server.id,
				name: server.name,
				version: server.version,
				gallery: true,
				config
			};

			await this.mcpResourceScannerService.addMcpServers([{ server: scannedServer, inputs }], mcpResourceUri);

			const local = await this.scanServer(scannedServer, mcpResourceUri);
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, local }]);
			return local;
		} catch (e) {
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e }]);
			throw e;
		}
	}

	private getLocation(name: string, version: string): URI {
		return this.uriIdentityService.extUri.joinPath(this.mcpLocation, `${name.replace('/', '.')}-${version}`);
	}

	async uninstall(server: ILocalMcpServer, options?: UninstallOptions): Promise<void> {
		this.logService.trace('MCP Management Service: uninstall', server.name);
		this._onUninstallMcpServer.fire({ name: server.name });

		try {
			const mcpResourceUri = options?.mcpResource ?? this.userDataProfilesService.defaultProfile.mcpResource;
			const currentServers = await this.mcpResourceScannerService.scanMcpServers(mcpResourceUri);
			if (!currentServers.servers) {
				return;
			}
			await this.mcpResourceScannerService.removeMcpServers([server.name], mcpResourceUri);
			if (server.location) {
				await this.fileService.del(URI.revive(server.location), { recursive: true });
			}
			this._onDidUninstallMcpServer.fire({ name: server.name });
		} catch (e) {
			this._onDidUninstallMcpServer.fire({ name: server.name, error: e });
			throw e;
		}
	}

	private toScannedMcpServerAndInputs(manifest: IMcpServerManifest, packageType?: PackageType): { config: IMcpServerConfiguration; inputs?: IMcpServerVariable[] } {
		if (packageType === undefined) {
			packageType = manifest.packages?.[0]?.registry_name ?? PackageType.REMOTE;
		}

		let config: IMcpServerConfiguration;
		const inputs: IMcpServerVariable[] = [];

		if (packageType === PackageType.REMOTE) {
			const headers: Record<string, string> = {};
			for (const input of manifest.remotes[0].headers ?? []) {
				headers[input.name] = input.value;
				if (input.variables) {
					inputs.push(...this.getVariables(input.variables));
				}
			}
			config = {
				type: 'http',
				url: manifest.remotes[0].url,
				headers: Object.keys(headers).length ? headers : undefined,
			};
		} else {
			const serverPackage = manifest.packages.find(p => p.registry_name === packageType) ?? manifest.packages[0];
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

			config = {
				type: 'stdio',
				command: this.getCommandName(serverPackage.registry_name),
				args: args.length ? args : undefined,
				env: Object.keys(env).length ? env : undefined,
			};
		}

		return {
			config,
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
