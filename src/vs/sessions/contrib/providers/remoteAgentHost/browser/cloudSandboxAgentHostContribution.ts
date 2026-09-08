/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Surfaces Copilot cloud sandbox (copilot-developer-cli) sessions as native agent-host sessions.
// Owns a CloudSandboxSessionsProvider per sandbox environment, connects on demand via
// CloudSandboxAgentHostService, and wires the live connection to the provider so the native session
// machinery can enumerate and render the host's sessions.

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
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
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
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
import { IAgentHostConnectionLabels, IAgentHostGroup } from '../../../../common/agentHostSessionsProvider.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostSessionSchemeAlias } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRemoteAgentHostSessionsProviderConfig } from './remoteAgentHostSessionsProvider.js';
import { CloudSandboxSessionsProvider } from './cloudSandboxSessionsProvider.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';

/**
 * Mission Control creates every sandbox session as `ahp-session:/<id>` while the host advertises the
 * `copilot` agent, so the two schemes name the same session.
 */
const SANDBOX_SESSION_SCHEME_ALIAS: IAgentHostSessionSchemeAlias = {
	ui: CLOUD_SANDBOX_AGENT_PROVIDER,
	backend: CLOUD_SANDBOX_SESSION_SCHEME,
};

/**
 * Folds every sandbox environment into one "GitHub Sandboxes" entry in the host
 * filter. Sandboxes are not connectable: one connects when a session of it is
 * opened, so a manual toggle would act on nothing the user pointed at. The icon
 * is left to the default so the entry reads like every other host.
 */
const CLOUD_SANDBOX_HOST_GROUP: IAgentHostGroup = {
	id: 'githubsandbox',
	label: localize('githubSandbox.hostGroup', "GitHub Sandboxes"),
	order: 1,
	connectable: false,
};

/** Names the environment rather than the task used as the provider's display name. */
const CLOUD_SANDBOX_CONNECTION_LABELS: IAgentHostConnectionLabels = {
	unavailableTitle: localize('cloudSandbox.offlineTitle', "Environment Offline"),
	unavailable: localize('cloudSandbox.offline', "Environment offline."),
	connectingTitle: localize('cloudSandbox.connectingTitle', "Connecting to the Environment"),
	connecting: localize('cloudSandbox.connecting', "Connecting..."),
	reconnecting: localize('cloudSandbox.reconnecting', "Reconnecting..."),
	reconnectingIn: seconds => localize('cloudSandbox.reconnectingIn', "Reconnecting in {0}s", seconds),
	incompatibleTitle: localize('cloudSandbox.incompatibleTitle', "Cannot Connect to the Environment"),
	incompatible: localize('cloudSandbox.incompatible', "This environment is incompatible with this version of Visual Studio Code."),
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
	readonly provider: CloudSandboxSessionsProvider;
	readonly session: ISession;
}

export class CloudSandboxAgentHostContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.cloudSandboxAgentHost';

	/** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
	private readonly _providerInstances = new Map<string, CloudSandboxSessionsProvider>();
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
	/**
	 * Keeps the "GitHub Sandboxes" filter entry present for as long as the feature is on, so the
	 * place is visible and selectable before the user has any sandbox session to put in it.
	 */
	private readonly _hostGroupRegistration = this._register(new MutableDisposable());

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
				this._updateHostGroupRegistration();
				if (this._isEnabled()) {
					void this._discoverAndSeed();
				} else {
					this._teardownAll();
				}
			}
		}));

		this._updateHostGroupRegistration();

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
				const connected = this._remoteAgentHostService.connections.some(
					c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status));
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
		let seededProvider: CloudSandboxSessionsProvider | undefined;
		try {
			this._ensureProvider({ environmentId: created.environmentId, sessionId: created.sessionId, taskId: created.taskId, name });

			const provider = this._providerInstances.get(address);
			if (!provider) {
				throw new Error(`No sessions provider was registered for sandbox environment ${created.environmentId}`);
			}
			const now = Date.now();
			const project = discoveredSessionProject(request.repoNwo);
			provider.seedProvisionalSession({
				// Same identity discovery seeds under: Mission Control issues the session as
				// `ahp-session:/<id>` and the host lists that id back, so this reconciles on connect.
				session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, created.sessionId),
				startTime: now,
				modifiedTime: now,
				summary: name,
				...(project ? { project } : {}),
			});
			seededProvider = provider;

			await this.connect({ environmentId: created.environmentId, sessionId: created.sessionId, name });

			// Connecting can take minutes while the sandbox wakes, and the feature can be disabled
			// (or the environment torn down) in the meantime — in which case `provider` is disposed
			// and unregistered, and handing it back would send into nothing.
			if (!this._isEnabled() || this._providerInstances.get(address) !== provider) {
				throw new CancellationError();
			}

			// The adapter `seedSessions` created addresses the session by its raw id, which is the
			// session id Mission Control just returned, and `getSessions` withholds it until
			// the caller publishes it.
			const session = provider.getCachedSession(created.sessionId);
			if (!session) {
				throw new Error(`Provisioned sandbox session ${created.sessionId} did not surface on its provider`);
			}
			return { ...created, provider, session };
		} catch (error) {
			// The task exists remotely, and nothing else clears a withheld seed.
			if (seededProvider && this._providerInstances.get(address) === seededProvider) {
				seededProvider.publishWithheldSession(created.sessionId);
			}
			throw error;
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
	private async _isEnvironmentOnline(env: ICloudSandboxEnvironment, token: CancellationToken): Promise<boolean> {
		try {
			const record = await this._apiService.getEnvironment(env.environmentId, token);
			return record.status === 'online';
		} catch (error) {
			this._logService.trace(`${LOG_PREFIX} Could not read the state of ${env.environmentId}; treating it as not online: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/** Reads history from Mission Control without connecting to the sandbox. */
	private _fetchTaskHistory(env: ICloudSandboxEnvironment, token: CancellationToken): Promise<IReplayedTaskHistory | undefined> | undefined {
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

	private _isEnabled(): boolean {
		return isCloudSandboxEnabled(this._configurationService);
	}

	/**
	 * Keep the host filter entry in step with the feature toggles. The entry stands on its own —
	 * it is there whether or not discovery has found any environment — so a user with the feature
	 * on but no tasks yet can still see and select the place their sandboxes will appear in.
	 */
	private _updateHostGroupRegistration(): void {
		if (!this._isEnabled()) {
			this._hostGroupRegistration.clear();
		} else if (!this._hostGroupRegistration.value) {
			this._hostGroupRegistration.value = this._agentHostFilterService.registerHostGroup(CLOUD_SANDBOX_HOST_GROUP);
		}
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
			// The sandbox agent edits without committing, so `branch` is always empty.
			defaultChangesetKind: ChangesetKind.Session,
			// Each sandbox is its own provider named after its task, so the `[host]` suffix would
			// put every session in a workspace group of one.
			omitHostFromWorkspaceLabel: true,
			// A sandbox is a disposable remote environment, not a checkout on disk.
			workspaceTypeIcon: Codicon.package,
			// The sandbox has to be resumed before it can be sent to, and a resume is not
			// guaranteed to succeed, so an offline session is read-only until it reconnects
			// rather than accepting input that would queue against an environment that may
			// never come back.
			readOnlyWhenDisconnected: true,
			connectionLabels: CLOUD_SANDBOX_CONNECTION_LABELS,
			hostGroup: CLOUD_SANDBOX_HOST_GROUP,
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
	protected _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		return this._instantiationService.createInstance(CloudSandboxSessionsProvider, config);
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
