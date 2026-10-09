/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, raceTimeout } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { type AgentProvider, IAgentCreateChatRequestOptions, IAgentCreateSessionConfig, type IAgentCustomizationInstallation, type IAgentCustomizationInstallationRequest, type IAgentCustomizationInstallationReview, type IAgentCustomizationMarketplaceSearchRequest, type IAgentCustomizationMarketplaceSearchResult, type IAgentPluginInstallRequest, type IAgentPluginUninstallRequest } from '../common/agent.js';
import { IAgentHostInspectInfo, IAgentHostManagedSettingsDiagnostics, IAgentHostManagementService, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk, type IMissionControlOptions, type IMissionControlCredentialSealingRequest } from '../common/agentService.js';
import { sealMissionControlCredential } from './missionControl/missionControlAuthentication.js';
import { MissionControlEnvironment } from './missionControl/missionControlEnvironment.js';
import { ISessionDataService } from '../common/sessionDataService.js';

const SHUTDOWN_DRAIN_TIMEOUT_MS = 1000;
const PROVIDER_SHUTDOWN_TIMEOUT_MS = 1500;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 2500;

export class AgentHostManagementService implements IAgentHostManagementService {
	declare readonly _serviceBrand: undefined;
	private _missionControl: MissionControlEnvironment | undefined;

	private _shutdownPromise: Promise<void> | undefined;
	private _shuttingDown = false;
	private readonly _inflightMutations = new Set<Promise<unknown>>();

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _connectionTrackerService: IConnectionTrackerService,
		private readonly _shutdownProtocolIngress: () => Promise<void>,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	setMissionControl(service: MissionControlEnvironment | undefined): void {
		this._missionControl = service;
	}

	configureMissionControl(options: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
		if (!this._missionControl) {
			throw new Error('Mission Control is unavailable in this Agent Host');
		}
		return this._missionControl.configure(options, withdrawingAccountId);
	}

	sealMissionControlCredential(request: IMissionControlCredentialSealingRequest): Promise<string> {
		if (!this._missionControl || this._shuttingDown) {
			throw new Error('Local Mission Control sealing is unavailable');
		}
		return sealMissionControlCredential(request);
	}

	async getMissionControlEnvironmentId(): Promise<string | undefined> {
		return this._missionControl?.environmentId;
	}

	createSessionWithExtensions(config: IAgentCreateSessionConfig): Promise<URI> {
		return this._runMutation(() => this._agentService.createSession(config));
	}

	createChatWithExtensions(session: URI, chat: URI, options: IAgentCreateChatRequestOptions): Promise<void> {
		return this._runMutation(() => this._agentService.createChat(session, chat, options));
	}

	createDetachedWorktree(session: URI, prompt: string): Promise<{ handle: string; worktree: URI }> {
		if (!this._agentService.createDetachedWorktree) {
			throw new Error('Agent Host detached worktrees are unavailable');
		}
		return this._runMutation(() => this._agentService.createDetachedWorktree!(session, prompt));
	}

	setDetachedWorktreeArchived(handle: string, archived: boolean): Promise<void> {
		if (!this._agentService.setDetachedWorktreeArchived) {
			throw new Error('Agent Host detached worktrees are unavailable');
		}
		return this._runMutation(() => this._agentService.setDetachedWorktreeArchived!(handle, archived));
	}

	claimDetachedWorktree(handle: string): Promise<void> {
		if (!this._agentService.claimDetachedWorktree) {
			throw new Error('Agent Host detached worktrees are unavailable');
		}
		return this._runMutation(() => this._agentService.claimDetachedWorktree!(handle));
	}

	deleteDetachedWorktree(handle: string): Promise<void> {
		if (!this._agentService.deleteDetachedWorktree) {
			throw new Error('Agent Host detached worktrees are unavailable');
		}
		return this._runMutation(() => this._agentService.deleteDetachedWorktree!(handle));
	}

	reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
		if (!this._agentService.reconcileDetachedWorktrees) {
			throw new Error('Agent Host detached worktrees are unavailable');
		}
		return this._runMutation(() => this._agentService.reconcileDetachedWorktrees!(scope, activeHandles));
	}

	refreshCopilotConnectorSessions(): Promise<void> {
		if (!this._agentService.refreshCopilotConnectorSessions) {
			throw new Error('Copilot Connector session refresh is unavailable');
		}
		return this._runMutation(() => this._agentService.refreshCopilotConnectorSessions!());
	}

	uninstallPlugin(provider: AgentProvider, request: IAgentPluginUninstallRequest): Promise<void> {
		if (!this._agentService.uninstallPlugin) {
			throw new Error('Agent Host plugin uninstall is unavailable');
		}
		return this._runMutation(() => this._agentService.uninstallPlugin!(provider, request));
	}

	installPlugin(provider: AgentProvider, request: IAgentPluginInstallRequest): Promise<void> {
		if (!this._agentService.installPlugin) {
			throw new Error('Agent Host plugin install is unavailable');
		}
		return this._runMutation(() => this._agentService.installPlugin!(provider, request));
	}

	searchCustomizationMarketplace(provider: AgentProvider, session: URI, request: IAgentCustomizationMarketplaceSearchRequest): Promise<IAgentCustomizationMarketplaceSearchResult> {
		if (!this._agentService.searchCustomizationMarketplace) {
			return Promise.resolve({ kind: 'unavailable', reason: 'unsupported' });
		}
		return this._runMutation(() => this._agentService.searchCustomizationMarketplace!(provider, session, request));
	}

	listCustomizationInstallations(provider: AgentProvider, session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		if (!this._agentService.listCustomizationInstallations) {
			throw new Error('Agent Host customization installation inventory is unavailable');
		}
		return this._runMutation(() => this._agentService.listCustomizationInstallations!(provider, session));
	}

	prepareCustomizationInstallation(provider: AgentProvider, session: URI, request: IAgentCustomizationInstallationRequest | { readonly installationId: string }): Promise<IAgentCustomizationInstallationReview> {
		if (!this._agentService.prepareCustomizationInstallation) {
			throw new Error('Agent Host customization installation preparation is unavailable');
		}
		return this._runMutation(() => this._agentService.prepareCustomizationInstallation!(provider, session, request));
	}

	applyCustomizationInstallation(provider: AgentProvider, operationId: string): Promise<void> {
		if (!this._agentService.applyCustomizationInstallation) {
			throw new Error('Agent Host customization installation apply is unavailable');
		}
		return this._runMutation(() => this._agentService.applyCustomizationInstallation!(provider, operationId));
	}

	recoverCustomizationInstallations(provider: AgentProvider, session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		if (!this._agentService.recoverCustomizationInstallations) {
			throw new Error('Agent Host customization installation recovery is unavailable');
		}
		return this._runMutation(() => this._agentService.recoverCustomizationInstallations!(provider, session));
	}

	shutdown(): Promise<void> {
		if (!this._shutdownPromise) {
			this._shuttingDown = true;
			this._shutdownPromise = this._doShutdown();
		}
		return this._shutdownPromise;
	}

	private async _doShutdown(): Promise<void> {
		const protocolDrain = raceTimeout(this._shutdownProtocolIngress(), SHUTDOWN_DRAIN_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host protocol requests did not finish within ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms during shutdown.`);
		}).catch(error => this._logService.error('Agent Host protocol shutdown failed.', error));
		const managementDrain = raceTimeout(Promises.settled([...this._inflightMutations]), SHUTDOWN_DRAIN_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host management operations did not finish within ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms during shutdown.`);
		}).catch(error => this._logService.error('An in-flight Agent Host management operation failed during shutdown.', error));
		await Promise.all([protocolDrain, managementDrain]);
		try {
			await raceTimeout(this._agentService.shutdown(), PROVIDER_SHUTDOWN_TIMEOUT_MS, () => {
				this._logService.warn(`Agent Host providers did not finish shutting down within ${PROVIDER_SHUTDOWN_TIMEOUT_MS}ms.`);
			});
		} catch (error) {
			this._logService.error('Agent Host provider shutdown failed.', error);
		}
		await raceTimeout(this._sessionDataService.whenIdle(), SHUTDOWN_FLUSH_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host session data did not finish flushing within ${SHUTDOWN_FLUSH_TIMEOUT_MS}ms during shutdown.`);
		});
	}

	private _runMutation<T>(operation: () => Promise<T>): Promise<T> {
		if (this._shuttingDown) {
			return Promise.reject(new Error('Agent Host is shutting down.'));
		}
		const promise = operation();
		this._inflightMutations.add(promise);
		const remove = () => this._inflightMutations.delete(promise);
		void promise.then(remove, remove);
		return promise;
	}

	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		return this._agentService.getNetworkDiagnosticsInfo();
	}

	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._agentService.getManagedSettingsDiagnostics();
	}

	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._agentService.diagnosticsFetch(url);
	}

	getSessionStateFile(session: URI, chat?: URI): Promise<URI | undefined> {
		if (!this._agentService.getSessionStateFile) {
			throw new Error('Agent Host session state files are unavailable');
		}
		return this._agentService.getSessionStateFile(session, chat);
	}

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
		if (!this._agentService.collectDebugLogs) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._agentService.collectDebugLogs(session, kind, chat);
	}

	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		if (!this._agentService.readDebugLogsChunk) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._agentService.readDebugLogsChunk(resource, position);
	}

	startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		return this._connectionTrackerService.startWebSocketServer();
	}

	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return this._connectionTrackerService.getInspectInfo(tryEnable);
	}
}
