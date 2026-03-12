/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { AgentProvider } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type IRootState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { RemoteAgentHostSessionHandler } from './remoteAgentHostSessionHandler.js';
import { RemoteAgentHostSessionListController } from './remoteAgentHostSessionListController.js';

/**
 * Sanitize a remote address into a string usable as a URI scheme component.
 * Replaces non-alphanumeric characters with hyphens.
 */
function sanitizeAddress(address: string): string {
	return address.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Discovers available agents from each connected remote agent host and
 * dynamically registers each one as a chat session type with its own
 * session handler, list controller, and language model provider.
 */
export class RemoteAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.remoteAgentHostContribution';

	/** Per-connection state: client state + per-agent registrations. */
	private readonly _connections = new Map<string, {
		store: DisposableStore;
		clientState: SessionClientState;
		agents: Map<AgentProvider, DisposableStore>;
		modelProviders: Map<AgentProvider, AgentHostLanguageModelProvider>;
		name: string | undefined;
	}>();

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IOutputService private readonly _outputService: IOutputService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();

		// Reconcile when connections change (added/removed/reconnected)
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._reconcileConnections();
		}));

		// Push auth token whenever the default account or sessions change
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._pushAuthTokenToAll()));
		this._register(this._authenticationService.onDidChangeSessions(() => this._pushAuthTokenToAll()));

		// IPC tracing for remote agent host traffic
		this._register(this._remoteAgentHostService.onDidAction(e => {
			this._traceIpc(e.remoteAddress, 'onDidAction', e);
		}));
		this._register(this._remoteAgentHostService.onDidNotification(e => {
			this._traceIpc(e.remoteAddress, 'onDidNotification', e);
		}));

		// Initial setup for already-connected remotes
		this._reconcileConnections();
	}

	private _reconcileConnections(): void {
		const currentAddresses = new Set(this._remoteAgentHostService.connections.map(c => c.address));

		// Remove connections no longer present
		for (const [address, conn] of this._connections) {
			if (!currentAddresses.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
				conn.store.dispose();
				this._connections.delete(address);
			}
		}

		// Add new connections
		for (const connection of this._remoteAgentHostService.connections) {
			if (!this._connections.has(connection.address)) {
				this._setupConnection(connection.address, connection.clientId, connection.name);
			}
		}
	}

	private _setupConnection(address: string, clientId: string, name: string | undefined): void {
		const store = new DisposableStore();
		this._register(store);

		const clientState = store.add(new SessionClientState(clientId));
		const agents = new Map<AgentProvider, DisposableStore>();
		const modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

		this._connections.set(address, { store, clientState, agents, modelProviders, name });

		// Forward non-session actions from this remote to client state
		store.add(this._remoteAgentHostService.onDidAction(envelope => {
			if (envelope.remoteAddress !== address) {
				return;
			}
			if (!isSessionAction(envelope.action)) {
				clientState.receiveEnvelope(envelope);
			}
		}));

		// Forward notifications to client state
		store.add(this._remoteAgentHostService.onDidNotification(n => {
			if (n.remoteAddress !== address) {
				return;
			}
			clientState.receiveNotification(n.notification);
		}));

		// React to root state changes (agent discovery)
		store.add(clientState.onDidChangeRootState(rootState => {
			this._handleRootStateChange(address, rootState);
		}));

		// Subscribe to root state
		this._remoteAgentHostService.subscribe(address, ROOT_STATE_URI).then(snapshot => {
			if (store.isDisposed) {
				return;
			}
			clientState.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to subscribe to root state for ${address}`, err);
		});

		// Push auth token to this new connection
		this._pushAuthToken(address);
	}

	private _handleRootStateChange(address: string, rootState: IRootState): void {
		const conn = this._connections.get(address);
		if (!conn) {
			return;
		}

		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents no longer present
		for (const [provider, agentStore] of conn.agents) {
			if (!incoming.has(provider)) {
				agentStore.dispose();
				conn.agents.delete(provider);
				conn.modelProviders.delete(provider);
			}
		}

		// Register new agents, push model updates to existing ones
		for (const agent of rootState.agents) {
			if (!conn.agents.has(agent.provider)) {
				this._registerAgent(address, agent, conn.name);
			} else {
				const modelProvider = conn.modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(address: string, agent: IAgentInfo, configuredName: string | undefined): void {
		const conn = this._connections.get(address);
		if (!conn) {
			return;
		}

		const agentStore = new DisposableStore();
		conn.agents.set(agent.provider, agentStore);
		conn.store.add(agentStore);

		const sanitized = sanitizeAddress(address);
		const sessionType = `remote-${sanitized}-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		const displayName = configuredName || `${agent.displayName} (${address})`;

		// Chat session contribution
		agentStore.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
		}));

		// Session list controller
		const listController = agentStore.add(this._instantiationService.createInstance(
			RemoteAgentHostSessionListController, sessionType, agent.provider, address, displayName));
		agentStore.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

		// Session handler
		const sessionHandler = agentStore.add(this._instantiationService.createInstance(
			RemoteAgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: displayName,
			description: agent.description,
			address,
		}));
		agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider
		const vendorDescriptor = { vendor, displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		modelProvider.updateModels(agent.models);
		conn.modelProviders.set(agent.provider, modelProvider);
		agentStore.add(toDisposable(() => conn.modelProviders.delete(agent.provider)));
		agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
	}

	private _pushAuthTokenToAll(): void {
		for (const address of this._connections.keys()) {
			this._pushAuthToken(address);
		}
	}

	private async _pushAuthToken(address: string): Promise<void> {
		try {
			const account = await this._defaultAccountService.getDefaultAccount();
			if (!account) {
				return;
			}

			const sessions = await this._authenticationService.getSessions(account.authenticationProvider.id);
			const session = sessions.find(s => s.id === account.sessionId);
			if (session) {
				this._remoteAgentHostService.setAuthToken(address, session.accessToken);
			}
		} catch {
			// best-effort
		}
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

	override dispose(): void {
		for (const [, conn] of this._connections) {
			conn.store.dispose();
		}
		this._connections.clear();
		super.dispose();
	}
}

registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
