/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { type AgentProvider, type AuthenticateParams, type AuthenticateResult } from '../../../../../platform/agentHost/common/agent.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, getEntryAddress } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { type ProtectedResourceMetadata } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo, type RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NotificationType, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { authenticateAgentProtectedResourcesWithToken, authenticateProtectedResources, authenticateProtectedResourcesWithToken, AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, resolveAuthenticationInteractively, revokeAuthenticationForRemovedSessions } from '../agentSessions/agentHost/agentHostAuth.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from '../agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../agentSessions/agentHost/agentHostSessionHandler.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { AgentCustomizationItemProvider } from '../agentSessions/agentHost/agentCustomizationItemProvider.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IAgentHostFileSystemService } from '../../../../services/agentHost/common/agentHostFileSystemService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { createRemoteAgentHarnessDescriptor, RemoteAgentPluginController } from './remoteAgentHostCustomizationHarness.js';
import { RemoteAgentHostLogForwarder } from './remoteAgentHostLogForwarder.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostSessionPreparation } from './remoteAgentHostConnectionCustomization.js';
import { IAgentHostTerminalService } from '../../../terminal/browser/agentHostTerminalService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';
import { IRemoteAgentHostAuthenticationService } from './remoteAgentHostAuthentication.js';

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
	readonly authRecovery: AgentHostAuthenticationRecovery;
	readonly authenticationPending: ISettableObservable<boolean>;
	prepareSession: RemoteAgentHostSessionPreparation | undefined;

	constructor(
		address: string,
		readonly name: string | undefined,
		readonly connection: IAgentConnection,
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentHostAuthenticationService authenticationService: IRemoteAgentHostAuthenticationService,
	) {
		super();
		this.authRecovery = instantiationService.createInstance(AgentHostAuthenticationRecovery);
		this.authenticationPending = this._register(authenticationService.acquire(address)).object;
		this.authenticationPending.set(true, undefined);
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

	static readonly ID = 'workbench.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = this._register(new DisposableMap<string, ConnectionState>());
	private readonly _enableSmokeTestDriver: boolean;
	private readonly _isSessionsWindow: boolean;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
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
		this._isSessionsWindow = environmentService.isSessionsWindow;

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
		const currentConnections = this._remoteAgentHostService.connections.filter(connection => this._isSessionsWindow || isCloudSandboxConnectionAddress(connection.address));
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
		const connState = this._instantiationService.createInstance(ConnectionState, address, name, connection);
		this._connections.set(address, connState);
		const store = connState.store;
		connState.prepareSession = this._connectionCustomizations.get(address)?.createSessionPreparation?.(connection, store);

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
		const sessionType = remoteAgentHostSessionTypeId(sanitized, agent.provider);
		const agentId = sessionType;
		const vendor = sessionType;

		const hostLabel = configuredName || address;
		const agentLabel = agent.displayName?.trim() || agent.provider;
		const displayName = `${agentLabel} [${hostLabel}]`;

		// Per-agent working directory cache, scoped to the agent store lifetime
		const sessionWorkingDirs = new Map<string, URI>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));
		const prepareSession = connState.prepareSession;

		// Capture the working directory from the session that is being created.
		const resolveWorkingDirectory = (sessionResource: URI): URI | undefined => {
			const resourceKey = sessionResource.toString();
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const workingDirectory = this._workingDirectoryResolver.resolve(sessionResource);
			if (workingDirectory) {
				sessionWorkingDirs.set(resourceKey, workingDirectory);
				return workingDirectory;
			}
			return undefined;
		};
		const isNewSession = (sessionResource: URI): boolean => this._workingDirectoryResolver.isNewSession(sessionResource);

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
			prepareSession: prepareSession ? async (sessionResource, token) => {
				const directory = await prepareSession(resolveWorkingDirectory(sessionResource), token);
				if (directory) {
					sessionWorkingDirs.set(sessionResource.toString(), connection.resourceUris.fromAgentHost(directory));
				}
			} : undefined,
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

	/** Authenticates advertised resources and settles the shared initial loading state. */
	private async _authenticateWithConnection(address: string, connection: IAgentConnection, agents: readonly AgentInfo[]): Promise<void> {
		const connState = this._connections.get(address);
		const authTokenCache = connState?.authTokenCache;
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
			if (connState && this._connections.get(address) === connState) {
				connState.authenticationPending.set(false, undefined);
			}
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
		this._instantiationService.invokeFunction(accessor => connState.authRecovery.recover(accessor, protectedResource, {
			authTokenCache: connState.authTokenCache,
			logPrefix: '[RemoteAgentHost]',
			authenticate: this._authenticateCallback(address, connection),
		}))
			.catch(err => {
				this._logService.error(`[RemoteAgentHost] Failed to authenticate notified resource ${protectedResource.resource}`, err);
			})
			.finally(() => {
				if (this._connections.get(address) === connState) {
					connState.authenticationPending.set(false, undefined);
				}
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

type TerminalRecoveryEvent = {
	recoveredCount: number;
	totalCount: number;
};

type TerminalRecoveryClassification = {
	owner: 'osortega';
	comment: 'Tracks terminal reconnection outcomes after agent host disconnect.';
	recoveredCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of terminals successfully reconnected.' };
	totalCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of active terminals at reconnect time.' };
};

function logTerminalRecovery(telemetryService: ITelemetryService, data: TerminalRecoveryEvent): void {
	telemetryService.publicLog2<TerminalRecoveryEvent, TerminalRecoveryClassification>('vscodeAgents.terminal/recovery', data);
}
