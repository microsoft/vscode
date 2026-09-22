/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/onboarding.js';
import { createModelPickerTryout } from '../../../browser/onboarding/modelPickerTryout.contribution.js';
import { ChatOnboardingTarget, MODEL_PICKER_TRYOUT_ID } from '../../../common/onboarding/modelPickerTryout.js';
import { NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND } from '../../../common/onboarding/newSessionPickerTryout.js';

suite('Model picker tryout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('defines the exact guided Agents payload without a model or provider selection', () => {
		const tryout = createModelPickerTryout();

		assert.deepStrictEqual({
			id: tryout.id,
			isAI: tryout.isAI,
			targetWindow: tryout.targetWindow,
			when: tryout.when?.serialize(),
			presentation: tryout.presentation,
		}, {
			id: MODEL_PICKER_TRYOUT_ID,
			isAI: true,
			targetWindow: 'agents',
			when: 'chatIsEnabled',
			presentation: {
				kind: GUIDED_TRYOUT_PRESENTATION_KIND,
				payload: {
					launch: {
						kind: NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND,
						payload: 'model',
					},
					steps: [{
						id: 'modelPicker',
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: {
							id: 'modelPicker',
							targetId: ChatOnboardingTarget.ModelPicker,
							title: 'Choose a Model and Provider',
							description: 'Models can come from different providers and vary in capability, speed, and billing or premium request usage. Review the details for your provider and plan before choosing.',
							placement: 'below',
							openTarget: true,
							allowTargetInteraction: true,
							missingTarget: { kind: 'wait', timeoutMs: 10_000 },
						},
					}],
					unavailableMessage: 'The Agents draft opened, but its model picker could not be highlighted. Use Models in Chat or Agents after setting up a provider.',
				},
			},
		});
	});

	test('offers setup and useful unavailable guidance', () => {
		const tryout = createModelPickerTryout();

		assert.deepStrictEqual({
			unavailableMessage: tryout.unavailableMessage,
			setup: tryout.setup,
		}, {
			unavailableMessage: 'The Agents draft opened, but its model picker is unavailable. Set up Chat or a model provider, then use Models in Chat or Agents to compare options and billing.',
			setup: {
				label: 'Set Up Chat',
				command: { id: 'workbench.action.chat.triggerSetup' },
			},
		});
	});
});
