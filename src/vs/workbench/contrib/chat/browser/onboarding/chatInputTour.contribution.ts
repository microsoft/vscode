/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, isOnboardingDeveloperModeEnabled } from '../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatOnboardingExperience } from '../../common/constants.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';

/**
 * Onboarding tour that introduces a brand-new user to the chat input the first
 * time they open the Chat view. It spotlights two controls without opening them:
 *
 *  1. The mode picker — switch between Agent, Ask and Plan.
 *  2. The model picker — switch between language models.
 *
 * Which onboarding experience a user gets is controlled by
 * {@link ChatConfiguration.OnboardingExperience}. The setting is registered with
 * `experiment: { mode: 'auto' }` so an ExP treatment can drive it once the
 * experiment is set up.
 */
export const CHAT_INPUT_TOUR_ID = 'chat.onboarding.chatInput';

/** Onboarding target ids resolved by {@link ChatInputTourTrigger}. */
export const ChatInputTourTarget = {
	ModePicker: 'chat.input.modePicker',
	ModelPicker: 'chat.input.modelPicker',
} as const;

const chatInputTourPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'modePicker',
			targetId: ChatInputTourTarget.ModePicker,
			title: localize('chat.onboarding.chatInput.mode.title', "Switch Between Agent, Ask, and Plan"),
			description: localize('chat.onboarding.chatInput.mode.description', "Use Agent to make changes and run tools across your workspace, Ask to get answers about your code without editing it, and Plan to think through an approach before any code is written. Switch anytime to match your task."),
			placement: 'above',
			missingTarget: { kind: 'skip' },
		},
		{
			id: 'modelPicker',
			targetId: ChatInputTourTarget.ModelPicker,
			title: localize('chat.onboarding.chatInput.model.title', "Choose Your Model"),
			description: localize('chat.onboarding.chatInput.model.description', "Change the model at any time. Some models respond faster, while others are better at complex reasoning, so pick the one that fits your task."),
			placement: 'above',
			missingTarget: { kind: 'skip' },
		},
	],
};

/**
 * Builds the chat input tour scenario. The `signal` is driven by
 * {@link ChatInputTourTrigger} and flips once an eligible user has the Chat view
 * open with both pickers rendered.
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

function getChatInputTourTargetElement(widget: IChatWidget, targetId: string): HTMLElement | undefined {
	switch (targetId) {
		case ChatInputTourTarget.ModePicker: return widget.inputPart.modePickerElement;
		case ChatInputTourTarget.ModelPicker: return widget.inputPart.modelPickerElement;
		default: return undefined;
	}
}

/**
 * Decides *when* the chat input tour runs and resolves its spotlight targets.
 *
 * The tour is only offered when {@link ChatConfiguration.OnboardingExperience} is
 * `spotlight` and the user has never sent a chat message from an editor window,
 * as recorded by {@link EditorChatUsage}. Once a Chat view widget is visible, the
 * trigger waits for the mode and model pickers to render before flipping the
 * signal, because the onboarding engine marks a tour shown as soon as it starts.
 *
 * The `onboarding.developerMode` setting bypasses the "no messages sent" gate so
 * the tour can be previewed on demand.
 */
export class ChatInputTourTrigger extends Disposable {

	/** Delay before the first readiness check, so restore and input rendering can settle. */
	static readonly SETTLE_DELAY_MS = 1_000;
	static readonly RETRY_DELAY_MS = 500;
	static readonly MAX_ATTEMPTS = 20;

	private readonly _trigger = observableValue<boolean>(this, false);
	readonly signal: IObservable<boolean> = this._trigger;

	private readonly _experience: IObservable<string>;
	private readonly _pendingCheck = this._register(new MutableDisposable());
	private _hasSentRequest: boolean;
	private _targetWidget: IChatWidget | undefined;

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@IChatService chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._hasSentRequest = new EditorChatUsage(storageService).getMessageCount() > 0;
		this._experience = observableConfigValue<string>(ChatConfiguration.OnboardingExperience, ChatOnboardingExperience.None, configurationService);

		for (const targetId of Object.values(ChatInputTourTarget)) {
			this._register(registerOnboardingTargetProvider(targetId, scope => {
				const element = scope === undefined && this._targetWidget ? getChatInputTourTargetElement(this._targetWidget, targetId) : undefined;
				return element ? { element } : undefined;
			}));
		}

		this._register(chatService.onDidAcceptRequest(() => {
			this._hasSentRequest = true;
			this._pendingCheck.clear();
		}));
		this._register(chatWidgetService.onDidAddWidget(() => this._update()));
		this._register(chatWidgetService.onDidChangeWidgetVisibility(() => this._update()));
		this._register(autorun(reader => {
			this._experience.read(reader);
			this._update();
		}));
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

	private _getVisibleChatViewWidgets(): readonly IChatWidget[] {
		return this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).filter(widget => widget.visible && isIChatViewViewContext(widget.viewContext));
	}

	private _update(): void {
		if (!this._isEligible()) {
			this._pendingCheck.clear();
			return;
		}
		if (!this._pendingCheck.value && this._getVisibleChatViewWidgets().length > 0) {
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
			const widget = this._getVisibleChatViewWidgets().find(candidate => this._hasVisibleTargets(candidate));
			if (widget) {
				this._targetWidget = widget;
				this._trigger.set(true, undefined);
			} else if (attempt + 1 < ChatInputTourTrigger.MAX_ATTEMPTS && this._getVisibleChatViewWidgets().length > 0) {
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
				localize('chat.onboarding.experience.spotlight', "Spotlight the mode and model pickers the first time the Chat view opens, if no chat messages have been sent yet."),
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
