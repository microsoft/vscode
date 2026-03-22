/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { type AgentProvider, type IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type IRootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostsSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { AgentHostSessionListController } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionListController.js';
import { ISessionsManagementService } from '../../../contrib/sessions/browser/sessionsManagementService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { AGENT_HOST_FS_SCHEME, AgentHostFileSystemProvider } from './agentHostFileSystemProvider.js';
import * as nls from '../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

/**
 * Encode a remote address into an identifier that is safe for use in
 * both URI schemes and URI authorities, and is collision-free.
 *
 * Three tiers:
 * 1. Purely alphanumeric addresses are returned as-is.
 * 2. "Normal" addresses containing only `[a-zA-Z0-9.:-]` get colons
 *    replaced with `__` (double underscore) for human readability.
 *    Addresses containing `_` skip this tier to keep the encoding
 *    collision-free (`__` can only appear from colon replacement).
 * 3. Everything else is url-safe base64-encoded with a `b64-` prefix.
 */
export function agentHostAuthority(address: string): string {
	if (/^[a-zA-Z0-9]+$/.test(address)) {
		return address;
	}
	if (/^[a-zA-Z0-9.:\-]+$/.test(address)) {
		return address.replaceAll(':', '__');
	}
	return 'b64-' + encodeBase64(VSBuffer.fromString(address), false, true);
}

/**
 * Given a sanitized URI authority, resolves the corresponding agent host
 * session target string by looking up the matching connection.
 *
 * Returns `undefined` if no connection matches the authority.
 */
export function getRemoteAgentHostSessionTarget(
	connections: readonly IRemoteAgentHostConnectionInfo[],
	authority: string,
): AgentSessionTarget | undefined {
	for (const conn of connections) {
		if (agentHostAuthority(conn.address) === authority) {
			return `remote-${agentHostAuthority(conn.address)}-copilot`;
		}
	}
	return undefined;
}

/** Per-connection state bundle, disposed when a connection is removed. */
class ConnectionState extends Disposable {
	readonly store = this._register(new DisposableStore());
	readonly clientState: SessionClientState;
	readonly agents = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	readonly modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

	constructor(
		clientId: string,
		readonly name: string | undefined,
		logService: ILogService,
	) {
		super();
		this.clientState = this.store.add(new SessionClientState(clientId, logService));
	}
}

/**
 * Discovers available agents from each connected remote agent host and
 * dynamically registers each one as a chat session type with its own
 * session handler, list controller, and language model provider.
 *
 * Uses the same unified {@link AgentHostSessionHandler} and
 * {@link AgentHostSessionListController} as the local agent host,
 * obtaining per-connection {@link IAgentConnection} instances from
 * {@link IRemoteAgentHostService.getConnection}.
 */
export class RemoteAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = this._register(new DisposableMap<string, ConnectionState>());

	/** Maps sanitized authority strings back to original addresses. */
	private readonly _fsProvider: AgentHostFileSystemProvider;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IOutputService private readonly _outputService: IOutputService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();

		// Register a single read-only filesystem provider for all remote agent
		// hosts. Individual connections are identified by the URI authority.
		this._fsProvider = this._register(this._instantiationService.createInstance(AgentHostFileSystemProvider));
		this._register(this._fileService.registerProvider(AGENT_HOST_FS_SCHEME, this._fsProvider));

		// Reconcile when connections change (added/removed/reconnected)
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._reconcileConnections();
		}));

		// Push auth token whenever the default account or sessions change
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
		this._register(this._authenticationService.onDidChangeSessions(() => this._authenticateAllConnections()));

		// Initial setup for already-connected remotes
		this._reconcileConnections();
	}

	private _reconcileConnections(): void {
		const currentAddresses = new Set(this._remoteAgentHostService.connections.map(c => c.address));

		// Remove connections no longer present
		for (const [address] of this._connections) {
			if (!currentAddresses.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
				this._connections.deleteAndDispose(address);
			}
		}

		// Add or update connections
		for (const connectionInfo of this._remoteAgentHostService.connections) {
			const existing = this._connections.get(connectionInfo.address);
			if (existing) {
				// If the name changed, tear down and re-register with new name
				if (existing.name !== connectionInfo.name) {
					this._logService.info(`[RemoteAgentHost] Name changed for ${connectionInfo.address}: ${existing.name} -> ${connectionInfo.name}`);
					this._connections.deleteAndDispose(connectionInfo.address);
					this._setupConnection(connectionInfo.address, connectionInfo.name);
				}
			} else {
				this._setupConnection(connectionInfo.address, connectionInfo.name);
			}
		}
	}

	private _setupConnection(address: string, name: string | undefined): void {
		const connection = this._remoteAgentHostService.getConnection(address);
		if (!connection) {
			return;
		}

		const connState = new ConnectionState(connection.clientId, name, this._logService);
		this._connections.set(address, connState);
		const store = connState.store;

		// Track authority -> address mapping for FS provider routing
		const authority = agentHostAuthority(address);
		store.add(this._fsProvider.registerAuthority(authority, address));

		// Forward non-session actions to client state
		store.add(connection.onDidAction(envelope => {
			if (!isSessionAction(envelope.action)) {
				connState.clientState.receiveEnvelope(envelope);
			}
			this._traceIpc(address, 'onDidAction', envelope);
		}));

		// Forward notifications to client state
		store.add(connection.onDidNotification(n => {
			connState.clientState.receiveNotification(n);
			this._traceIpc(address, 'onDidNotification', n);
		}));

		// React to root state changes (agent discovery)
		store.add(connState.clientState.onDidChangeRootState(rootState => {
			this._handleRootStateChange(address, connection, rootState);
		}));

		// Subscribe to root state
		connection.subscribe(URI.parse(ROOT_STATE_URI)).then(snapshot => {
			if (store.isDisposed) {
				return;
			}
			connState.clientState.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to subscribe to root state for ${address}`, err);
		});

		// Authenticate with this new connection
		this._authenticateWithConnection(connection);
	}

	private _handleRootStateChange(address: string, connection: IAgentConnection, rootState: IRootState): void {
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

	private _registerAgent(address: string, connection: IAgentConnection, agent: IAgentInfo, configuredName: string | undefined): void {
		// Only register copilot agents; other provider types are not supported
		if (agent.provider !== 'copilot') {
			this._logService.warn(`[RemoteAgentHost] Ignoring unsupported agent provider '${agent.provider}' from ${address}`);
			return;
		}

		const connState = this._connections.get(address);
		if (!connState) {
			return;
		}

		const agentStore = new DisposableStore();
		connState.agents.set(agent.provider, agentStore);
		connState.store.add(agentStore);

		const sanitized = agentHostAuthority(address);
		const sessionType = `remote-${sanitized}-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		const displayName = configuredName || `${agent.displayName} (${address})`;

		// Per-agent working directory cache, scoped to the agent store lifetime
		const sessionWorkingDirs = new Map<string, string>();
		agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));

		// Capture the working directory from the active session for new sessions
		const resolveWorkingDirectory = (resourceKey: string): string | undefined => {
			const cached = sessionWorkingDirs.get(resourceKey);
			if (cached) {
				return cached;
			}
			const activeSessionItem = this._sessionsManagementService.getActiveSession();
			if (activeSessionItem?.repository) {
				// The repository URI's path is the remote filesystem path
				// (set via agentHostRemotePath in the folder picker callback)
				const dir = activeSessionItem.repository.path;
				sessionWorkingDirs.set(resourceKey, dir);
				return dir;
			}
			return undefined;
		};

		// Chat session contribution
		agentStore.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
			supportsDelegation: false,
		}));

		// Session list controller (unified)
		const listController = agentStore.add(this._instantiationService.createInstance(
			AgentHostSessionListController, sessionType, agent.provider, connection, displayName));
		agentStore.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

		// Session handler (unified)
		const sessionHandler = agentStore.add(this._instantiationService.createInstance(
			AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: displayName,
			description: agent.description,
			connection,
			extensionId: 'vscode.remote-agent-host',
			extensionDisplayName: 'Remote Agent Host',
			resolveWorkingDirectory,
			resolveAuthentication: () => this._resolveAuthenticationInteractively(connection),
		}));
		agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider
		const vendorDescriptor = { vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		modelProvider.updateModels(agent.models);
		connState.modelProviders.set(agent.provider, modelProvider);
		agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
		agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
	}

	private _authenticateAllConnections(): void {
		for (const address of this._connections.keys()) {
			const connection = this._remoteAgentHostService.getConnection(address);
			if (connection) {
				this._authenticateWithConnection(connection);
			}
		}
	}

	/**
	 * Discover auth requirements from the connection's resource metadata
	 * and authenticate using matching tokens resolved via the standard
	 * VS Code authentication service (same flow as MCP auth).
	 */
	private async _authenticateWithConnection(connection: IAgentConnection): Promise<void> {
		try {
			const metadata = await connection.getResourceMetadata();
			for (const resource of metadata.resources) {
				const resourceUri = URI.parse(resource.resource);
				const token = await this._resolveTokenForResource(resourceUri, resource.authorization_servers ?? [], resource.scopes_supported ?? []);
				if (token) {
					this._logService.info(`[RemoteAgentHost] Authenticating for resource: ${resource.resource}`);
					await connection.authenticate({ resource: resource.resource, token });
				} else {
					this._logService.info(`[RemoteAgentHost] No token resolved for resource: ${resource.resource}`);
				}
			}
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Failed to authenticate with connection', err);
		}
	}

	/**
	 * Resolve a bearer token for a set of authorization servers using the
	 * standard VS Code authentication service provider resolution.
	 */
	private async _resolveTokenForResource(resourceServer: URI, authorizationServers: readonly string[], scopes: readonly string[]): Promise<string | undefined> {
		for (const server of authorizationServers) {
			const serverUri = URI.parse(server);
			const providerId = await this._authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
			if (!providerId) {
				this._logService.trace(`[RemoteAgentHost] No auth provider found for server: ${server}`);
				continue;
			}

			const sessions = await this._authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
			if (sessions.length > 0) {
				return sessions[0].accessToken;
			}
		}
		return undefined;
	}

	/**
	 * Interactively prompt the user to authenticate when the server requires it.
	 * Returns true if authentication succeeded.
	 */
	private async _resolveAuthenticationInteractively(connection: IAgentConnection): Promise<boolean> {
		try {
			const metadata = await connection.getResourceMetadata();
			for (const resource of metadata.resources) {
				for (const server of resource.authorization_servers ?? []) {
					const serverUri = URI.parse(server);
					const resourceUri = URI.parse(resource.resource);
					const providerId = await this._authenticationService.getOrActivateProviderIdForServer(serverUri, resourceUri);
					if (!providerId) {
						continue;
					}

					const scopes = [...(resource.scopes_supported ?? [])];
					const session = await this._authenticationService.createSession(providerId, scopes, {
						activateImmediate: true,
						authorizationServer: serverUri,
					});

					await connection.authenticate({
						resource: resource.resource,
						token: session.accessToken,
					});
					this._logService.info(`[RemoteAgentHost] Interactive authentication succeeded for ${resource.resource}`);
					return true;
				}
			}
		} catch (err) {
			this._logService.error('[RemoteAgentHost] Interactive authentication failed', err);
		}
		return false;
	}

	private _traceIpc(address: string, method: string, data?: unknown): void {
		if (this._logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		const channel = this._outputService.getChannel('agentHostIpc');
		if (!channel) {
			return;
		}

		const timestamp = new Date().toISOString();
		let payload: string;
		try {
			payload = data !== undefined ? JSON.stringify(data, (_key, value) => {
				if (value && typeof value === 'object' && (value as { $mid?: unknown }).$mid !== undefined && (value as { scheme?: unknown }).scheme !== undefined) {
					return URI.revive(value).toString();
				}
				return value;
			}, 2) : '';
		} catch {
			payload = String(data);
		}

		channel.append(`[${timestamp}] [trace] ** [remote:${address}] ${method}${payload ? `\n${payload}` : ''}\n`);
	}


}

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[RemoteAgentHostsSettingId]: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					address: { type: 'string', description: nls.localize('chat.remoteAgentHosts.address', "The address of the remote agent host (e.g. \"localhost:3000\").") },
					name: { type: 'string', description: nls.localize('chat.remoteAgentHosts.name', "A display name for this remote agent host.") },
					connectionToken: { type: 'string', description: nls.localize('chat.remoteAgentHosts.connectionToken', "An optional connection token for authenticating with the remote agent host.") },
				},
				required: ['address', 'name'],
			},
			description: nls.localize('chat.remoteAgentHosts', "A list of remote agent host addresses to connect to (e.g. \"localhost:3000\")."),
			default: [],
			tags: ['experimental', 'advanced'],
		},
	},
});
