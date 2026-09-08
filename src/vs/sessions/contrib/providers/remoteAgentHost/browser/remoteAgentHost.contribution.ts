/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { type AgentProvider, type AuthenticateParams, type AuthenticateResult } from '../../../../../platform/agentHost/common/agent.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, getEntryAddress } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TunnelAgentHostsSettingId } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { WslAutoStartSettingId } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { CloudSandboxEnabledSettingId } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentHostLocalFilePermissionsSettingId } from '../../../../../platform/agentHost/common/agentHostResourceService.js';
import { type ProtectedResourceMetadata } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NotificationType, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { OpenAgentHostStateFileAction } from '../../agentHost/browser/openAgentHostStateFileAction.js';
import { authenticateAgentProtectedResourcesWithToken, authenticateProtectedResources, authenticateProtectedResourcesWithToken, AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, resolveAuthenticationInteractively, revokeAuthenticationForRemovedSessions } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IAgentHostFileSystemService } from '../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { createRemoteAgentHarnessDescriptor, RemoteAgentPluginController } from './remoteAgentHostCustomizationHarness.js';
import { RemoteAgentHostLogForwarder } from './remoteAgentHostLogForwarder.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentHostTerminalService } from '../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logTerminalRecovery } from '../../../../common/sessionsTelemetry.js';

Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
	matchSessionType: sessionType => isRemoteAgentHostSessionType(sessionType),
	waitForActivation: waitForRemoteAgentHostActivation,
});

async function waitForRemoteAgentHostActivation(accessor: ServicesAccessor, sessionType: string): Promise<boolean> {
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const address = getAddressForSessionType(sessionType, remoteAgentHostService);
	if (!address) {
		return false;
	}

	while (true) {
		const connection = remoteAgentHostService.getConnection(address);
		if (connection) {
			const rootState = connection.rootState.value;
			if (rootState instanceof Error) {
				return false;
			}
			if (rootState) {
				const authority = agentHostAuthority(address);
				return rootState.agents.some(agent => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
			}

			await Promise.race([
				Event.toPromise(connection.rootState.onDidChange),
				Event.toPromise(remoteAgentHostService.onDidChangeConnections),
			]);
			continue;
		}

		const connectionInfo = remoteAgentHostService.connections.find(connection => connection.address === address);
		if (connectionInfo
			&& !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo.status)
			&& !RemoteAgentHostConnectionStatus.isReconnecting(connectionInfo.status)) {
			return false;
		}

		if (!connectionInfo && !remoteAgentHostService.configuredEntries.some(entry => getEntryAddress(entry) === address)) {
			return false;
		}

		await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
	}
}

function getAddressForSessionType(sessionType: string, remoteAgentHostService: IRemoteAgentHostService): string | undefined {
	const authorities = new Map<string, string>();
	for (const connection of remoteAgentHostService.connections) {
		authorities.set(agentHostAuthority(connection.address), connection.address);
	}
	for (const entry of remoteAgentHostService.configuredEntries) {
		const address = getEntryAddress(entry);
		authorities.set(agentHostAuthority(address), address);
	}

	const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, authorities.keys());
	return authority ? authorities.get(authority) : undefined;
}

/** Per-connection state bundle, disposed when a connection is removed. */
class ConnectionState extends Disposable {
	readonly store = this._register(new DisposableStore());
	readonly agents = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	readonly modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();
	/** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
	readonly authTokenCache = new AgentHostAuthTokenCache();
	readonly authRecovery = new AgentHostAuthenticationRecovery();

	constructor(
		readonly name: string | undefined,
		readonly connection: IAgentConnection,
	) {
		super();
	}
}

/**
 * Discovers available agents from each connected remote agent host and
 * dynamically registers each one as a chat session type with its own
 * session handler and language model provider.
 *
 * Uses the same unified {@link AgentHostSessionHandler} as the local
 * agent host, obtaining per-connection {@link IAgentConnection}
 * instances from {@link IRemoteAgentHostService.getConnection}.
 */
export class RemoteAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = this._register(new DisposableMap<string, ConnectionState>());
	private readonly _enableSmokeTestDriver: boolean;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostFileSystemService private readonly _agentHostFileSystemService: IAgentHostFileSystemService,
		@ICustomizationHarnessService private readonly _customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
		this._register(this._authenticationService.onDidRegisterAuthenticationProvider(() => this._authenticateAllConnections()));
		this._register(this._authenticationService.onDidChangeSessions(event => {
			void this._handleAuthenticationSessionsChanged(event.providerId, event.event.removed ?? []);
		}));

		this._reconcile();
	}

	private _reconcile(): void {
		this._reconcileConnections();
	}

	private _reconcileConnections(): void {
		const currentConnections = this._remoteAgentHostService.connections;
		const connectedAddresses = new Set(
			currentConnections
				.filter(c => RemoteAgentHostConnectionStatus.isConnected(c.status) && c.clientId !== undefined)
				.map(c => c.address)
		);
		const allAddresses = new Set(currentConnections.map(c => c.address));

		// Remove contribution state for connections that are no longer present at all
		for (const [address] of this._connections) {
			if (!allAddresses.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
				this._connections.deleteAndDispose(address);
			} else if (!connectedAddresses.has(address)) {
				// Connection exists but is not connected (reconnecting or disconnected).
				// Keep the contribution state while the connection restores.
			}
		}

		// Add or update connections
		for (const connectionInfo of currentConnections) {
			// Only set up contribution state for connected entries
			if (!RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status) || connectionInfo.clientId === undefined) {
				continue;
			}
			const existing = this._connections.get(connectionInfo.address);
			if (existing) {
				const nameChanged = existing.name !== connectionInfo.name;
				const clientIdChanged = existing.connection.clientId !== connectionInfo.clientId;

				// If the name or clientId changed, tear down and re-register
				if (nameChanged || clientIdChanged) {
					this._logService.info(`[RemoteAgentHost] Reconnecting contribution for ${connectionInfo.address}: oldClientId=${existing.connection.clientId}, newClientId=${connectionInfo.clientId}, nameChanged=${nameChanged}`);
					const oldClientId = existing.connection.clientId;
					this._connections.deleteAndDispose(connectionInfo.address);
					this._setupConnection(connectionInfo);

					// Reconnect active terminals only when the backing
					// client changed. Name-only updates don't invalidate
					// subscriptions and would cause unnecessary buffer
					// clear/replay flicker.
					if (clientIdChanged) {
						const newConnection = this._remoteAgentHostService.getConnection(connectionInfo.address);
						if (newConnection) {
							this._agentHostTerminalService.reconnectTerminals(newConnection, oldClientId).then(
								({ recovered, total }) => {
									if (total > 0) {
										this._logService.info(`[RemoteAgentHost] Terminal reconnection: ${recovered}/${total} recovered`);
										logTerminalRecovery(this._telemetryService, { recoveredCount: recovered, totalCount: total });
									}
								},
								err => this._logService.warn('[RemoteAgentHost] Terminal reconnection failed', err)
							);
						}
					}
				}
			} else {
				this._setupConnection(connectionInfo);
			}
		}
	}

	private _setupConnection(connectionInfo: IRemoteAgentHostConnectionInfo): void {
		const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
		if (!connection) {
			return;
		}

		const { address, name } = connectionInfo;
		const connState = this._instantiationService.createInstance(ConnectionState, name, connection);
		this._connections.set(address, connState);
		const store = connState.store;

		// Bridge the host's OTLP logs channel into a dedicated workbench
		// Output channel (`Agent Host (${name})`). Concrete clients
		// returned by `IRemoteAgentHostService.getConnection` are always
		// `AgentHostProtocolClient` instances — `IAgentConnection`
		// erases the concrete type, so cast here at the integration
		// point rather than polluting that interface with OTLP-specific
		// surface.
		store.add(this._instantiationService.createInstance(
			RemoteAgentHostLogForwarder,
			connection as AgentHostProtocolClient,
			address,
			name || address,
		));

		// Track authority -> connection mapping for FS provider routing
		const authority = agentHostAuthority(address);
		store.add(this._agentHostFileSystemService.registerAuthority(authority, connection));

		// React to root state changes (agent discovery)
		store.add(connection.rootState.onDidChange(rootState => {
			this._handleRootStateChange(address, connection, rootState);
		}));
		store.add(connection.onDidNotification(notification => this._handleAuthenticationRequiredNotification(address, connection, notification)));

		// If root state is already available, process it immediately
		const initialRootState = connection.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(address, connection, initialRootState);
		}

	}

	private _handleRootStateChange(address: string, connection: IAgentConnection, rootState: RootState): void {
		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents no longer present
		for (const [provider] of connState.agents) {
			if (!incoming.has(provider)) {
				connState.agents.deleteAndDispose(provider);
				connState.modelProviders.delete(provider);
			}
		}

		// Authenticate using protectedResources from agent info
		this._authenticateWithConnection(address, connection, rootState.agents)
			.catch(() => { /* best-effort */ });

		// Register new agents, push model updates to existing ones
		for (const agent of rootState.agents) {
			if (!connState.agents.has(agent.provider)) {
				this._registerAgent(address, connection, agent, connState.name);
			} else {
				const modelProvider = connState.modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(address: string, connection: IAgentConnection, agent: AgentInfo, configuredName: string | undefined): void {
		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const agentStore = new DisposableStore();
		connState.agents.set(agent.provider, agentStore);
		connState.store.add(agentStore);

		const sanitized = agentHostAuthority(address);
		const providerId = `agenthost-${sanitized}`;
		const sessionType = remoteAgentHostSessionTypeId(sanitized, agent.provider);
		const agentId = sessionType;
		const vendor = sessionType;

		// User-facing display name for this agent. We always include the
		// agent's own name so that a host exposing multiple agents (e.g.
		// `copilot` + `openai` from the same machine) produces distinct
		// labels instead of collapsing to a single `configuredName`.
		const hostLabel = configuredName || address;
		const agentLabel = agent.displayName?.trim() || agent.provider;
		const displayName = `${agentLabel} [${hostLabel}]`;

		// Per-agent working directory cache, scoped to the agent store lifetime
		const sessionWorkingDirs = new Map<string, URI>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));

		// Capture the working directory from the session that is being created.
		const resolveWorkingDirectory = (sessionResource: URI): URI | undefined => {
			const resourceKey = sessionResource.toString();
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
			const session = provider?.getSessionByResource(sessionResource);
			const workingDirectory = session?.workspace.get()?.folders[0]?.workingDirectory;
			if (workingDirectory) {
				sessionWorkingDirs.set(resourceKey, workingDirectory);
				return workingDirectory;
			}
			return undefined;
		};
		const isNewSession = (sessionResource: URI): boolean => {
			const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
			return provider?.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
		};

		// Chat session contribution
		agentStore.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
			supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
			agentHostProviderId: agent.provider,
			supportsDelegation: false,
			capabilities: {
				supportsCheckpoints: true,
				supportsPromptAttachments: true,
				supportsImageAttachments: true,
				get terminalCommandPrefix() {
					return connection.initializeResult.get()?.terminalCommandPrefix;
				}
			},
		}));

		// Customization harness for this remote agent
		const pluginController = agentStore.add(this._instantiationService.createInstance(RemoteAgentPluginController,
			hostLabel,
			sanitized,
			connection,
		));

		const syncProvider = this._activeClientService.getSyncProvider(sessionType);
		// The management UI remains ambient while individual sessions use their working-directory scopes.
		const ambientScope = agentStore.add(this._activeClientService.acquireScope(sessionType, []));

		const itemProvider = agentStore.add(this._instantiationService.createInstance(AgentCustomizationItemProvider,
			sanitized,
			(customization, clientId) => {
				if (clientId !== undefined) {
					// Customization came from the client; we don't allow actions on these since they're read-only reflections of client state.
					return undefined;
				}
				return [{
					id: 'remoteAgentHost.removeConfiguredPlugin',
					label: nls.localize('remoteAgentHost.removeConfiguredPlugin', "Remove from Remote Host"),
					icon: Codicon.trash,
					run: () => pluginController.removeConfiguredPlugin(customization),
				}];
			},
			syncedUri => this._activeClientService.getOrigin(syncedUri)
		));
		itemProvider.setDraftCustomAgents(ambientScope.customAgents);
		itemProvider.setDraftCustomizations(ambientScope.customizations);

		const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, pluginController, itemProvider, syncProvider);
		agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));

		// Session handler (unified)
		const sessionHandler = agentStore.add(this._instantiationService.createInstance(
			AgentHostSessionHandler, {
			provider: agent.provider,
			backendSessionScheme: this._connectionCustomizations.get(address)?.backendSessionScheme?.(agent.provider),
			agentId,
			sessionType,
			fullName: displayName,
			description: agent.description,
			connection,
			connectionAuthority: sanitized,
			extensionId: 'vscode.remote-agent-host',
			extensionDisplayName: 'Remote Agent Host',
			resolveWorkingDirectory,
			isNewSession,
			resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(address, connection, resources),
		}));
		agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider.
		// Order matters: `updateModels` must be called after
		// `registerLanguageModelProvider` so the initial `onDidChange` is observed.
		const vendorDescriptor = { vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor, this._languageModelsService));
		connState.modelProviders.set(agent.provider, modelProvider);
		agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
		agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
		modelProvider.updateModels(agent.models);

		this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
	}

	private _authenticateAllConnections(): void {
		for (const [address, connState] of this._connections) {
			const rootState = connState.connection.rootState.value;
			if (rootState && !(rootState instanceof Error)) {
				this._authenticateWithConnection(address, connState.connection, rootState.agents).catch(() => { /* best-effort */ });
			}
		}
	}

	private async _handleAuthenticationSessionsChanged(providerId: string, removedSessions: readonly AuthenticationSession[]): Promise<void> {
		if (removedSessions.length > 0) {
			for (const [address, connState] of this._connections) {
				const rootState = connState.connection.rootState.value;
				if (!rootState || rootState instanceof Error) {
					continue;
				}
				try {
					await this._instantiationService.invokeFunction(revokeAuthenticationForRemovedSessions, rootState.agents, providerId, removedSessions, {
						authTokenCache: connState.authTokenCache,
						logPrefix: '[RemoteAgentHost]',
						authenticate: this._authenticateCallback(address, connState.connection),
					});
				} catch (error) {
					this._logService.error(`[RemoteAgentHost] Failed to revoke removed authentication session for ${address}`, error);
				}
			}
		}
		this._authenticateAllConnections();
	}

	/**
	 * Authenticate using protectedResources from agent info in root state.
	 * Resolves tokens via the standard VS Code authentication service.
	 *
	 * Marks the matching provider's `authenticationPending` observable while
	 * the auth pass is in flight so that sessions surface as still loading.
	 */
	private async _authenticateWithConnection(address: string, connection: IAgentConnection, agents: readonly AgentInfo[]): Promise<void> {
		const providerId = `agenthost-${agentHostAuthority(address)}`;
		const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
		const authTokenCache = this._connections.get(address)?.authTokenCache;
		provider?.setAuthenticationPending(true);
		try {
			const testToken = this._getScenarioAutomationToken();
			if (testToken !== undefined) {
				await authenticateAgentProtectedResourcesWithToken(agents, testToken, {
					authTokenCache,
					authenticate: this._authenticateCallback(address, connection),
				});
				return;
			}
			await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
				authTokenCache,
				logPrefix: '[RemoteAgentHost]',
				authenticate: this._authenticateCallback(address, connection),
			});
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Failed to authenticate with connection', err);
		} finally {
			provider?.setAuthenticationPending(false);
		}
	}

	private _getScenarioAutomationToken(): string | undefined {
		if (!this._enableSmokeTestDriver) {
			return undefined;
		}
		const token = this._configurationService.getValue('chat.agentHost.unsafeTestToken');
		return typeof token === 'string' && token.length > 0 ? token : undefined;
	}

	private _handleAuthenticationRequiredNotification(address: string, connection: IAgentConnection, notification: INotification): void {
		if (notification.type !== NotificationType.AuthRequired) {
			return;
		}
		this._authenticateNotificationResource(address, connection, notification.resource);
	}

	private _authenticateNotificationResource(address: string, connection: IAgentConnection, protectedResource: ProtectedResourceMetadata): void {
		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}
		const providerId = `agenthost-${agentHostAuthority(address)}`;
		const provider = this._sessionsProvidersService.getProvider<RemoteAgentHostSessionsProvider>(providerId);
		provider?.setAuthenticationPending(true);
		this._instantiationService.invokeFunction(accessor => connState.authRecovery.recover(accessor, protectedResource, {
			authTokenCache: connState.authTokenCache,
			logPrefix: '[RemoteAgentHost]',
			authenticate: this._authenticateCallback(address, connection),
		}))
			.catch(err => {
				this._logService.error(`[RemoteAgentHost] Failed to authenticate notified resource ${protectedResource.resource}`, err);
			})
			.finally(() => {
				provider?.setAuthenticationPending(false);
			});
	}

	/**
	 * Build the `authenticate` callback for a connection. Host-agnostic by default (forwards the
	 * request unchanged); a connection kind may inject a token transform via
	 * {@link IRemoteAgentHostConnectionCustomizationService} — e.g. cloud sandbox connections, whose
	 * host rejects plaintext bearers over the relay (`-32602`) and requires a Mission-Control-sealed
	 * envelope. The transform owns fail-closed validation, so a raw token can never reach the host.
	 */
	private _authenticateCallback(address: string, connection: IAgentConnection): (request: AuthenticateParams) => Promise<AuthenticateResult> {
		const transform = this._connectionCustomizations.get(address)?.authenticate;
		if (!transform) {
			return request => connection.authenticate(request);
		}
		return async request => {
			// An empty token is the protocol's revocation sentinel, not a credential.
			// Token transforms substitute a live credential for an unsealed one, which
			// would turn a sign-out into a re-authentication and leave the remote host
			// holding a credential the user just revoked.
			if (!request.token) {
				return connection.authenticate(request);
			}
			return connection.authenticate(await transform(request));
		};
	}

	/**
	 * Interactively prompt the user to authenticate when the user starts a session.
	 * Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(address: string, connection: IAgentConnection, protectedResources: readonly ProtectedResourceMetadata[]): Promise<boolean> {
		const authTokenCache = this._connections.get(address)?.authTokenCache;
		const testToken = this._getScenarioAutomationToken();
		if (testToken !== undefined) {
			await authenticateProtectedResourcesWithToken(protectedResources, testToken, {
				authTokenCache,
				authenticate: this._authenticateCallback(address, connection),
			});
			return protectedResources.length > 0;
		}
		return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
			authTokenCache,
			logPrefix: '[RemoteAgentHost]',
			authenticate: this._authenticateCallback(address, connection),
		});
	}
}

registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);

registerAction2(OpenAgentHostStateFileAction);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.enabled', "Enable connecting to remote agent hosts."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostAutoConnectSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.remoteAgentHosts.autoConnect', "Automatically connect to online dev tunnel, SSH, and WSL remote agent hosts on startup. When disabled, cached sessions are still shown but connections are established only on demand."),
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		// Off by default: sandbox tasks currently carry the `copilot-developer-cli` slug, which the
		// Copilot extension's cloud provider does not list, so the two do not overlap. That slug is
		// expected to change, at which point both providers would list the same task — see
		// `CLOUD_SANDBOX_AGENT_SLUG`.
		[CloudSandboxEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.cloudSandbox.enabled', "Enable Copilot cloud sandbox sessions over a live Agent Host Protocol relay, for slash commands and a responsive, steerable experience instead of only polling logs. Adds a Sandbox option when starting a cloud session, and connects to the sandbox when opening one."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			experiment: { mode: 'auto' },
		},
		'chat.sshRemoteAgentHostCommand': {
			type: 'string',
			description: nls.localize('chat.sshRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.wslRemoteAgentHostCommand': {
			type: 'string',
			description: nls.localize('chat.wslRemoteAgentHostCommand', "For development: Override the command used to start the remote agent host in WSL. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		'chat.agentHost.forwardSSHAgent': {
			type: 'boolean',
			description: nls.localize('chat.agentHost.forwardSSHAgent', "When enabled, forwards the local SSH agent to the remote machine during SSH agent host connections to hosts whose SSH config has `ForwardAgent yes`. Only enable this for trusted hosts. The remote agent host process must be restarted for this setting to take effect."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[WslAutoStartSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.wsl.autoStart', "Automatically start a WSL distribution when opening a chat whose distribution is not running. When disabled, the chat shows a Start button instead."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[RemoteAgentHostsSettingId]: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					address: { type: 'string', description: nls.localize('chat.remoteAgentHosts.address', "The WebSocket address of the remote agent host (e.g. \"localhost:3000\").") },
					name: { type: 'string', description: nls.localize('chat.remoteAgentHosts.name', "A display name for this remote agent host.") },
					connectionToken: { type: 'string', description: nls.localize('chat.remoteAgentHosts.connectionToken', "An optional connection token for authenticating with the remote agent host.") },
				},
				required: ['address', 'name'],
			},
			description: nls.localize('chat.remoteAgentHosts', "A list of WebSocket remote agent host addresses to connect to (e.g. \"localhost:3000\"). SSH remote agent host details are managed by VS Code."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[TunnelAgentHostsSettingId]: {
			type: 'array',
			items: { type: 'string' },
			description: nls.localize('chat.remoteAgentTunnels', "Additional dev tunnel names to look for when connecting to remote agent hosts. These are looked up in addition to tunnels automatically enumerated from your account."),
			default: [],
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostLocalFilePermissionsSettingId]: {
			type: 'object',
			description: nls.localize('chat.agentHost.localFilePermissions', "Per-host filesystem grants for remote agent hosts. Maps a remote agent host address to URI strings and the access mode the host has been granted (`r` for read, `rw` for read and write). Hosts cannot read or write any files outside the granted URIs without prompting; a URI grant covers descendants. This setting is normally maintained by the agent-host permission prompts and rarely edited by hand."),
			additionalProperties: {
				type: 'object',
				additionalProperties: {
					oneOf: [
						{
							type: 'string',
							enum: ['r', 'rw'],
							enumDescriptions: [
								nls.localize('chat.agentHost.localFilePermissions.read', "Read-only access."),
								nls.localize('chat.agentHost.localFilePermissions.readWrite', "Read and write access."),
							],
						},
						{
							type: 'object',
							properties: {
								mode: {
									type: 'string',
									enum: ['r', 'rw'],
								},
								lexicalUri: {
									type: 'string',
									description: nls.localize('chat.agentHost.localFilePermissions.lexicalUri', "Original resource URI used to display accessible directory entries."),
								},
							},
							required: ['mode', 'lexicalUri'],
							additionalProperties: false,
						},
					],
				},
			},
			default: {},
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
		},
	},
});

// Side-effect registrations for the remote agent host feature
import './remoteAgentHostActions.js';
import './manageRemoteAgentHosts.js';
import '../../agentHost/browser/agentHostAgentPicker.js';
import { AgentCustomizationItemProvider } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { Codicon } from '../../../../../base/common/codicons.js';
