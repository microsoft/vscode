/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, IDevContainerAgentHostMainService } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { ReconnectingRelayTransport, type IRelayConnectionHandle } from '../../../../../platform/agentHost/common/relayTransport.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { NonReconnectableTransportError } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId, IDevContainerAgentHostConnection, IDevContainerAgentHostConnector, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';

type DevContainerEnvironmentEvent = {
	dockerAvailable: boolean;
	devContainerFolderCount: number;
	devContainerEnabled: boolean;
};

type DevContainerEnvironmentClassification = {
	owner: 'chrmarti';
	comment: 'Reports whether the Agents window can resolve Docker and how many recent local folders contain a default Dev Container configuration.';
	dockerAvailable: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the Docker executable can be resolved from the user shell environment.' };
	devContainerFolderCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of unique recent local folders containing .devcontainer/devcontainer.json or .devcontainer.json.' };
	devContainerEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Value of the chat.agentHost.devContainer.enabled setting when the event was emitted.' };
};

type DevContainerEnvironment = Omit<DevContainerEnvironmentEvent, 'devContainerEnabled'>;

async function hasDevContainerConfiguration(workspaceUri: URI, fileService: IFileService): Promise<boolean> {
	const configurations = await Promise.all([
		fileService.exists(URI.joinPath(workspaceUri, '.devcontainer', 'devcontainer.json')),
		fileService.exists(URI.joinPath(workspaceUri, '.devcontainer.json')),
	]);
	return configurations.some(exists => exists);
}

export async function getDevContainerEnvironment(
	workspaceUris: readonly URI[],
	fileService: IFileService,
	mainService: IDevContainerAgentHostMainService,
): Promise<DevContainerEnvironment> {
	const [dockerAvailable, configurations] = await Promise.all([
		mainService.isDockerAvailable(),
		Promise.all(workspaceUris.map(workspaceUri => hasDevContainerConfiguration(workspaceUri, fileService))),
	]);
	return {
		dockerAvailable,
		devContainerFolderCount: configurations.filter(Boolean).length,
	};
}

export async function reportDevContainerEnvironment(
	recentWorkspacesService: ISessionsRecentWorkspacesService,
	getEnvironment: (workspaceUris: readonly URI[]) => Promise<DevContainerEnvironment>,
	configurationService: IConfigurationService,
	telemetryService: ITelemetryService,
): Promise<void> {
	if (telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
		return;
	}
	await waitForState(recentWorkspacesService.historyLoadState, state => state !== 'loading');
	const workspaceUris: URI[] = [];
	const seen = new Set<string>();
	for (const { workspace } of recentWorkspacesService.getRecentWorkspaces()) {
		const folderUri = workspace.folders[0]?.root;
		if (folderUri?.scheme !== Schemas.file) {
			continue;
		}
		const key = getComparisonKey(folderUri);
		if (!seen.has(key)) {
			seen.add(key);
			workspaceUris.push(folderUri);
		}
	}
	const environment = await getEnvironment(workspaceUris);
	telemetryService.publicLog2<DevContainerEnvironmentEvent, DevContainerEnvironmentClassification>(
		'vscodeAgents.devContainer/environment',
		{
			...environment,
			devContainerEnabled: configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId),
		},
	);
}

/** Throws when Dev Container Agent Host connections are disabled. */
export function ensureDevContainerAgentHostsEnabled(configurationService: IConfigurationService): void {
	if (!configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)) {
		throw new Error(localize('devContainerAgentHost.disabled', "Dev Container Agent Host connections are not enabled."));
	}
	if (!configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
		throw new Error(localize('devContainerAgentHost.remoteAgentHostsDisabled', "Remote Agent Host connections are not enabled."));
	}
}

/** Returns whether a local workspace can be launched as a Dev Container. */
export async function isDevContainerWorkspaceAvailable(
	workspaceUri: URI,
	fileService: IFileService,
	mainService: IDevContainerAgentHostMainService,
	configurationService: IConfigurationService,
): Promise<boolean> {
	if (
		!configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
		|| !configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
		|| workspaceUri.scheme !== Schemas.file
	) {
		return false;
	}
	return await hasDevContainerConfiguration(workspaceUri, fileService) && await mainService.isDockerAvailable();
}

class DevContainerOutputWriter extends Disposable {
	private readonly _channelId: string;
	private readonly _connectionIds = new Set<string>();

	constructor(
		mainService: IDevContainerAgentHostMainService,
		connectionId: string,
		workspaceUri: URI,
		private readonly _outputService: IOutputService,
	) {
		super();
		this._connectionIds.add(connectionId);
		const sha = new StringSHA1();
		sha.update(getComparisonKey(workspaceUri));
		this._channelId = `devContainer.${sha.digest()}`;

		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		if (!registry.getChannel(this._channelId)) {
			registry.registerChannel({
				id: this._channelId,
				label: localize('devContainerOutputChannel', "Dev Container ({0})", basename(workspaceUri)),
				log: false,
				languageId: 'log',
			});
		}

		this._append(localize('devContainerOutputStarting', "\n--- Starting Dev Container for {0} ---\n", workspaceUri.fsPath));
		this._register(mainService.onDidOutput(output => {
			if (this._connectionIds.has(output.connectionId)) {
				this._append(output.data);
			}
		}));
	}

	addConnection(connectionId: string): void {
		this._connectionIds.add(connectionId);
	}

	removeConnection(connectionId: string): void {
		this._connectionIds.delete(connectionId);
	}

	reveal(): Promise<void> {
		return this._outputService.showChannel(this._channelId, true);
	}

	private _append(value: string): void {
		this._outputService.getChannel(this._channelId)?.append(value);
	}
}

export class DevContainerAgentHostConnector implements IDevContainerAgentHostConnector {
	private readonly _mainService: IDevContainerAgentHostMainService;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IOutputService private readonly _outputService: IOutputService,
		@IFileService private readonly _fileService: IFileService,
	) {
		this._mainService = ProxyChannel.toService<IDevContainerAgentHostMainService>(
			sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL),
		);
	}

	async isAvailable(workspaceUri: URI): Promise<boolean> {
		return isDevContainerWorkspaceAvailable(workspaceUri, this._fileService, this._mainService, this._configurationService);
	}

	getEnvironment(workspaceUris: readonly URI[]): Promise<DevContainerEnvironment> {
		return getDevContainerEnvironment(workspaceUris, this._fileService, this._mainService);
	}

	async createConnection(workspaceUri: URI, address: string, token: CancellationToken): Promise<IDevContainerAgentHostConnection> {
		ensureDevContainerAgentHostsEnabled(this._configurationService);
		if (workspaceUri.scheme !== Schemas.file) {
			throw new Error(localize('devContainerAgentHost.localWorkspaceRequired', "Dev Container Agent Hosts require a local file workspace."));
		}
		const connectionId = generateUuid();
		const workspaceFolder = workspaceUri.fsPath;
		const name = `${basename(workspaceUri)} Dev Container`;
		const outputWriter = new DevContainerOutputWriter(this._mainService, connectionId, workspaceUri, this._outputService);
		const cancellationListener = token.onCancellationRequested(() => {
			void this._mainService.disconnect(connectionId).catch(error => {
				this._logService.warn('[DevContainerAgentHostConnector] Failed to cancel connection', error);
			});
		});
		try {
			const result = await this._mainService.connect({
				connectionId,
				workspaceFolder,
				name,
			});
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			let seed = true;
			const establish = async (): Promise<IRelayConnectionHandle> => {
				if (seed) {
					seed = false;
					// The initial relay is owned by the connection cancellation and teardown path below.
					return { connectionId };
				}

				try {
					ensureDevContainerAgentHostsEnabled(this._configurationService);
				} catch (error) {
					throw new NonReconnectableTransportError(error instanceof Error ? error.message : String(error));
				}
				if (!await this._fileService.exists(workspaceUri)) {
					throw new NonReconnectableTransportError('Dev Container workspace folder no longer exists.');
				}

				const reconnectConnectionId = generateUuid();
				outputWriter.addConnection(reconnectConnectionId);
				try {
					await this._mainService.connect({
						connectionId: reconnectConnectionId,
						workspaceFolder,
						name,
					});
					return {
						connectionId: reconnectConnectionId,
						close: async () => {
							outputWriter.removeConnection(reconnectConnectionId);
							await this._mainService.disconnect(reconnectConnectionId);
						},
					};
				} catch (error) {
					outputWriter.removeConnection(reconnectConnectionId);
					if (isCancellationError(error)) {
						throw new NonReconnectableTransportError('Dev Container Agent Host connection was cancelled.');
					}
					throw error;
				}
			};
			const transportFactory = () => {
				// Post-reconnect logs use the original channel id because the new id is assigned asynchronously by `establish`.
				const createLogger = () => this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)
					? this._instantiationService.createInstance(AhpJsonlLogger, {
						logsHome: this._environmentService.logsHome,
						connectionId,
						transport: 'devcontainer',
					})
					: undefined;
				return new ReconnectingRelayTransport(
					establish,
					this._mainService,
					createLogger,
					this._logService,
					'[DevContainerRelayTransport]',
					AgentHostClientConnectionKind.DevContainer,
				);
			};
			return {
				address,
				name: result.name,
				transportFactory,
				transportDisposable: combinedDisposable(
					outputWriter,
					toDisposable(() => {
						void this._mainService.disconnect(connectionId).catch(error => {
							this._logService.warn('[DevContainerAgentHostConnector] Failed to disconnect transport', error);
						});
					}),
				),
				workspaceUri: workspaceUri.with({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: result.remoteWorkspaceFolder,
				}),
				defaultDirectory: result.remoteWorkspaceFolder,
			};
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				await outputWriter.reveal();
			}
			outputWriter.dispose();
			await this._mainService.disconnect(connectionId);
			throw error;
		} finally {
			cancellationListener.dispose();
		}
	}
}

class DevContainerAgentHostConnectorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.devContainerAgentHostConnector';

	constructor(
		@IDevContainerAgentHostService service: IDevContainerAgentHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsRecentWorkspacesService recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super();
		const connector = instantiationService.createInstance(DevContainerAgentHostConnector);
		this._register(service.registerConnector(connector));
		void reportDevContainerEnvironment(
			recentWorkspacesService,
			workspaceUris => connector.getEnvironment(workspaceUris),
			configurationService,
			telemetryService,
		).catch(error => logService.warn('[DevContainerAgentHostConnector] Failed to report Dev Container environment telemetry', error));
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[DevContainerAgentHostEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.enabled', "Enable running Agent Host sessions in Dev Containers."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
		},
		[DevContainerWorktreeEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.worktree.enabled', "Enable running Dev Container Agent Host sessions in new worktrees."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			included: false,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});

registerWorkbenchContribution2(
	DevContainerAgentHostConnectorContribution.ID,
	DevContainerAgentHostConnectorContribution,
	WorkbenchPhase.AfterRestored,
);
