/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../platform/agentHost/common/customAgents.js';
import { fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeyExprs } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatMode, IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { logChangesToStateModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { ActiveSessionProviderIdContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionAgentRef, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ModePicker } from '../../copilotChatSessions/browser/modePicker.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

// -- Agent Host Agent Picker Action --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.agentPicker',
			title: nls.localize2('agentHostAgentPicker', "Agent"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: -1,
				when: ContextKeyExpr.and(IsActiveSessionAgentHost, IsPhoneLayoutContext.negate()),
			}, {
				// Running-session input bar — only inside the dedicated
				// Agents Window. The regular VS Code chat editor uses the
				// built-in mode picker for Agent Host custom agents.
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, IsSessionsWindowContext, IsPhoneLayoutContext.negate()),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

class AgentHostModePickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: ModePicker, disposable: IDisposable) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		this._register(disposable);
	}

	override render(container: HTMLElement): void {
		container.classList.add('chat-input-picker-item', 'chat-agent-picker-item');
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

class AgentHostAgentPickerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostAgentPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		let settingAgentInternally = false;

		const initAgentFromActiveSession = () => {
			const session = sessionsManagementService.activeSession.get();
			this._initAgent(session, session?.mode.get()?.id, session?.status.get() === SessionStatus.Untitled, sessionsProvidersService, () => settingAgentInternally = true, () => settingAgentInternally = false);
		};
		const syncChatInputModeFromActiveSession = () => {
			const session = sessionsManagementService.activeSession.get();
			const selectedAgentUri = session?.mode.get()?.id;
			this._syncChatInputMode(session, selectedAgentUri, sessionsProvidersService);
		};

		this._register(autorun(reader => {
			const session = sessionsManagementService.activeSession.read(reader);
			const selectedAgentUri = session?.mode.read(reader)?.id;
			const isUntitled = session?.status.read(reader) === SessionStatus.Untitled;
			this._syncChatInputMode(session, selectedAgentUri, sessionsProvidersService);
			this._initAgent(session, selectedAgentUri, isUntitled, sessionsProvidersService, () => settingAgentInternally = true, () => settingAgentInternally = false);
		}));
		this._register(this.chatWidgetService.onDidAddWidget(() => {
			syncChatInputModeFromActiveSession();
		}));
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => {
			syncChatInputModeFromActiveSession();
		}));

		const customAgentsListener = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const session = sessionsManagementService.activeSession.read(reader);
			const provider = this._getProvider(session, sessionsProvidersService);
			customAgentsListener.value = provider?.onDidChangeCustomAgents(() => {
				if (!settingAgentInternally) {
					initAgentFromActiveSession();
				}
			});
		}));

		const factory = (_action: IAction, _options: IActionViewItemOptions, scopedInstantiationService: IInstantiationService) => {
			const picker = scopedInstantiationService.createInstance(ModePicker);
			const disposableStore = new DisposableStore();

			disposableStore.add(picker.onDidChange(mode => {
				this._selectMode(mode, sessionsManagementService, sessionsProvidersService);
			}));
			return scopedInstantiationService.createInstance(AgentHostModePickerActionViewItem, picker, disposableStore);
		};

		this._register(actionViewItemService.register(Menus.NewSessionConfig, 'sessions.agentHost.agentPicker', factory));
		this._register(actionViewItemService.register(MenuId.ChatInput, 'sessions.agentHost.agentPicker', factory));
	}

	private _getProvider(session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): IAgentHostSessionsProvider | undefined {
		if (!session) {
			return undefined;
		}
		const provider = sessionsProvidersService.getProvider(session.providerId);
		return provider && isAgentHostProvider(provider) ? provider : undefined;
	}

	private _syncChatInputMode(session: ISession | undefined, selectedAgentUri: string | undefined, sessionsProvidersService: ISessionsProvidersService): void {
		if (!session || !this._getProvider(session, sessionsProvidersService)) {
			return;
		}

		const chatModel = this.chatService.getSession(session.resource);
		const currentMode = chatModel?.inputModel.state.get()?.mode;
		const nextMode = selectedAgentUri ? { id: selectedAgentUri, kind: ChatModeKind.Agent } : { id: ChatMode.Agent.id, kind: ChatModeKind.Agent };
		if (currentMode?.id === nextMode.id && currentMode.kind === nextMode.kind) {
			this._syncVisibleChatInputMode(session, nextMode.id);
			return;
		}

		chatModel?.inputModel.setState({ mode: nextMode });
		this._syncVisibleChatInputMode(session, nextMode.id);
	}

	private _syncVisibleChatInputMode(session: ISession, modeId: string): void {
		const widget = this.chatWidgetService.getWidgetBySessionResource(session.resource);
		if (!widget) {
			return;
		}

		const currentMode = widget.input.currentModeObs.get();
		if (currentMode.id === modeId) {
			return;
		}

		const apply = async () => {
			await widget.input.currentChatModesObs.get().waitForPendingUpdates();
			if (widget.viewModel?.model.sessionResource.toString() !== session.resource.toString()) {
				return;
			}

			const mode = widget.input.currentChatModesObs.get().findModeById(modeId);
			if (!mode) {
				return;
			}

			const chatModel = this.chatService.getSession(session.resource);
			logChangesToStateModel(chatModel?.inputModel, `[AGPK] _syncVisibleChatInputMode -> widget.input.setChatMode(${modeId}) for ${session.resource.toString()}`, undefined, chatModel?.inputModel.state.get(), this.logService);
			widget.input.setChatMode(modeId, false);
		};

		apply().catch(err => this.logService.error('[AgentHostAgentPickerProbe] sync visible chat input mode failed', err));
	}

	private _initAgent(
		session: ISession | undefined,
		selectedAgentUri: string | undefined,
		isUntitled: boolean,
		sessionsProvidersService: ISessionsProvidersService,
		beginInternalSet: () => void,
		endInternalSet: () => void,
	): void {
		const provider = this._getProvider(session, sessionsProvidersService);
		if (!session || !provider) {
			return;
		}

		const agents = provider.getCustomAgents(session.sessionId);
		const storedUri = isUntitled
			? this.storageService.get(agentHostAgentPickerStorageKey(session.resource.scheme), StorageScope.PROFILE)
			: undefined;
		const resolved = resolveAgentHostAgent(agents, selectedAgentUri, storedUri);

		if (!selectedAgentUri && isUntitled && resolved) {
			beginInternalSet();
			try {
				this._setAgent(session, provider, resolved);
			} finally {
				endInternalSet();
			}
		} else if (selectedAgentUri && !resolved && agents.length > 0 && !isUntitled) {
			beginInternalSet();
			try {
				this._setAgent(session, provider, undefined);
			} finally {
				endInternalSet();
			}
		}
	}

	private _selectMode(mode: IChatMode, sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService): void {
		const session = sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}
		const provider = sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return;
		}
		if (mode.id === ChatMode.Agent.id) {
			this._setAgent(session, provider, undefined);
		} else {
			const modeUri = mode.uri?.get() ?? URI.parse(mode.id);
			const rawAgentUri = fromAgentHostUri(modeUri).toString();
			this._setAgent(session, provider, { uri: rawAgentUri, name: mode.name.get() });
		}
	}

	private _setAgent(session: ISession, provider: IAgentHostSessionsProvider, agent: ISessionAgentRef | undefined): void {
		const key = agentHostAgentPickerStorageKey(session.resource.scheme);
		if (agent) {
			this.storageService.store(key, agent.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(key, StorageScope.PROFILE);
		}
		provider.setAgent?.(session.sessionId, agent ? { uri: agent.uri, name: agent.name } : undefined);
	}
}

registerWorkbenchContribution2(AgentHostAgentPickerContribution.ID, AgentHostAgentPickerContribution, WorkbenchPhase.AfterRestored);
