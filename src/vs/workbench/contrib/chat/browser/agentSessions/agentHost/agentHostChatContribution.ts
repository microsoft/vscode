/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentHostService, AgentHostEnabledSettingId, IAgentDescriptor } from '../../../../../../platform/agent/common/agentService.js';
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
		this._discoverAndRegisterAgents();
	}

	// ---- IPC output channel (trace-level only) ------------------------------

	private _setupIpcLogging(): void {
		this._updateOutputChannel();
		this._register(this._logService.onDidChangeLogLevel(() => this._updateOutputChannel()));

		// Subscribe to all progress events for IPC logging
		this._register(this._agentHostService.onDidSessionProgress(e => {
			this._traceIpc('event', 'onDidSessionProgress', e);
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

	private async _discoverAndRegisterAgents(): Promise<void> {
		try {
			const agents = await this._agentHostService.listAgents();
			if (this._store.isDisposed) {
				return;
			}
			for (const agent of agents) {
				this._registerAgent(agent);
			}
		} catch (err) {
			this._logService.error('[AgentHost] Failed to discover agents', err);
		}
	}

	private _registerAgent(agent: IAgentDescriptor): void {
		const store = this._register(new DisposableStore());
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
		const modelProvider = store.add(this._instantiationService.createInstance(AgentHostLanguageModelProvider, sessionType, vendor, agent.provider));
		store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));

		// Auth (only for agents that need it)
		if (agent.requiresAuth) {
			this._pushAuthToken().then(() => modelProvider.refresh());
			store.add(this._defaultAccountService.onDidChangeDefaultAccount(() =>
				this._pushAuthToken().then(() => modelProvider.refresh())));
			store.add(this._authenticationService.onDidChangeSessions(() =>
				this._pushAuthToken().then(() => modelProvider.refresh())));
		}
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
