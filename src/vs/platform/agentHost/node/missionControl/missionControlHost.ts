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

interface IMissionControlHostOptions {
	readonly hostLaunchKind: AgentHostLaunchKind;
	readonly clientFileSystemProvider: AgentHostClientFileSystemProvider;
	readonly trackProtocolHandler: (handler: ProtocolServerHandler) => IDisposable;
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
				relayResourceRoots: readOnly => this._resourceRoots(readOnly, getRoots()),
				defaultDirectory: roots[0] ? URI.file(roots[0]).toString() : undefined,
			},
			this._options.clientFileSystemProvider,
		);
		return this._options.trackProtocolHandler(handler);
	}

	private _resourceRoots(readOnly: boolean, grantedRoots: readonly string[]): readonly string[] {
		const summaries = this._stateManager.getOverlaySessionSummaries();
		const workspaces = summaries.flatMap(summary => summary.workingDirectories ?? [])
			.map(directory => URI.parse(directory)).filter(directory => directory.scheme === Schemas.file).map(directory => directory.fsPath);
		const contentRoots = readOnly ? summaries.map(summary => this._sessionDataService.getSessionDataDir(URI.parse(summary.resource)).fsPath) : [];
		return [...grantedRoots, ...workspaces, ...contentRoots];
	}

	private _createMirror(environmentId: string): { readonly mirror: MissionControlSessionMirror; readonly source: IDisposable } {
		const mirror = this._instantiationService.createInstance(MissionControlSessionMirror, environmentId, {});
		const sources = new DisposableStore();
		try {
			const sdk = sources.add(this._instantiationService.createInstance(MissionControlSdkEventSource, environmentId, mirror, () => this.environment.isEnabled));
			const registered = new Set<string>();
			sources.add(this._stateManager.onDidEmitEnvelope(envelope => {
				const channel = parseChatUri(envelope.channel)?.session ?? parseAnnotationsUri(envelope.channel)?.sessionUri
					?? parseChangesetUri(envelope.channel)?.sessionUri ?? envelope.channel;
				const session = this._stateManager.getSessionSummary(channel);
				if (!session) {
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
}
