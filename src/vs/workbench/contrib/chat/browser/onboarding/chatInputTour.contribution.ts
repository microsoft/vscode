/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IOnboardingTarget, registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, isOnboardingDeveloperModeEnabled } from '../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatOnboardingExperience } from '../../common/constants.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { AgentHostChatInputPicker, AgentHostPickerSection } from '../agentSessions/agentHost/agentHostChatInputPicker.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';

/**
 * Onboarding tour that introduces a brand-new user to the Copilot harness chat
 * input the first time they open the Chat view. It walks through three controls:
 *
 *  1. The model picker — switch between language models to balance reasoning and cost.
 *  2. Agent mode — opens the mode and permissions picker on its agent mode section.
 *  3. Permissions — moves the same open menu to its permissions section.
 *
 * Which onboarding experience a user gets is controlled by
 * {@link ChatConfiguration.OnboardingExperience}. The setting is registered with
 * `experiment: { mode: 'auto' }` so an ExP treatment can drive it once the
 * experiment is set up. The tour only runs for Copilot harness chats, which the
 * `chat.defaultToCopilotHarness` experiment makes the default.
 */
export const CHAT_INPUT_TOUR_ID = 'chat.onboarding.chatInput';

/** Onboarding target ids resolved by {@link ChatInputTourTrigger}. */
export const ChatInputTourTarget = {
	AgentMode: 'chat.input.agentMode',
	Permissions: 'chat.input.permissions',
	ModelPicker: 'chat.input.modelPicker',
} as const;

const chatInputTourPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'modelPicker',
			targetId: ChatInputTourTarget.ModelPicker,
			title: localize('chat.onboarding.chatInput.model.title', "Want Faster Answers or Deeper Thinking?"),
			description: localize('chat.onboarding.chatInput.model.description', "Switch models to balance reasoning and cost. Save the strongest ones for hard problems."),
			placement: 'above',
			missingTarget: { kind: 'skip' },
		},
		{
			id: 'agentMode',
			targetId: ChatInputTourTarget.AgentMode,
			title: localize('chat.onboarding.chatInput.agentMode.title', "Get the Right Kind of Help"),
			description: localize('chat.onboarding.chatInput.agentMode.description', "Choose how hands-on the agent is. Work together, review a plan first, or let it run."),
			placement: 'left',
			openTarget: true,
			missingTarget: { kind: 'skip' },
		},
		{
			id: 'permissions',
			targetId: ChatInputTourTarget.Permissions,
			title: localize('chat.onboarding.chatInput.permissions.title', "Decide What Needs Your Approval"),
			description: localize('chat.onboarding.chatInput.permissions.description', "Choose when the agent asks before editing files or running commands. Start cautious, then allow more as you trust it."),
			placement: 'left',
			openTarget: true,
			missingTarget: { kind: 'skip' },
		},
	],
};

/**
 * Builds the chat input tour scenario. The `signal` is driven by
 * {@link ChatInputTourTrigger} and flips once an eligible user has a Copilot
 * harness chat open in the Chat view with every tour target rendered.
 */
export function createChatInputTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: CHAT_INPUT_TOUR_ID,
		when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorPartModalVisibleContext.toNegated()),
		trigger: { kind: 'observable', signal },
		priority: 50,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: chatInputTourPayload,
		},
	};
}

/** How the tour opens and highlights the chat input's Agent Host pickers. */
interface IChatInputTourPickerActions {
	/** The picker's open menu, which the spotlight highlights together with the picker. */
	getOpenMenu(picker: AgentHostChatInputPicker): HTMLElement | undefined;
	/** Shows the picker's menu on `section`. */
	open(picker: AgentHostChatInputPicker, section: AgentHostPickerSection): Promise<void>;
}

/**
 * Resolves a tour target through the chat input's pickers. With the combined
 * mode and permissions picker, both the agent mode and permissions steps point
 * at that picker and show its menu on the matching section. Otherwise the
 * permissions step points at the separate permissions picker. While a picker's
 * menu is open, the spotlight highlights the menu together with the picker.
 */
function resolveChatInputTourTarget(widget: IChatWidget, targetId: string, actions: IChatInputTourPickerActions): IOnboardingTarget | undefined {
	const input = widget.inputPart;
	const pickerTarget = (picker: AgentHostChatInputPicker | undefined, section: AgentHostPickerSection): IOnboardingTarget | undefined => {
		const element = picker?.triggerElement;
		return picker && element ? { element, open: () => actions.open(picker, section), popup: () => actions.getOpenMenu(picker) } : undefined;
	};
	switch (targetId) {
		case ChatInputTourTarget.AgentMode:
			return pickerTarget(input.getAgentHostPicker(SessionConfigKey.Mode), 'mode');
		case ChatInputTourTarget.Permissions: {
			const modePicker = input.getAgentHostPicker(SessionConfigKey.Mode);
			return pickerTarget(modePicker?.combinesPermissions ? modePicker : input.getAgentHostPicker(SessionConfigKey.AutoApprove), 'permissions');
		}
		case ChatInputTourTarget.ModelPicker: {
			const element = input.modelPickerElement;
			return element ? { element } : undefined;
		}
		default:
			return undefined;
	}
}

/**
 * Decides *when* the chat input tour runs and resolves its spotlight targets.
 *
 * The tour is only offered when {@link ChatConfiguration.OnboardingExperience} is
 * `spotlight`, the Chat view shows a Copilot harness chat, and the user has never
 * sent a chat message from an editor window, as recorded by {@link EditorChatUsage}.
 * Once such a widget is visible, the trigger waits for the agent mode,
 * permissions, and model pickers to render before flipping the signal, because
 * the onboarding engine marks a tour shown as soon as it starts.
 *
 * The `onboarding.developerMode` setting bypasses the "no messages sent" gate so
 * the tour can be previewed on demand.
 */
export class ChatInputTourTrigger extends Disposable {

	/** Delay before the first readiness check, so restore and input rendering can settle. */
	static readonly SETTLE_DELAY_MS = 1_000;
	static readonly RETRY_DELAY_MS = 500;
	/** The Copilot harness pickers render once the Agent Host resolves the session configuration. */
	static readonly MAX_ATTEMPTS = 40;
	static readonly MENU_CLOSE_DELAY_MS = 50;
	static readonly MENU_CLOSE_ATTEMPTS = 20;
	/** How long the collapsed menu stays visible before the next section expands. */
	static readonly SECTION_SWITCH_DELAY_MS = 400;

	private readonly _trigger = observableValue<boolean>(this, false);
	readonly signal: IObservable<boolean> = this._trigger;

	private readonly _experience: IObservable<string>;
	private readonly _pendingCheck = this._register(new MutableDisposable());
	private readonly _widgetListeners = this._register(new DisposableMap<IChatWidget>());
	private _hasSentRequest: boolean;
	private _targetWidget: IChatWidget | undefined;

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@IChatService chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextViewService contextViewService: IContextViewService,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
	) {
		super();

		this._hasSentRequest = new EditorChatUsage(storageService).getMessageCount() > 0;
		this._experience = observableConfigValue<string>(ChatConfiguration.OnboardingExperience, ChatOnboardingExperience.None, configurationService);

		const actions: IChatInputTourPickerActions = {
			getOpenMenu: picker => picker.isOpen ? contextViewService.getContextViewElement() : undefined,
			open: (picker, section) => this._openSection(picker, section),
		};
		for (const targetId of Object.values(ChatInputTourTarget)) {
			this._register(registerOnboardingTargetProvider(targetId, scope => scope === undefined && this._targetWidget ? resolveChatInputTourTarget(this._targetWidget, targetId, actions) : undefined));
		}

		this._register(chatService.onDidAcceptRequest(() => {
			this._hasSentRequest = true;
			this._pendingCheck.clear();
		}));
		for (const widget of chatWidgetService.getAllWidgets()) {
			this._watchWidget(widget);
		}
		this._register(chatWidgetService.onDidAddWidget(widget => {
			this._watchWidget(widget);
			this._update();
		}));
		this._register(chatWidgetService.onDidRemoveWidget(widget => this._widgetListeners.deleteAndDispose(widget)));
		this._register(chatWidgetService.onDidChangeWidgetVisibility(() => this._update()));
		this._register(autorun(reader => {
			this._experience.read(reader);
			this._update();
		}));
	}

	/** Re-checks eligibility when a widget switches sessions, e.g. to or from the Copilot harness. */
	private _watchWidget(widget: IChatWidget): void {
		if (!this._widgetListeners.has(widget)) {
			this._widgetListeners.set(widget, widget.onDidChangeViewModel(() => this._update()));
		}
	}

	/**
	 * Shows `section` of the picker's menu. When the menu is still open on the other
	 * section, as it is after Next or Back, collapses that section first and expands
	 * `section` once the collapse has been visible, so the step change reads as one
	 * menu moving between sections. Otherwise opens the menu on `section`.
	 */
	private async _openSection(picker: AgentHostChatInputPicker, section: AgentHostPickerSection): Promise<void> {
		if (picker.setSectionExpanded(section === 'mode' ? 'permissions' : 'mode', false)) {
			await timeout(ChatInputTourTrigger.SECTION_SWITCH_DELAY_MS);
			if (picker.setSectionExpanded(section, true)) {
				return;
			}
		}
		await this._whenMenuClosed();
		picker.open(section === 'permissions');
	}

	/**
	 * Closes any open menu and waits for it to finish animating closed, since a picker
	 * cannot open while another menu is still shown.
	 */
	private async _whenMenuClosed(): Promise<void> {
		this.actionWidgetService.hide();
		for (let attempt = 0; this.actionWidgetService.isVisible && attempt < ChatInputTourTrigger.MENU_CLOSE_ATTEMPTS; attempt++) {
			await timeout(ChatInputTourTrigger.MENU_CLOSE_DELAY_MS);
		}
	}

	private _isEligible(): boolean {
		if (this._trigger.get() || this.onboardingScenarioService.hasBeenShown(CHAT_INPUT_TOUR_ID)) {
			return false;
		}
		if (this._experience.get() !== ChatOnboardingExperience.Spotlight) {
			return false;
		}
		return !this._hasSentRequest || isOnboardingDeveloperModeEnabled(this.configurationService, CHAT_INPUT_TOUR_ID);
	}

	private _getCandidateWidgets(): readonly IChatWidget[] {
		return this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).filter(widget => {
			const sessionResource = widget.viewModel?.sessionResource;
			return widget.visible
				&& isIChatViewViewContext(widget.viewContext)
				&& !!sessionResource
				&& getChatSessionType(sessionResource) === SessionType.AgentHostCopilot;
		});
	}

	private _update(): void {
		if (!this._isEligible()) {
			this._pendingCheck.clear();
			return;
		}
		if (this._getCandidateWidgets().length === 0) {
			this._pendingCheck.clear();
		} else if (!this._pendingCheck.value) {
			this._scheduleCheck(0);
		}
	}

	private _scheduleCheck(attempt: number): void {
		const delay = attempt === 0 ? ChatInputTourTrigger.SETTLE_DELAY_MS : ChatInputTourTrigger.RETRY_DELAY_MS;
		this._pendingCheck.value = disposableTimeout(() => {
			this._pendingCheck.clear();
			if (!this._isEligible()) {
				return;
			}
			const widget = this._getCandidateWidgets().find(candidate => this._hasVisibleTargets(candidate));
			if (widget) {
				this._targetWidget = widget;
				this._trigger.set(true, undefined);
			} else if (attempt + 1 < ChatInputTourTrigger.MAX_ATTEMPTS && this._getCandidateWidgets().length > 0) {
				this._scheduleCheck(attempt + 1);
			}
		}, delay);
	}

	/** Resolves the targets through the registered providers, so readiness uses the spotlight's own visibility rules. */
	private _hasVisibleTargets(widget: IChatWidget): boolean {
		const previous = this._targetWidget;
		this._targetWidget = widget;
		const targetWindow = getWindow(widget.domNode);
		const ready = Object.values(ChatInputTourTarget).every(targetId => resolveOnboardingTarget(targetWindow, targetId) !== undefined);
		if (!ready) {
			this._targetWidget = previous;
		}
		return ready;
	}
}

class ChatInputTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatInputTour';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const trigger = this._register(instantiationService.createInstance(ChatInputTourTrigger));
		this._register(onboardingScenarioRegistry.register(createChatInputTour(trigger.signal)));
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.OnboardingExperience]: {
			type: 'string',
			enum: [ChatOnboardingExperience.None, ChatOnboardingExperience.Spotlight],
			enumDescriptions: [
				localize('chat.onboarding.experience.none', "Do not show a chat onboarding experience."),
				localize('chat.onboarding.experience.spotlight', "Spotlight the model, agent mode, and permissions pickers the first time the Chat view shows a Copilot harness chat, if no chat messages have been sent yet."),
			],
			default: ChatOnboardingExperience.None,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.onboarding.experience', "Controls which onboarding experience is shown to new users when they first open the Chat view."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});

registerWorkbenchContribution2(ChatInputTourContribution.ID, ChatInputTourContribution, WorkbenchPhase.AfterRestored);
