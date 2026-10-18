/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname } from 'os';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { formatConnectionDiagnosticError, getConnectionDiagnosticError, type IConnectionDiagnosticEvent } from '../../common/connectionDiagnostics.js';
import { IAgentService } from '../../common/agentService.js';
import type { IAgent, IAgentChatSessionEvent } from '../../common/agent.js';
import type { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import type { AgentHostClientFileSystemProvider } from '../../common/agentHostClientFileSystemProvider.js';
import { parseAnnotationsUri } from '../../common/annotationsUri.js';
import { changesetSession, parseChangesetUri } from '../../common/changesetUri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { isAhpChatChannel } from '../../common/state/sessionState.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { ProtocolServerHandler } from '../protocolServerHandler.js';
import { MissionControlEnvironment } from './missionControlEnvironment.js';
import type { MissionControlProtocolServer, MissionControlPublishDiagnostic } from './missionControlProtocolServer.js';
import { MissionControlSdkEventSource } from './missionControlSdkEventSource.js';
import { MissionControlSessionMirror } from './missionControlSessionMirror.js';
import { MissionControlSessionPublisher } from './missionControlSessionPublisher.js';
import { MissionControlProjects } from './missionControlProjects.js';
import { MissionControlCopilotExtension } from './missionControlCopilotExtension.js';
import { missionControlSessionConfigAdapter } from './missionControlSessionConfig.js';
import { toMissionControlSessionList } from './missionControlSessionList.js';
import { isObject } from '../../../../base/common/types.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentHostAhpJsonlLoggingEnvVar, AhpJsonlLogger, AhpJsonlLogRetention, isAhpJsonlLoggingEnabled } from '../../common/ahpJsonlLogger.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../common/missionControlEnvironment.js';
import { IAgentHostChatOwnershipService } from '../agentHostChatOwnershipService.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { AgentHostAhpJsonlLoggingEnabledConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';

interface IMissionControlHostOptions {
	readonly hostLaunchKind: AgentHostLaunchKind;
	readonly publishTelemetryClock?: StopWatch;
	readonly clientFileSystemProvider: AgentHostClientFileSystemProvider;
	readonly trackProtocolHandler: (handler: ProtocolServerHandler) => IDisposable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

type MissionControlOperationEvent = {
	operation: 'configure' | 'checkIn' | 'register' | 'heartbeat' | 'token' | 'signingKeys' | 'relay' | 'relayDisconnected';
	outcome: 'succeeded' | 'failed' | 'info';
	durationMs: number | undefined;
	statusCode: number | undefined;
	hostLaunchKind: AgentHostLaunchKind;
};

export type MissionControlOperationClassification = {
	owner: 'roblourens';
	comment: 'Mission Control host registration and relay health; routine successful heartbeats are excluded.';
	operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded registration, heartbeat, token, signing key, relay establishment or unexpected relay loss operation.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Operation success or failure, or an unexpected relay loss (info).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Operation milliseconds, or ready relay milliseconds before an unexpected loss.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status on failed requests, when available. No response content.' };
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the native Agent Host was launched.' };
};

type MissionControlPublishSummaryEvent = {
	hostLaunchKind: AgentHostLaunchKind;
	windowDurationMs: number;
	publishCount: number;
	chunkedPublishCount: number;
	frameCount: number;
	bytes: number;
	meanQueueWaitMs: number | undefined;
	maxQueueWaitMs: number;
	meanAckLatencyMs: number | undefined;
	maxAckLatencyMs: number;
	meanPublishDurationMs: number | undefined;
	maxPublishDurationMs: number;
	peakInFlight: number;
	peakOutstandingFrames: number;
	peakOutstandingBytes: number;
	ackTimeoutCount: number;
	publishRejectedCount: number;
	socketFailureCount: number;
	queueLimitCount: number;
	mirrorBackpressureCount: number;
};

export type MissionControlPublishSummaryClassification = {
	owner: 'roblourens';
	comment: 'Aggregates Mission Control publication performance while connected to the relay service, including background mirroring, plus failures without requiring a connection. At most one event per five minutes per host, including across reconnects. WPS acceptance is not client receipt or durable persistence.';
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the native Agent Host was launched.' };
	windowDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds from the first accumulated observation to summary emission.' };
	publishCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of payload publications whose frames were all acknowledged successfully.' };
	chunkedPublishCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of successful multi-fragment payload publications.' };
	frameCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total WPS frames in successful publications; also the acknowledgement-latency denominator.' };
	bytes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Serialized relay JSON bytes in successful publications, excluding WebSocket/TLS overhead.' };
	meanQueueWaitMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Mean enqueue-to-first-write milliseconds for successful publications; absent without a successful publication.' };
	maxQueueWaitMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum enqueue-to-first-write milliseconds among successful publications.' };
	meanAckLatencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Mean write-to-service-acknowledgement milliseconds across frames in successful publications; absent without a successful frame.' };
	maxAckLatencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum frame acknowledgement latency in successful publications.' };
	meanPublishDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Mean enqueue-to-final-acknowledgement milliseconds for successful publications; absent without a successful publication.' };
	maxPublishDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum enqueue-to-final-acknowledgement milliseconds among successful publications.' };
	peakInFlight: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum simultaneous in-flight frames observed in successful publications.' };
	peakOutstandingFrames: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum queued plus in-flight relay frame count observed at admission.' };
	peakOutstandingBytes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum queued plus in-flight serialized relay bytes observed at admission.' };
	ackTimeoutCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of WPS acknowledgement timeout failures.' };
	publishRejectedCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of WPS acknowledgement rejection failures, excluding acknowledged duplicates.' };
	socketFailureCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unexpected socket closures, socket errors or publish write failures.' };
	queueLimitCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of relay publication admissions rejected by the frame or byte limit.' };
	mirrorBackpressureCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of mirror admission attempts paused by backpressure; these are not publication failures.' };
};

const publishSummaryIntervalMs = 5 * 60_000;

function newPublishTotals() {
	return {
		publishCount: 0, chunkedPublishCount: 0, frameCount: 0, bytes: 0,
		queueWaitMs: 0, maxQueueWaitMs: 0, ackLatencyMs: 0, maxAckLatencyMs: 0,
		publishDurationMs: 0, maxPublishDurationMs: 0, peakInFlight: 0,
		peakOutstandingFrames: 0, peakOutstandingBytes: 0,
		ackTimeoutCount: 0, publishRejectedCount: 0, socketFailureCount: 0, queueLimitCount: 0, mirrorBackpressureCount: 0,
	};
}

class MissionControlPublishTelemetry extends Disposable {
	private readonly _timer = this._register(new RunOnceScheduler(() => this.flush(), publishSummaryIntervalMs));
	private _totals = newPublishTotals();
	private _windowStartedMs: number | undefined;
	private _lastEmissionMs = -Infinity;
	private _serviceConnected = false;

	constructor(
		private readonly _hostLaunchKind: AgentHostLaunchKind,
		private readonly _clock: StopWatch,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
	}

	private _setServiceConnected(connected: boolean): void {
		if (this._store.isDisposed) {
			return;
		}
		this._serviceConnected = connected;
		if (!connected && !this._hasFailures()) {
			this._totals = newPublishTotals();
			this._windowStartedMs = undefined;
			this._timer.cancel();
		}
	}

	private _hasFailures(): boolean {
		const totals = this._totals;
		return totals.ackTimeoutCount + totals.publishRejectedCount + totals.socketFailureCount + totals.queueLimitCount > 0;
	}

	record(event: MissionControlPublishDiagnostic): void {
		if (this._store.isDisposed) {
			return;
		}
		if (event.phase === 'relayConnection') {
			this._setServiceConnected(event.connected);
			return;
		}
		if (!this._serviceConnected && !(event.phase === 'relayPublish' && event.outcome === 'failed' && event.failure !== 'mirrorBackpressure')) {
			return;
		}
		this._windowStartedMs ??= this._clock.elapsed();
		const totals = this._totals;
		if (event.phase === 'relayQueue') {
			totals.peakOutstandingFrames = Math.max(totals.peakOutstandingFrames, event.measurements.frames);
			totals.peakOutstandingBytes = Math.max(totals.peakOutstandingBytes, event.measurements.bytes);
		} else if (event.outcome === 'succeeded') {
			const measurements = event.measurements;
			totals.publishCount++;
			totals.chunkedPublishCount += Number(measurements.chunked);
			totals.frameCount += measurements.frameCount;
			totals.bytes += measurements.bytes;
			totals.queueWaitMs += measurements.queueWaitMs;
			totals.maxQueueWaitMs = Math.max(totals.maxQueueWaitMs, measurements.queueWaitMs);
			totals.ackLatencyMs += measurements.ackLatencyMs;
			totals.maxAckLatencyMs = Math.max(totals.maxAckLatencyMs, measurements.maxAckLatencyMs);
			totals.publishDurationMs += event.durationMs;
			totals.maxPublishDurationMs = Math.max(totals.maxPublishDurationMs, event.durationMs);
			totals.peakInFlight = Math.max(totals.peakInFlight, measurements.peakInFlight);
		} else {
			switch (event.failure) {
				case 'ackTimeout': totals.ackTimeoutCount++; break;
				case 'publishRejected': totals.publishRejectedCount++; break;
				case 'socketFailure': totals.socketFailureCount++; break;
				case 'queueLimit': totals.queueLimitCount++; break;
				case 'mirrorBackpressure': totals.mirrorBackpressureCount++; break;
			}
			if (event.failure !== 'mirrorBackpressure') {
				this.flush();
				return;
			}
		}
		if (!this._timer.isScheduled()) {
			this._timer.schedule();
		}
	}

	flush(): void {
		if (this._windowStartedMs === undefined || this._store.isDisposed || !this._serviceConnected && !this._hasFailures()) {
			return;
		}
		const now = this._clock.elapsed();
		const remaining = this._lastEmissionMs + publishSummaryIntervalMs - now;
		if (remaining > 0) {
			if (!this._timer.isScheduled()) {
				this._timer.schedule(remaining);
			}
			return;
		}
		const totals = this._totals;
		const event: MissionControlPublishSummaryEvent = {
			hostLaunchKind: this._hostLaunchKind,
			windowDurationMs: now - this._windowStartedMs,
			publishCount: totals.publishCount, chunkedPublishCount: totals.chunkedPublishCount, frameCount: totals.frameCount, bytes: totals.bytes,
			meanQueueWaitMs: totals.publishCount ? totals.queueWaitMs / totals.publishCount : undefined,
			maxQueueWaitMs: totals.maxQueueWaitMs,
			meanAckLatencyMs: totals.frameCount ? totals.ackLatencyMs / totals.frameCount : undefined,
			maxAckLatencyMs: totals.maxAckLatencyMs,
			meanPublishDurationMs: totals.publishCount ? totals.publishDurationMs / totals.publishCount : undefined,
			maxPublishDurationMs: totals.maxPublishDurationMs,
			peakInFlight: totals.peakInFlight, peakOutstandingFrames: totals.peakOutstandingFrames, peakOutstandingBytes: totals.peakOutstandingBytes,
			ackTimeoutCount: totals.ackTimeoutCount, publishRejectedCount: totals.publishRejectedCount, socketFailureCount: totals.socketFailureCount,
			queueLimitCount: totals.queueLimitCount, mirrorBackpressureCount: totals.mirrorBackpressureCount,
		};
		this._lastEmissionMs = now;
		this._windowStartedMs = undefined;
		this._totals = newPublishTotals();
		this._timer.cancel();
		this._telemetryService.publicLog2<MissionControlPublishSummaryEvent, MissionControlPublishSummaryClassification>('agentHost.missionControlPublishSummary', event);
	}

	override dispose(): void {
		this.flush();
		super.dispose();
	}
}

export function getMissionControlEnvironmentName(product: IProductService, machineName = hostname()): string {
	const applicationName = product.quality === 'stable' ? 'VS Code'
		: product.quality === 'insider' ? 'VS Code Insiders'
			: product.nameShort === 'Code - OSS' || product.nameShort === 'Code - OSS Dev' ? 'VS Code OSS' : product.nameShort;
	return `${machineName.replace(/\.local$/i, '')} (${applicationName})`;
}

/** Entry-owned adapter from the native runtime graph to the registration lifecycle. */
export class MissionControlHost extends Disposable {
	readonly environment: MissionControlEnvironment;
	private readonly _projects: MissionControlProjects;
	private readonly _publishTelemetry: MissionControlPublishTelemetry;
	private readonly _ahpLogDirectory: URI;
	private _grantedRoots: () => readonly string[] = () => [];
	private _projectRoots: () => readonly string[] = () => [];

	constructor(
		private readonly _options: IMissionControlHostOptions,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		@IAgentHostGitHubEndpointService gitHubEndpoints: IAgentHostGitHubEndpointService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
	) {
		super();
		this._ahpLogDirectory = URI.joinPath(environmentService.logsHome, 'ahp');
		const bootstrapLoggingEnabled = isAhpJsonlLoggingEnabled(productService.quality, process.env[AgentHostAhpJsonlLoggingEnvVar]);
		let ahpLoggingEnabled = bootstrapLoggingEnabled;
		this._register(configurationService.onDidRootConfigChange(() => {
			ahpLoggingEnabled = configurationService.getRootValue(platformRootSchema, AgentHostAhpJsonlLoggingEnabledConfigKey) ?? bootstrapLoggingEnabled;
		}));
		this._publishTelemetry = this._register(this._instantiationService.createInstance(MissionControlPublishTelemetry, this._options.hostLaunchKind, this._options.publishTelemetryClock ?? StopWatch.create()));
		const retention = this._instantiationService.createInstance(AhpJsonlLogRetention, {
			logsHome: environmentService.logsHome,
			logId: MISSION_CONTROL_AHP_LOG_ID,
			maxFiles: 10,
			maxSizeBytes: 750 * 1024 * 1024,
		});
		this._projects = this._register(this._instantiationService.createInstance(MissionControlProjects, {
			getRoots: () => this._grantedRoots(),
			getProjectRoots: () => this._projectRoots(),
		}));
		this.environment = this._register(this._instantiationService.createInstance(MissionControlEnvironment, {
			userDataPath: environmentService.userDataPath,
			name: getMissionControlEnvironmentName(productService),
			fetch: (input, init) => proxyResolver.fetch(input, init),
			attach: (relay, roots, getRoots, getProjects, defaultDirectory) => this._attachRelay(relay, roots, getRoots, getProjects, defaultDirectory),
			updateProjects: () => this._projects.initialize(),
			onError: error => {
				this._publishTelemetry.flush();
				this._logService.error(`[AgentHost] Mission Control failure: ${formatConnectionDiagnosticError(getConnectionDiagnosticError(error))}`);
			},
			onDiagnostic: event => this._reportOperation(event),
			onPublishDiagnostic: event => {
				this._publishTelemetry.record(event);
				if (event.phase === 'relayPublish' && event.outcome === 'succeeded') {
					this._logService.trace(`[AgentHost] Mission Control publish ${event.detail}; durationMs=${event.durationMs}`);
				}
			},
			getSessionCount: () => this._agentService.getSessionCount(),
			getRemoteControlPolicy: () => this._readRemoteControlPolicy(),
			onReady: environmentId => this._logService.info(`[AgentHost] Mission Control ready; environmentId=${environmentId}`),
			getIdentityApiBase: () => gitHubEndpoints.getApiBaseUri(),
			onDidChangeIdentityAuthority: gitHubEndpoints.onDidChange,
			createMirror: environmentId => this._createMirror(environmentId),
			createAhpLogger: (clientId, generation) => this._instantiationService.createInstance(AhpJsonlLogger, {
				logsHome: environmentService.logsHome,
				logId: MISSION_CONTROL_AHP_LOG_ID,
				connectionId: `${clientId}-${generation}`,
				transport: 'mission-control',
				retention,
				isEnabled: () => ahpLoggingEnabled,
			}),
		}));
	}

	private _reportOperation(event: IConnectionDiagnosticEvent): void {
		if (event.phase === 'relayDisconnected') {
			this._publishTelemetry.flush();
		}
		switch (event.phase) {
			case 'configure':
			case 'checkIn':
			case 'register':
			case 'heartbeat':
			case 'token':
			case 'signingKeys':
			case 'relay':
			case 'relayDisconnected': {
				if (event.outcome === 'started' || ((event.phase === 'heartbeat' || event.phase === 'checkIn') && event.outcome === 'succeeded')) {
					return;
				}
				this._telemetryService.publicLog2<MissionControlOperationEvent, MissionControlOperationClassification>('agentHost.missionControlOperation', {
					operation: event.phase,
					outcome: event.outcome,
					durationMs: event.durationMs,
					statusCode: event.error?.status,
					hostLaunchKind: this._options.hostLaunchKind,
				});
				const message = `[AgentHost] Mission Control ${event.phase} ${event.outcome}; durationMs=${event.durationMs ?? 'unknown'}`;
				if (event.error) {
					this._logService.warn(`${message}: ${formatConnectionDiagnosticError(event.error)}`);
				} else if (event.phase === 'relayDisconnected') {
					this._logService.warn(message);
				} else {
					this._logService.info(message);
				}
			}
		}
	}

	private _readRemoteControlPolicy(): Promise<Record<string, unknown> | undefined> {
		const provider = this._providerService.getProvider('copilotcli');
		if (!provider?.getRemoteControlManagedSettings) {
			throw new Error('Copilot runtime cannot read device remote-control policy');
		}
		return provider.getRemoteControlManagedSettings();
	}

	private _attachRelay(relay: MissionControlProtocolServer, roots: readonly string[], getRoots: () => readonly string[], getProjects: () => readonly string[], defaultDirectory?: string): IDisposable {
		this._grantedRoots = getRoots;
		this._projectRoots = getProjects;
		const directory = defaultDirectory ?? roots[0];
		const handler = this._instantiationService.createInstance(
			ProtocolServerHandler,
			this._agentService,
			this._stateManager,
			relay,
			{
				hostLaunchKind: this._options.hostLaunchKind,
				allowExtensionMethods: false,
				scopedRelayCredentials: true,
				relayRoots: relay.rootMeta ? undefined : roots,
				relayRootMeta: relay.rootMeta,
				ahpLogDirectory: this._ahpLogDirectory,
				advertisedModelProviders: ['copilotcli'],
				sessionConfigAdapter: missionControlSessionConfigAdapter,
				sessionListAdapter: toMissionControlSessionList,
				extension: relay.rootMeta ? this._instantiationService.createInstance(MissionControlCopilotExtension, this._projects) : undefined,
				relayResourceRoots: readOnly => this._resourceRoots(readOnly, getRoots()),
				defaultDirectory: directory ? URI.file(directory).toString() : undefined,
			},
			this._options.clientFileSystemProvider,
		);
		return this._options.trackProtocolHandler(handler);
	}

	private _resourceRoots(readOnly: boolean, grantedRoots: readonly string[]): readonly string[] {
		const summaries = this._stateManager.getOverlaySessionSummaries();
		const workspaces = summaries.flatMap(summary => summary.workingDirectories ?? [])
			.map(directory => URI.parse(directory)).filter(directory => directory.scheme === Schemas.file).map(directory => directory.fsPath);
		// Each session's data and, for its loaded chats, every directory their content lives in: a peer stores in its
		// own, and a moved chat also reads the session it came from (Block 4).
		const contentScopes = readOnly ? new Set(summaries.flatMap(summary => [
			summary.resource,
			...(this._stateManager.getSessionState(summary.resource)?.chats ?? []).flatMap(chat => this._stateManager.getChatAttachmentScopes(chat.resource) ?? []),
		])) : [];
		const contentRoots = [...contentScopes].map(scope => this._sessionDataService.getSessionDataDir(URI.parse(scope)).fsPath);
		return [...grantedRoots, ...this._projects.roots, ...workspaces, ...contentRoots];
	}

	private _createMirror(environmentId: string): { readonly mirror: MissionControlSessionMirror; readonly source: IDisposable } {
		const mirror = this._instantiationService.createInstance(MissionControlSessionMirror, environmentId, {});
		const sources = new DisposableStore();
		try {
			const publisher = sources.add(this._instantiationService.createInstance(MissionControlSessionPublisher, mirror, () => this.environment.isEnabled));
			const sdk = sources.add(this._instantiationService.createInstance(MissionControlSdkEventSource, environmentId, mirror, () => this.environment.isEnabled, session => publisher.registerSession(session)));
			const attachPlanHints = (provider: IAgent) => {
				if (provider.getSessionPlan && provider.onDidChatSessionEvent) {
					sources.add(provider.onDidChatSessionEvent(event => this._publishPlanHint(event)));
				}
			};
			sources.add(this._providerService.onDidRegisterProvider(attachPlanHints));
			for (const provider of this._providerService.getProviders()) {
				attachPlanHints(provider);
			}
			sources.add(this._stateManager.onDidEmitEnvelope(envelope => {
				const changeset = parseChangesetUri(envelope.channel);
				const getChatOwner = (chat: string) => this._chatOwnership.getChatOwner(chat);
				const channel = isAhpChatChannel(envelope.channel)
					? getChatOwner(envelope.channel)
					: changeset ? changesetSession(changeset, getChatOwner) : parseAnnotationsUri(envelope.channel)?.sessionUri ?? envelope.channel;
				const session = channel !== undefined ? this._stateManager.getSessionSummary(channel) : undefined;
				// Mirroring a provisional draft would create a persistent task before its first message.
				if (!session || this._stateManager.isIdleProvisionalSession(session.resource)) {
					return;
				}
				try {
					publisher.enqueue(envelope, session.resource);
					sdk.observeSession(session.resource);
				} catch (error) {
					this._logService.error('[AgentHost] Mission Control mirror admission failed', error);
				}
			}));
			return { mirror, source: sources };
		} catch (error) {
			sources.dispose();
			mirror.dispose();
			throw error;
		}
	}

	private _publishPlanHint(event: IAgentChatSessionEvent): void {
		if (!this.environment.isEnabled || (event.type !== 'session.plan_changed' && event.type !== 'session.todos_changed')) {
			return;
		}
		const session = this._chatOwnership.getChatOwner(event.chat.toString());
		const summary = session && this._stateManager.getSessionSummary(session);
		if (!summary || summary.defaultChat !== event.chat.toString()) {
			return;
		}
		const operation = isRecord(event.data) && typeof event.data.operation === 'string'
			&& ['create', 'update', 'delete'].includes(event.data.operation) ? event.data.operation : 'unknown';
		this._stateManager.dispatchServerAction(summary.resource, {
			type: ActionType.SessionMetaChanged,
			_meta: {
				...this._stateManager.getSessionState(summary.resource)?._meta,
				[event.type === 'session.plan_changed' ? 'copilot.planHint' : 'copilot.todosHint']:
					{ eventId: event.id, ...(event.type === 'session.plan_changed' ? { operation } : {}) },
			},
		});
	}
}
