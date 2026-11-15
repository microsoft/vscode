/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { env } from '../../../../../base/common/process.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { supportsAgentHostDevContainers } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostClientProxy } from '../../../../../platform/agentHost/browser/agentHostClientProxy.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, IDevContainerAgentHostConfig, IDevContainerAgentHostMainService, IDevContainerAgentHostOutput, IDevContainerAgentHostSandboxSupport, IDevContainerAgentHostUserStateReport } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { findDevContainerSample, IDevContainerSampleSource } from '../../../../../platform/agentHost/common/devContainerSamples.js';
import { ReconnectingRelayTransport, type IRelayConnectionHandle, type IRelayMessage } from '../../../../../platform/agentHost/common/relayTransport.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { NonReconnectableTransportError } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { areDevContainerSamplesEnabled, DevContainerAgentHostEnabledSettingId, DevContainerIdleTimeoutSettingId, DevContainerSamplesEnabledSettingId, DevContainerStateVolumeEnabledSettingId, DevContainerWorktreeEnabledSettingId, IDevContainerAgentHostConnection, IDevContainerAgentHostConnector, IDevContainerAgentHostService } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { devContainerSourcePath, getDevContainerSourceEntry, resolveDevContainerSourceConnection } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/devContainerSource.js';

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

type DevContainerStateVolumeEvent = {
	stage: string;
	outcome: string;
	reason: string | undefined;
	step: string | undefined;
	target: string | undefined;
	skipReasons: string | undefined;
	exitCode: number | undefined;
	restoredFolders: number | undefined;
	movedFolders: number | undefined;
	createdFolders: number | undefined;
	existingFolders: number | undefined;
	skippedFolders: number | undefined;
	errorMessage: string | undefined;
	enabled: boolean;
	sample: boolean;
	remote: boolean;
};

type DevContainerStateVolumeClassification = {
	owner: 'chrmarti';
	comment: 'Reports how keeping user and agent state on a per-container volume went, to evaluate the chat.agentHost.devContainer.stateVolume.enabled experiment.';
	stage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The stage: mount (adding the volume), up (starting the container), link (linking state folders to it) or userCommands (lifecycle commands, which run after linking).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The stage outcome, e.g., added, existingContainer, linked, noMount, homeNotFound, succeeded or failed.' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed identifier of the operation that failed.' };
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed identifier of the link script step that failed.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the volume is mounted at /workspaces or at a separate folder.' };
	skipReasons: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed identifiers of why state folders were not persisted, e.g., because they are already mounted.' };
	exitCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Exit code of the failed command.' };
	restoredFolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of state folders restored from an earlier container.' };
	movedFolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of existing state folders moved to the volume.' };
	createdFolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of new state folders created on the volume.' };
	existingFolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of state folders that were already linked.' };
	skippedFolders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of state folders not persisted.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'FeatureInsight'; comment: 'Error message of a failed stage without command lines, ids and the container user; the telemetry service also redacts paths and secrets.' };
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the chat.agentHost.devContainer.stateVolume.enabled setting is on. Linking also runs for containers created with it on.' };
	sample: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the container is for a Dev Container sample.' };
	remote: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the container runs on a remote Docker host through SSH, Tunnel or WSL.' };
};

export function reportDevContainerUserState(telemetryService: ITelemetryService, report: IDevContainerAgentHostUserStateReport, enabled: boolean, sample: boolean, remote: boolean): void {
	telemetryService.publicLog2<DevContainerStateVolumeEvent, DevContainerStateVolumeClassification>('vscodeAgents.devContainer/stateVolume', {
		stage: report.stage,
		outcome: report.outcome,
		reason: report.reason,
		step: report.step,
		target: report.target,
		skipReasons: report.skipReasons || undefined,
		exitCode: report.exitCode,
		restoredFolders: report.restoredFolders,
		movedFolders: report.movedFolders,
		createdFolders: report.createdFolders,
		existingFolders: report.existingFolders,
		skippedFolders: report.skippedFolders,
		errorMessage: report.errorMessage,
		enabled,
		sample,
		remote,
	});
}

type DevContainerConnectEvent = {
	success: boolean;
	cancelled: boolean;
	reconnect: boolean;
	stateVolume: boolean;
	sample: boolean;
	remote: boolean;
	durationMs: number;
};

type DevContainerConnectClassification = {
	owner: 'chrmarti';
	comment: 'Reports whether starting a Dev Container and its Agent Host succeeded, to compare reliability with and without the chat.agentHost.devContainer.stateVolume.enabled experiment.';
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the Dev Container and its Agent Host started.' };
	cancelled: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the attempt failed because it was cancelled.' };
	reconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this is an automatic reconnect rather than the initial connection.' };
	stateVolume: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether user state was kept on a per-container volume.' };
	sample: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the container is for a Dev Container sample.' };
	remote: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the container runs on a remote Docker host through SSH, Tunnel or WSL.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the attempt in milliseconds.' };
};

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
	if (configurationService.getValue<boolean>('chat.disableAIFeatures') === true) {
		throw new Error(localize('devContainerAgentHost.aiDisabled', "AI features are disabled."));
	}
}

/** Returns whether a workspace can be launched using its host's Dev Container service. */
export async function isDevContainerWorkspaceAvailable(
	workspaceUri: URI,
	fileService: IFileService,
	mainService: IDevContainerAgentHostMainService,
	configurationService: IConfigurationService,
): Promise<boolean> {
	if (
		!configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
		|| !configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
		|| configurationService.getValue<boolean>('chat.disableAIFeatures') === true
	) {
		return false;
	}
	if (findDevContainerSample(workspaceUri)) {
		return areDevContainerSamplesEnabled(configurationService) && await mainService.isDockerAvailable();
	}
	if (workspaceUri.scheme !== Schemas.file && workspaceUri.scheme !== AGENT_HOST_SCHEME) {
		return false;
	}
	return await hasDevContainerConfiguration(workspaceUri, fileService) && await mainService.isDockerAvailable();
}

export class RemoteDevContainerService extends Disposable implements IDevContainerAgentHostMainService {
	declare readonly _serviceBrand: undefined;
	private readonly _messages = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage = this._messages.event;
	private readonly _relayActivity = this._register(new Emitter<string>());
	readonly onDidRelayActivity = this._relayActivity.event;
	private readonly _relayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this._relayClose.event;
	private readonly _close = this._register(new Emitter<string>());
	readonly onDidCloseConnection = this._close.event;
	private readonly _output = this._register(new Emitter<IDevContainerAgentHostOutput>());
	readonly onDidOutput = this._output.event;
	private readonly _sandboxSupport = this._register(new Emitter<IDevContainerAgentHostSandboxSupport>());
	readonly onDidChangeSandboxSupport = this._sandboxSupport.event;
	private readonly _userState = this._register(new Emitter<IDevContainerAgentHostUserStateReport>());
	readonly onDidReportUserState = this._userState.event;
	private readonly _connections = new Map<string, { store: DisposableStore; tokenSource: CancellationTokenSource; service?: IDevContainerAgentHostMainService }>();
	private _disposed = false;

	constructor(
		private readonly _resolveService: (token: CancellationToken) => Promise<IDevContainerAgentHostMainService>,
		private readonly _logService: ILogService,
	) {
		super();
	}

	async isDockerAvailable(): Promise<boolean> {
		return (await this._resolveService(CancellationToken.None)).isDockerAvailable();
	}

	async connect(config: IDevContainerAgentHostConfig) {
		if (this._connections.has(config.connectionId)) {
			await this.disconnect(config.connectionId);
		}
		if (this._disposed) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const entry: { store: DisposableStore; tokenSource: CancellationTokenSource; service?: IDevContainerAgentHostMainService } = {
			store,
			tokenSource: store.add(new CancellationTokenSource()),
		};
		this._connections.set(config.connectionId, entry);
		try {
			const service = await this._resolveService(entry.tokenSource.token);
			if (entry.tokenSource.token.isCancellationRequested) {
				throw new CancellationError();
			}
			entry.service = service;
			store.add(Event.filter(service.onDidRelayMessage, event => event.connectionId === config.connectionId)(event => this._messages.fire(event)));
			store.add(Event.filter(service.onDidRelayActivity, id => id === config.connectionId)(id => this._relayActivity.fire(id)));
			store.add(Event.filter(service.onDidRelayClose, id => id === config.connectionId)(id => this._relayClose.fire(id)));
			store.add(Event.filter(service.onDidCloseConnection, id => id === config.connectionId)(id => this._close.fire(id)));
			store.add(Event.filter(service.onDidOutput, event => event.connectionId === config.connectionId)(event => this._output.fire(event)));
			if (service.onDidChangeSandboxSupport) {
				store.add(Event.filter(service.onDidChangeSandboxSupport, event => event.connectionId === config.connectionId)(event => this._sandboxSupport.fire(event)));
			}
			if (service.onDidReportUserState) {
				store.add(Event.filter(service.onDidReportUserState, event => event.connectionId === config.connectionId)(event => this._userState.fire(event)));
			}
			return await service.connect(config);
		} catch (error) {
			if (this._connections.get(config.connectionId) === entry) {
				await this.disconnect(config.connectionId);
			}
			throw error;
		}
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		const service = this._connections.get(connectionId)?.service;
		if (!service) {
			throw new Error(`Dev Container relay '${connectionId}' is not connected.`);
		}
		await service.relaySend(connectionId, message);
	}

	async disconnect(connectionId: string): Promise<void> {
		const entry = this._connections.get(connectionId);
		if (!entry) {
			return;
		}
		this._connections.delete(connectionId);
		entry.tokenSource.cancel();
		try {
			await entry.service?.disconnect(connectionId);
		} finally {
			entry.store.dispose();
		}
	}

	async stopContainer(workspaceFolder: string | IDevContainerSampleSource): Promise<boolean> {
		return (await this._resolveService(CancellationToken.None)).stopContainer(workspaceFolder);
	}

	async removeContainer(workspaceFolder: string | IDevContainerSampleSource): Promise<boolean> {
		return (await this._resolveService(CancellationToken.None)).removeContainer(workspaceFolder);
	}

	override dispose(): void {
		this._disposed = true;
		for (const id of this._connections.keys()) {
			void this.disconnect(id).catch(error => this._logService.warn('[DevContainerAgentHostConnector] Failed to disconnect remote container', error));
		}
		super.dispose();
	}
}

function getDevContainerOutputChannel(workspaceUri: URI): string {
	const sha = new StringSHA1();
	sha.update(getComparisonKey(workspaceUri));
	const channelId = `devContainer.${sha.digest()}`;
	const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
	if (!registry.getChannel(channelId)) {
		registry.registerChannel({
			id: channelId,
			label: localize('devContainerOutputChannel', "Dev Container ({0})", basename(workspaceUri)),
			log: false,
			languageId: 'log',
		});
	}
	return channelId;
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
		this._channelId = getDevContainerOutputChannel(workspaceUri);

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

export class DevContainerAgentHostConnector extends Disposable implements IDevContainerAgentHostConnector {
	private readonly _sandboxSupport = this._register(new Emitter<{ readonly workspaceUri: URI; readonly supported: boolean }>());
	readonly onDidChangeSandboxSupport = this._sandboxSupport.event;
	private readonly _mainService: IDevContainerAgentHostMainService;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IOutputService private readonly _outputService: IOutputService,
		@IFileService private readonly _fileService: IFileService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IRequestService private readonly _requestService: IRequestService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._mainService = ProxyChannel.toService<IDevContainerAgentHostMainService>(
			sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL),
		);
	}

	async isAvailable(workspaceUri: URI): Promise<boolean> {
		if (workspaceUri.scheme === Schemas.file || findDevContainerSample(workspaceUri)) {
			return isDevContainerWorkspaceAvailable(workspaceUri, this._fileService, this._mainService, this._configurationService);
		}
		const entry = getDevContainerSourceEntry(workspaceUri, this._remoteAgentHostService);
		const connection = entry && this._remoteAgentHostService.getConnection(getEntryAddress(entry));
		return !!connection && supportsAgentHostDevContainers(connection.initializeResult.get()) && !!connection.devContainerService
			&& await isDevContainerWorkspaceAvailable(workspaceUri, this._fileService, connection.devContainerService, this._configurationService);
	}

	getEnvironment(workspaceUris: readonly URI[]): Promise<DevContainerEnvironment> {
		return getDevContainerEnvironment(workspaceUris, this._fileService, this._mainService);
	}

	showLog(workspaceUri: URI): Promise<void> {
		return this._outputService.showChannel(getDevContainerOutputChannel(workspaceUri), true);
	}

	async stopContainer(workspaceUri: URI): Promise<boolean> {
		const service = await this._resolveWorkspaceService(workspaceUri, CancellationToken.None);
		const sample = findDevContainerSample(workspaceUri);
		return service.stopContainer(sample ? { sampleId: sample.id } : devContainerSourcePath(workspaceUri));
	}

	async removeContainer(workspaceUri: URI): Promise<boolean> {
		const service = await this._resolveWorkspaceService(workspaceUri, CancellationToken.None);
		const sample = findDevContainerSample(workspaceUri);
		return service.removeContainer(sample ? { sampleId: sample.id } : devContainerSourcePath(workspaceUri));
	}

	private async _resolveWorkspaceService(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostMainService> {
		if (workspaceUri.scheme === Schemas.file || findDevContainerSample(workspaceUri)) {
			return this._mainService;
		}
		const connection = await resolveDevContainerSourceConnection(workspaceUri, this._remoteAgentHostService, this._sessionsProvidersService, token);
		if (!supportsAgentHostDevContainers(connection.initializeResult.get()) || !connection.devContainerService) {
			throw new NonReconnectableTransportError(localize('devContainerAgentHost.unsupportedHost', "This remote Agent Host does not support Dev Container sessions. Update VS Code on the remote machine."));
		}
		return connection.devContainerService;
	}

	async createConnection(workspaceUri: URI, address: string, token: CancellationToken, options?: { readonly resume: boolean; readonly sandboxEnabled?: boolean }): Promise<IDevContainerAgentHostConnection> {
		ensureDevContainerAgentHostsEnabled(this._configurationService);
		const sample = findDevContainerSample(workspaceUri);
		const sourceEntry = getDevContainerSourceEntry(workspaceUri, this._remoteAgentHostService);
		if (workspaceUri.scheme !== Schemas.file && !sourceEntry && !sample) {
			throw new Error(localize('devContainerAgentHost.workspaceRequired', "Dev Container Agent Hosts require a local, SSH, Tunnel, or WSL workspace."));
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const remoteService = sourceEntry ? new RemoteDevContainerService(token => this._resolveWorkspaceService(workspaceUri, token), this._logService) : undefined;
		const mainService = remoteService ?? this._mainService;
		const connectionId = generateUuid();
		const source = sample ? { sampleId: sample.id } : { workspaceFolder: devContainerSourcePath(workspaceUri) };
		const name = sourceEntry ? `${basename(workspaceUri)} Dev Container (${sourceEntry.name})` : `${basename(workspaceUri)} Dev Container`;
		const connectionStore = new DisposableStore();
		const outputWriter = connectionStore.add(new DevContainerOutputWriter(mainService, connectionId, workspaceUri, this._outputService));
		// Whether each connection keeps user state on a volume.
		const connectionIds = new Map<string, boolean>();
		const cancellationListener = token.onCancellationRequested(() => {
			void mainService.disconnect(connectionId).catch(error => {
				this._logService.warn('[DevContainerAgentHostConnector] Failed to cancel connection', error);
			});
		});
		const connect = async (config: IDevContainerAgentHostConfig, reconnect: boolean) => {
			// Read on every connect, so a container created on reconnect follows the current setting.
			const persistUserState = this._configurationService.getValue<boolean>(DevContainerStateVolumeEnabledSettingId) === true;
			connectionIds.set(config.connectionId, persistUserState);
			const stopWatch = StopWatch.create(false);
			const report = (success: boolean, cancelled: boolean) => this._telemetryService.publicLog2<DevContainerConnectEvent, DevContainerConnectClassification>('vscodeAgents.devContainer/connect', {
				success,
				cancelled,
				reconnect,
				stateVolume: persistUserState,
				sample: !!sample,
				remote: !!sourceEntry,
				durationMs: stopWatch.elapsed(),
			});
			try {
				const connected = await mainService.connect(persistUserState ? { ...config, persistUserState } : config);
				report(true, false);
				return connected;
			} catch (error) {
				report(false, isCancellationError(error) || (!reconnect && token.isCancellationRequested));
				throw error;
			}
		};
		try {
			if (mainService.onDidChangeSandboxSupport) {
				connectionStore.add(mainService.onDidChangeSandboxSupport(event => {
					if (connectionIds.has(event.connectionId)) {
						this._sandboxSupport.fire({ workspaceUri, supported: event.supported });
					}
				}));
			}
			if (mainService.onDidReportUserState) {
				connectionStore.add(mainService.onDidReportUserState(event => {
					const persistUserState = connectionIds.get(event.connectionId);
					if (persistUserState !== undefined) {
						reportDevContainerUserState(this._telemetryService, event, persistUserState, !!sample, !!sourceEntry);
					}
				}));
			}
			let result = await connect({
				connectionId,
				...source,
				name,
				resume: options?.resume ?? true,
				...(options?.sandboxEnabled !== undefined ? { sandboxEnabled: options.sandboxEnabled } : {}),
			}, false);
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
				if (!sourceEntry && !sample && !await this._fileService.exists(workspaceUri)) {
					throw new NonReconnectableTransportError('Dev Container workspace folder no longer exists.');
				}

				const reconnectConnectionId = generateUuid();
				outputWriter.addConnection(reconnectConnectionId);
				try {
					result = await connect({
						connectionId: reconnectConnectionId,
						...source,
						name,
						resume: false,
						...(options?.sandboxEnabled !== undefined ? { sandboxEnabled: options.sandboxEnabled } : {}),
					}, true);
					return {
						connectionId: reconnectConnectionId,
						close: async () => {
							connectionIds.delete(reconnectConnectionId);
							outputWriter.removeConnection(reconnectConnectionId);
							await mainService.disconnect(reconnectConnectionId);
						},
					};
				} catch (error) {
					connectionIds.delete(reconnectConnectionId);
					outputWriter.removeConnection(reconnectConnectionId);
					if (isCancellationError(error)) {
						throw new NonReconnectableTransportError('Dev Container Agent Host connection was cancelled.');
					}
					throw error;
				}
			};
			const transportFactory = () => {
				const createLogger = (activeConnectionId: string) => this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)
					? this._instantiationService.createInstance(AhpJsonlLogger, {
						logsHome: this._environmentService.logsHome,
						logId: address,
						connectionId: activeConnectionId,
						transport: 'devcontainer',
					})
					: undefined;
				return new ReconnectingRelayTransport(
					establish,
					mainService,
					createLogger,
					this._logService,
					'[DevContainerRelayTransport]',
					AgentHostClientConnectionKind.DevContainer,
				);
			};
			return {
				address,
				name: result.name,
				hostWorkspaceFolder: result.hostWorkspaceFolder,
				repository: result.repository,
				sandboxSupported: result.sandboxSupported,
				clientCertificates: remoteService ? undefined : {
					isEnabled: () => result.sharesClientNetwork === true && this._configurationService.getValue<boolean>('http.systemCertificates') !== false,
					loadCertificates: () => this._requestService.loadCertificates(),
				},
				clientProxy: remoteService ? undefined : this._instantiationService.createInstance(AgentHostClientProxy, () => result.sharesClientNetwork === true, env),
				transportFactory,
				transportDisposable: combinedDisposable(
					connectionStore,
					toDisposable(() => {
						void mainService.disconnect(connectionId).catch(error => {
							this._logService.warn('[DevContainerAgentHostConnector] Failed to disconnect transport', error);
						});
					}),
					toDisposable(() => remoteService?.dispose()),
				),
				workspaceUri: URI.from({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(address),
					path: result.remoteWorkspaceFolder,
				}),
				defaultDirectory: result.remoteWorkspaceFolder,
			};
		} catch (error) {
			try {
				if (!token.isCancellationRequested && !isCancellationError(error)) {
					await outputWriter.reveal();
				}
			} finally {
				connectionStore.dispose();
				try {
					await mainService.disconnect(connectionId);
				} finally {
					remoteService?.dispose();
				}
			}
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
		const connector = this._register(instantiationService.createInstance(DevContainerAgentHostConnector));
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
			default: true,
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
		[DevContainerStateVolumeEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.stateVolume.enabled', "Keep user and agent state of new Dev Containers, including agent sessions and worktrees, on a per-container volume across rebuilds."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[DevContainerSamplesEnabledSettingId]: {
			type: 'boolean',
			description: localize('chat.agentHost.devContainer.samples.enabled', "Show Dev Container samples in the Agents window workspace picker. The sample is cloned into a Docker volume and started when you send the first prompt. Requires Dev Container Agent Host sessions to be enabled."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			experiment: { mode: 'auto' },
		},
		[DevContainerIdleTimeoutSettingId]: {
			type: 'integer',
			description: localize('chat.agentHost.devContainer.idleTimeout', "Number of seconds with no Agent Host sessions actively working, waiting for input, or holding unsent drafts before automatically stopping a Dev Container. Set to 0 to disable automatic shutdown. Archiving or deleting sessions can still remove the container."),
			default: 300,
			minimum: 0,
			scope: ConfigurationScope.APPLICATION,
		},
	},
});

registerWorkbenchContribution2(
	DevContainerAgentHostConnectorContribution.ID,
	DevContainerAgentHostConnectorContribution,
	WorkbenchPhase.AfterRestored,
);
