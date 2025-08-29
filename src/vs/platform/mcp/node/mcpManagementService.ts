/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IGalleryMcpServer, IMcpGalleryService, IMcpManagementService, InstallOptions, ILocalMcpServer, PackageType, IInstallableMcpServer, IMcpServerManifest } from '../common/mcpManagement.js';
import { McpUserResourceManagementService as CommonMcpUserResourceManagementService, McpManagementService as CommonMcpManagementService } from '../common/mcpManagementService.js';
import { IMcpResourceScannerService } from '../common/mcpResourceScannerService.js';
import { McpServerType } from '../common/mcpPlatformTypes.js';
import { INpmPackageManagementService } from './npmPackageService.js';
import { Schemas } from '../../../base/common/network.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';


export class McpUserResourceManagementService extends CommonMcpUserResourceManagementService {
	constructor(
		mcpResource: URI,
		@IMcpGalleryService mcpGalleryService: IMcpGalleryService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@IMcpResourceScannerService mcpResourceScannerService: IMcpResourceScannerService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INpmPackageManagementService private readonly npmPackageService: INpmPackageManagementService,
	) {
		super(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService);
	}

	override async installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		this.logService.trace('MCP Management Service: installGallery', server.url);

		this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });

		try {
			const manifest = await this.updateMetadataFromGallery(server);
			const packageType = options?.packageType ?? manifest.packages?.[0]?.registry_name ?? PackageType.REMOTE;

			const { config, inputs } = packageType === PackageType.NODE
				? await this.getNodePackageMcpServerConfiguration(server, manifest)
				: this.getMcpServerConfigurationFromManifest(manifest, packageType);

			const installable: IInstallableMcpServer = {
				name: server.name,
				config: {
					...config,
					gallery: server.url ?? true,
					version: server.version
				},
				inputs
			};

			await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);

			await this.updateLocal();
			const local = (await this.getInstalled()).find(s => s.name === server.name);
			if (!local) {
				throw new Error(`Failed to install MCP server: ${server.name}`);
			}
			return local;
		} catch (e) {
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
			throw e;
		}
	}

	private async getNodePackageMcpServerConfiguration(server: IGalleryMcpServer, manifest: IMcpServerManifest): Promise<Omit<IInstallableMcpServer, 'name'>> {
		if (this.configurationService.getValue('chat.mcp.enableNpmInstall') !== true) {
			return this.getMcpServerConfigurationFromManifest(manifest, PackageType.NODE);
		}

		const nodePackage = manifest.packages?.find(p => p.registry_name === PackageType.NODE);
		if (!nodePackage) {
			throw new Error('No npm package found in manifest');
		}

		const location = this.getLocation(server.name, server.version);
		if (!(await this.fileService.exists(location))) {
			await this.fileService.createFolder(location);
		}

		const packageVersion = !nodePackage.version || nodePackage.version === 'latest' ? await this.npmPackageService.getLatestPackageVersion(nodePackage.name) : nodePackage.version;
		await this.npmPackageService.installPackage(nodePackage.name, packageVersion, location.with({ scheme: Schemas.file }).fsPath);

		const entryPoint = await this.findPackageEntryPoint(nodePackage.name, location);
		const result = this.getMcpServerConfigurationFromManifest(manifest, PackageType.NODE);
		if (result.config.type === McpServerType.LOCAL && result.config.args) {
			const newArgs = [...result.config.args];
			newArgs[0] = entryPoint.with({ scheme: Schemas.file }).fsPath;
			return {
				config: {
					...result.config,
					command: 'node',
					args: newArgs,
					version: server.version
				},
				inputs: result.inputs
			};
		}
		return result;
	}

	private async findPackageEntryPoint(packageName: string, packageLocation: URI): Promise<URI> {
		const nodeModulesPath = this.uriIdentityService.extUri.joinPath(packageLocation, 'node_modules', packageName);
		const packageJsonPath = this.uriIdentityService.extUri.joinPath(nodeModulesPath, 'package.json');

		try {
			const packageJsonContent = await this.fileService.readFile(packageJsonPath);
			const packageJson = JSON.parse(packageJsonContent.value.toString());

			if (packageJson.bin) {
				if (typeof packageJson.bin === 'string') {
					return this.uriIdentityService.extUri.joinPath(nodeModulesPath, packageJson.bin);
				} else if (typeof packageJson.bin === 'object') {
					const binName = packageJson.bin[packageName] || Object.values(packageJson.bin)[0];
					if (binName) {
						return this.uriIdentityService.extUri.joinPath(nodeModulesPath, binName as string);
					}
				}
			}

			if (packageJson.main) {
				return this.uriIdentityService.extUri.joinPath(nodeModulesPath, packageJson.main);
			}

			return this.uriIdentityService.extUri.joinPath(nodeModulesPath, 'index.js');

		} catch (error) {
			this.logService.error('Failed to read package.json for entry point', packageName, error);
			throw new Error(`Could not find entry point for package ${packageName}`);
		}
	}

}

export class McpManagementService extends CommonMcpManagementService implements IMcpManagementService {
	protected override createMcpResourceManagementService(mcpResource: URI): McpUserResourceManagementService {
		return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
	}
}
