/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentHostService, AgentHostEnabledSettingId, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI, type IAgentInfo, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from '../../../../../services/output/common/output.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { AgentHostLanguageModelProvider } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';

export { AgentHostSessionHandler } from './agentHostSessionHandler.js';
export { AgentHostSessionListController } from './agentHostSessionListController.js';

/**
 * Discovers available agents from the agent host process and dynamically
 * registers each one as a chat session type with its own session handler,
 * list controller, and language model provider.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostContribution';

	private static readonly _outputChannelId = 'agentHostIpc';

	private _outputChannel: IOutputChannel | undefined;
	private _isChannelRegistered = false;
	private _clientState: SessionClientState | undefined;
	private readonly _agentRegistrations = new Map<AgentProvider, DisposableStore>();
	/** Model providers keyed by agent provider, for pushing model updates. */
	private readonly _modelProviders = new Map<AgentProvider, AgentHostLanguageModelProvider>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IOutputService private readonly _outputService: IOutputService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		this._setupIpcLogging();

		// Shared client state for protocol reconciliation
		this._clientState = this._register(new SessionClientState(this._agentHostService.clientId));

		// Forward action envelopes from the host to client state
		this._register(this._agentHostService.onDidAction(envelope => {
			// Only root actions are relevant here; session actions are
			// handled by individual session handlers.
			if (!isSessionAction(envelope.action)) {
				this._clientState!.receiveEnvelope(envelope);
			}
		}));

		// Forward notifications to client state
		this._register(this._agentHostService.onDidNotification(n => {
			this._clientState!.receiveNotification(n);
		}));

		// React to root state changes (agent discovery / removal)
		this._register(this._clientState.onDidChangeRootState(rootState => {
			this._handleRootStateChange(rootState);
		}));

		this._initializeAndSubscribe();
	}

	// ---- IPC output channel (trace-level only) ------------------------------

	private _setupIpcLogging(): void {
		this._updateOutputChannel();
		this._register(this._logService.onDidChangeLogLevel(() => this._updateOutputChannel()));

		// Subscribe to action / notification streams for IPC logging
		this._register(this._agentHostService.onDidAction(e => {
			this._traceIpc('event', 'onDidAction', e);
		}));
		this._register(this._agentHostService.onDidNotification(e => {
			this._traceIpc('event', 'onDidNotification', e);
		}));
	}

	private _updateOutputChannel(): void {
		const isTrace = this._logService.getLevel() === LogLevel.Trace;
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);

		if (isTrace && !this._isChannelRegistered) {
			registry.registerChannel({
				id: AgentHostContribution._outputChannelId,
				label: 'Agent Host IPC',
				log: false,
				languageId: 'log',
			});
			this._isChannelRegistered = true;
			this._outputChannel = undefined; // force re-fetch
		} else if (!isTrace && this._isChannelRegistered) {
			registry.removeChannel(AgentHostContribution._outputChannelId);
			this._isChannelRegistered = false;
			this._outputChannel = undefined;
		}
	}

	private _traceIpc(direction: 'call' | 'result' | 'event', method: string, data?: unknown): void {
		if (this._logService.getLevel() !== LogLevel.Trace) {
			return;
		}

		if (!this._outputChannel) {
			this._outputChannel = this._outputService.getChannel(AgentHostContribution._outputChannelId);
			if (!this._outputChannel) {
				return;
			}
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

		const arrow = direction === 'call' ? '>>' : direction === 'result' ? '<<' : '**';
		this._outputChannel.append(`[${timestamp}] [trace] ${arrow} ${method}${payload ? `\n${payload}` : ''}\n`);
	}

	private async _initializeAndSubscribe(): Promise<void> {
		try {
			const snapshot = await this._agentHostService.subscribe(ROOT_STATE_URI);
			if (this._store.isDisposed) {
				return;
			}
			// Feed snapshot into client state — fires onDidChangeRootState
			this._clientState!.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
		} catch (err) {
			this._logService.error('[AgentHost] Failed to subscribe to root state', err);
		}
	}

	private _handleRootStateChange(rootState: IRootState): void {
		const incoming = new Set(rootState.agents.map(a => a.provider));

		// Remove agents that are no longer present
		for (const [provider, store] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				store.dispose();
				this._agentRegistrations.delete(provider);
				this._modelProviders.delete(provider);
			}
		}

		// Register new agents and push model updates to existing ones
		for (const agent of rootState.agents) {
			if (!this._agentRegistrations.has(agent.provider)) {
				this._registerAgent(agent);
			} else {
				// Push updated models to existing model provider
				const modelProvider = this._modelProviders.get(agent.provider);
				modelProvider?.updateModels(agent.models);
			}
		}
	}

	private _registerAgent(agent: IAgentInfo): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);
		this._register(store);
		const sessionType = `agent-host-${agent.provider}`;
		const agentId = sessionType;
		const vendor = sessionType;

		// Chat session contribution
		store.add(this._chatSessionsService.registerChatSessionContribution({
			type: sessionType,
			name: agentId,
			displayName: agent.displayName,
			description: agent.description,
			canDelegate: true,
			requiresCustomModels: true,
		}));

		// Session list controller
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider));
		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));

		// Session handler
		const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
			provider: agent.provider,
			agentId,
			sessionType,
			fullName: agent.displayName,
			description: agent.description,
		}));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

		// Language model provider
		const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
		this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
		store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
		const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
		modelProvider.updateModels(agent.models);
		this._modelProviders.set(agent.provider, modelProvider);
		store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		// Push auth token and refresh models from server
		this._pushAuthToken().then(() => this._agentHostService.refreshModels()).catch(() => { /* best-effort */ });
		store.add(this._defaultAccountService.onDidChangeDefaultAccount(() =>
			this._pushAuthToken().then(() => this._agentHostService.refreshModels()).catch(() => { /* best-effort */ })));
		store.add(this._authenticationService.onDidChangeSessions(() =>
			this._pushAuthToken().then(() => this._agentHostService.refreshModels()).catch(() => { /* best-effort */ })));
	}

	private async _pushAuthToken(): Promise<void> {
		try {
			const account = await this._defaultAccountService.getDefaultAccount();
			if (!account) {
				return;
			}

			const sessions = await this._authenticationService.getSessions(account.authenticationProvider.id);
			const session = sessions.find(s => s.id === account.sessionId);
			if (session) {
				await this._agentHostService.setAuthToken(session.accessToken);
			}
		} catch {
			// best-effort
		}
	}
}
