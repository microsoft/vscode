/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../base/common/path.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IGalleryMcpServer, IGalleryMcpServerConfiguration, IMcpGalleryService, IMcpManagementService, IMcpServerArgument, InstallOptions, ILocalMcpServer, RegistryType, IInstallableMcpServer, IMcpServerKeyValueInput } from '../common/mcpManagement.js';
import { McpUserResourceManagementService as CommonMcpUserResourceManagementService, McpManagementService as CommonMcpManagementService } from '../common/mcpManagementService.js';
import { IMcpResourceScannerService } from '../common/mcpResourceScannerService.js';
import { IMcpServerVariable, McpServerType, McpServerVariableType } from '../common/mcpPlatformTypes.js';
import { IMcpBundleService } from './mcpBundleService.js';

export class McpUserResourceManagementService extends CommonMcpUserResourceManagementService {
	constructor(
		mcpResource: URI,
		@IMcpGalleryService mcpGalleryService: IMcpGalleryService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@IMcpResourceScannerService mcpResourceScannerService: IMcpResourceScannerService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IMcpBundleService private readonly mcpBundleService: IMcpBundleService,
	) {
		super(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService);
	}

	override async installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		this.logService.trace('MCP Management Service: installGallery', server.name, server.galleryUrl);

		this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });

		try {
			const manifest = await this.updateMetadataFromGallery(server);

			// Determine package type: explicit option > MCPB if available > first package > REMOTE
			let packageType = options?.packageType;
			if (!packageType) {
				// Prefer MCPB if available, otherwise use first package
				const mcpbPackage = manifest.packages?.find(p => p.registryType === RegistryType.MCPB);
				packageType = mcpbPackage ? RegistryType.MCPB : (manifest.packages?.[0]?.registryType ?? RegistryType.REMOTE);
				this.logService.info(`MCP Management Service: Package types available: ${JSON.stringify(manifest.packages?.map(p => p.registryType))}`);
				this.logService.info(`MCP Management Service: Selected package type: ${packageType}`);
			}

			// Special handling for MCPB packages
			if (packageType === RegistryType.MCPB) {
				this.logService.info(`MCP Management Service: Using MCPB installation path for ${server.name}`);
				return this.installMcpbPackage(server, manifest);
			}

			const { mcpServerConfiguration, notices } = this.getMcpServerConfigurationFromManifest(manifest, packageType);

			if (notices.length > 0) {
				this.logService.warn(`MCP Management Service: Warnings while installing ${server.name}`, notices);
			}

			const installable: IInstallableMcpServer = {
				name: server.name,
				config: {
					...mcpServerConfiguration.config,
					gallery: server.galleryUrl ?? true,
					version: server.version
				},
				inputs: mcpServerConfiguration.inputs
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

	private async installMcpbPackage(server: IGalleryMcpServer, manifest: IGalleryMcpServerConfiguration): Promise<ILocalMcpServer> {
		const serverPackage = manifest.packages?.find(p => p.registryType === RegistryType.MCPB);
		if (!serverPackage) {
			throw new Error(`MCPB package not found in manifest for server: ${server.name}`);
		}

		this.logService.info(`MCP Management Service: Installing MCPB package ${server.name} from ${serverPackage.identifier}`);
		this.logService.info(`MCP Management Service: MCPB target location: ${this.mcpLocation.fsPath}`);

		try {
			// Download and extract the bundle
			const { extractedPath, manifest: bundleManifest } = await this.mcpBundleService.downloadAndExtract(
				serverPackage,
				this.mcpLocation,
				CancellationToken.None
			);
			this.logService.info(`MCP Management Service: MCPB extracted to: ${extractedPath.fsPath}`);

			// Build the command path from the extracted bundle
			const command = path.join(extractedPath.fsPath, bundleManifest.command);

			// Process working directory
			const cwd = bundleManifest.cwd
				? path.join(extractedPath.fsPath, bundleManifest.cwd)
				: extractedPath.fsPath;

			// Process environment variables from bundle manifest and server package
			const env: Record<string, string> = {};
			const inputs: IMcpServerVariable[] = [];

			// Add bundle manifest env vars
			if (bundleManifest.env) {
				for (const [key, value] of Object.entries(bundleManifest.env)) {
					env[key] = value;
				}
			}

			// Process environment variables from server package (may include user inputs)
			if (serverPackage.environmentVariables?.length) {
				const { envInputs, envVariables } = this.processEnvironmentVariables(serverPackage.environmentVariables);
				for (const [key, value] of Object.entries(envInputs)) {
					env[key] = value;
				}
				inputs.push(...envVariables);
			}

			// Process package arguments if any
			const args: string[] = bundleManifest.args ? [...bundleManifest.args] : [];
			if (serverPackage.packageArguments?.length) {
				const { processedArgs, argVariables } = this.processPackageArguments(serverPackage.packageArguments);
				args.push(...processedArgs);
				inputs.push(...argVariables);
			}

			const installable: IInstallableMcpServer = {
				name: server.name,
				config: {
					type: McpServerType.LOCAL,
					command,
					args: args.length ? args : undefined,
					env: Object.keys(env).length ? env : undefined,
					cwd,
					gallery: server.galleryUrl ?? true,
					version: server.version
				},
				inputs: inputs.length ? inputs : undefined
			};

			await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);

			await this.updateLocal();
			const local = (await this.getInstalled()).find(s => s.name === server.name);
			if (!local) {
				// Clean up on failure
				await this.mcpBundleService.cleanup(extractedPath);
				throw new Error(`Failed to install MCPB server: ${server.name}`);
			}

			this.logService.info('MCP Management Service: MCPB package installed successfully', server.name);
			return local;
		} catch (e) {
			this.logService.error('MCP Management Service: Failed to install MCPB package', server.name, e);
			this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
			throw e;
		}
	}

	private processEnvironmentVariables(envVars: ReadonlyArray<IMcpServerKeyValueInput>): {
		envInputs: Record<string, string>;
		envVariables: IMcpServerVariable[];
	} {
		const envInputs: Record<string, string> = {};
		const envVariables: IMcpServerVariable[] = [];

		for (const envVar of envVars) {
			let value = envVar.value || '';

			// Check if this env var needs user input
			if (!value && (envVar.description || envVar.choices || envVar.default !== undefined)) {
				envVariables.push({
					id: envVar.name,
					type: envVar.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
					description: envVar.description ?? '',
					password: !!envVar.isSecret,
					default: envVar.default,
					options: envVar.choices,
				});
				value = `\${input:${envVar.name}}`;
			}

			envInputs[envVar.name] = value;
		}

		return { envInputs, envVariables };
	}

	private processPackageArguments(args: readonly IMcpServerArgument[]): {
		processedArgs: string[];
		argVariables: IMcpServerVariable[];
	} {
		const processedArgs: string[] = [];
		const argVariables: IMcpServerVariable[] = [];

		for (const arg of args) {
			if (arg.type === 'positional') {
				if (arg.value) {
					processedArgs.push(arg.value);
				} else if (arg.valueHint && (arg.description || arg.default !== undefined)) {
					argVariables.push({
						id: arg.valueHint,
						type: McpServerVariableType.PROMPT,
						description: arg.description ?? '',
						password: false,
						default: arg.default,
					});
					processedArgs.push(`\${input:${arg.valueHint}}`);
				} else if (arg.valueHint) {
					processedArgs.push(arg.valueHint);
				}
			} else if (arg.type === 'named') {
				if (arg.name) {
					processedArgs.push(arg.name);
					if (arg.value) {
						processedArgs.push(arg.value);
					} else if (arg.description || arg.default !== undefined) {
						const variableId = arg.name.replace(/^--?/, '');
						argVariables.push({
							id: variableId,
							type: McpServerVariableType.PROMPT,
							description: arg.description ?? '',
							password: false,
							default: arg.default,
						});
						processedArgs.push(`\${input:${variableId}}`);
					}
				}
			}
		}

		return { processedArgs, argVariables };
	}

}

export class McpManagementService extends CommonMcpManagementService implements IMcpManagementService {
	protected override createMcpResourceManagementService(mcpResource: URI): McpUserResourceManagementService {
		return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
	}
}
