/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CloudSandboxEnabledSettingId,
	CloudSandboxAuthenticationRequiredError,
	cloudSandboxAddress,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	isCloudSandboxEnabled,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxDiscoveryResult,
	type ICloudSandboxDiscoveredSession,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IReplayedTaskHistory } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { CloudSandboxReadOnlySessionHandler } from './cloudSandboxReadOnlySessionHandler.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';
const DISCOVERY_STALE_AFTER_MS = 60_000;
const FULL_DISCOVERY_INTERVAL_MS = 15 * 60_000;
const MAX_DISCOVERY_RETRY_INTERVAL_MS = 5 * 60_000;
const INVENTORY_STORAGE_PREFIX = 'sessions.cloudSandbox.inventory.';

/** A discovered sandbox environment we can create a provider for. */
export interface ICloudSandboxSessionEnvironment {
	readonly environmentId: string;
	readonly sessionId?: string;
	/**
	 * Mission Control task owning the session. Persisted AHP history is addressed per task, so this
	 * is what makes the conversation readable once the environment is unreachable.
	 */
	readonly taskId?: string;
	readonly name: string;
	readonly repoName?: string;
	readonly updatedAt?: string;
}

function isDiscoveredSandboxSession(value: unknown): value is ICloudSandboxDiscoveredSession {
	const candidate = value as Partial<ICloudSandboxDiscoveredSession> | undefined;
	return isObject(candidate)
		&& typeof candidate.environmentId === 'string' && candidate.environmentId.length > 0
		&& typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0
		&& typeof candidate.taskId === 'string' && candidate.taskId.length > 0
		&& typeof candidate.name === 'string'
		&& (candidate.repoName === undefined || typeof candidate.repoName === 'string')
		&& (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string');
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
	seedSessions(sessions: readonly IAgentSessionMetadata[], options?: { readonly updateExisting?: boolean }): void;
	getSessionModifiedTime(sessionId: string): number | undefined;
	setLabel?(label: string): void;
	setConnection(connection: IAgentConnection, defaultDirectory: string | undefined): void;
	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void;
}

export abstract class CloudSandboxSessionContribution<T extends ICloudSandboxSessionList> extends Disposable implements IWorkbenchContribution {

	/** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
	protected readonly _providerInstances = new Map<string, T>();
	private readonly _providerStores = this._register(new DisposableMap<string>());
	private _persistedInventory = new Map<string, string>();
	/** Environment metadata keyed by connection address, for on-demand reconnect. */
	private readonly _environments = new Map<string, ICloudSandboxSessionEnvironment>();
	/** In-flight connects keyed by address, so concurrent opens share one attempt. */
	private readonly _pendingConnects = new Map<string, Promise<string>>();
	/**
	 * Addresses being provisioned right now. A task we just created is not yet visible to a
	 * discovery pass that started before it existed, so reconciliation would see a brand-new
	 * environment as one that has vanished and tear it down mid-provision.
	 */
	protected readonly _provisioning = new Set<string>();
	/**
	 * Read-only content providers standing in for unreachable environments, keyed by session type.
	 * Disposed when the environment becomes reachable again.
	 */
	private readonly _readOnlyHandlers = this._register(new DisposableMap<string>());
	/**
	 * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
	 * discovery and connects abort instead of committing state after teardown has run.
	 */
	protected _enabledCts = new CancellationTokenSource();
	/** Serializes discovery so overlapping triggers can't interleave reconciliation. */
	private _discoveryInFlight: Promise<void> | undefined;
	private _discoveryQueued: Promise<void> | undefined;
	private _discoveryToken: CancellationToken | undefined;
	private _discoveryIncremental = false;
	private _lastDiscoveryAttempt: number | undefined;
	private _lastFullDiscovery: number | undefined;
	private _discoveryRetryInterval = DISCOVERY_STALE_AFTER_MS;
	private _accountKey: string | undefined;

	constructor(
		@ICloudSandboxAgentHostService private readonly _cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService protected readonly _apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IHostService private readonly _hostService: IHostService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		// Supply the generic remote-agent-host contribution with the sandbox host's per-connection
		// deviations (sealed-token auth + `ahp-session` backend scheme) without leaking sandbox
		// specifics into that shared code path.
		this._register(this._connectionCustomizations.register(
			isCloudSandboxConnectionAddress,
			address => createCloudSandboxConnectionCustomization(address, this._cloudSandboxService)!,
		));

		// Keep providers wired to their live connections and their status fresh.
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			// Drop a stand-in registered mid-connect before wiring: wiring publishes the session, and
			// two content providers for one session type throws.
			for (const connection of this._remoteAgentHostService.connections) {
				if (RemoteAgentHostConnectionStatus.isConnected(connection.status)) {
					this._clearReadOnly(connection.address);
				}
			}
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
		}));

		this._register(Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
			matchSessionType: sessionType => this._findAddressForSessionType(sessionType) !== undefined,
			waitForActivation: (_accessor, sessionType) => this._waitForActivation(sessionType),
		}));
	}

	protected async _refreshIfStale(): Promise<void> {
		if (this._discoveryInFlight) {
			await (this._discoveryQueued ?? this._discoveryInFlight);
			return;
		}
		if (!this._hostService.hasFocus || (this._lastDiscoveryAttempt !== undefined && Date.now() - this._lastDiscoveryAttempt < this._discoveryRetryInterval)) {
			return;
		}
		await this._discoverAndSeed(true);
	}

	/** Share overlapping scans, queuing at most one full scan when a stronger refresh is needed. */
	protected _discoverAndSeed(incremental = false, retry = false): Promise<void> {
		if (!this._isEnabled() || this._store.isDisposed) {
			return Promise.resolve();
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
		this._lastDiscoveryAttempt = Date.now();
		this._discoveryIncremental = incremental && this._lastFullDiscovery !== undefined
			&& this._lastDiscoveryAttempt - this._lastFullDiscovery < FULL_DISCOVERY_INTERVAL_MS;
		this._discoveryToken = this._enabledCts.token;
		this._discoveryInFlight = this._doDiscoverAndSeed(this._discoveryToken, this._discoveryIncremental).finally(() => {
			this._discoveryInFlight = undefined;
			this._discoveryToken = undefined;
		});
		return this._discoveryInFlight;
	}

	private async _doDiscoverAndSeed(token: CancellationToken, incremental: boolean): Promise<void> {
		let result: ICloudSandboxDiscoveryResult;
		try {
			const accountKey = await this._apiService.getAccountKey();
			if (token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (this._restoreAccount(accountKey)) {
				token = this._enabledCts.token;
				this._discoveryToken = token;
				this._discoveryIncremental = incremental = false;
				this._lastDiscoveryAttempt = Date.now();
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			result = await this._apiService.listSessions(token, { incremental });
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
		const updatedTasks = new Set<string>();
		for (const session of result.sessions) {
			if (!session.environmentId || !session.sessionId) {
				continue;
			}
			const address = cloudSandboxAddress(session.environmentId);
			present.add(address);
			updatedTasks.add(session.taskId);
			this._seedDiscoveredSession(session);
		}

		const removedTasks = new Set(result.kind === 'complete' ? [] : result.removedTaskIds);
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
		this._environments.set(address, session);
		const provider = this._providerInstances.get(address);
		provider?.setLabel?.(session.name);
		const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
		const modifiedTime = Number.isNaN(parsed) ? provider?.getSessionModifiedTime(session.sessionId) ?? Date.now() : parsed;
		const project = discoveredSessionProject(session.repoName);
		provider?.seedSessions([{
			session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, session.sessionId),
			startTime: modifiedTime,
			modifiedTime,
			summary: session.name,
			...(session.status !== undefined ? { status: session.status } : {}),
			...(project ? { project } : {}),
		}], { updateExisting: true });
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
		for (const environment of this._environments.values()) {
			if (environment.sessionId && environment.taskId) {
				const session: ICloudSandboxDiscoveredSession = {
					environmentId: environment.environmentId,
					sessionId: environment.sessionId,
					taskId: environment.taskId,
					name: environment.name,
					repoName: environment.repoName,
					updatedAt: environment.updatedAt,
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

	/**
	 * Remove the connection (and its credential refresher) for an environment while keeping the
	 * provider and its cached sessions visible in a disconnected state. Disposing the protocol
	 * client stops its soft-reconnect loop and disposes the credential refresher owned by its
	 * connection factory.
	 */
	private async _disconnectEnvironment(address: string): Promise<void> {
		try {
			await this._remoteAgentHostService.removeRemoteAgentHost(address);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
	 * remove its connection + credential refresher. Used when an environment vanishes from discovery
	 * or the feature is disabled.
	 */
	private _teardownEnvironment(address: string): void {
		this._environments.delete(address);
		this._pendingConnects.delete(address);
		this._providerStores.deleteAndDispose(address);
		// Drop the read-only stand-in too, or disabling the feature would leave a content provider
		// registered for a session type this contribution no longer serves.
		this._clearReadOnly(address);
		void this._disconnectEnvironment(address);
	}

	/** Tear down every known sandbox environment (feature disabled). */
	private _teardownAll(): void {
		// Abort in-flight discovery/connects first so nothing commits state after this runs.
		this._enabledCts.cancel();
		this._enabledCts.dispose();
		this._enabledCts = new CancellationTokenSource();
		this._lastDiscoveryAttempt = undefined;
		this._lastFullDiscovery = undefined;
		this._discoveryRetryInterval = DISCOVERY_STALE_AFTER_MS;
		this._accountKey = undefined;
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

	/** Opens an online environment through its host, or an offline session from persisted history. */
	protected async _waitForActivation(sessionType: string): Promise<boolean> {
		const address = this._findAddressForSessionType(sessionType);
		const env = address ? this._environments.get(address) : undefined;
		const provider = address ? this._providerInstances.get(address) : undefined;
		if (!address || !env || !provider) {
			return false;
		}
		const token = this._enabledCts.token;
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

		// Without a task there is no history fallback, so connecting is the only way to open it.
		const shouldConnect = !env.taskId || await this._isEnvironmentOnline(env, token);
		if (!isCurrentActivation()) {
			return false;
		}
		if (!shouldConnect) {
			this._logService.info(`${LOG_PREFIX} Environment for ${address} is not online; serving history and leaving the connect to the user.`);
			return this._activateReadOnly(sessionType, address, env, this._fetchTaskHistory(env, token));
		}

		const connectError = await this
			.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name })
			.then(() => undefined, (error: unknown) => error ?? new Error('connect failed'));
		if (!isCurrentActivation()) {
			return false;
		}
		if (connectError !== undefined) {
			this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
			return this._activateReadOnly(sessionType, address, env, this._fetchTaskHistory(env, token));
		}
		const authority = agentHostAuthority(address);
		while (true) {
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
			await Event.toPromise(connection.rootState.onDidChange);
		}
	}

	/** An unreadable record must not trigger an automatic resume. */
	private async _isEnvironmentOnline(env: ICloudSandboxSessionEnvironment, token: CancellationToken): Promise<boolean> {
		try {
			const record = await this._apiService.getEnvironment(env.environmentId, token);
			return record.status === 'online';
		} catch (error) {
			this._logService.trace(`${LOG_PREFIX} Could not read the state of ${env.environmentId}; treating it as not online: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/** Reads history from Mission Control without connecting to the sandbox. */
	private _fetchTaskHistory(env: ICloudSandboxSessionEnvironment, token: CancellationToken): Promise<IReplayedTaskHistory | undefined> | undefined {
		const taskId = env.taskId;
		if (!taskId) {
			return undefined;
		}
		return this._apiService.getSessionHistory(taskId, token).catch((error: unknown) => {
			this._logService.trace(`${LOG_PREFIX} History read for ${env.environmentId} did not complete: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		});
	}

	/**
	 * Register a content provider that serves this session from replayed history, read-only.
	 *
	 * Only ever registered when the environment is not connected — dormant, or a connect that just
	 * failed — so the transcript is real but there is nothing to send to. A connect that later
	 * lands drops this stand-in and hands the session to the live handler.
	 *
	 * Returns `true` once registered, which is what lets `canResolveChatSession` proceed, or
	 * `false` when there is no task to read history from.
	 */
	private _activateReadOnly(sessionType: string, address: string, env: ICloudSandboxSessionEnvironment, prefetchedHistory?: Promise<IReplayedTaskHistory | undefined>): boolean {
		if (this._readOnlyHandlers.has(sessionType)) {
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
		const handler = store.add(this._instantiationService.createInstance(CloudSandboxReadOnlySessionHandler, {
			taskId: env.taskId,
			// The live handler registers `agentId === sessionType`; matching it keeps replayed
			// history attributed to the same participant.
			agentId: sessionType,
			connectionAuthority: agentHostAuthority(address),
			prefetchedHistory,
		}));
		handler.markReadOnly();
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, handler));
		this._readOnlyHandlers.set(sessionType, store);
		this._logService.info(`${LOG_PREFIX} Serving ${sessionType} from Mission Control history.`);
		return true;
	}

	/**
	 * Drop any read-only stand-in for an address so the live handler can own the session type.
	 * Registering two content providers for one session type throws, so this must run before a
	 * connection is established rather than after.
	 */
	private _clearReadOnly(address: string): void {
		const authority = agentHostAuthority(address);
		for (const sessionType of [...this._readOnlyHandlers.keys()]) {
			if (findRemoteAgentHostSessionTypeAuthority(sessionType, [authority]) === authority) {
				this._readOnlyHandlers.deleteAndDispose(sessionType);
				this._logService.info(`${LOG_PREFIX} Dropped read-only stand-in for ${sessionType}; the environment is reachable again.`);
			}
		}
	}

	/**
	 * Ensure a provider exists for the environment and establish (or reuse) the
	 * connection. Resolves with the connection's display address.
	 */
	async connect(options: ICloudSandboxConnectOptions): Promise<string> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		const address = cloudSandboxAddress(options.environmentId);
		this._ensureProvider({ environmentId: options.environmentId, sessionId: options.sessionId, name: options.name });

		const pending = this._pendingConnects.get(address);
		if (pending) {
			return pending;
		}
		const token = this._enabledCts.token;
		const attempt = (async () => {
			try {
				this._providerInstances.get(address)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
				// Drop any read-only stand-in *before* connecting: the connect registers the live
				// handler, and two content providers for one session type throws.
				this._clearReadOnly(address);
				const result = await this._cloudSandboxService.connect(options, token);
				// The feature may have been disabled while connecting; drop the connection rather
				// than leaving a live relay open after teardown.
				if (token.isCancellationRequested || !this._isEnabled()) {
					void this._disconnectEnvironment(address);
					throw new CancellationError();
				}
				return result;
			} catch (error) {
				// Settle the status here rather than waiting for a connections-changed event: a
				// wake that exhausts its retry budget fails before any transport entry exists, so
				// no such event is coming and the provider would sit at `connecting` forever —
				// a permanent spinner with no way back to the connect action.
				this._settleFailedConnect(address);
				throw error;
			} finally {
				this._pendingConnects.delete(address);
			}
		})();
		this._pendingConnects.set(address, attempt);
		return attempt;
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
		const known = this._environments.get(address);
		this._environments.set(address, {
			...known, ...env,
			taskId: env.taskId ?? known?.taskId,
			repoName: env.repoName ?? known?.repoName,
			updatedAt: env.updatedAt ?? known?.updatedAt,
		});
		if (this._providerStores.has(address)) {
			return;
		}
		const store = new DisposableStore();
		this._providerStores.set(address, store);
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
