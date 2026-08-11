/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID } from '../widget/input/modelPicker/modelPickerWidget.js';

/** Command that arms the chat model-picker onboarding tour (shows the activity pip). */
export const CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID = 'workbench.action.chat.armModelPickerTour';

/** Stable scenario id for the chat model-picker spotlight tour. */
export const CHAT_MODEL_PICKER_TOUR_ID = 'chat.onboarding.modelPicker';

/** Whether the model-picker tour is waiting for the user to open Chat. */
export const ChatModelPickerTourArmedContext = new RawContextKey<boolean>('chatModelPickerTourArmed', false);

const modelPickerTourPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'modelPicker',
			targetId: CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID,
			title: localize('chat.onboarding.modelPicker.title', "Choose the Right Model for the Task"),
			description: localize('chat.onboarding.modelPicker.description', "Use a faster, more economical model for everyday work, or choose a more capable model when the task calls for deeper reasoning."),
			placement: 'left',
			padding: 6,
			openTarget: true,
			missingTarget: { kind: 'wait', timeoutMs: 8_000 },
		},
	],
};

/**
 * Builds the chat model-picker spotlight scenario. The tour never auto-starts;
 * it is armed by {@link CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID} and started after
 * the user opens Chat from the activity bar pip.
 */
export function createChatModelPickerTour(): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: CHAT_MODEL_PICKER_TOUR_ID,
		when: ChatContextKeys.enabled,
		trigger: { kind: 'command', commandId: CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID },
		// Re-armable for demos and developer previews via the command palette.
		repeatable: true,
		priority: 50,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: modelPickerTourPayload,
		},
	};
}

/** Shared when-clause for the arm command and related UI. */
export const chatModelPickerTourWhen = ContextKeyExpr.and(ChatContextKeys.enabled);
