/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import * as nls from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../platform/agentHost/common/customAgents.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatMode, IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { logChangesToStateModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { SessionProviderIdContext, IsPhoneLayoutContext, SessionAgentPickerInAttachContext } from '../../../../common/contextkeys.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionAgentRef, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ModePicker, ScopedModePickerModelCache } from '../../copilotChatSessions/browser/modePicker.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING } from '../../../chat/common/constants.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IChatContextPickService } from '../../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';

const IsActiveSessionAgentHost = ContextKeyExpr.or(
	ContextKeyExpr.equals(SessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.regex(SessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE),
);

// -- Agent Host Agent Picker Action --

const AGENT_HOST_AGENT_PICKER_ACTION_ID = 'sessions.agentHost.agentPicker';
interface IAgentPickerActionContext {
	readonly anchor?: HTMLElement;
}
let openActiveAgentPicker: ((anchor?: HTMLElement) => void) | undefined;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: AGENT_HOST_AGENT_PICKER_ACTION_ID,
			title: nls.localize2('agentHostAgentPicker', "Agent"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: -1,
				when: ContextKeyExpr.and(IsActiveSessionAgentHost, IsPhoneLayoutContext.negate(), ChatContextKeys.inAutomationsDialog.negate()),
			}, {
				id: Menus.NewSessionAttachContext,
				group: 'navigation',
				order: -1,
				when: ContextKeyExpr.and(IsActiveSessionAgentHost, SessionAgentPickerInAttachContext),
			}, {
				id: Menus.AutomationsDialogInputToolbar,
				group: 'navigation',
				order: -1,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inAutomationsDialog, IsActiveSessionAgentHost, IsPhoneLayoutContext.negate()),
			}, {
				// Running-session input bar — only inside the dedicated
				// Agents Window. The regular VS Code chat editor uses the
				// built-in mode picker for Agent Host custom agents.
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 0,
				// Hide the agent picker while a delegation (continue in) target is pending.
				when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, IsSessionsWindowContext, IsPhoneLayoutContext.negate(), ChatContextKeys.hasPendingDelegationTarget.negate()),
			}],
		});
	}
	override run(_accessor: unknown, context?: IAgentPickerActionContext): void {
		openActiveAgentPicker?.(context?.anchor);
	}
});

class AgentHostModePickerActionViewItem extends BaseActionViewItem {
	private compact = false;

	constructor(
		private readonly picker: ModePicker,
		private readonly pickerInAttachContext: IObservable<boolean>,
		disposable: IDisposable,
	) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		this._register(disposable);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-input-picker-item', 'chat-agent-picker-item');
		container.classList.toggle('compact-picker', this.compact);
		this.picker.render(container);
		this._register(autorun(reader => {
			const hidden = this.pickerInAttachContext.read(reader);
			container.hidden = hidden;
			container.inert = hidden;
			if (hidden) {
				dom.hide(container);
			} else {
				dom.show(container);
			}
		}));
	}

	showPicker(anchor?: HTMLElement): void {
		this.picker.showPicker(anchor);
	}

	isCompact(): boolean {
		return this.compact;
	}

	setCompact(compact: boolean): void {
		this.compact = compact;
		this.element?.classList.toggle('compact-picker', compact);
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
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatContextPickService chatContextPickService: IChatContextPickService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		let settingAgentInternally = false;
		const explicitlySelectedSessions = new Set<string>();
		const explicitSelectionVersion = observableValue(this, 0);
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const isEligible = (session: ISession | undefined): boolean => {
			if (!session || !this._getProvider(session, sessionsProvidersService)) {
				return false;
			}
			return !explicitlySelectedSessions.has(session.resource.toString());
		};
		const isMoved = (session: ISession | undefined): boolean => isEligible(session)
			&& configurationService.getValue<boolean>(AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING);
		const shouldHidePicker = (session: ISession | undefined): boolean => configurationService.getValue<boolean>(AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING)
			&& (!session || !explicitlySelectedSessions.has(session.resource.toString()));
		const markExplicitlySelected = (session: ISession | undefined) => {
			if (session && !explicitlySelectedSessions.has(session.resource.toString())) {
				explicitlySelectedSessions.add(session.resource.toString());
				explicitSelectionVersion.set(explicitSelectionVersion.get() + 1, undefined);
			}
		};
		const agentPickerInAttachContext = SessionAgentPickerInAttachContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			explicitSelectionVersion.read(reader);
			agentPickerInAttachContext.set(isMoved(sessionsService.activeSession.read(reader)));
		}));
		this._register({ dispose: () => agentPickerInAttachContext.reset() });

		const renderedPickers = new Set<{ readonly session: IObservable<ISession | undefined>; readonly item: AgentHostModePickerActionViewItem }>();
		openActiveAgentPicker = anchor => {
			const activeSession = sessionsService.activeSession.get();
			const rendered = [...renderedPickers].find(candidate => candidate.session.get()?.resource.toString() === activeSession?.resource.toString());
			rendered?.item.showPicker(anchor);
		};
		this._register({
			dispose: () => {
				openActiveAgentPicker = undefined;
			}
		});

		this._register(chatContextPickService.registerChatContextItem({
			type: 'valuePick',
			label: nls.localize('agentHostAgentPicker.context', "Agent..."),
			icon: Codicon.agent,
			ordinal: 1000,
			isEnabled: widget => {
				const session = sessionsService.activeSession.get();
				if (isEligible(session)) {
					logSettingExperimentTrigger(telemetryService, AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING);
				}
				return isMoved(session) && widget.viewModel?.sessionResource.toString() === session?.activeChat.get()?.resource.toString();
			},
			asAttachment: async widget => {
				openActiveAgentPicker?.(widget.inputPart.attachContextButtonElement ?? widget.inputPart.inputToolbarElement);
				return undefined;
			},
		}));
		const modePickerModels = this._register(new ScopedModePickerModelCache(session => {
			const provider = sessionsProvidersService.getProvider(session.providerId);
			return !!provider && isAgentHostProvider(provider);
		}));

		const initAgentFromActiveSession = () => {
			const session = sessionsService.activeSession.get();
			this._initAgent(session, session?.mode.get()?.id, session?.status.get() === SessionStatus.Untitled, sessionsProvidersService, () => settingAgentInternally = true, () => settingAgentInternally = false);
		};
		const syncChatInputModeFromActiveSession = () => {
			const session = sessionsService.activeSession.get();
			const selectedAgentUri = session?.mode.get()?.id;
			this._syncChatInputMode(session, selectedAgentUri, sessionsProvidersService);
		};

		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
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
			const session = sessionsService.activeSession.read(reader);
			const provider = this._getProvider(session, sessionsProvidersService);
			customAgentsListener.value = provider?.onDidChangeCustomAgents(() => {
				if (!settingAgentInternally) {
					initAgentFromActiveSession();
				}
			});
		}));

		const createFactory = (hideWhenMoved: boolean) => (_action: IAction, _options: IActionViewItemOptions, scopedInstantiationService: IInstantiationService) => {
			const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
			const disposableStore = new DisposableStore();
			const modePickerModel = disposableStore.add(modePickerModels.acquire(session, scopedInstantiationService));
			const picker = scopedInstantiationService.createInstance(ModePicker, modePickerModel.model, session);
			const pickerInAttachContext = derived(reader => {
				configurationChanged.read(reader);
				explicitSelectionVersion.read(reader);
				return hideWhenMoved && shouldHidePicker(session.read(reader));
			});

			disposableStore.add(picker.onDidSelect(mode => {
				markExplicitlySelected(session.get());
				this._selectMode(mode, session.get(), sessionsProvidersService);
			}));
			const item = scopedInstantiationService.createInstance(AgentHostModePickerActionViewItem, picker, pickerInAttachContext, disposableStore);
			const renderedPicker = { session, item };
			renderedPickers.add(renderedPicker);
			disposableStore.add({ dispose: () => renderedPickers.delete(renderedPicker) });
			return item;
		};

		this._register(actionViewItemService.register(Menus.NewSessionConfig, AGENT_HOST_AGENT_PICKER_ACTION_ID, createFactory(true)));
		this._register(actionViewItemService.register(Menus.AutomationsDialogInputToolbar, AGENT_HOST_AGENT_PICKER_ACTION_ID, createFactory(false)));
		this._register(actionViewItemService.register(MenuId.ChatInput, AGENT_HOST_AGENT_PICKER_ACTION_ID, createFactory(true)));
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

	private _selectMode(mode: IChatMode, session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): void {
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
			const rawAgentUri = mode.id;
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
