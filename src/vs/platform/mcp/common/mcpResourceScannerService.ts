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
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { ConfigurationTarget, ConfigurationTargetToString } from '../../configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
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
	activateTelemetry(mcpResource: URI, target?: McpResourceTarget): void;
	clearTelemetry(mcpResource: URI): void;
}

interface IMcpConfigurationFoundEvent {
	source: 'vscodeUserConfig' | 'vscodeRemoteUserConfig' | 'vscodeWorkspaceConfig' | 'vscodeWorkspaceFolderConfig' | 'all';
	format: 'vscodeServers' | 'all';
	scope: 'profile' | 'workspace' | 'workspaceFolder' | 'all';
	host: 'local' | 'remote' | 'all';
	configurationPresent: number;
	configuredEntryCount: number;
	parseErrorCount: number;
	unreadableCount: number;
}

type McpConfigurationFoundClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration source.' };
	format: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration format.' };
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration scope.' };
	host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the configuration belongs to the local or remote host.' };
	configurationPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicit configuration files or sections found.' };
	configuredEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of configured MCP entries without reporting identities or values.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of malformed MCP configurations.' };
	unreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unreadable MCP configurations.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe MCP configuration-file presence and outcomes.';
};

interface IMcpConfigurationTelemetryState {
	readonly generation: number;
	readonly pending: boolean;
	readonly event?: IMcpConfigurationFoundEvent;
}

export class McpResourceScannerService extends Disposable implements IMcpResourceScannerService {
	readonly _serviceBrand: undefined;

	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IScannedMcpServers>>();
	private readonly configurationTelemetryByResource = new ResourceMap<IMcpConfigurationTelemetryState>();
	private readonly activeProfileResources = new Map<'local' | 'remote', URI>();
	private readonly activeWorkspaceResources = new ResourceSet();
	private readonly lastTelemetryRows = new Map<string, IMcpConfigurationFoundEvent>();
	private hasTelemetrySnapshot = false;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
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

	clearTelemetry(mcpResource: URI): void {
		let changed = this.configurationTelemetryByResource.delete(mcpResource);
		changed = this.activeWorkspaceResources.delete(mcpResource) || changed;
		for (const [host, resource] of this.activeProfileResources) {
			if (this.uriIdentityService.extUri.isEqual(resource, mcpResource)) {
				this.activeProfileResources.delete(host);
				changed = true;
			}
		}
		if (changed) {
			this.emitConfigurationTelemetry();
		}
	}

	activateTelemetry(mcpResource: URI, target: McpResourceTarget = ConfigurationTarget.USER): void {
		if (target === ConfigurationTarget.USER) {
			this.activeProfileResources.set(mcpResource.scheme === Schemas.vscodeRemote ? 'remote' : 'local', mcpResource);
		} else {
			this.activeWorkspaceResources.add(mcpResource);
		}
		if (!this.configurationTelemetryByResource.has(mcpResource)) {
			this.configurationTelemetryByResource.set(mcpResource, { generation: 0, pending: true });
		}
		this.emitConfigurationTelemetry();
	}

	private async withProfileMcpServers(mcpResource: URI, target?: McpResourceTarget, updateFn?: (data: IScannedMcpServers) => IScannedMcpServers): Promise<IScannedMcpServers> {
		return this.getResourceAccessQueue(mcpResource)
			.queue(async (): Promise<IScannedMcpServers> => {
				target = target ?? ConfigurationTarget.USER;
				const telemetryGeneration = this.beginTelemetryScan(mcpResource, target);
				let scannedMcpServers: IScannedMcpServers = {};
				let configurationPresent = 0;
				let parseErrorCount = 0;
				let unreadableCount = 0;
				try {
					const content = await this.fileService.readFile(mcpResource);
					configurationPresent = 1;
					const errors: ParseError[] = [];
					const result = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true }) || {};
					if (errors.length > 0) {
						parseErrorCount = 1;
						throw new Error('Failed to parse scanned MCP servers: ' + errors.map(e => `[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`).join(', '));
					}

					if (target === ConfigurationTarget.USER) {
						scannedMcpServers = this.fromUserMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
						scannedMcpServers = this.fromWorkspaceFolderMcpServers(result);
					} else if (target === ConfigurationTarget.WORKSPACE) {
						const workspaceScannedMcpServers: IScannedWorkspaceMcpServers = result;
						const workspaceMcp = workspaceScannedMcpServers.settings?.mcp;
						if (workspaceMcp && typeof workspaceMcp === 'object') {
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
						this.logConfigurationTelemetry(mcpResource, target, telemetryGeneration, configurationPresent, 0, parseErrorCount, unreadableCount);
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
						this.logConfigurationTelemetry(mcpResource, target, telemetryGeneration, configurationPresent, Object.keys(scannedMcpServers.servers ?? {}).length, parseErrorCount, 1);
						throw error;
					}
				}
				const updatedConfigurationPresent = updateFn && target === ConfigurationTarget.USER
					? (Object.keys(scannedMcpServers.servers ?? {}).length > 0 || (scannedMcpServers.inputs?.length ?? 0) > 0 || scannedMcpServers.sandbox !== undefined ? 1 : 0)
					: updateFn ? 1 : configurationPresent;
				this.logConfigurationTelemetry(mcpResource, target, telemetryGeneration, updatedConfigurationPresent, Object.keys(scannedMcpServers.servers ?? {}).length, parseErrorCount, unreadableCount);
				return scannedMcpServers;
			});
	}

	private beginTelemetryScan(mcpResource: URI, target: McpResourceTarget): number {
		const previous = this.configurationTelemetryByResource.get(mcpResource);
		const generation = (previous?.generation ?? 0) + 1;
		if (target === ConfigurationTarget.USER && !this.activeProfileResources.has(mcpResource.scheme === Schemas.vscodeRemote ? 'remote' : 'local')) {
			this.activateTelemetry(mcpResource, target);
		} else if (target !== ConfigurationTarget.USER) {
			this.activeWorkspaceResources.add(mcpResource);
		}
		this.configurationTelemetryByResource.set(mcpResource, { generation, pending: true, event: previous?.event });
		return generation;
	}

	private logConfigurationTelemetry(mcpResource: URI, target: McpResourceTarget, generation: number, configurationPresent: number, configuredEntryCount: number, parseErrorCount: number, unreadableCount: number): void {
		const remote = mcpResource.scheme === Schemas.vscodeRemote;
		const source = target === ConfigurationTarget.WORKSPACE
			? 'vscodeWorkspaceConfig'
			: target === ConfigurationTarget.WORKSPACE_FOLDER
				? 'vscodeWorkspaceFolderConfig'
				: remote ? 'vscodeRemoteUserConfig' : 'vscodeUserConfig';
		const scope = target === ConfigurationTarget.WORKSPACE
			? 'workspace'
			: target === ConfigurationTarget.WORKSPACE_FOLDER ? 'workspaceFolder' : 'profile';
		const event: IMcpConfigurationFoundEvent = {
			source,
			format: 'vscodeServers',
			scope,
			host: remote ? 'remote' : 'local',
			configurationPresent,
			configuredEntryCount,
			parseErrorCount,
			unreadableCount,
		};
		const state = this.configurationTelemetryByResource.get(mcpResource);
		if (!state || state.generation !== generation) {
			return;
		}
		this.configurationTelemetryByResource.set(mcpResource, { generation, pending: false, event });
		this.emitConfigurationTelemetry();
	}

	private emitConfigurationTelemetry(): void {
		const activeResources = [...this.activeProfileResources.values(), ...this.activeWorkspaceResources];
		const activeStates: { readonly resource: URI; readonly state: IMcpConfigurationTelemetryState }[] = [];
		for (const resource of activeResources) {
			const state = this.configurationTelemetryByResource.get(resource);
			if (!state || state.pending || !state.event) {
				return;
			}
			activeStates.push({ resource, state });
		}
		const rows = new Map<string, IMcpConfigurationFoundEvent>();
		for (const { state: { event } } of activeStates) {
			if (!event || (event.configurationPresent === 0 && event.configuredEntryCount === 0 && event.parseErrorCount === 0 && event.unreadableCount === 0)) {
				continue;
			}
			const key = `${event.source}\0${event.format}\0${event.scope}\0${event.host}`;
			let row = rows.get(key);
			if (!row) {
				row = { ...event };
				rows.set(key, row);
			} else {
				row.configurationPresent += event.configurationPresent;
				row.configuredEntryCount += event.configuredEntryCount;
				row.parseErrorCount += event.parseErrorCount;
				row.unreadableCount += event.unreadableCount;
			}
		}
		const changed: IMcpConfigurationFoundEvent[] = [];
		for (const [key, row] of rows) {
			if (JSON.stringify(this.lastTelemetryRows.get(key)) !== JSON.stringify(row)) {
				changed.push(row);
			}
		}
		for (const [key, row] of this.lastTelemetryRows) {
			if (!rows.has(key)) {
				changed.push({ ...row, configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 });
			}
		}
		if (rows.size === 0 && (!this.hasTelemetrySnapshot || this.lastTelemetryRows.size > 0)) {
			changed.push({ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 });
		}
		this.hasTelemetrySnapshot = true;
		this.lastTelemetryRows.clear();
		for (const [key, row] of rows) {
			this.lastTelemetryRows.set(key, row);
		}
		for (const row of changed.sort((a, b) => a.source.localeCompare(b.source) || a.scope.localeCompare(b.scope) || a.host.localeCompare(b.host))) {
			this.telemetryService.publicLog2<IMcpConfigurationFoundEvent, McpConfigurationFoundClassification>('mcp/configurationFound', row);
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
