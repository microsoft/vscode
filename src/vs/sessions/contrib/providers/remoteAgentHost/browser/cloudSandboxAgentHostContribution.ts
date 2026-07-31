/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Surfaces Copilot cloud sandbox (copilot-developer-cli) sessions as native agent-host sessions.
// Owns a RemoteAgentHostSessionsProvider per sandbox environment, connects on demand via
// CloudSandboxAgentHostService, and wires the live connection to the provider so the native session
// machinery can enumerate and render the host's sessions.

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	CloudSandboxEnabledSettingId,
	CloudSandboxEnvironmentOfflineError,
	cloudSandboxAddress,
	ICloudSandboxAgentHostService,
	ICloudSandboxCredentialsService,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxDiscoveryResult,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionSchemeAlias, RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
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
	readonly name: string;
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
		@ICloudSandboxCredentialsService private readonly _credentialsService: ICloudSandboxCredentialsService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
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

		// Lazy discovery: surface environment-bound sandbox sessions in the list
		// without connecting. Runs when the Agents window (re)discovers hosts and
		// once now so sessions appear on startup. Connecting happens on open via
		// the sandbox async activator.
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

		// Connect-on-open: when a seeded sandbox session is opened, the chat
		// service resolves it through this async activator, which establishes the
		// relay connection and waits for the host to advertise the session's agent
		// (so its content provider registers) before the chat loads. Scoped to our
		// sandbox authorities so it never intercepts other remote-agent-host types.
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
			result = await this._credentialsService.listSessions(token);
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
			this._ensureProvider({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
			const provider = this._providerInstances.get(address);
			const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
			const modifiedTime = Number.isNaN(parsed) ? Date.now() : parsed;
			const meta: IAgentSessionMetadata = {
				// Seed under the agent-provider (UI) scheme, preserving the session id. Mission Control
				// issues each session as `ahp-session:/<id>` (the id it also returns here), and the
				// Copilot host lists that same id back, so the seed reconciles deterministically with
				// the live `listSessions()` result on connect. See copilot-host session-identity docs.
				session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, session.sessionId),
				startTime: modifiedTime,
				modifiedTime,
				summary: session.name,
			};
			provider?.seedSessions([meta]);
		}

		// Negative reconciliation: drop environments that are no longer discoverable and aren't
		// currently connected (an open/connected session is kept so active use isn't disrupted).
		// Only a complete scan is authoritative — a partial one is missing entries that still exist.
		if (result.kind === 'complete') {
			for (const address of [...this._environments.keys()]) {
				if (present.has(address)) {
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
	 * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
	 * remove its connection + credential refresher. Used when an environment vanishes from discovery
	 * or the feature is disabled.
	 */
	private _teardownEnvironment(address: string): void {
		this._environments.delete(address);
		this._pendingConnects.delete(address);
		this._providerStores.deleteAndDispose(address);
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
		try {
			await this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name });
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${error instanceof Error ? error.message : String(error)}`);
			// TODO: render the session's history read-only and queue follow-ups instead of refusing to
			// open it. Needs a history source that does not depend on the relay.
			if (error instanceof CloudSandboxEnvironmentOfflineError) {
				this._notificationService.warn(error.message);
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
		return this._configurationService.getValue<boolean>(CloudSandboxEnabledSettingId)
			&& this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
	}

	/** Create the sessions provider for an environment if it doesn't exist yet. */
	private _ensureProvider(env: ICloudSandboxEnvironment): void {
		const address = cloudSandboxAddress(env.environmentId);
		this._environments.set(address, env);
		if (this._providerStores.has(address)) {
			return;
		}
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, {
			address,
			name: env.name,
			connectOnDemand: () => this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(() => { }),
			sessionSchemeAlias: SANDBOX_SESSION_SCHEME_ALIAS,
		});
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._providerStores.set(address, store);
		this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
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
