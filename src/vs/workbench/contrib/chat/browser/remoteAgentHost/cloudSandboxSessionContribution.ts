/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, raceCancellation, raceCancellationError } from '../../../../../base/common/async.js';
import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	CloudSandboxEnabledSettingId,
	CloudSandboxAutoConnectOnOpenSettingId,
	CloudSandboxSessionFeedEnabledSettingId,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxRequestError,
	cloudSandboxAddress,
	type CloudSandboxTaskCreationPath,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	ICloudSandboxDraftPreparationService,
	isCloudSandboxEnabled,
	isCloudSandboxPlaceholderTitle,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxPreparedReservation,
	type ICloudSandboxDiscoveryResult,
	type ICloudSandboxDiscoveredSession,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionContentProvider, IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { CloudSandboxSessionHandler } from './cloudSandboxSessionHandler.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';
import { withSessionInitiator } from '../../../../../platform/agentHost/common/meta/agentSessionInitiatorMeta.js';
import { readCloudSandboxProjects } from '../../../../../platform/agentHost/common/meta/cloudSandboxProjectMeta.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { withSessionWorkspaceless } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { getCloudSandboxTaskCreationPath } from './cloudSandboxTelemetry.js';
import { CloudSandboxSessionFeed } from './cloudSandboxSessionFeed.js';
import { CloudSandboxStartupError } from './cloudSandboxStartupError.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';
const DISCOVERY_STALE_AFTER_MS = 60_000;
const DISCOVERY_SAFETY_POLL_MS = 5 * 60_000;
const FULL_DISCOVERY_INTERVAL_MS = 15 * 60_000;
const MAX_DISCOVERY_RETRY_INTERVAL_MS = 5 * 60_000;
const INVENTORY_STORAGE_PREFIX = 'sessions.cloudSandbox.inventory.';

/** A discovered sandbox environment we can create a provider for. */
export interface ICloudSandboxSessionEnvironment {
	readonly environmentId: string;
	readonly eventType?: string;
	readonly application?: string;
	readonly sessionId?: string;
	/**
	 * Mission Control task owning the session. Persisted AHP history is addressed per task, so this
	 * is what makes the conversation readable once the environment is unreachable.
	 */
	readonly taskId?: string;
	readonly name: string;
	readonly repoName?: string;
	readonly hasRepository?: boolean;
	readonly updatedAt?: string;
	readonly isArchived?: boolean;
}

function isDiscoveredSandboxSession(value: unknown): value is ICloudSandboxDiscoveredSession {
	const candidate = value as Partial<ICloudSandboxDiscoveredSession> | undefined;
	return isObject(candidate)
		&& typeof candidate.environmentId === 'string' && candidate.environmentId.length > 0
		&& typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0
		&& typeof candidate.taskId === 'string' && candidate.taskId.length > 0
		&& typeof candidate.name === 'string'
		&& (candidate.eventType === undefined || typeof candidate.eventType === 'string')
		&& (candidate.application === undefined || typeof candidate.application === 'string')
		&& (candidate.repoName === undefined || typeof candidate.repoName === 'string')
		&& (candidate.hasRepository === undefined || typeof candidate.hasRepository === 'boolean')
		&& (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string')
		&& (candidate.isArchived === undefined || typeof candidate.isArchived === 'boolean');
}

/**
 * The repository a discovered session belongs to, matching the shape the sandbox host reports once
 * connected so reconnecting does not visibly regroup the session.
 *
 * The `https` URI identifies the repository but is not backed by a file system provider, so a
 * session discovered this way cannot browse its files until it connects.
 */
export function discoveredSessionProject(repoName: string | undefined): IAgentSessionMetadata['project'] {
	if (!repoName) {
		return undefined;
	}
	return { uri: URI.parse(`https://github.com/${repoName}`), displayName: repoName };
}

/** The window-specific list maintained by shared sandbox discovery and activation. */
export interface ICloudSandboxSessionList extends IDisposable {
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus>;
	seedSessions(sessions: readonly IAgentSessionMetadata[], options?: { readonly updateExisting?: boolean; readonly workspaceless?: boolean }): void;
	/** Timestamp of a listed or provisional session, or undefined when it is absent. */
	getSessionModifiedTime(sessionId: string): number | undefined;
	setLabel?(label: string): void;
	setConnection(connection: IAgentConnection, defaultDirectory: string | undefined): void;
	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void;
	setSessionArchived(rawId: string, archived: boolean): void;
	removeDeletedSession?(rawId: string): void;
	removeTaskOwnership?(rawId: string): void;
	/**
	 * Record a session this window just provisioned, before the host announces it. Implementations
	 * may withhold it from listings until {@link publishWithheldSession} or the host lists it.
	 */
	seedProvisionalSession?(metadata: IAgentSessionMetadata): void;
	/** Reveal a session seeded by {@link seedProvisionalSession} whose first turn did not dispatch. */
	publishWithheldSession?(rawId: string): void;
	/** Configuration recorded for a provisioned session whose draft had no backend to hold it. */
	getProvisionalSessionConfig?(sessionResource: URI): Record<string, unknown> | undefined;
}

/** A sandbox environment this window provisioned and connected to. */
export interface ICloudSandboxProvisionedEnvironment<T extends ICloudSandboxSessionList> extends ICloudSandboxCreatedSession {
	readonly address: string;
	readonly name: string;
	/** How the session is listed until it is titled: the first line of its prompt. */
	readonly title: string;
	readonly repoNwo: string | undefined;
	readonly provider: T;
}

/** The Agents window titles a new session's placeholder the same way. */
function newSessionTitle(prompt: string, fallback: string): string {
	return prompt.split('\n')[0].trim().substring(0, 100) || fallback;
}

export abstract class CloudSandboxSessionContribution<T extends ICloudSandboxSessionList> extends Disposable implements IWorkbenchContribution {

	/** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
	protected readonly _providerInstances = new Map<string, T>();
	private readonly _providerStores = this._register(new DisposableMap<string, IDisposable & { readonly token: CancellationToken }>());
	private _persistedInventory = new Map<string, string>();
	/** Environment metadata keyed by connection address, for on-demand reconnect. */
	private readonly _environments = new Map<string, ICloudSandboxSessionEnvironment>();
	/** Tasks are session-owned: several discovered tasks can share one environment. */
	private readonly _sessionEnvironments = new Map<string, Map<string, ICloudSandboxSessionEnvironment>>();
	/** In-flight connects keyed by address, so concurrent opens share one attempt. */
	private readonly _pendingConnects = new Map<string, { readonly source: CancellationTokenSource; readonly promise: Promise<string> }>();
	/**
	 * Addresses being provisioned right now. A task we just created is not yet visible to a
	 * discovery pass that started before it existed, so reconciliation would see a brand-new
	 * environment as one that has vanished and tear it down mid-provision.
	 */
	protected readonly _provisioning = new Set<string>();
	/** History-backed providers retained through their first live connection. */
	private readonly _historyHandlers = this._register(new DisposableMap<string, { readonly handler: CloudSandboxSessionHandler; dispose(): void }>());
	/**
	 * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
	 * discovery and connects abort instead of committing state after teardown has run.
	 */
	protected _enabledCts = new CancellationTokenSource();
	/** Serializes discovery so overlapping triggers can't interleave reconciliation. */
	private _discoveryInFlight: Promise<void> | undefined;
	private _discoveryQueued: Promise<void> | undefined;
	private _taskRefreshInFlight: Promise<void> | undefined;
	private _taskRefreshQueued: Promise<void> | undefined;
	private readonly _pendingTaskIds = new Set<string>();
	private _discoveryToken: CancellationToken | undefined;
	private _discoveryIncremental = false;
	private _lastDiscoveryAttempt: number | undefined;
	private _lastFullDiscovery: number | undefined;
	private _discoveryRetryInterval = DISCOVERY_STALE_AFTER_MS;
	private _accountKey: string | undefined;
	private readonly _deletedTaskIds = new Set<string>();
	private readonly _sessionFeed = this._register(new MutableDisposable<CloudSandboxSessionFeed>());
	private readonly _discoveryPoll = this._register(new RunOnceScheduler(() => {
		void this._refreshIfStale();
		this._discoveryPoll.schedule();
	}, DISCOVERY_STALE_AFTER_MS));

	constructor(
		@ICloudSandboxAgentHostService private readonly _cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService protected readonly _apiService: ICloudSandboxApiService,
		@ICloudSandboxDraftPreparationService protected readonly _draftPreparationService: ICloudSandboxDraftPreparationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IHostService private readonly _hostService: IHostService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		// Supply the generic remote-agent-host contribution with the sandbox host's per-connection
		// deviations (sealed-token auth + `ahp-session` backend scheme) without leaking sandbox
		// specifics into that shared code path.
		this._register(this._connectionCustomizations.register(
			isCloudSandboxConnectionAddress,
			address => {
				const connection = this._remoteAgentHostService.configuredEntries.find(entry => getEntryAddress(entry) === address)?.connection;
				const userLocal = connection?.type === RemoteAgentHostEntryType.CloudSandbox && connection.environmentKind === 'user-local';
				const customization = createCloudSandboxConnectionCustomization(address, this._cloudSandboxService, userLocal)!;
				return {
					...customization,
					registerChatSessionContentProvider: (sessionType, provider) => this._registerLiveSessionProvider(sessionType, provider),
					resolveInitialSessionConfig: sessionResource => this._providerInstances.get(address)?.getProvisionalSessionConfig?.(sessionResource),
					// Sessions drafted under the creation type carry its model identifiers into the environment.
					modelIdentifierAliases: [SessionType.CloudSandbox],
					isSessionTitlePlaceholder: isCloudSandboxPlaceholderTitle,
					useSessionTitleForDefaultChat: true,
				};
			},
		));

		// Keep providers wired to their live connections and their status fresh.
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._wireConnections();
			this._updateConnectionStatuses();
		}));

		// React to the feature toggles at runtime: (re)discover when enabled, tear everything down
		// when disabled, so enabling the setting doesn't require a reload and disabling it doesn't
		// leave stale providers, connections, or credential refreshers behind.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CloudSandboxEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._updateEnablement();
			}
			if (e.affectsConfiguration(CloudSandboxSessionFeedEnabledSettingId)) {
				this._sessionFeed.clear();
				this._pendingTaskIds.clear();
				void this._discoverAndSeed(false, true);
			}
		}));

		this._register(this._chatEntitlementService.onDidChangeSentiment(() => this._updateEnablement()));

		this._register(this._hostService.onDidChangeFocus(focused => {
			if (focused) {
				void this._refreshIfStale();
			}
		}));
		this._register(this._apiService.onDidChangeAccount(accountKey => {
			if (!this._isEnabled()) {
				return;
			}
			this._restoreAccount(accountKey);
			void this._discoverAndSeed(false, true);
		}));

		// Connect-on-open: resolves a seeded session by establishing the relay and waiting for the
		// host to advertise its agent. Scoped to our authorities so it never intercepts other
		// remote-agent-host types.
		// The source is swapped out by `_teardownAll`, so cancel whichever one is current on dispose.
		this._register(toDisposable(() => {
			this._enabledCts.cancel();
			this._enabledCts.dispose();
			for (const address of [...this._environments.keys()]) {
				this._teardownEnvironment(address);
			}
		}));

		this._register(Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
			// Serve recorded history before the generic activator waits for a live host.
			priority: 1,
			matchSessionType: sessionType => this._findAddressForSessionType(sessionType) !== undefined,
			getActivationToken: sessionType => {
				const address = this._findAddressForSessionType(sessionType);
				return (address ? this._providerStores.get(address)?.token : undefined) ?? CancellationToken.Cancelled;
			},
			waitForActivation: (_accessor, sessionType) => this._waitForActivation(sessionType),
		}));
	}

	protected async _refreshIfStale(): Promise<void> {
		if (this._discoveryInFlight) {
			await (this._discoveryQueued ?? this._discoveryInFlight);
			return;
		}
		const interval = this._sessionFeed.value?.connected ? Math.max(DISCOVERY_SAFETY_POLL_MS, this._discoveryRetryInterval) : this._discoveryRetryInterval;
		if (!this._hostService.hasFocus || (this._lastDiscoveryAttempt !== undefined && Date.now() - this._lastDiscoveryAttempt < interval)) {
			return;
		}
		await this._discoverAndSeed(true);
	}

	/** Inventory scans are serialized; feed task reads use an independent coalescing lane. */
	protected _discoverAndSeed(incremental = false, retry = false, taskIds?: readonly string[]): Promise<void> {
		if (!this._isEnabled() || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (taskIds) {
			return this._refreshTasks(taskIds);
		}
		if (this._discoveryInFlight) {
			if (!retry && this._discoveryToken === this._enabledCts.token && (incremental || !this._discoveryIncremental)) {
				return this._discoveryQueued ?? this._discoveryInFlight;
			}
			this._discoveryQueued ??= this._discoveryInFlight.then(() => {
				this._discoveryQueued = undefined;
				return this._discoverAndSeed();
			});
			return this._discoveryQueued;
		}
		const now = Date.now();
		this._lastDiscoveryAttempt = now;
		this._discoveryIncremental = incremental && this._lastFullDiscovery !== undefined
			&& now - this._lastFullDiscovery < FULL_DISCOVERY_INTERVAL_MS;
		this._discoveryToken = this._enabledCts.token;
		this._discoveryInFlight = this._doDiscoverAndSeed(this._discoveryToken, this._discoveryIncremental, taskIds).finally(() => {
			this._discoveryInFlight = undefined;
			this._discoveryToken = undefined;
		});
		return this._discoveryInFlight;
	}

	private _refreshTasks(taskIds: readonly string[]): Promise<void> {
		if (!this._isEnabled() || this._store.isDisposed || this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) !== true) {
			return Promise.resolve();
		}
		for (const id of taskIds) {
			this._pendingTaskIds.add(id);
		}
		if (this._taskRefreshInFlight) {
			this._taskRefreshQueued ??= this._taskRefreshInFlight.then(() => {
				this._taskRefreshQueued = undefined;
				return this._refreshTasks([]);
			});
			return this._taskRefreshQueued;
		}
		if (!this._pendingTaskIds.size || !this._isEnabled() || this._store.isDisposed) {
			return Promise.resolve();
		}
		const token = this._enabledCts.token;
		this._taskRefreshInFlight = Promise.resolve().then(() => {
			if (token.isCancellationRequested) {
				return;
			}
			const pending = [...this._pendingTaskIds];
			this._pendingTaskIds.clear();
			return pending.length ? this._doDiscoverAndSeed(token, true, pending) : undefined;
		}).finally(() => {
			this._taskRefreshInFlight = undefined;
		});
		return this._taskRefreshInFlight;
	}

	private async _doDiscoverAndSeed(token: CancellationToken, incremental: boolean, taskIds?: readonly string[]): Promise<void> {
		let result: ICloudSandboxDiscoveryResult;
		try {
			const accountKey = await this._apiService.getAccountKey();
			if (token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (this._restoreAccount(accountKey)) {
				if (taskIds) {
					void this._discoverAndSeed(false, true);
					return;
				}
				token = this._enabledCts.token;
				this._discoveryToken = token;
				this._discoveryIncremental = incremental = false;
				taskIds = undefined;
				this._lastDiscoveryAttempt = Date.now();
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			if (this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) === true && !this._sessionFeed.value) {
				const feed = this._sessionFeed.value = this._instantiationService.createInstance(CloudSandboxSessionFeed,
					(incremental: boolean, taskIds?: readonly string[]) => void this._discoverAndSeed(incremental, true, taskIds), undefined);
				await feed.start();
			}
			if (token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (!this._discoveryPoll.isScheduled()) {
				this._discoveryPoll.schedule();
			}
			result = await this._apiService.listSessions(token, { incremental, ...(taskIds ? { taskIds } : {}) });
			const retryTaskIds = taskIds && (result.kind === 'failed' ? taskIds : result.kind === 'partial' ? result.failedTaskIds : undefined);
			if (retryTaskIds?.length && !token.isCancellationRequested && this._isEnabled()
				&& this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) === true) {
				const retried = await this._apiService.listSessions(token, { incremental: true, taskIds: retryTaskIds });
				if (result.kind === 'failed') {
					result = retried;
				} else if (result.kind === 'partial' && retried.kind !== 'failed') {
					result = {
						kind: retried.kind === 'partial' ? 'partial' : 'incremental',
						sessions: [...result.sessions, ...retried.sessions],
						removedTaskIds: [...result.removedTaskIds ?? [], ...retried.kind === 'complete' ? [] : retried.removedTaskIds ?? []],
						...(retried.kind === 'partial' ? { failedTaskIds: retried.failedTaskIds } : {}),
					};
				}
			}
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error) || !this._isEnabled()) {
				return;
			}
			result = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
		}
		if (token.isCancellationRequested || !this._isEnabled()) {
			return;
		}
		this._discoveryRetryInterval = result.kind === 'failed' || result.kind === 'partial'
			? Math.min(this._discoveryRetryInterval * 2, MAX_DISCOVERY_RETRY_INTERVAL_MS)
			: DISCOVERY_STALE_AFTER_MS;
		if (result.kind === 'failed') {
			this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
			return;
		}
		if (result.kind === 'complete') {
			this._lastFullDiscovery = Date.now();
		}

		const present = new Set<string>();
		const presentSessions = new Set<string>();
		const updatedTasks = new Set<string>();
		for (const session of result.sessions) {
			if (!session.environmentId || !session.sessionId || this._deletedTaskIds.has(session.taskId)) {
				continue;
			}
			const address = cloudSandboxAddress(session.environmentId);
			present.add(address);
			presentSessions.add(JSON.stringify([address, session.sessionId]));
			updatedTasks.add(session.taskId);
			this._seedDiscoveredSession({ ...session, isArchived: session.isArchived === true });
		}

		const removedTasks = new Set(result.kind === 'complete' ? [] : result.removedTaskIds);
		for (const [address, sessions] of this._sessionEnvironments) {
			if (this._provisioning.has(address)) {
				continue;
			}
			const connected = this._remoteAgentHostService.connections.some(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status));
			for (const [rawId, session] of sessions) {
				if (!presentSessions.has(JSON.stringify([address, rawId]))
					&& (result.kind === 'complete' || !!session.taskId && (removedTasks.has(session.taskId) || updatedTasks.has(session.taskId)))) {
					sessions.delete(rawId);
					this._providerInstances.get(address)?.removeTaskOwnership?.(rawId);
					if (!connected) {
						this._providerInstances.get(address)?.removeDeletedSession?.(rawId);
					}
					if (session.taskId) {
						this._apiService.clearSessionHistory(session.taskId);
					}
				}
			}
			const remaining = sessions.values().next().value;
			if (remaining && !sessions.has(this._environments.get(address)?.sessionId ?? '')) {
				this._environments.set(address, remaining);
			}
		}
		for (const [address, environment] of this._environments) {
			if (present.has(address) || this._provisioning.has(address)) {
				continue;
			}
			if (result.kind !== 'complete' && (!environment.taskId || (!removedTasks.has(environment.taskId) && !updatedTasks.has(environment.taskId)))) {
				continue;
			}
			const connected = this._remoteAgentHostService.connections.some(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status));
			if (!connected) {
				this._teardownEnvironment(address);
			}
		}

		this._persistInventory();
		this._logService.info(`${LOG_PREFIX} Seeded ${present.size} discovered sandbox environment(s)${result.kind === 'partial' ? ' (partial scan; kept existing entries)' : ''}.`);
	}

	private _seedDiscoveredSession(session: ICloudSandboxDiscoveredSession): void {
		this._ensureProvider(session);
		const address = cloudSandboxAddress(session.environmentId);
		this._updateSandboxSession(address, session);
		const provider = this._providerInstances.get(address);
		provider?.setLabel?.(session.name);
		const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
		const modifiedTime = Number.isNaN(parsed) ? provider?.getSessionModifiedTime(session.sessionId) ?? Date.now() : parsed;
		const project = discoveredSessionProject(session.repoName);
		const application = session.application || session.eventType;
		provider?.seedSessions([{
			session: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, session.sessionId),
			provider: CLOUD_SANDBOX_AGENT_PROVIDER,
			...(application ? { _meta: withSessionInitiator(undefined, { name: application }) } : {}),
			startTime: modifiedTime,
			modifiedTime,
			summary: session.name,
			...(session.status !== undefined ? { status: session.status } : {}),
			...(project ? { project } : {}),
		}], { updateExisting: true, workspaceless: session.hasRepository === undefined ? undefined : !session.hasRepository });
		if (session.isArchived !== undefined) {
			provider?.setSessionArchived(session.sessionId, session.isArchived);
		}
	}

	protected _restoreAccount(accountKey: string | undefined): boolean {
		if (accountKey === this._accountKey) {
			return false;
		}
		this._teardownAll();
		this._accountKey = accountKey;
		if (accountKey) {
			const storageKey = INVENTORY_STORAGE_PREFIX + accountKey;
			const keys = this._storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.startsWith(`${storageKey}.`));
			let restored = 0;
			for (const key of keys) {
				const sessions = this._readInventory(key);
				this._persistedInventory.set(key, JSON.stringify({ version: 1, sessions }));
				for (const session of sessions) {
					this._seedDiscoveredSession(session);
					restored++;
				}
			}
			if (keys.length === 0 && this._storageService.get(storageKey, StorageScope.PROFILE) !== undefined) {
				for (const session of this._readInventory(storageKey)) {
					this._seedDiscoveredSession(session);
					restored++;
				}
				this._persistInventory();
			}
			if (restored) {
				this._logService.info(`${LOG_PREFIX} Restored ${restored} cached sandbox environment(s).`);
			}
		}
		return true;
	}

	private _readInventory(storageKey: string): readonly ICloudSandboxDiscoveredSession[] {
		let cached: { readonly version?: number; readonly sessions?: unknown } | undefined;
		try {
			cached = this._storageService.getObject(storageKey, StorageScope.PROFILE);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Reading cached sandbox inventory failed.`, error);
			return [];
		}
		if (cached !== undefined) {
			if (isObject(cached) && cached.version === 1 && Array.isArray(cached.sessions) && cached.sessions.every(isDiscoveredSandboxSession)) {
				return cached.sessions;
			}
			this._logService.warn(`${LOG_PREFIX} Ignoring invalid cached sandbox inventory.`);
		}
		return [];
	}

	protected _persistInventory(): void {
		if (!this._accountKey) {
			return;
		}
		const storageKey = INVENTORY_STORAGE_PREFIX + this._accountKey;
		const inventory = new Map<string, string>();
		const entries: IStorageEntry[] = [];
		for (const environment of [...this._sessionEnvironments.values()].flatMap(sessions => [...sessions.values()])) {
			if (environment.sessionId && environment.taskId) {
				const session: ICloudSandboxDiscoveredSession = {
					environmentId: environment.environmentId,
					sessionId: environment.sessionId,
					taskId: environment.taskId,
					eventType: environment.eventType,
					application: environment.application,
					name: environment.name,
					repoName: environment.repoName,
					hasRepository: environment.hasRepository,
					updatedAt: environment.updatedAt,
					...(environment.isArchived !== undefined ? { isArchived: environment.isArchived } : {}),
				};
				const key = `${storageKey}.${JSON.stringify([session.environmentId, session.sessionId])}`;
				const value = JSON.stringify({ version: 1, sessions: [session] });
				inventory.set(key, value);
				if (this._persistedInventory.get(key) !== value) {
					entries.push({ key, value, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
				}
			}
		}
		// Only remove this window's known entries, never a concurrent window's newly stored sessions.
		for (const key of this._persistedInventory.keys()) {
			if (!inventory.has(key)) {
				entries.push({ key, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
			}
		}
		if (this._storageService.get(storageKey, StorageScope.PROFILE) !== undefined) {
			entries.push({ key: storageKey, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
		}
		this._persistedInventory = inventory;
		this._storageService.storeAll(entries, false);
	}

	protected _ownsSandboxSession(address: string, rawId: string): boolean {
		return !!this._sessionEnvironments.get(address)?.get(rawId)?.taskId;
	}

	private _getTaskId(address: string, resource: URI): string | undefined {
		const sessions = this._sessionEnvironments.get(address);
		return sessions?.get(AgentSession.id(resource))?.taskId
			?? (sessions?.size === 1 ? sessions.values().next().value?.taskId : undefined);
	}

	private _updateSandboxSession(address: string, session: ICloudSandboxSessionEnvironment): void {
		if (session.sessionId) {
			this._sessionEnvironments.get(address)?.set(session.sessionId, session);
			if (this._environments.get(address)?.sessionId === session.sessionId) {
				this._environments.set(address, session);
			}
		}
	}

	protected async _renameSandboxSession(address: string, rawId: string, title: string): Promise<void> {
		const environment = this._sessionEnvironments.get(address)?.get(rawId);
		if (!environment?.taskId) {
			throw new Error(localize('cloudSandbox.renameSessionNotFound', "Mission Control sandbox session not found."));
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		try {
			await this._apiService.renameTask(environment.taskId, title, source.token);
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
		} finally {
			store.dispose();
		}
		const current = this._sessionEnvironments.get(address)?.get(rawId);
		if (current?.taskId !== environment.taskId || current.sessionId !== rawId) {
			throw new CancellationError();
		}
		this._updateSandboxSession(address, { ...current, name: title });
		this._persistInventory();
	}

	protected async _setSandboxSessionArchived(address: string, rawId: string, archived: boolean, token: CancellationToken = CancellationToken.None): Promise<void> {
		const environment = this._sessionEnvironments.get(address)?.get(rawId);
		if (!environment?.taskId) {
			throw new Error(localize('cloudSandbox.archiveSessionNotFound', "Mission Control sandbox session not found."));
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		store.add(token.onCancellationRequested(() => source.cancel()));
		try {
			await this._apiService.setTaskArchived(environment.taskId, archived, source.token);
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
		} finally {
			store.dispose();
		}
		const current = this._sessionEnvironments.get(address)?.get(rawId);
		if (current?.taskId !== environment.taskId || current.sessionId !== rawId) {
			throw new CancellationError();
		}
		this._updateSandboxSession(address, { ...current, isArchived: archived });
		this._persistInventory();
	}

	protected async _deleteSandboxSession(address: string, sessionIds: readonly string[], removeSession: (rawId: string) => void, token: CancellationToken = CancellationToken.None): Promise<void> {
		const sessions = this._sessionEnvironments.get(address);
		const targets: { sessionId: string; taskId: string }[] = [];
		for (const sessionId of sessionIds) {
			const taskId = sessions?.get(sessionId)?.taskId;
			if (!taskId) {
				throw new Error(localize('cloudSandbox.deleteSessionNotFound', "Mission Control sandbox session not found."));
			}
			targets.push({ sessionId, taskId });
		}
		if (sessionIds.length === 0) {
			return;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		store.add(token.onCancellationRequested(() => source.cancel()));
		try {
			for (const target of targets) {
				await this._apiService.deleteTask(target.taskId, source.token);
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				this._deletedTaskIds.add(target.taskId);
				this._apiService.clearSessionHistory(target.taskId);
				sessions?.delete(target.sessionId);
				removeSession(target.sessionId);
			}
		} finally {
			store.dispose();
			if (this._sessionEnvironments.get(address) === sessions) {
				const remaining = sessions?.values().next().value;
				if (!remaining) {
					this._teardownEnvironment(address);
				} else if (!sessions?.has(this._environments.get(address)?.sessionId ?? '')) {
					this._environments.set(address, remaining);
				}
				this._persistInventory();
			}
		}
	}

	/**
	 * Cancel pending work and remove the connection while retaining the provider and its cached sessions.
	 */
	protected async _disconnectEnvironment(address: string): Promise<void> {
		this._cancelPendingConnect(address);
		try {
			await this._cloudSandboxService.disconnect(address);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			if (!this._pendingConnects.has(address)) {
				this._settleFailedConnect(address);
			}
		}
	}

	private _cancelPendingConnect(address: string): void {
		const pending = this._pendingConnects.get(address);
		this._pendingConnects.delete(address);
		pending?.source.dispose(true);
	}

	/**
	 * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
	 * remove its connection + credential refresher. Used when an environment vanishes from discovery
	 * or the feature is disabled.
	 */
	private _teardownEnvironment(address: string): void {
		for (const session of this._sessionEnvironments.get(address)?.values() ?? []) {
			if (session.taskId) {
				this._apiService.clearSessionHistory(session.taskId);
			}
		}
		this._sessionEnvironments.delete(address);
		this._environments.delete(address);
		this._cancelPendingConnect(address);
		this._providerStores.deleteAndDispose(address);
		this._clearSessionHandlers(address);
		void this._disconnectEnvironment(address);
	}

	/** Tear down every known sandbox environment (feature disabled). */
	private _teardownAll(): void {
		this._sessionFeed.clear();
		this._discoveryPoll.cancel();
		this._pendingTaskIds.clear();
		this._apiService.clearSessionHistory();
		// Abort in-flight discovery/connects first so nothing commits state after this runs.
		this._enabledCts.cancel();
		this._enabledCts.dispose();
		this._enabledCts = new CancellationTokenSource();
		this._lastDiscoveryAttempt = undefined;
		this._lastFullDiscovery = undefined;
		this._discoveryRetryInterval = DISCOVERY_STALE_AFTER_MS;
		this._accountKey = undefined;
		this._deletedTaskIds.clear();
		this._persistedInventory.clear();
		for (const address of [...this._environments.keys()]) {
			this._teardownEnvironment(address);
		}
	}

	/** Map each known sandbox connection authority to its address (`cloudsandbox:<envId>`). */
	private _authoritiesByAddress(): Map<string, string> {
		const byAuthority = new Map<string, string>();
		for (const address of this._environments.keys()) {
			byAuthority.set(agentHostAuthority(address), address);
		}
		return byAuthority;
	}

	/** Resolve the sandbox address owning a remote-agent-host session type, if any. */
	private _findAddressForSessionType(sessionType: string): string | undefined {
		const byAuthority = this._authoritiesByAddress();
		const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, byAuthority.keys());
		return authority ? byAuthority.get(authority) : undefined;
	}

	/** Whether the chat surface can hand off persisted history and offline drafts to a live connection. */
	protected get supportsBackgroundConnection(): boolean { return false; }

	/** Makes recorded history available independently of the surface's connection-on-open policy. */
	protected async _waitForActivation(sessionType: string): Promise<boolean> {
		const address = this._findAddressForSessionType(sessionType);
		const env = address ? this._environments.get(address) : undefined;
		const provider = address ? this._providerInstances.get(address) : undefined;
		if (!address || !env || !provider) {
			return false;
		}
		const token = this._providerStores.get(address)?.token ?? CancellationToken.Cancelled;
		const isCurrentActivation = () => {
			const current = !token.isCancellationRequested
				&& this._isEnabled()
				&& this._environments.has(address)
				&& this._providerInstances.get(address) === provider;
			if (!current) {
				this._logService.trace(`${LOG_PREFIX} Abandoning activation for ${address} after teardown.`);
			}
			return current;
		};

		if (env.taskId) {
			const activated = this._activateHistory(sessionType, address, env);
			if (activated) {
				void this._connectOnOpen(sessionType, address, env, token, isCurrentActivation).catch(error => {
					if (!isCancellationError(error)) {
						this._logService.warn(`${LOG_PREFIX} Background activation failed for ${address}`, error);
					}
				});
			}
			return activated && isCurrentActivation() && this._chatSessionsService.getContentProviderSchemes().includes(sessionType);
		}

		return this._connectOnOpen(sessionType, address, env, token, isCurrentActivation);
	}

	private async _connectOnOpen(sessionType: string, address: string, env: ICloudSandboxSessionEnvironment, token: CancellationToken, isCurrentActivation: () => boolean): Promise<boolean> {
		const shouldConnect = this.supportsBackgroundConnection
			? this._configurationService.getValue<boolean>(CloudSandboxAutoConnectOnOpenSettingId) === true
			: !env.taskId || this._pendingConnects.has(address) || await this._isEnvironmentOnline(env, token);
		if (!isCurrentActivation()) {
			return false;
		}
		if (!shouldConnect && !this._pendingConnects.has(address)) {
			this._logService.info(`${LOG_PREFIX} Not connecting automatically to ${address}; serving history and leaving the connect to the user.`);
			return !!env.taskId;
		}
		const connecting = this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(
			() => undefined,
			(error: unknown) => {
				this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${error instanceof Error ? error.message : String(error)}`);
				return error ?? new Error('connect failed');
			},
		);
		const connectError = await connecting;
		if (!isCurrentActivation()) {
			return false;
		}
		if (connectError !== undefined) {
			return !!env.taskId;
		}
		if (env.taskId) {
			return true;
		}
		const authority = agentHostAuthority(address);
		while (isCurrentActivation()) {
			const connection = this._remoteAgentHostService.getConnection(address);
			if (!connection) {
				return false;
			}
			const rootState = connection.rootState.value;
			if (rootState instanceof Error) {
				return false;
			}
			if (rootState) {
				return rootState.agents.some(agent => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
			}
			const changed = Event.toPromise(connection.rootState.onDidChange);
			try {
				await raceCancellation(changed, token);
			} finally {
				changed.cancel();
			}
		}
		return false;
	}

	/** An unreadable record must not trigger an automatic resume in surfaces without background connection support. */
	private async _isEnvironmentOnline(env: ICloudSandboxSessionEnvironment, token: CancellationToken): Promise<boolean> {
		try {
			const record = await this._apiService.getEnvironment(env.environmentId, token);
			return record.status === 'online';
		} catch (error) {
			this._logService.trace(`${LOG_PREFIX} Could not read the state of ${env.environmentId}; treating it as not online: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/** Registers one provider that can promote its recorded conversations in place. */
	private _activateHistory(sessionType: string, address: string, env: ICloudSandboxSessionEnvironment): boolean {
		if (this._historyHandlers.has(sessionType)) {
			return true;
		}
		// Registering a second content provider for a session type throws. This check and the
		// registration below are synchronous, so the connect cannot interleave between them.
		if (this._chatSessionsService.getContentProviderSchemes().includes(sessionType)) {
			this._logService.trace(`${LOG_PREFIX} ${sessionType} already has a content provider; leaving it to serve the session.`);
			return true;
		}
		if (!env.taskId) {
			this._logService.warn(`${LOG_PREFIX} No task id for ${address}; cannot serve history read-only.`);
			return false;
		}
		const store = new DisposableStore();
		const handler = store.add(this._instantiationService.createInstance(CloudSandboxSessionHandler, {
			taskId: env.taskId,
			getTaskId: (resource: URI) => this._getTaskId(address, resource),
			// The live handler registers `agentId === sessionType`; matching it keeps replayed
			// history attributed to the same participant.
			agentId: sessionType,
			connectionAuthority: agentHostAuthority(address),
			connectionStatus: this._providerInstances.get(address)!.connectionStatus,
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, handler));
		this._historyHandlers.set(sessionType, { handler, dispose: () => store.dispose() });
		this._logService.info(`${LOG_PREFIX} Serving ${sessionType} from Mission Control history.`);
		return true;
	}

	private _registerLiveSessionProvider(sessionType: string, provider: IChatSessionContentProvider): IDisposable | undefined {
		const entry = this._historyHandlers.get(sessionType);
		if (!entry) {
			return undefined;
		}
		entry.handler.setLiveProvider(provider);
		// Later connection replacement retains the normal provider teardown/reload lifecycle.
		return toDisposable(() => {
			if (this._historyHandlers.get(sessionType) === entry) {
				this._historyHandlers.deleteAndDispose(sessionType);
			}
		});
	}

	private _clearSessionHandlers(address: string): void {
		const authority = agentHostAuthority(address);
		for (const sessionType of [...this._historyHandlers.keys()]) {
			if (findRemoteAgentHostSessionTypeAuthority(sessionType, [authority]) === authority) {
				this._historyHandlers.deleteAndDispose(sessionType);
			}
		}
	}

	/** Reconnect using a surviving session rather than the provider's original discovery seed. */
	protected _connectEnvironment(environmentId: string): Promise<string> {
		const env = this._environments.get(cloudSandboxAddress(environmentId));
		if (!env) {
			throw new Error(localize('cloudSandbox.environmentNotFound', "The sandbox environment is no longer available."));
		}
		return this.connect({ environmentId, sessionId: env.sessionId, name: env.name });
	}

	/** Establish or reuse the environment connection, returning its display address. */
	async connect(options: ICloudSandboxConnectOptions): Promise<string> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		const address = cloudSandboxAddress(options.environmentId);
		this._ensureProvider({ environmentId: options.environmentId, sessionId: options.sessionId, name: options.name });

		const pending = this._pendingConnects.get(address);
		if (pending) {
			return pending.promise;
		}
		const source = new CancellationTokenSource(this._enabledCts.token);
		const token = source.token;
		const attempt = (async () => {
			this._providerInstances.get(address)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			const result = await raceCancellationError(this._cloudSandboxService.connect(options, token), token);
			if (token.isCancellationRequested || !this._isEnabled()) {
				throw new CancellationError();
			}
			for (const [sessionType, entry] of this._historyHandlers) {
				if (this._findAddressForSessionType(sessionType) === address) {
					entry.handler.retryLiveSessions();
				}
			}
			return result;
		})();
		this._pendingConnects.set(address, { source, promise: attempt });
		try {
			return await attempt;
		} catch (error) {
			if (this._pendingConnects.get(address)?.source === source) {
				// Credential acquisition can fail before a connection status event exists.
				this._settleFailedConnect(address);
			}
			throw error;
		} finally {
			if (this._pendingConnects.get(address)?.source === source) {
				this._pendingConnects.delete(address);
			}
			source.dispose();
		}
	}

	/**
	 * Return a provider to a state the user can act on after its connect failed. Defers to the
	 * service when it has something live to report, so a failure that raced a successful dial does
	 * not overwrite a good status, and leaves `incompatible` alone since redialing cannot fix it.
	 */
	private _settleFailedConnect(address: string): void {
		const provider = this._providerInstances.get(address);
		if (!provider) {
			return;
		}
		const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
		if (connectionInfo) {
			provider.setConnectionStatus(connectionInfo.status);
		} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
			provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		}
	}

	protected _isEnabled(): boolean {
		return !this._store.isDisposed && isCloudSandboxEnabled(this._configurationService) && !this._chatEntitlementService.sentiment.hidden;
	}

	/**
	 * Create a Mission Control task for a brand-new sandbox, seed its session on the provider and
	 * connect to the environment. Provisioning runs the same `_ensureProvider → seed → connect`
	 * path discovery does, so a later discovery pass reconciles the task rather than duplicating it.
	 *
	 * The seeded session stays withheld on providers that support it until the caller publishes
	 * it (or this method fails, in which case the remote task is published so it is not lost).
	 */
	protected async _provisionSandbox(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, progress?: IProgress<string>, draftResource?: URI): Promise<ICloudSandboxProvisionedEnvironment<T>> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		let created: ICloudSandboxCreatedSession;
		let taskCreationPath: CloudSandboxTaskCreationPath;
		let reservationWaitMs: number;
		let reused: boolean;
		let enabledToken: CancellationToken;
		let provisioningStartedAt: number;
		let phase: 'preparation' | 'creation' = 'preparation';
		try {
			const accountKey = await this._apiService.getAccountKey();
			if (!this._isEnabled() || token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			this._restoreAccount(accountKey);
			enabledToken = this._enabledCts.token;
			progress?.report(localize('sandbox.provisioningContainer', "Setting up cloud container"));
			provisioningStartedAt = Date.now();
			phase = 'creation';
			({ created, taskCreationPath, reservationWaitMs, reused } = await this._createTaskForDraft(request, draftResource, accountKey, token));
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.error(`${LOG_PREFIX} Cloud session ${phase} failed.`, error);
			throw this._instantiationService.createInstance(CloudSandboxStartupError, error, phase);
		}
		this._logService.info(`${LOG_PREFIX} event=${reused ? 'taskReused' : 'taskSubmitted'} taskCreationPath=${taskCreationPath} taskId=${JSON.stringify(created.taskId)} environmentId=${JSON.stringify(created.environmentId)} reservationWaitMs=${reservationWaitMs} durationMs=${Math.max(0, Date.now() - provisioningStartedAt)}`);
		const name = request.repoNwo ?? created.taskId;
		const title = newSessionTitle(request.prompt, name);
		const address = cloudSandboxAddress(created.environmentId);
		if (!this._isEnabled() || token.isCancellationRequested || enabledToken.isCancellationRequested) {
			throw new CancellationError();
		}
		this._provisioning.add(address);
		let seededProvider: T | undefined;
		let connectionAttempt: Promise<string> | undefined;
		try {
			const now = Date.now();
			this._ensureProvider({ ...created, name, repoName: request.repoNwo, hasRepository: request.repoNwo !== undefined, updatedAt: new Date(now).toISOString() });
			const provider = this._providerInstances.get(address);
			if (!provider) {
				throw new Error(`No sessions provider was registered for sandbox environment ${created.environmentId}`);
			}
			if (!reused || provider.getSessionModifiedTime(created.sessionId) === undefined) {
				const project = discoveredSessionProject(request.repoNwo);
				provider.seedProvisionalSession?.({
					session: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, created.sessionId),
					provider: CLOUD_SANDBOX_AGENT_PROVIDER,
					_meta: withSessionWorkspaceless(undefined, request.repoNwo === undefined),
					startTime: now,
					modifiedTime: now,
					summary: title,
					...(project ? { project } : {}),
				});
			}
			seededProvider = provider;
			this._persistInventory();
			progress?.report(localize('sandbox.connectingContainer', "Connecting to cloud container"));
			connectionAttempt = this.connect({
				environmentId: created.environmentId, sessionId: created.sessionId, name, taskCreationPath, reservationWaitMs,
				connectionSource: reused ? 'existing' : 'created',
				provisioningStartedAt: reused ? undefined : provisioningStartedAt,
			});
			await raceCancellationError(connectionAttempt, token);
			if (token.isCancellationRequested || !this._isEnabled() || this._providerInstances.get(address) !== provider) {
				throw new CancellationError();
			}
			return { ...created, address, name, title, repoNwo: request.repoNwo, provider };
		} catch (error) {
			// The remote task exists even if connecting or publishing it failed.
			if (seededProvider && this._providerInstances.get(address) === seededProvider) {
				seededProvider.publishWithheldSession?.(created.sessionId);
			}
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			throw this._instantiationService.createInstance(CloudSandboxStartupError, error, 'connection');
		} finally {
			const releaseProvisioning = () => { this._provisioning.delete(address); };
			if (connectionAttempt) {
				// A canceled caller must not let discovery tear down a connection that is still waking.
				void connectionAttempt.then(releaseProvisioning, releaseProvisioning);
			} else {
				releaseProvisioning();
			}
		}
	}

	private async _createTaskForDraft(request: ICloudSandboxCreateSessionRequest, draftResource: URI | undefined, accountKey: string, token: CancellationToken): Promise<{ readonly created: ICloudSandboxCreatedSession; readonly taskCreationPath: CloudSandboxTaskCreationPath; readonly reservationWaitMs: number; readonly reused: boolean }> {
		if (!draftResource) {
			const created = await this._apiService.createSession(request, token);
			return { created, taskCreationPath: getCloudSandboxTaskCreationPath(request, created), reservationWaitMs: 0, reused: false };
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(token));
		store.add(this._enabledCts.token.onCancellationRequested(() => source.cancel()));
		let prepared: ICloudSandboxPreparedReservation | undefined;
		let reservationWaitMs = 0;
		let taskRequestStarted = false;
		try {
			if (request.expectedAccountKey !== undefined && request.expectedAccountKey !== accountKey) {
				throw new CancellationError();
			}
			const submitted = this._draftPreparationService.getSubmittedDraft(draftResource);
			if (submitted) {
				if (source.token.isCancellationRequested || submitted.reservation.expectedAccountKey !== accountKey) {
					throw new CancellationError();
				}
				if (request.environmentId !== undefined
					|| (request.reservedTaskId !== undefined && request.reservedTaskId.trim() !== submitted.reservation.taskId)
					|| !equalsIgnoreCase(request.repoNwo ?? '', submitted.repoNwo ?? '')) {
					throw new CloudSandboxRequestError(undefined, localize('cloudSandbox.submittedDraftChanged', "This draft already started a cloud session with different settings. Open that session or start a new chat."), undefined, { code: 'invalid_request' });
				}
				if (this._deletedTaskIds.has(submitted.created.taskId)) {
					throw new CloudSandboxRequestError(404, localize('cloudSandbox.submittedTaskDeleted', "The cloud task created for this draft has been deleted. Start a new chat."), undefined, { code: 'task_not_found' });
				}
				return {
					created: submitted.created,
					taskCreationPath: getCloudSandboxTaskCreationPath({ ...request, reservedTaskId: submitted.reservation.taskId }, submitted.created),
					reservationWaitMs: 0,
					reused: true,
				};
			}
			if (request.environmentId === undefined) {
				const startedAt = Date.now();
				prepared = await this._draftPreparationService.take(draftResource, source.token);
				reservationWaitMs = Math.max(0, Date.now() - startedAt);
				if (request.reservedTaskId !== undefined && request.reservedTaskId.trim() !== prepared?.taskId) {
					throw new CancellationError();
				}
			} else {
				void this._draftPreparationService.discard(draftResource);
			}
			if (source.token.isCancellationRequested || !this._isEnabled() || (prepared && prepared.expectedAccountKey !== accountKey)) {
				throw new CancellationError();
			}
			const taskRequest = {
				...request,
				expectedAccountKey: request.expectedAccountKey ?? accountKey,
				...(prepared ? { reservedTaskId: prepared.taskId } : {}),
			};
			const created = await this._apiService.createSession(taskRequest, source.token, () => {
				taskRequestStarted = true;
			});
			if (prepared) {
				this._draftPreparationService.markSubmitted(prepared, created, request.repoNwo);
			}
			// A fallback may mean another Send claimed the reservation; do not release it here.
			return { created, taskCreationPath: getCloudSandboxTaskCreationPath(taskRequest, created), reservationWaitMs, reused: false };
		} catch (error) {
			if (prepared && !taskRequestStarted) {
				try {
					await this._draftPreparationService.release(prepared);
				} catch (cleanupError) {
					this._logService.warn(`${LOG_PREFIX} Could not release task reservation ${prepared.taskId} before submission.`, cleanupError);
				}
			} else if (prepared) {
				this._logService.warn(`${LOG_PREFIX} Retaining task reservation ${prepared.taskId} after a failed submission; its outcome must be reconciled.`);
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	/**
	 * Observe repository setup on a freshly provisioned environment. The returned store disposes
	 * itself once the repository is ready or its clone failed.
	 */
	trackSessionCreationProgress(environmentId: string, repoNwo: string, progress: IProgress<string>): IDisposable {
		const store = new DisposableStore();
		const connection = this._remoteAgentHostService.getConnection(cloudSandboxAddress(environmentId));
		if (!connection) {
			return store;
		}
		let cloningProjectId: string | undefined;
		const update = () => {
			const state = connection.rootState.value;
			if (!state || state instanceof Error) {
				return;
			}
			const projects = readCloudSandboxProjects(state)?.filter(project => {
				const remote = project.remoteUrl && getGitHubRepositoryFromRemoteUrl(project.remoteUrl, ['github.com']);
				return remote && equalsIgnoreCase(`${remote.owner}/${remote.repo}`, repoNwo);
			});
			const project = projects?.find(project => project.status === 'ready') ?? projects?.find(project => project.status === 'cloning') ?? projects?.[0];
			if (project?.status === 'cloning') {
				cloningProjectId = project.id;
				progress.report(project.progress === undefined
					? localize('sandbox.cloningRepository', "Cloning repository")
					: localize('sandbox.cloningRepositoryProgress', "Cloning repository ({0}%)", Math.round(project.progress)));
			} else if (project?.status === 'ready') {
				progress.report(localize('sandbox.startingAgent', "Starting Copilot agent"));
				store.dispose();
			} else if (project?.status === 'failed' && project.id === cloningProjectId) {
				progress.report(localize('sandbox.cloningFailed', "Repository cloning failed"));
				store.dispose();
			}
		};
		store.add(connection.rootState.onDidChange(update));
		update();
		return store;
	}

	private _updateEnablement(): void {
		this._updateRegistration();
		if (!this._isEnabled()) {
			this._teardownAll();
		}
	}

	protected abstract _updateRegistration(): void;

	/** Create the sessions provider for an environment if it doesn't exist yet. */
	protected _ensureProvider(env: ICloudSandboxSessionEnvironment): void {
		const address = cloudSandboxAddress(env.environmentId);
		// `connect()` reaches here with only the fields its caller had, so preserve anything
		// discovery already resolved — notably the task id that makes history readable offline.
		const known = (env.sessionId ? this._sessionEnvironments.get(address)?.get(env.sessionId) : undefined) ?? this._environments.get(address);
		const current = {
			...known, ...env,
			taskId: env.taskId ?? (!env.sessionId || env.sessionId === known?.sessionId ? known?.taskId : undefined),
			eventType: env.eventType ?? known?.eventType,
			application: env.application ?? (!env.sessionId || env.sessionId === known?.sessionId ? known?.application : undefined),
			repoName: env.repoName ?? known?.repoName,
			hasRepository: env.hasRepository ?? known?.hasRepository,
			updatedAt: env.updatedAt ?? known?.updatedAt,
		};
		// A stale reconnect must not displace a surviving task's recorded-history route.
		if (current.taskId || !this._environments.get(address)?.taskId) {
			this._environments.set(address, current);
		}
		if (current.sessionId && current.taskId) {
			let sessions = this._sessionEnvironments.get(address);
			if (!sessions) {
				sessions = new Map();
				this._sessionEnvironments.set(address, sessions);
			}
			sessions.set(current.sessionId, current);
		}
		if (this._providerStores.has(address)) {
			return;
		}
		const store = new DisposableStore();
		const token = cancelOnDispose(store);
		this._providerStores.set(address, { token, dispose: () => store.dispose() });
		store.add(this._workspaceTrustManagementService.registerTrustedAuthority(AGENT_HOST_SCHEME, agentHostAuthority(address)));
		const provider = this._createProvider(env, store);
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
	}

	protected abstract _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): T;

	/** Wire each live connection to its provider so session enumeration runs. */
	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status),
			);
			if (connectionInfo) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	/** Push the service's authoritative connection status onto each provider. */
	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else if (this._pendingConnects.has(address)) {
				// A connect is in flight but has not reached `reconnect()` yet, so the service has
				// no entry to report: waking an environment can spend minutes minting credentials
				// beforehand. Any unrelated connection change would otherwise land here and reset
				// the wake to `disconnected`, flipping the chat to a failure it has not had.
				continue;
			} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}
}
