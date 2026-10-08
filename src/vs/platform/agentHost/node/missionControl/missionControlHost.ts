/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname } from 'os';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
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
import { parseChangesetUri } from '../../common/changesetUri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { parseChatUri } from '../../common/state/sessionState.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { ProtocolServerHandler } from '../protocolServerHandler.js';
import { MissionControlEnvironment } from './missionControlEnvironment.js';
import type { MissionControlProtocolServer } from './missionControlProtocolServer.js';
import { MissionControlSdkEventSource } from './missionControlSdkEventSource.js';
import { MissionControlSessionMirror } from './missionControlSessionMirror.js';
import { MissionControlProjects } from './missionControlProjects.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { isObject } from '../../../../base/common/types.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AhpJsonlLogger, AhpJsonlLogRetention } from '../../common/ahpJsonlLogger.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../common/missionControlEnvironment.js';

interface IMissionControlHostOptions {
	readonly hostLaunchKind: AgentHostLaunchKind;
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
	private _grantedRoots: () => readonly string[] = () => [];

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
	) {
		super();
		const retention = this._instantiationService.createInstance(AhpJsonlLogRetention, {
			logsHome: environmentService.logsHome,
			logId: MISSION_CONTROL_AHP_LOG_ID,
			maxFiles: 10,
			maxSizeBytes: 750 * 1024 * 1024,
		});
		this._projects = this._register(this._instantiationService.createInstance(MissionControlProjects, {
			getRoots: () => this._grantedRoots(),
		}));
		this.environment = this._register(this._instantiationService.createInstance(MissionControlEnvironment, {
			userDataPath: environmentService.userDataPath,
			name: getMissionControlEnvironmentName(productService),
			fetch: (input, init) => proxyResolver.fetch(input, init),
			attach: (relay, roots, getRoots) => this._attachRelay(relay, roots, getRoots),
			onError: error => this._logService.error(`[AgentHost] Mission Control failure: ${formatConnectionDiagnosticError(getConnectionDiagnosticError(error))}`),
			onDiagnostic: event => this._reportOperation(event),
			getSessionCount: async () => (await this._agentService.listSessions()).length,
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
			}),
		}));
	}

	private _reportOperation(event: IConnectionDiagnosticEvent): void {
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

	private _attachRelay(relay: MissionControlProtocolServer, roots: readonly string[], getRoots: () => readonly string[]): IDisposable {
		this._grantedRoots = getRoots;
		const handler = this._instantiationService.createInstance(
			ProtocolServerHandler,
			this._agentService,
			this._stateManager,
			relay,
			{
				hostLaunchKind: this._options.hostLaunchKind,
				allowExtensionMethods: false,
				relayRoots: relay.rootMeta ? undefined : roots,
				relayRootMeta: relay.rootMeta,
				advertisedModelProviders: ['copilotcli'],
				copilotSessionConfig: true,
				copilotProjects: relay.rootMeta ? this._projects : undefined,
				copilotSessionRequest: (method, params) => this._handleSessionRequest(method, params),
				relayResourceRoots: readOnly => this._resourceRoots(readOnly, getRoots()),
				defaultDirectory: roots[0] ? URI.file(roots[0]).toString() : undefined,
			},
			this._options.clientFileSystemProvider,
		);
		return this._options.trackProtocolHandler(handler);
	}

	private async _handleSessionRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
		if (typeof params.channel !== 'string' || !this._stateManager.getSessionState(params.channel)) {
			throw new ProtocolError(AhpErrorCodes.SessionNotFound, 'Session does not exist');
		}
		const session = URI.parse(params.channel);
		const provider = this._providerService.getProviderForSession(session);
		if (method === 'extensions/getPlan' && provider?.getSessionPlan) {
			return provider.getSessionPlan(session);
		}
		if (method === 'extensions/setSessionApproveAll' && provider?.setSessionApproveAll) {
			if (typeof params.enabled !== 'boolean') {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'enabled must be a boolean');
			}
			await provider.setSessionApproveAll(session, params.enabled);
			return null;
		}
		throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, `Provider does not support ${method}`);
	}

	private _resourceRoots(readOnly: boolean, grantedRoots: readonly string[]): readonly string[] {
		const summaries = this._stateManager.getOverlaySessionSummaries();
		const workspaces = summaries.flatMap(summary => summary.workingDirectories ?? [])
			.map(directory => URI.parse(directory)).filter(directory => directory.scheme === Schemas.file).map(directory => directory.fsPath);
		const contentRoots = readOnly ? summaries.map(summary => this._sessionDataService.getSessionDataDir(URI.parse(summary.resource)).fsPath) : [];
		return [...grantedRoots, ...this._projects.roots, ...workspaces, ...contentRoots];
	}

	private _createMirror(environmentId: string): { readonly mirror: MissionControlSessionMirror; readonly source: IDisposable } {
		const mirror = this._instantiationService.createInstance(MissionControlSessionMirror, environmentId, {});
		const sources = new DisposableStore();
		try {
			const sdk = sources.add(this._instantiationService.createInstance(MissionControlSdkEventSource, environmentId, mirror, () => this.environment.isEnabled));
			const attachPlanHints = (provider: IAgent) => {
				if (provider.getSessionPlan && provider.onDidChatSessionEvent) {
					sources.add(provider.onDidChatSessionEvent(event => this._publishPlanHint(event)));
				}
			};
			sources.add(this._providerService.onDidRegisterProvider(attachPlanHints));
			for (const provider of this._providerService.getProviders()) {
				attachPlanHints(provider);
			}
			const registered = new Set<string>();
			sources.add(this._stateManager.onDidEmitEnvelope(envelope => {
				const channel = parseChatUri(envelope.channel)?.session ?? parseAnnotationsUri(envelope.channel)?.sessionUri
					?? parseChangesetUri(envelope.channel)?.sessionUri ?? envelope.channel;
				const session = this._stateManager.getSessionSummary(channel);
				// Mirroring a provisional draft would create a persistent task before its first message.
				if (!session || this._stateManager.isIdleProvisionalSession(session.resource)) {
					return;
				}
				try {
					if (!this.environment.isEnabled) {
						if (registered.has(session.resource)) {
							mirror.reportSourceLag(session.resource, 1);
						}
						return;
					}
					if (!registered.has(session.resource)) {
						mirror.registerSession(session.resource);
						registered.add(session.resource);
						mirror.setLifecycle(session.resource, 'started');
					}
					mirror.enqueue(envelope, session.resource);
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
		const session = parseChatUri(event.chat.toString())?.session;
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
