/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { IOnboardingTarget, registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AgentHostPickerSection } from '../agentSessions/agentHost/agentHostChatInputPicker.js';
import { IChatWidget } from '../chat.js';
import { ChatOnboardingEligibility, IChatOnboardingEligibility } from './chatOnboardingEligibility.js';

export const CHAT_INPUT_TOUR_ID = 'chat.onboarding.chatInput';

export const ChatInputTourTarget = {
	AgentMode: 'chat.input.agentMode',
	Permissions: 'chat.input.permissions',
	ModelPicker: 'chat.input.modelPicker',
} as const;

const chatInputTourSteps: readonly ISpotlightStep[] = [
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
];

function createChatInputTour(signal: IObservable<boolean>, onBeforeShowStep: () => void): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: CHAT_INPUT_TOUR_ID,
		when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorPartModalVisibleContext.toNegated()),
		trigger: { kind: 'observable', signal },
		priority: 50,
		experiment: { behaviorFlag: 'onb.chatInput.show', assignmentContextIdFlag: 'onb.chatInput.id' },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: { steps: chatInputTourSteps.map(step => ({ ...step, onBeforeShow: onBeforeShowStep })) },
		},
	};
}

type ChatInputTourPicker = NonNullable<ReturnType<IChatWidget['inputPart']['getAgentHostPicker']>>;

function resolveChatInputTourTarget(widget: IChatWidget, targetId: string): IOnboardingTarget | undefined {
	const input = widget.inputPart;
	const pickerTarget = (picker: ChatInputTourPicker | undefined, section: AgentHostPickerSection): IOnboardingTarget | undefined => {
		const element = picker?.triggerElement;
		return picker && element ? {
			element,
			open: token => picker.showSection(section, token ?? CancellationToken.None),
			additionalElements: () => picker.menuElement ? [picker.menuElement] : [],
		} : undefined;
	};
	switch (targetId) {
		case ChatInputTourTarget.AgentMode:
			return pickerTarget(input.getAgentHostPicker(SessionConfigKey.Mode), 'mode');
		case ChatInputTourTarget.Permissions: {
			const modePicker = input.getAgentHostPicker(SessionConfigKey.Mode);
			return pickerTarget(modePicker?.combinesPermissions ? modePicker : input.getAgentHostPicker(SessionConfigKey.AutoApprove), 'permissions');
		}
		case ChatInputTourTarget.ModelPicker: {
			const element = input.getModelPickerControl()?.element;
			return element ? { element } : undefined;
		}
		default:
			return undefined;
	}
}

/**
 * Starts the chat input tour in the eligible chat once its targets render there, because the
 * onboarding engine marks a tour shown as soon as it starts. Ends the tour if a modal editor opens.
 */
export class ChatInputSpotlightTour extends Disposable {

	/** Delay before the first readiness check, so restore and input rendering can settle. */
	static readonly SETTLE_DELAY_MS = 1_000;
	static readonly RETRY_DELAY_MS = 500;
	/** The Copilot harness pickers render once the Agent Host resolves the session configuration. */
	static readonly MAX_ATTEMPTS = 40;

	private readonly _readyChat = observableValue<IChatWidget | undefined>(this, undefined);
	readonly signal: IObservable<boolean>;
	private readonly _run = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		eligibility: IChatOnboardingEligibility,
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.signal = derived(this, reader => {
			const chat = this._readyChat.read(reader);
			return !!chat && eligibility.eligibleChat.read(reader) === chat;
		});
		for (const targetId of Object.values(ChatInputTourTarget)) {
			this._register(registerOnboardingTargetProvider(targetId, scope => {
				const chat = eligibility.eligibleChat.get();
				return scope === undefined && chat ? resolveChatInputTourTarget(chat, targetId) : undefined;
			}));
		}
		this._register(onboardingScenarioRegistry.register(createChatInputTour(this.signal, () => this._joinRun())));

		this._register(autorun(reader => {
			const chat = eligibility.eligibleChat.read(reader);
			if (chat && chat !== this._readyChat.read(reader)) {
				reader.store.add(this._markReadyWhenTargetsRender(chat));
			}
		}));

		const modalKeys = new Set([EditorPartModalVisibleContext.key]);
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(modalKeys) && contextKeyService.getContextKeyValue<boolean>(EditorPartModalVisibleContext.key)) {
				this._run.value?.cancel();
			}
		}));
	}

	private _markReadyWhenTargetsRender(chat: IChatWidget): IDisposable {
		const pending = new MutableDisposable();
		const targetWindow = getWindow(chat.domNode);
		const check = (attempt: number) => {
			pending.value = disposableTimeout(() => {
				if (Object.values(ChatInputTourTarget).every(targetId => resolveOnboardingTarget(targetWindow, targetId))) {
					this._readyChat.set(chat, undefined);
				} else if (attempt + 1 < ChatInputSpotlightTour.MAX_ATTEMPTS) {
					check(attempt + 1);
				}
			}, attempt === 0 ? ChatInputSpotlightTour.SETTLE_DELAY_MS : ChatInputSpotlightTour.RETRY_DELAY_MS);
		};
		check(0);
		return pending;
	}

	/** Joins the running tour, so a modal editor can end it. */
	private _joinRun(): void {
		if (this._run.value) {
			return;
		}
		const run = this._run.value = new CancellationTokenSource();
		void this.onboardingScenarioService.runScenario(CHAT_INPUT_TOUR_ID, run.token).finally(() => {
			if (this._run.value === run) {
				this._run.clear();
			}
		});
	}
}

class ChatInputSpotlightTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatInputSpotlightTour';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const developerMode = observableConfigValue<unknown>(ONBOARDING_DEVELOPER_MODE_CONFIG, undefined, configurationService);
		const bypassNewUserCheck = derived(this, reader => {
			developerMode.read(reader);
			return isOnboardingDeveloperModeEnabled(configurationService, CHAT_INPUT_TOUR_ID);
		});
		const eligibility = this._register(instantiationService.createInstance(ChatOnboardingEligibility, bypassNewUserCheck));
		this._register(instantiationService.createInstance(ChatInputSpotlightTour, eligibility));
	}
}

registerWorkbenchContribution2(ChatInputSpotlightTourContribution.ID, ChatInputSpotlightTourContribution, WorkbenchPhase.AfterRestored);
