/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID } from '../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import {
	CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID,
	CHAT_MODEL_PICKER_TOUR_ID,
	createChatModelPickerTour,
} from '../../../browser/onboarding/chatModelPickerTour.js';

suite('Chat model picker onboarding tour', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('scenario targets the model picker with a command trigger', () => {
		const scenario = createChatModelPickerTour();
		assert.deepStrictEqual({
			id: scenario.id,
			trigger: scenario.trigger,
			presentationKind: scenario.presentation.kind,
			repeatable: scenario.repeatable,
			stepTargetIds: (scenario.presentation.payload as { steps: readonly { targetId: string }[] }).steps.map(step => step.targetId),
			commandId: CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID,
			targetId: CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID,
			placement: (scenario.presentation.payload as { steps: readonly { placement?: string }[] }).steps[0].placement,
			openTarget: (scenario.presentation.payload as { steps: readonly { openTarget?: boolean }[] }).steps[0].openTarget,
		}, {
			id: CHAT_MODEL_PICKER_TOUR_ID,
			trigger: { kind: 'command', commandId: CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID },
			presentationKind: SPOTLIGHT_PRESENTATION_KIND,
			repeatable: true,
			stepTargetIds: [CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID],
			commandId: CHAT_MODEL_PICKER_TOUR_ARM_COMMAND_ID,
			targetId: CHAT_MODEL_PICKER_ONBOARDING_TARGET_ID,
			placement: 'left',
			openTarget: true,
		});
	});
});
