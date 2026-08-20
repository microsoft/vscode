/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Surfaces Copilot cloud sandbox (copilot-developer-cli) sessions as native agent-host sessions.
// Owns a RemoteAgentHostSessionsProvider per sandbox environment, connects on demand via
// CloudSandboxAgentHostService, and wires the live connection to the provider so the native session
// machinery can enumerate and render the host's sessions.

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	CloudSandboxEnabledSettingId,
	cloudSandboxAddress,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	isCloudSandboxEnabled,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxDiscoveryResult,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { IReplayedTaskHistory } from '../../../../../platform/agentHost/common/taskEventReplay.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CloudSandboxReadOnlySessionHandler } from './cloudSandboxReadOnlySessionHandler.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionSchemeAlias, IRemoteAgentHostSessionsProviderConfig, RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/**
 * Mission Control creates every sandbox session as `ahp-session:/<id>` while the host advertises the
 * `copilot` agent, so the two schemes name the same session.
 */
const SANDBOX_SESSION_SCHEME_ALIAS: ISessionSchemeAlias = {
	ui: CLOUD_SANDBOX_AGENT_PROVIDER,
	backend: CLOUD_SANDBOX_SESSION_SCHEME,
};

/** A discovered sandbox environment we can create a provider for. */
interface ICloudSandboxEnvironment {
	readonly environmentId: string;
	readonly sessionId?: string;
	/**
	 * Mission Control task owning the session. Persisted AHP history is addressed per task, so this
	 * is what makes the conversation readable once the environment is unreachable.
	 */
	readonly taskId?: string;
	readonly name: string;
}

/**
 * The repository a discovered session belongs to, matching the shape the sandbox host reports once
 * connected so reconnecting does not visibly regroup the session.
 *
 * The `https` URI identifies the repository but is not backed by a file system provider, so a
 * session discovered this way cannot browse its files until it connects.
 */
function discoveredSessionProject(repoName: string | undefined): IAgentSessionMetadata['project'] {
	if (!repoName) {
		return undefined;
	}
	return { uri: URI.parse(`https://github.com/${repoName}`), displayName: repoName };
}

/**
 * A sandbox session that has just been created, connected, and surfaced on its provider — enough
 * for the caller to send the first turn into it.
 */
export interface ICloudSandboxProvisionedSession extends ICloudSandboxCreatedSession {
	readonly provider: RemoteAgentHostSessionsProvider;
	readonly session: ISession;
}

export class CloudSandboxAgentHostContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.cloudSandboxAgentHost';

	/** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
	private readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _providerStores = this._register(new DisposableMap<string>());
	/** Environment metadata keyed by connection address, for on-demand reconnect. */
	private readonly _environments = new Map<string, ICloudSandboxEnvironment>();
	/** In-flight connects keyed by address, so concurrent opens share one attempt. */
	private readonly _pendingConnects = new Map<string, Promise<string>>();
	/**
	 * Addresses being provisioned right now. A task we just created is not yet visible to a
	 * discovery pass that started before it existed, so reconciliation would see a brand-new
	 * environment as one that has vanished and tear it down mid-provision.
	 */
	private readonly _provisioning = new Set<string>();
	/**
	 * Read-only content providers standing in for unreachable environments, keyed by session type.
	 * Disposed when the environment becomes reachable again.
	 */
	private readonly _readOnlyHandlers = this._register(new DisposableMap<string>());
	/** Live handler instances, so an already-open session can be settled read-only in place. */
	private readonly _readOnlyInstances = new Map<string, CloudSandboxReadOnlySessionHandler>();
	/**
	 * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
	 * discovery and connects abort instead of committing state after teardown has run.
	 */
	private _enabledCts = new CancellationTokenSource();
	/** Serializes discovery so overlapping triggers can't interleave reconciliation. */
	private _discoveryInFlight: Promise<void> | undefined;
	private _discoveryQueued: Promise<void> | undefined;
	/** Whether discovery has completed at least once, used to stop the auth-driven retry. */
	private _hasDiscovered = false;

	constructor(
		@ICloudSandboxAgentHostService private readonly _cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
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
				if (this._isEnabled()) {
					void this._discoverAndSeed();
				} else {
					this._teardownAll();
				}
			}
		}));

		// Lazy discovery: surface environment-bound sandbox sessions in the list without connecting.
		// Connecting happens on open via the sandbox async activator.
		this._register(this._agentHostFilterService.registerDiscoveryHandler(() => this._discoverAndSeed()));
		void this._discoverAndSeed();

		// Discovery needs a GitHub session, and the auth provider is contributed by an extension that
		// may not be registered yet at startup. Retry as sessions become available, until the first
		// success; from then on the discovery handler above drives refreshes.
		const retryUntilFirstSuccess = this._register(new DisposableStore());
		const retry = () => {
			if (this._hasDiscovered) {
				retryUntilFirstSuccess.clear();
				return;
			}
			void this._discoverAndSeed();
		};
		retryUntilFirstSuccess.add(this._authenticationService.onDidChangeSessions(retry));
		retryUntilFirstSuccess.add(this._authenticationService.onDidRegisterAuthenticationProvider(retry));

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

	/**
	 * Discover environment-bound sandbox sessions and seed them into per-environment providers so
	 * they appear in the sessions list **without** connecting. Reconciles against the result:
	 * environments that have vanished from discovery (e.g. their task was archived) and are not
	 * currently connected are torn down, so stale providers/sessions don't linger. Best-effort:
	 * a failed discovery is logged and leaves existing state untouched.
	 *
	 * Runs are serialized, with at most one follow-up queued, so overlapping triggers can't
	 * interleave their reconciliation passes.
	 */
	private _discoverAndSeed(): Promise<void> {
		if (this._discoveryInFlight) {
			this._discoveryQueued ??= this._discoveryInFlight.then(() => {
				this._discoveryQueued = undefined;
				return this._discoverAndSeed();
			});
			return this._discoveryQueued;
		}
		this._discoveryInFlight = this._doDiscoverAndSeed().finally(() => {
			this._discoveryInFlight = undefined;
		});
		return this._discoveryInFlight;
	}

	private async _doDiscoverAndSeed(): Promise<void> {
		if (!this._isEnabled()) {
			return;
		}
		const token = this._enabledCts.token;
		let result: ICloudSandboxDiscoveryResult;
		try {
			result = await this._apiService.listSessions(token);
		} catch (error) {
			result = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
		}
		if (result.kind === 'failed') {
			// Not "no sessions" — leave existing state alone, and stay eligible for the auth retry.
			this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
			return;
		}
		// The feature may have been disabled while the scan was in flight.
		if (token.isCancellationRequested || !this._isEnabled()) {
			return;
		}
		this._hasDiscovered = true;

		const present = new Set<string>();
		for (const session of result.sessions) {
			if (!session.environmentId || !session.sessionId) {
				continue;
			}
			const address = cloudSandboxAddress(session.environmentId);
			present.add(address);
			this._ensureProvider({ environmentId: session.environmentId, sessionId: session.sessionId, taskId: session.taskId, name: session.name });
			const provider = this._providerInstances.get(address);
			const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
			const modifiedTime = Number.isNaN(parsed) ? Date.now() : parsed;
			const project = discoveredSessionProject(session.repoName);
			const meta: IAgentSessionMetadata = {
				// Seed under the agent-provider (UI) scheme, preserving the session id: the host
				// lists the same id back, so this reconciles with `listSessions()` on connect.
				session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, session.sessionId),
				startTime: modifiedTime,
				modifiedTime,
				summary: session.name,
				...(project ? { project } : {}),
			};
			provider?.seedSessions([meta]);
		}

		// Negative reconciliation: drop environments that are no longer discoverable and aren't
		// currently connected (an open/connected session is kept so active use isn't disrupted).
		// Only a complete scan is authoritative — a partial one is missing entries that still exist.
		if (result.kind === 'complete') {
			for (const address of [...this._environments.keys()]) {
				if (present.has(address) || this._provisioning.has(address)) {
					continue;
				}
				const connected = this._remoteAgentHostService.connections.some(c => c.address === address);
				if (!connected) {
					this._teardownEnvironment(address);
				}
			}
		}

		this._logService.info(`${LOG_PREFIX} Seeded ${present.size} discovered sandbox environment(s)${result.kind === 'partial' ? ' (partial scan; kept existing entries)' : ''}.`);
	}

	/**
	 * Remove the connection (and its credential refresher) for an environment while keeping the
	 * provider and its cached sessions visible in a disconnected state. Disposing the protocol
	 * client stops the soft-reconnect loop; the {@link CloudSandboxAgentHostService} prunes the
	 * refresher via `onDidChangeConnections`.
	 */
	private async _disconnectEnvironment(address: string): Promise<void> {
		try {
			await this._remoteAgentHostService.removeRemoteAgentHost(address);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Provision a brand-new sandbox session and make it usable: create the Mission Control task,
	 * seed it into a per-environment provider, and connect the relay.
	 *
	 * From the seed onward this matches {@link _doDiscoverAndSeed}, so a later discovery pass
	 * reconciles against the session instead of duplicating it. The caller sends the first turn.
	 */
	async provisionSession(request: ICloudSandboxCreateSessionRequest, token: CancellationToken): Promise<ICloudSandboxProvisionedSession> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		const created = await this._apiService.createSession(request, token);
		const name = request.repoNwo ?? created.taskId;
		const address = cloudSandboxAddress(created.environmentId);
		// `_teardownAll` has already snapshotted the environments it knows about, so registering a
		// provider now would leave one behind that nothing reconciles.
		if (!this._isEnabled() || token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._provisioning.add(address);
		try {
			this._ensureProvider({ environmentId: created.environmentId, sessionId: created.sessionId, taskId: created.taskId, name });

			const provider = this._providerInstances.get(address);
			if (!provider) {
				throw new Error(`No sessions provider was registered for sandbox environment ${created.environmentId}`);
			}
			const now = Date.now();
			const project = discoveredSessionProject(request.repoNwo);
			provider.seedSessions([{
				// Same identity discovery seeds under: Mission Control issues the session as
				// `ahp-session:/<id>` and the host lists that id back, so this reconciles on connect.
				session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, created.sessionId),
				startTime: now,
				modifiedTime: now,
				summary: name,
				...(project ? { project } : {}),
			}]);

			await this.connect({ environmentId: created.environmentId, sessionId: created.sessionId, name });

			// Connecting can take minutes while the sandbox wakes, and the feature can be disabled
			// (or the environment torn down) in the meantime — in which case `provider` is disposed
			// and unregistered, and handing it back would send into nothing.
			if (!this._isEnabled() || this._providerInstances.get(address) !== provider) {
				throw new CancellationError();
			}

			// The adapter `seedSessions` created addresses the session by its raw id, which is the
			// session id Mission Control just returned.
			const session = provider.getSessions().find(candidate => AgentSession.id(candidate.resource) === created.sessionId);
			if (!session) {
				throw new Error(`Provisioned sandbox session ${created.sessionId} did not surface on its provider`);
			}
			return { ...created, provider, session };
		} finally {
			this._provisioning.delete(address);
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

	/**
	 * Async-activation hook for a sandbox session type: establish the relay connection on demand,
	 * then resolve once the host advertises the agent backing this session type (its content
	 * provider is registered), so the chat can load. Returns false if the environment is unknown,
	 * the connection fails, or the agent never appears.
	 */
	private async _waitForActivation(sessionType: string): Promise<boolean> {
		const address = this._findAddressForSessionType(sessionType);
		const env = address ? this._environments.get(address) : undefined;
		if (!address || !env) {
			return false;
		}
		// Both start before any `await` so they overlap: `/connect` blocks on the compute resume and
		// can occupy its whole budget while the transcript already sits ready.
		const connecting = this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name });
		// Settled into a value so the race below can inspect it without an unhandled rejection.
		const connectOutcome = connecting.then(() => undefined, (error: unknown) => error ?? new Error('connect failed'));
		const prefetchedHistory = this._prefetchHistoryIfDormant(env);

		if (prefetchedHistory) {
			// Whichever lands first decides what the user sees. The connect keeps running either
			// way: if it lands later, `onDidChangeConnections` drops the stand-in.
			const historyFirst = await Promise.race([
				connectOutcome.then(() => undefined),
				prefetchedHistory,
			]);
			if (historyFirst && this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
				this._logService.info(`${LOG_PREFIX} History for ${address} arrived before the connect settled; opening it now.`);
				const opened = this._activateReadOnly(sessionType, address, env, prefetchedHistory);
				// On screen but undecided: a failed connect disables the composer in place.
				void connectOutcome.then(connectError => {
					if (connectError !== undefined && this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
						this._logService.info(`${LOG_PREFIX} Connect for ${address} failed after the session opened; settling it read-only.`);
						this._settleReadOnly(sessionType, address);
					}
				});
				return opened;
			}
		}

		const connectError = await connectOutcome;
		if (connectError !== undefined) {
			this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
			// Serve history whatever the reason: `/connect` fails in several ways for a deleted
			// sandbox, so gating on any one of them would leave the rest with no history.
			if (this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
				const opened = this._activateReadOnly(sessionType, address, env, prefetchedHistory);
				if (opened) {
					this._settleReadOnly(sessionType, address);
				}
				return opened;
			}
			return false;
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

	/**
	 * Persisted history for an environment that is not currently online, or `undefined` when it is
	 * online, has no task, or the read failed.
	 *
	 * `status` cannot predict whether a dormant environment will wake — suspended and deleted both
	 * read `offline` — but it does say cheaply that this open is on the slow path. Never rejects.
	 */
	private _prefetchHistoryIfDormant(env: ICloudSandboxEnvironment): Promise<IReplayedTaskHistory | undefined> | undefined {
		const taskId = env.taskId;
		if (!taskId) {
			return undefined;
		}
		const token = this._enabledCts.token;
		return (async () => {
			try {
				const record = await this._apiService.getEnvironment(env.environmentId, token);
				if (record.status === 'online') {
					return undefined;
				}
				this._logService.trace(`${LOG_PREFIX} Environment ${env.environmentId} is '${record.status}'; prefetching history in case the connect does not land.`);
				return await this._apiService.getSessionHistory(taskId, token);
			} catch (error) {
				this._logService.trace(`${LOG_PREFIX} History prefetch for ${env.environmentId} did not complete: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			}
		})();
	}

	/**
	 * Register a content provider that serves this session from replayed history.
	 *
	 * Deliberately does *not* mark the session read-only: this also runs while a connect is in
	 * flight and the environment may yet wake — callers settle it via {@link _settleReadOnly}.
	 * Returns `true` once registered, which is what lets `canResolveChatSession` proceed, or `false`
	 * when there is no task to read history from.
	 */
	private _activateReadOnly(sessionType: string, address: string, env: ICloudSandboxEnvironment, prefetchedHistory?: Promise<IReplayedTaskHistory | undefined>): boolean {
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
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, handler));
		this._readOnlyHandlers.set(sessionType, store);
		this._readOnlyInstances.set(sessionType, handler);
		store.add(toDisposable(() => this._readOnlyInstances.delete(sessionType)));
		this._logService.info(`${LOG_PREFIX} Serving ${sessionType} from Mission Control history.`);
		return true;
	}

	/**
	 * Settle a history-backed session as read-only once the connect has failed. Sessions already on
	 * screen observe this and disable their composer in place, without needing a reopen.
	 */
	private _settleReadOnly(sessionType: string, address: string): void {
		const handler = this._readOnlyInstances.get(sessionType);
		if (!handler) {
			// The live handler owns this session type, so there is nothing being served from
			// history to settle — and forcing the host read-only here would be wrong.
			return;
		}
		handler.markReadOnly();
		// The transcript is real, but there is no host left to send to.
		this._providerInstances.get(address)?.setReadOnly(true);
	}

	/**
	 * Drop any read-only stand-in for an address so the live handler can own the session type.
	 * Registering two content providers for one session type throws, so this must run before a
	 * connection is established rather than after.
	 */
	private _clearReadOnly(address: string): void {
		this._providerInstances.get(address)?.setReadOnly(false);
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
				// `onDidChangeConnections` fires from addManagedConnection and wires the
				// provider; call _wireConnections directly too in case it already fired.
				this._wireConnections();
				return result;
			} finally {
				this._pendingConnects.delete(address);
			}
		})();
		this._pendingConnects.set(address, attempt);
		return attempt;
	}

	private _isEnabled(): boolean {
		return isCloudSandboxEnabled(this._configurationService);
	}

	/** Create the sessions provider for an environment if it doesn't exist yet. */
	private _ensureProvider(env: ICloudSandboxEnvironment): void {
		const address = cloudSandboxAddress(env.environmentId);
		// `connect()` reaches here with only the fields its caller had, so preserve anything
		// discovery already resolved — notably the task id that makes history readable offline.
		const known = this._environments.get(address);
		this._environments.set(address, { ...known, ...env, taskId: env.taskId ?? known?.taskId });
		if (this._providerStores.has(address)) {
			return;
		}
		const store = new DisposableStore();
		const provider = this._instantiateProvider({
			address,
			name: env.name,
			connectOnDemand: () => this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(() => { }),
			sessionSchemeAlias: SANDBOX_SESSION_SCHEME_ALIAS,
			// Each sandbox is its own provider named after its task, so the `[host]` suffix would
			// put every session in a workspace group of one.
			omitHostFromWorkspaceLabel: true,
			// A sandbox is a disposable remote environment, not a checkout on disk.
			workspaceTypeIcon: Codicon.package,
		});
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._providerStores.set(address, store);
		this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
	}

	/**
	 * Provider construction seam so tests can observe each provider's configuration.
	 */
	protected _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): RemoteAgentHostSessionsProvider {
		return this._instantiationService.createInstance(RemoteAgentHostSessionsProvider, config);
	}

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
			} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}
}
