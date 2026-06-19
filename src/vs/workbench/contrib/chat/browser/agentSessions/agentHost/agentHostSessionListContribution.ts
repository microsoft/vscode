/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { type URI } from '../../../../../../base/common/uri.js';
import { AgentHostEnabledSettingId, claudePreferAgentHostSettingId, IAgentHostService, shouldSurfaceLocalAgentHostProvider, type AgentProvider, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { AgentHostSessionListController, IAgentHostSessionListConnection } from './agentHostSessionListController.js';

/**
 * Shared session-list connection used by all local agent-host list controllers.
 *
 * The agent host exposes a single provider-agnostic `listSessions()` RPC, while
 * the workbench registers one {@link AgentHostSessionListController} per agent
 * provider. Those controllers can refresh at the same time during startup,
 * reconnect, or workspace changes. This wrapper keeps the controller coupled
 * only to the minimal list-session surface and joins concurrent refreshes onto
 * one in-flight `listSessions()` request so the agent host does not repeat the
 * same session enumeration work for every provider.
 */
export class CoalescingAgentHostSessionListConnection implements IAgentHostSessionListConnection {

	private _listSessionsInFlight: Promise<IAgentSessionMetadata[]> | undefined;

	constructor(
		private readonly _delegate: IAgentHostService,
	) { }

	get onDidNotification(): IAgentHostSessionListConnection['onDidNotification'] {
		return this._delegate.onDidNotification;
	}

	disposeSession(session: URI): Promise<void> {
		return this._delegate.disposeSession(session);
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		if (this._listSessionsInFlight) {
			return this._listSessionsInFlight;
		}

		const request = this._delegate.listSessions();
		this._listSessionsInFlight = request;
		const clear = () => {
			if (this._listSessionsInFlight === request) {
				this._listSessionsInFlight = undefined;
			}
		};
		request.then(clear, clear);
		return request;
	}
}

export class AgentHostSessionListContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSessionListContribution';

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	private readonly _listControllers = new Map<AgentProvider, AgentHostSessionListController>();
	private readonly _sessionListConnection: CoalescingAgentHostSessionListConnection;

	private readonly _isSessionsWindow: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;
		this._sessionListConnection = new CoalescingAgentHostSessionListConnection(this._agentHostService);

		if (this._isSessionsWindow || !this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState);
		}));

		this._register(this._agentHostService.onAgentHostStart(() => {
			for (const controller of this._listControllers.values()) {
				controller.resetCache();
			}
		}));

		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState);
		}

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			const relevantSetting = claudePreferAgentHostSettingId(this._isSessionsWindow);
			if (!e.affectsConfiguration(relevantSetting)) {
				return;
			}
			const current = this._agentHostService.rootState.value;
			if (current && !(current instanceof Error)) {
				this._handleRootStateChange(current);
			}
		}));
	}

	private _shouldRegisterAgent(provider: AgentProvider): boolean {
		return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
	}

	private _handleRootStateChange(rootState: RootState): void {
		const allowed = rootState.agents.filter(agent => this._shouldRegisterAgent(agent.provider));
		const incoming = new Set(allowed.map(agent => agent.provider));

		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
			}
		}

		for (const agent of allowed) {
			if (!this._agentRegistrations.has(agent.provider)) {
				this._registerAgent(agent);
			}
		}
	}

	private _registerAgent(agent: AgentInfo): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);

		const sessionType = `agent-host-${agent.provider}`;
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._sessionListConnection, undefined, 'local'));
		this._listControllers.set(agent.provider, listController);
		store.add(toDisposable(() => this._listControllers.delete(agent.provider)));

		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));
		store.add(this._workingDirectoryResolver.registerResolver(sessionType, _sessionResource => undefined, sessionResource => listController.isNewSession(sessionResource)));
	}
}
