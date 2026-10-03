/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { IOnboardingTarget, registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AgentHostChatInputPicker } from '../agentSessions/agentHost/agentHostChatInputPicker.js';
import { getModePermissionsPickerOptions } from '../agentSessions/agentHost/agentHostModePickerPresentation.js';
import { IChatWidget } from '../chat.js';
import { IChatOnboardingEligibility } from './chatOnboardingEligibility.js';

/**
 * The `spotlight` chat onboarding experience: a spotlight tour of the Copilot
 * harness chat input that walks through three controls:
 *
 *  1. The model picker — switch between language models to balance reasoning and cost.
 *  2. Agent mode — opens the mode and permissions picker on its agent mode section.
 *  3. Permissions — moves the same open menu to its permissions section.
 *
 * Whether and where the tour may run is decided by {@link IChatOnboardingEligibility};
 * this module only owns the tour's UI.
 */
export const CHAT_INPUT_TOUR_ID = 'chat.onboarding.chatInput';

/** Onboarding target ids resolved by {@link ChatInputSpotlightTour}. */
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
			allowTargetInteraction: true,
			missingTarget: { kind: 'skip' },
		},
		{
			id: 'permissions',
			targetId: ChatInputTourTarget.Permissions,
			title: localize('chat.onboarding.chatInput.permissions.title', "Decide What Needs Your Approval"),
			description: localize('chat.onboarding.chatInput.permissions.description', "Choose when the agent asks before editing files or running commands. Start cautious, then allow more as you trust it."),
			placement: 'left',
			openTarget: true,
			allowTargetInteraction: true,
			missingTarget: { kind: 'skip' },
		},
	],
};

/**
 * Builds the chat input tour scenario. The `signal` is driven by
 * {@link ChatInputSpotlightTour} and flips once an eligible Chat view shows every
 * tour target.
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

/** A section of the combined mode and permissions picker's menu. */
type ChatInputTourPickerSection = 'mode' | 'permissions';

/**
 * Returns the ID of `section`'s header in the combined mode and permissions menu. The picker
 * collapses the mode section when it opens on permissions, and the permissions section
 * otherwise, so its options name each section's header.
 */
function getSectionHeaderId(section: ChatInputTourPickerSection): string | undefined {
	const [headerId] = getModePermissionsPickerOptions(section === 'mode').collapsedByDefault ?? [];
	return headerId;
}

/** How the tour opens and highlights the chat input's Agent Host pickers. */
interface IChatInputTourPickerActions {
	/** The picker's open menu, which the spotlight highlights together with the picker. */
	getOpenMenu(picker: AgentHostChatInputPicker): HTMLElement | undefined;
	/** Shows the picker's menu on `section`. */
	open(picker: AgentHostChatInputPicker, section: ChatInputTourPickerSection): Promise<void>;
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
	const pickerTarget = (picker: AgentHostChatInputPicker | undefined, section: ChatInputTourPickerSection): IOnboardingTarget | undefined => {
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
 * Registers the chat input spotlight tour and starts it in the chat that
 * {@link IChatOnboardingEligibility} reports as eligible. Before starting, it waits
 * for the model, agent mode, and permissions pickers to render, because the
 * onboarding engine marks a tour shown as soon as it starts.
 */
export class ChatInputSpotlightTour extends Disposable {

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

	private _targetWidget: IChatWidget | undefined;

	constructor(
		eligibility: IChatOnboardingEligibility,
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@IContextViewService contextViewService: IContextViewService,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		const actions: IChatInputTourPickerActions = {
			getOpenMenu: picker => picker.isOpen ? contextViewService.getContextViewElement() : undefined,
			open: (picker, section) => this._openSection(picker, section),
		};
		for (const targetId of Object.values(ChatInputTourTarget)) {
			this._register(registerOnboardingTargetProvider(targetId, scope => scope === undefined && this._targetWidget ? resolveChatInputTourTarget(this._targetWidget, targetId, actions) : undefined));
		}
		this._register(onboardingScenarioRegistry.register(createChatInputTour(this._trigger)));

		this._register(autorun(reader => {
			const chat = eligibility.eligibleChat.read(reader);
			if (chat && !this._isTriggeredOrShown()) {
				reader.store.add(this._startWhenTargetsRender(chat));
			}
		}));
	}

	private _isTriggeredOrShown(): boolean {
		return this._trigger.get() || this.onboardingScenarioService.hasBeenShown(CHAT_INPUT_TOUR_ID);
	}

	/** Checks for the tour targets until they render in `chat`, then starts the tour there. */
	private _startWhenTargetsRender(chat: IChatWidget): IDisposable {
		const pending = new MutableDisposable();
		const check = (attempt: number) => {
			pending.value = disposableTimeout(() => {
				if (this._isTriggeredOrShown()) {
					return;
				}
				if (this._hasVisibleTargets(chat)) {
					this._trigger.set(true, undefined);
				} else if (attempt + 1 < ChatInputSpotlightTour.MAX_ATTEMPTS) {
					check(attempt + 1);
				}
			}, attempt === 0 ? ChatInputSpotlightTour.SETTLE_DELAY_MS : ChatInputSpotlightTour.RETRY_DELAY_MS);
		};
		check(0);
		return pending;
	}

	/** Resolves the targets through the registered providers, so readiness uses the spotlight's own visibility rules. */
	private _hasVisibleTargets(chat: IChatWidget): boolean {
		const previous = this._targetWidget;
		this._targetWidget = chat;
		const targetWindow = getWindow(chat.domNode);
		const ready = Object.values(ChatInputTourTarget).every(targetId => resolveOnboardingTarget(targetWindow, targetId) !== undefined);
		if (!ready) {
			this._targetWidget = previous;
		}
		return ready;
	}

	/**
	 * Shows `section` of the picker's menu. When the menu is still open on the other
	 * section, as it is after Next or Back, collapses that section first and expands
	 * `section` once the collapse has been visible, so the step change reads as one
	 * menu moving between sections. Otherwise opens the menu on `section`. Either way
	 * focuses the header of `section`, so every step highlights its section's name.
	 */
	private async _openSection(picker: AgentHostChatInputPicker, section: ChatInputTourPickerSection): Promise<void> {
		if (await this._setSectionExpanded(picker, section === 'mode' ? 'permissions' : 'mode', false)) {
			await timeout(ChatInputSpotlightTour.SECTION_SWITCH_DELAY_MS);
			if (await this._setSectionExpanded(picker, section, true)) {
				return;
			}
		}
		await this._whenMenuClosed();
		const trigger = picker.triggerElement;
		if (!trigger) {
			return;
		}
		picker.show(trigger, section === 'permissions');
		// The menu focuses the selected item when it opens, so move focus to the header once it shows.
		for (let attempt = 0; !picker.isOpen && attempt < ChatInputSpotlightTour.MENU_CLOSE_ATTEMPTS; attempt++) {
			await timeout(ChatInputSpotlightTour.MENU_CLOSE_DELAY_MS);
		}
		const headerId = getSectionHeaderId(section);
		if (picker.isOpen && picker.combinesPermissions && headerId) {
			this.actionWidgetService.focusItemById(headerId);
		}
	}

	/**
	 * Collapses or expands `section` of the picker's open menu, as the arrow keys do on its
	 * header. Returns `false` when the menu is not open or does not combine mode and permissions.
	 */
	private async _setSectionExpanded(picker: AgentHostChatInputPicker, section: ChatInputTourPickerSection, expanded: boolean): Promise<boolean> {
		if (!picker.isOpen || !picker.combinesPermissions) {
			return false;
		}
		const headerId = getSectionHeaderId(section);
		if (!headerId) {
			return false;
		}
		this.actionWidgetService.focusItemById(headerId);
		await this.commandService.executeCommand(expanded ? 'expandSectionCodeAction' : 'collapseSectionCodeAction');
		return true;
	}

	/**
	 * Closes any open menu and waits for it to finish animating closed, since a picker
	 * cannot open while another menu is still shown.
	 */
	private async _whenMenuClosed(): Promise<void> {
		this.actionWidgetService.hide();
		for (let attempt = 0; this.actionWidgetService.isVisible && attempt < ChatInputSpotlightTour.MENU_CLOSE_ATTEMPTS; attempt++) {
			await timeout(ChatInputSpotlightTour.MENU_CLOSE_DELAY_MS);
		}
	}
}
