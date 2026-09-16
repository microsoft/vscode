/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/onboarding.js';
import { IOnboardingTryout, registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { ChatOnboardingTarget, MODEL_PICKER_TRYOUT_ID, PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID } from '../../common/onboarding/modelPickerTryout.js';

export function createModelPickerTryout(): IOnboardingTryout<IGuidedTryoutPayload> {
	return {
		id: MODEL_PICKER_TRYOUT_ID,
		title: localize('chat.tryout.modelPicker.title', "Try Model and Provider Selection"),
		description: localize('chat.tryout.modelPicker.description', "Open a safe, unsent Agents draft and compare available models, providers, and billing information."),
		isAI: true,
		targetWindow: 'agents',
		when: ChatContextKeys.enabled,
		unavailableMessage: localize('chat.tryout.modelPicker.unavailable', "The Agents draft opened, but its model picker is unavailable. Set up Chat or a model provider, then use Models in Chat or Agents to compare options and billing."),
		setup: {
			label: localize('chat.tryout.modelPicker.setup', "Set Up Chat"),
			command: { id: CHAT_SETUP_ACTION_ID },
		},
		presentation: {
			kind: GUIDED_TRYOUT_PRESENTATION_KIND,
			payload: {
				launch: {
					kind: 'command',
					payload: {
						commandId: PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID,
					},
				},
				steps: [{
					id: 'modelPicker',
					kind: SPOTLIGHT_PRESENTATION_KIND,
					payload: {
						id: 'modelPicker',
						targetId: ChatOnboardingTarget.ModelPicker,
						title: localize('chat.tryout.modelPicker.step.title', "Choose a Model and Provider"),
						description: localize('chat.tryout.modelPicker.step.description', "Models can come from different providers and vary in capability, speed, and billing or premium request usage. Review the details for your provider and plan before choosing; this example never selects a model or sends a prompt for you."),
						placement: 'below',
						openTarget: true,
						allowTargetInteraction: true,
						missingTarget: { kind: 'wait', timeoutMs: 10_000 },
					},
				}],
				unavailableMessage: localize('chat.tryout.modelPicker.guidanceUnavailable', "The Agents draft opened, but its model picker could not be highlighted. Use Models in Chat or Agents after setting up a provider."),
			},
		},
	};
}

class ModelPickerTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.modelPickerTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout(createModelPickerTryout()));
	}
}

registerWorkbenchContribution2(ModelPickerTryoutContribution.ID, ModelPickerTryoutContribution, WorkbenchPhase.BlockRestore);
