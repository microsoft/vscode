/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, raceTimeout } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { IMcpServerConfiguration } from '../../mcp/common/mcpPlatformTypes.js';
import { type AgentCanvasDefinitionSnapshot, type AgentProvider, type IAgentCanvasCloseRequest, type IAgentCanvasOpenRequest, IAgentCreateChatRequestOptions, IAgentCreateSessionConfig, type IAgentCustomizationInstallation, type IAgentCustomizationInstallationApplyResult, type IAgentCustomizationInstallationRequest, type IAgentCustomizationInstallationReview, type IAgentCustomizationMarketplaceSearchRequest, type IAgentCustomizationMarketplaceSearchResult, type IAgentExtensionInventory, type IAgentManagedPluginRetryEntry, type IAgentPluginInstallRequest, type IAgentPluginUninstallRequest } from '../common/agent.js';
import { IAgentHostInspectInfo, IAgentHostManagedSettingsDiagnostics, IAgentHostManagementService, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk, type IMissionControlOptions, type IMissionControlCredentialSealingRequest } from '../common/agentService.js';
import { sealMissionControlCredential } from './missionControl/missionControlAuthentication.js';
import { MissionControlEnvironment } from './missionControl/missionControlEnvironment.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostMacAccessibilityTrustService } from './agentHostMacAccessibilityTrustService.js';
import { IAgentHostSystemWakeService } from './agentHostSystemWakeService.js';

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
		@IAgentHostSystemWakeService private readonly _systemWake: IAgentHostSystemWakeService,
		@IAgentHostMacAccessibilityTrustService private readonly _macAccessibilityTrust: IAgentHostMacAccessibilityTrustService,
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

	async getMissionControlEnvironmentName(): Promise<string | undefined> {
		return this._missionControl?.environmentName;
	}

	createSessionWithExtensions(config: IAgentCreateSessionConfig): Promise<URI> {
		return this._runMutation(() => this._agentService.createSession({ ...config, legacyChatUris: undefined }));
	}

	createChatWithExtensions(session: URI, chat: URI, options: IAgentCreateChatRequestOptions): Promise<void> {
		return this._runMutation(() => this._agentService.createChat(session, chat, options));
	}

	installSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		if (!this._agentService.installSandboxCertificate) {
			throw new Error('Sandbox certificate installation is unavailable');
		}
		return this._runMutation(() => this._agentService.installSandboxCertificate!(chat, scopeId));
	}

	rotateSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		if (!this._agentService.rotateSandboxCertificate) {
			throw new Error('Sandbox certificate rotation is unavailable');
		}
		return this._runMutation(() => this._agentService.rotateSandboxCertificate!(chat, scopeId));
	}

	removeSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		if (!this._agentService.removeSandboxCertificate) {
			throw new Error('Sandbox certificate removal is unavailable');
		}
		return this._runMutation(() => this._agentService.removeSandboxCertificate!(chat, scopeId));
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

	refreshCopilotConnectorSessions(forceConnectorName?: string): Promise<void> {
		if (!this._agentService.refreshCopilotConnectorSessions) {
			throw new Error('Copilot Connector session refresh is unavailable');
		}
		return this._runMutation(() => this._agentService.refreshCopilotConnectorSessions!(forceConnectorName));
	}

	uninstallPlugin(provider: AgentProvider, request: IAgentPluginUninstallRequest, session?: URI, chat?: URI): Promise<void> {
		if (!this._agentService.uninstallPlugin) {
			throw new Error('Agent Host plugin uninstall is unavailable');
		}
		return this._runMutation(() => this._agentService.uninstallPlugin!(provider, request, session, chat));
	}

	listAgentExtensions(session?: URI, chat?: URI): Promise<IAgentExtensionInventory> {
		if (!this._agentService.listAgentExtensions) {
			throw new Error('Copilot extension inventory is unavailable.');
		}
		return this._agentService.listAgentExtensions(session, chat);
	}

	setAgentExtensionEnabled(extensionId: string, enabled: boolean, session?: URI, chat?: URI): Promise<void> {
		if (!this._agentService.setAgentExtensionEnabled) {
			throw new Error('Copilot extension management is unavailable.');
		}
		return this._runMutation(() => this._agentService.setAgentExtensionEnabled!(extensionId, enabled, session, chat));
	}

	listSessionCanvases(session: URI, chat: URI): Promise<AgentCanvasDefinitionSnapshot> {
		if (!this._agentService.listSessionCanvases) {
			throw new Error('Copilot canvas inventory is unavailable');
		}
		return this._agentService.listSessionCanvases(session, chat);
	}

	openSessionCanvas(session: URI, request: IAgentCanvasOpenRequest, chat: URI): Promise<void> {
		if (!this._agentService.openSessionCanvas) {
			throw new Error('Opening Copilot canvases is unavailable');
		}
		return this._runMutation(() => this._agentService.openSessionCanvas!(session, request, chat));
	}

	closeSessionCanvas(session: URI, request: IAgentCanvasCloseRequest, chat: URI): Promise<void> {
		if (!this._agentService.closeSessionCanvas) {
			throw new Error('Closing Copilot canvases is unavailable');
		}
		return this._runMutation(() => this._agentService.closeSessionCanvas!(session, request, chat));
	}

	installPlugin(provider: AgentProvider, request: IAgentPluginInstallRequest, session?: URI, chat?: URI): Promise<void> {
		if (!this._agentService.installPlugin) {
			throw new Error('Agent Host plugin install is unavailable');
		}
		return this._runMutation(() => this._agentService.installPlugin!(provider, request, session, chat));
	}

	retryManagedPlugins(provider: AgentProvider, session: URI, chat?: URI): Promise<readonly IAgentManagedPluginRetryEntry[]> {
		if (!this._agentService.retryManagedPlugins) {
			throw new Error('Agent Host managed plugin retry is unavailable');
		}
		return this._runMutation(() => this._agentService.retryManagedPlugins!(provider, session, chat));
	}

	listPluginMarketplaces(provider: AgentProvider, session: URI, chat?: URI) {
		if (!this._agentService.listPluginMarketplaces) {
			throw new Error('Agent Host plugin marketplace inventory is unavailable');
		}
		return this._agentService.listPluginMarketplaces(provider, session, chat);
	}

	addPluginMarketplace(provider: AgentProvider, session: URI, source: string, chat?: URI) {
		if (!this._agentService.addPluginMarketplace) {
			throw new Error('Agent Host plugin marketplace registration is unavailable');
		}
		return this._runMutation(() => this._agentService.addPluginMarketplace!(provider, session, source, chat));
	}

	browsePluginMarketplace(provider: AgentProvider, session: URI, name: string, chat?: URI) {
		if (!this._agentService.browsePluginMarketplace) {
			throw new Error('Agent Host plugin marketplace browse is unavailable');
		}
		return this._agentService.browsePluginMarketplace(provider, session, name, chat);
	}

	removePluginMarketplace(provider: AgentProvider, session: URI, name: string, force?: boolean, chat?: URI) {
		if (!this._agentService.removePluginMarketplace) {
			throw new Error('Agent Host plugin marketplace removal is unavailable');
		}
		return this._runMutation(() => this._agentService.removePluginMarketplace!(provider, session, name, force, chat));
	}

	refreshPluginMarketplaces(provider: AgentProvider, session: URI, name?: string, chat?: URI) {
		if (!this._agentService.refreshPluginMarketplaces) {
			throw new Error('Agent Host plugin marketplace refresh is unavailable');
		}
		return this._runMutation(() => this._agentService.refreshPluginMarketplaces!(provider, session, name, chat));
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

	applyCustomizationInstallation(provider: AgentProvider, operationId: string): Promise<IAgentCustomizationInstallationApplyResult | undefined> {
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

	addMcpServerConfiguration(provider: AgentProvider, name: string, config: IMcpServerConfiguration): Promise<void> {
		if (!this._agentService.addMcpServerConfiguration) {
			throw new Error('Agent Host MCP server configuration is unavailable');
		}
		return this._runMutation(() => this._agentService.addMcpServerConfiguration!(provider, name, config));
	}

	async setSystemFullyAwake(fullyAwake: boolean): Promise<void> {
		this._logService.info(`[AgentHost] System is ${fullyAwake ? 'fully awake' : 'asleep or in a background wake'}`);
		this._systemWake.setFullyAwake(fullyAwake);
	}

	async reportMacAccessibilityTrustChange(): Promise<void> {
		this._logService.info('[AgentHost] macOS changed which apps it trusts for Accessibility');
		this._macAccessibilityTrust.reportChange();
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

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI, progressToken?: string): Promise<IAgentHostDebugLogsArtifact> {
		if (!this._agentService.collectDebugLogs) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._agentService.collectDebugLogs(session, kind, chat, progressToken);
	}

	async cancelDebugLogs(progressToken: string): Promise<void> {
		await this._agentService.cancelDebugLogs?.(progressToken);
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
