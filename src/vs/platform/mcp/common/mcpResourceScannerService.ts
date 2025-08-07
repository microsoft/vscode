/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../base/common/assert.js';
import { Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { parse, ParseError } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, ConfigurationTargetToString } from '../../configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IInstallableMcpServer } from './mcpManagement.js';
import { ICommonMcpServerConfiguration, IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from './mcpPlatformTypes.js';

interface IScannedMcpServers {
	servers?: IStringDictionary<Mutable<IMcpServerConfiguration>>;
	inputs?: IMcpServerVariable[];
}

interface IOldScannedMcpServer {
	id: string;
	name: string;
	version?: string;
	gallery?: boolean;
	config: Mutable<IMcpServerConfiguration>;
}

interface IScannedWorkspaceMcpServers {
	settings?: {
		mcp?: IScannedMcpServers;
	};
}

export type McpResourceTarget = ConfigurationTarget.USER | ConfigurationTarget.WORKSPACE | ConfigurationTarget.WORKSPACE_FOLDER;

export const IMcpResourceScannerService = createDecorator<IMcpResourceScannerService>('IMcpResourceScannerService');
export interface IMcpResourceScannerService {
	readonly _serviceBrand: undefined;
	scanMcpServers(mcpResource: URI, target?: McpResourceTarget): Promise<IScannedMcpServers>;
	addMcpServers(servers: IInstallableMcpServer[], mcpResource: URI, target?: McpResourceTarget): Promise<void>;
	removeMcpServers(serverNames: string[], mcpResource: URI, target?: McpResourceTarget): Promise<void>;
}

export class McpResourceScannerService extends Disposable implements IMcpResourceScannerService {
	readonly _serviceBrand: undefined;

	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IScannedMcpServers>>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	async scanMcpServers(mcpResource: URI, target?: McpResourceTarget): Promise<IScannedMcpServers> {
		return this.withProfileMcpServers(mcpResource, target);
	}

	async addMcpServers(servers: IInstallableMcpServer[], mcpResource: URI, target?: McpResourceTarget): Promise<void> {
		await this.withProfileMcpServers(mcpResource, target, scannedMcpServers => {
			let updatedInputs = scannedMcpServers.inputs ?? [];
			const existingServers = scannedMcpServers.servers ?? {};
			for (const { name, config, inputs } of servers) {
				existingServers[name] = config;
				if (inputs) {
					const existingInputIds = new Set(updatedInputs.map(input => input.id));
					const newInputs = inputs.filter(input => !existingInputIds.has(input.id));
					updatedInputs = [...updatedInputs, ...newInputs];
				}
			}
			return { servers: existingServers, inputs: updatedInputs };
		});
	}

	async removeMcpServers(serverNames: string[], mcpResource: URI, target?: McpResourceTarget): Promise<void> {
		await this.withProfileMcpServers(mcpResource, target, scannedMcpServers => {
			for (const serverName of serverNames) {
				if (scannedMcpServers.servers?.[serverName]) {
					delete scannedMcpServers.servers[serverName];
				}
			}
			return scannedMcpServers;
		});
	}

	private async withProfileMcpServers(mcpResource: URI, target?: McpResourceTarget, updateFn?: (data: IScannedMcpServers) => IScannedMcpServers): Promise<IScannedMcpServers> {
		return this.getResourceAccessQueue(mcpResource)
			.queue(async (): Promise<IScannedMcpServers> => {
				target = target ?? ConfigurationTarget.USER;
				let scannedMcpServers: IScannedMcpServers = {};
				try {
					const content = await this.fileService.readFile(mcpResource);
					const errors: ParseError[] = [];
					const result = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true }) || {};
					if (errors.length > 0) {
						throw new Error('Failed to parse scanned MCP servers: ' + errors.join(', '));
					}

					if (target === ConfigurationTarget.USER) {
						scannedMcpServers = this.fromUserMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
						scannedMcpServers = this.fromWorkspaceFolderMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE) {
						const workspaceScannedMcpServers: IScannedWorkspaceMcpServers = result;
						if (workspaceScannedMcpServers.settings?.mcp) {
							scannedMcpServers = this.fromWorkspaceFolderMcpServers(workspaceScannedMcpServers.settings?.mcp);
						}
					}
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						throw error;
					}
				}
				if (updateFn) {
					scannedMcpServers = updateFn(scannedMcpServers ?? {});

					if (target === ConfigurationTarget.USER) {
						await this.writeScannedMcpServers(mcpResource, scannedMcpServers);
					} else if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
						await this.writeScannedMcpServersToWorkspaceFolder(mcpResource, scannedMcpServers);
					} else if (target === ConfigurationTarget.WORKSPACE) {
						await this.writeScannedMcpServersToWorkspace(mcpResource, scannedMcpServers);
					} else {
						assertNever(target, `Invalid Target: ${ConfigurationTargetToString(target)}`);
					}
				}
				return scannedMcpServers;
			});
	}

	private async writeScannedMcpServers(mcpResource: URI, scannedMcpServers: IScannedMcpServers): Promise<void> {
		if ((scannedMcpServers.servers && Object.keys(scannedMcpServers.servers).length > 0) || (scannedMcpServers.inputs && scannedMcpServers.inputs.length > 0)) {
			await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedMcpServers, null, '\t')));
		} else {
			await this.fileService.del(mcpResource);
		}
	}

	private async writeScannedMcpServersToWorkspaceFolder(mcpResource: URI, scannedMcpServers: IScannedMcpServers): Promise<void> {
		await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedMcpServers, null, '\t')));
	}

	private async writeScannedMcpServersToWorkspace(mcpResource: URI, scannedMcpServers: IScannedMcpServers): Promise<void> {
		let scannedWorkspaceMcpServers: IScannedWorkspaceMcpServers | undefined;
		try {
			const content = await this.fileService.readFile(mcpResource);
			const errors: ParseError[] = [];
			scannedWorkspaceMcpServers = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true }) as IScannedWorkspaceMcpServers;
			if (errors.length > 0) {
				throw new Error('Failed to parse scanned MCP servers: ' + errors.join(', '));
			}
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			scannedWorkspaceMcpServers = { settings: {} };
		}
		if (!scannedWorkspaceMcpServers.settings) {
			scannedWorkspaceMcpServers.settings = {};
		}
		scannedWorkspaceMcpServers.settings.mcp = scannedMcpServers;
		await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedWorkspaceMcpServers, null, '\t')));
	}

	private fromUserMcpServers(scannedMcpServers: IScannedMcpServers): IScannedMcpServers {
		const userMcpServers: IScannedMcpServers = {
			inputs: scannedMcpServers.inputs
		};
		const servers = Object.entries(scannedMcpServers.servers ?? {});
		if (servers.length > 0) {
			userMcpServers.servers = {};
			for (const [serverName, server] of servers) {
				userMcpServers.servers[serverName] = this.sanitizeServer(server);
			}
		}
		return userMcpServers;
	}

	private fromWorkspaceFolderMcpServers(scannedWorkspaceFolderMcpServers: IScannedMcpServers): IScannedMcpServers {
		const scannedMcpServers: IScannedMcpServers = {
			inputs: scannedWorkspaceFolderMcpServers.inputs
		};
		const servers = Object.entries(scannedWorkspaceFolderMcpServers.servers ?? {});
		if (servers.length > 0) {
			scannedMcpServers.servers = {};
			for (const [serverName, config] of servers) {
				scannedMcpServers.servers[serverName] = this.sanitizeServer(config);
			}
		}
		return scannedMcpServers;
	}

	private sanitizeServer(serverOrConfig: IOldScannedMcpServer | Mutable<IMcpServerConfiguration>): IMcpServerConfiguration {
		let server: IMcpServerConfiguration;
		if ((<IOldScannedMcpServer>serverOrConfig).config) {
			const oldScannedMcpServer = <IOldScannedMcpServer>serverOrConfig;
			server = {
				...oldScannedMcpServer.config,
				version: oldScannedMcpServer.version,
				gallery: oldScannedMcpServer.gallery
			};
		} else {
			server = serverOrConfig as IMcpServerConfiguration;
		}

		if (server.type === undefined || (server.type !== McpServerType.REMOTE && server.type !== McpServerType.LOCAL)) {
			(<Mutable<ICommonMcpServerConfiguration>>server).type = (<IMcpStdioServerConfiguration>server).command ? McpServerType.LOCAL : McpServerType.REMOTE;
		}

		return server;
	}

	private getResourceAccessQueue(file: URI): Queue<IScannedMcpServers> {
		let resourceQueue = this.resourcesAccessQueueMap.get(file);
		if (!resourceQueue) {
			resourceQueue = new Queue<IScannedMcpServers>();
			this.resourcesAccessQueueMap.set(file, resourceQueue);
		}
		return resourceQueue;
	}
}

registerSingleton(IMcpResourceScannerService, McpResourceScannerService, InstantiationType.Delayed);
