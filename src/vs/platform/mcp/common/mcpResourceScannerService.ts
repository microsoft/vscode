/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../base/common/assert.js';
import { Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { parse, ParseError } from '../../../base/common/json.js';
import { getParseErrorMessage } from '../../../base/common/jsonErrorMessages.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, ConfigurationTargetToString } from '../../configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMcpConfigurationFoundEvent, McpConfigurationFoundClassification, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, mcpConfigurationFoundEventName } from './mcpDiscoveryMetadata.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { getKeyedChanges } from '../../telemetry/common/telemetryUtils.js';
import { IInstallableMcpServer } from './mcpManagement.js';
import { ICommonMcpServerConfiguration, IMcpSandboxConfiguration, IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from './mcpPlatformTypes.js';

interface IScannedMcpServers {
	servers?: IStringDictionary<Mutable<IMcpServerConfiguration>>;
	inputs?: IMcpServerVariable[];
	sandbox?: IMcpSandboxConfiguration;
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
	updateSandboxConfig(updateFn: (data: IScannedMcpServers) => IScannedMcpServers, mcpResource: URI, target?: McpResourceTarget): Promise<void>;
	removeMcpServers(serverNames: string[], mcpResource: URI, target?: McpResourceTarget): Promise<void>;
	registerConfigurationResource(mcpResource: URI, target: McpResourceTarget, host: McpDiscoveryHost): IDisposable;
}

interface IMcpConfigurationOutcomeState {
	readonly generation: number;
	readonly pending: boolean;
	readonly target: McpResourceTarget;
	readonly host: McpDiscoveryHost;
	readonly outcome?: IMcpConfigurationFoundEvent;
}

export class McpResourceScannerService extends Disposable implements IMcpResourceScannerService {
	readonly _serviceBrand: undefined;

	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IScannedMcpServers>>();
	private readonly configurationOutcomesByResource = new ResourceMap<IMcpConfigurationOutcomeState>();
	private readonly activeProfileResources = new Map<McpDiscoveryHost, { readonly resource: URI; readonly registration: object }>();
	private readonly activeWorkspaceResources = new ResourceMap<object>();
	private readonly lastTelemetryRows = new Map<string, IMcpConfigurationFoundEvent>();
	private hasTelemetrySnapshot = false;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
			return { servers: existingServers, inputs: updatedInputs, sandbox: scannedMcpServers.sandbox };
		});
	}

	async updateSandboxConfig(updateFn: (data: IScannedMcpServers) => IScannedMcpServers, mcpResource: URI, target?: McpResourceTarget): Promise<void> {
		await this.withProfileMcpServers(mcpResource, target, updateFn);
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

	registerConfigurationResource(mcpResource: URI, target: McpResourceTarget, host: McpDiscoveryHost): IDisposable {
		const registration = {};
		if (target === ConfigurationTarget.USER) {
			this.activeProfileResources.set(host, { resource: mcpResource, registration });
		} else {
			this.activeWorkspaceResources.set(mcpResource, registration);
		}
		const previous = this.configurationOutcomesByResource.get(mcpResource);
		if (!previous || previous.target !== target || previous.host !== host) {
			this.configurationOutcomesByResource.set(mcpResource, { generation: previous?.generation ?? 0, pending: true, target, host });
		}
		this.emitConfigurationTelemetry();
		return toDisposable(() => {
			let changed = false;
			if (target === ConfigurationTarget.USER) {
				const active = this.activeProfileResources.get(host);
				if (active?.registration === registration) {
					this.activeProfileResources.delete(host);
					changed = true;
				}
			} else if (this.activeWorkspaceResources.get(mcpResource) === registration) {
				this.activeWorkspaceResources.delete(mcpResource);
				changed = true;
			}
			if (changed) {
				this.configurationOutcomesByResource.delete(mcpResource);
				this.emitConfigurationTelemetry();
			}
		});
	}

	private async withProfileMcpServers(mcpResource: URI, target?: McpResourceTarget, updateFn?: (data: IScannedMcpServers) => IScannedMcpServers): Promise<IScannedMcpServers> {
		return this.getResourceAccessQueue(mcpResource)
			.queue(async (): Promise<IScannedMcpServers> => {
				target = target ?? ConfigurationTarget.USER;
				const outcomeGeneration = this.beginConfigurationScan(mcpResource, target);
				let scannedMcpServers: IScannedMcpServers = {};
				let configurationPresent = 0;
				let parseErrorCount = 0;
				let unreadableCount = 0;
				try {
					const content = await this.fileService.readFile(mcpResource);
					configurationPresent = 1;
					const errors: ParseError[] = [];
					const parsed = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true });
					if (errors.length > 0) {
						parseErrorCount = 1;
						throw new Error('Failed to parse scanned MCP servers: ' + errors.map(e => `[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`).join(', '));
					}
					const result = parsed === undefined ? {} : parsed;
					if (result === null || typeof result !== 'object' || Array.isArray(result)) {
						parseErrorCount = 1;
						throw new Error('Failed to parse scanned MCP servers: expected an object at the configuration root');
					}

					if (target === ConfigurationTarget.USER) {
						scannedMcpServers = this.fromUserMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
						scannedMcpServers = this.fromWorkspaceFolderMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE) {
						const workspaceScannedMcpServers: IScannedWorkspaceMcpServers = result;
						const workspaceMcp = workspaceScannedMcpServers.settings?.mcp;
						if (workspaceMcp && typeof workspaceMcp === 'object' && !Array.isArray(workspaceMcp)) {
							scannedMcpServers = this.fromWorkspaceFolderMcpServers(workspaceMcp);
						} else if (workspaceMcp !== undefined) {
							parseErrorCount = 1;
						} else {
							configurationPresent = 0;
						}
					}
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						if (!parseErrorCount) {
							configurationPresent = 1;
							unreadableCount = 1;
						}
						this.recordConfigurationOutcome(mcpResource, outcomeGeneration, configurationPresent, 0, parseErrorCount, unreadableCount);
						throw error;
					}
				}
				if (updateFn) {
					try {
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
					} catch (error) {
						this.recordConfigurationOutcome(mcpResource, outcomeGeneration, configurationPresent, Object.keys(scannedMcpServers.servers ?? {}).length, parseErrorCount, 1);
						throw error;
					}
				}
				const updatedConfigurationPresent = updateFn && target === ConfigurationTarget.USER
					? (Object.keys(scannedMcpServers.servers ?? {}).length > 0 || (scannedMcpServers.inputs?.length ?? 0) > 0 || scannedMcpServers.sandbox !== undefined ? 1 : 0)
					: updateFn ? 1 : configurationPresent;
				this.recordConfigurationOutcome(mcpResource, outcomeGeneration, updatedConfigurationPresent, Object.keys(scannedMcpServers.servers ?? {}).length, parseErrorCount, unreadableCount);
				return scannedMcpServers;
			});
	}

	private beginConfigurationScan(mcpResource: URI, target: McpResourceTarget): number {
		const previous = this.configurationOutcomesByResource.get(mcpResource);
		const generation = (previous?.generation ?? 0) + 1;
		this.configurationOutcomesByResource.set(mcpResource, {
			generation,
			pending: true,
			target,
			host: previous?.host ?? McpDiscoveryHost.Local,
			outcome: previous?.outcome,
		});
		return generation;
	}

	private recordConfigurationOutcome(mcpResource: URI, generation: number, configurationPresent: number, configuredEntryCount: number, parseErrorCount: number, unreadableCount: number): void {
		const state = this.configurationOutcomesByResource.get(mcpResource);
		if (!state || state.generation !== generation) {
			return;
		}
		const source = state.target === ConfigurationTarget.WORKSPACE
			? McpDiscoverySource.VSCodeWorkspaceConfig
			: state.target === ConfigurationTarget.WORKSPACE_FOLDER
				? McpDiscoverySource.VSCodeWorkspaceFolderConfig
				: state.host === McpDiscoveryHost.Remote ? McpDiscoverySource.VSCodeRemoteUserConfig : McpDiscoverySource.VSCodeUserConfig;
		const scope = state.target === ConfigurationTarget.WORKSPACE
			? McpDiscoveryScope.Workspace
			: state.target === ConfigurationTarget.WORKSPACE_FOLDER ? McpDiscoveryScope.WorkspaceFolder : McpDiscoveryScope.Profile;
		const event: IMcpConfigurationFoundEvent = {
			source,
			format: McpDiscoveryFormat.VSCodeServers,
			scope,
			host: state.host,
			configurationPresent,
			configuredEntryCount,
			parseErrorCount,
			unreadableCount,
		};
		this.configurationOutcomesByResource.set(mcpResource, { ...state, pending: false, outcome: event });
		this.emitConfigurationTelemetry();
	}

	private emitConfigurationTelemetry(): void {
		const activeResources = [
			...Array.from(this.activeProfileResources.values(), value => value.resource),
			...Array.from(this.activeWorkspaceResources.keys()),
		];
		const activeStates: IMcpConfigurationOutcomeState[] = [];
		for (const resource of activeResources) {
			const state = this.configurationOutcomesByResource.get(resource);
			if (!state || state.pending || !state.outcome) {
				return;
			}
			activeStates.push(state);
		}
		const rows = new Map<string, IMcpConfigurationFoundEvent>();
		for (const { outcome } of activeStates) {
			if (!outcome || (outcome.configurationPresent === 0 && outcome.configuredEntryCount === 0 && outcome.parseErrorCount === 0 && outcome.unreadableCount === 0)) {
				continue;
			}
			const key = `${outcome.source}\0${outcome.format}\0${outcome.scope}\0${outcome.host}`;
			let row = rows.get(key);
			if (!row) {
				row = { ...outcome };
				rows.set(key, row);
			} else {
				row.configurationPresent += outcome.configurationPresent;
				row.configuredEntryCount += outcome.configuredEntryCount;
				row.parseErrorCount += outcome.parseErrorCount;
				row.unreadableCount += outcome.unreadableCount;
			}
		}
		const changes = getKeyedChanges(this.lastTelemetryRows, rows);
		const changed = [
			...changes.changed,
			...changes.removed.map(row => ({ ...row, configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 })),
		];
		if (rows.size === 0 && (!this.hasTelemetrySnapshot || this.lastTelemetryRows.size > 0)) {
			changed.push({ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 });
		}
		this.hasTelemetrySnapshot = true;
		this.lastTelemetryRows.clear();
		for (const [key, row] of rows) {
			this.lastTelemetryRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.source.localeCompare(b.source) || a.scope.localeCompare(b.scope) || a.host.localeCompare(b.host))) {
			this.telemetryService.publicLog2<IMcpConfigurationFoundEvent, McpConfigurationFoundClassification>(mcpConfigurationFoundEventName, row);
		}
	}

	private async writeScannedMcpServers(mcpResource: URI, scannedMcpServers: IScannedMcpServers): Promise<void> {
		if ((scannedMcpServers.servers && Object.keys(scannedMcpServers.servers).length > 0)
			|| (scannedMcpServers.inputs && scannedMcpServers.inputs.length > 0)
			|| scannedMcpServers.sandbox !== undefined) {
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
				throw new Error('Failed to parse scanned MCP servers: ' + errors.map(e => `[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`).join(', '));
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
			inputs: scannedMcpServers.inputs,
			sandbox: scannedMcpServers.sandbox
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
			inputs: scannedWorkspaceFolderMcpServers.inputs,
			sandbox: scannedWorkspaceFolderMcpServers.sandbox
		};
		const servers = Object.entries(scannedWorkspaceFolderMcpServers.servers ?? {});
		if (servers.length > 0) {
			scannedMcpServers.servers = {};
			for (const [serverName, config] of servers) {
				const serverConfig = this.sanitizeServer(config);
				scannedMcpServers.servers[serverName] = serverConfig;
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
