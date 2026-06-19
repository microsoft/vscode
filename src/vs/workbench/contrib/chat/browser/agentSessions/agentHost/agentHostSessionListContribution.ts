/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { AgentHostEnabledSettingId, claudePreferAgentHostSettingId, IAgentHostService, shouldSurfaceLocalAgentHostProvider, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';

export class AgentHostSessionListContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSessionListContribution';

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	private readonly _listControllers = new Map<AgentProvider, AgentHostSessionListController>();

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
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._agentHostService, undefined, 'local'));
		this._listControllers.set(agent.provider, listController);
		store.add(toDisposable(() => this._listControllers.delete(agent.provider)));

		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));
		store.add(this._workingDirectoryResolver.registerResolver(sessionType, _sessionResource => undefined, sessionResource => listController.isNewSession(sessionResource)));
	}
}
