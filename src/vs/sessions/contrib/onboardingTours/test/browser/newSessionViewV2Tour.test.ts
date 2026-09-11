/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, SessionHarnessPickerVisibleContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from '../../browser/tours/newSessionViewV2Tour.js';
import { createNewSessionViewV3Tour } from '../../browser/tours/newSessionViewV3Tour.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';
import { createNewSessionViewTour } from '../../browser/tours/newSessionViewTour.js';

suite('NewSessionViewV2Tour', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defines the interactive workspace, harness, and model flow', () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenario = createNewSessionViewV2Tour(trigger);
		const steps = scenario.presentation.payload.steps;

		assert.deepStrictEqual({
			id: scenario.id,
			seenKey: scenario.seenKey,
			presentationKind: scenario.presentation.kind,
			priority: scenario.priority,
			experiment: scenario.experiment,
			steps: steps.map(step => ({
				id: step.id,
				targetId: step.targetId,
				missingTarget: step.missingTarget,
				openTarget: step.openTarget,
				allowTargetInteraction: step.allowTargetInteraction,
				advanceWhenWorkspaceSelected: step.advanceWhen === SessionHasWorkspaceContext,
				requiresInteractiveHarnessPicker: step.when === SessionHarnessPickerVisibleContext,
			})),
		}, {
			id: NEW_SESSION_VIEW_V2_TOUR_ID,
			seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
			presentationKind: 'spotlight',
			priority: 110,
			experiment: {
				behaviorFlag: 'onb.newSessionViewV2.show',
				assignmentContextIdFlag: 'onb.newSessionViewV2.id',
			},
			steps: [
				{
					id: 'workspacePicker',
					targetId: 'sessions.newSession.workspacePicker',
					missingTarget: { kind: 'skip' },
					openTarget: true,
					allowTargetInteraction: true,
					advanceWhenWorkspaceSelected: true,
					requiresInteractiveHarnessPicker: false,
				},
				{
					id: 'harnessPicker',
					targetId: 'sessions.newSession.harnessPicker',
					missingTarget: { kind: 'wait', timeoutMs: 5_000 },
					openTarget: false,
					allowTargetInteraction: true,
					advanceWhenWorkspaceSelected: false,
					requiresInteractiveHarnessPicker: true,
				},
				{
					id: 'modelPicker',
					targetId: 'sessions.newSession.modelPicker',
					missingTarget: { kind: 'wait', timeoutMs: 5_000 },
					openTarget: true,
					allowTargetInteraction: true,
					advanceWhenWorkspaceSelected: false,
					requiresInteractiveHarnessPicker: false,
				},
			],
		});
	});

	test('requires the new-session view for both view tours', () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];

		assert.deepStrictEqual(
			scenarios.map(scenario => scenario.when?.keys().includes(IsNewChatSessionContext.key)),
			[true, true],
		);
	});

	test('waits for an agent-host provider before running V2 or V3', () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenarios = [createNewSessionViewV2Tour(trigger), createNewSessionViewV3Tour(trigger, () => true)];

		assert.deepStrictEqual(
			scenarios.map(scenario => scenario.when?.keys().includes(AgentHostSessionTypesAvailableContext.key)),
			[true, true],
		);
	});

	test('keeps picker targets interactive in both view tours', () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];

		assert.deepStrictEqual(
			scenarios.map(scenario => scenario.presentation.payload.steps.map(step => step.allowTargetInteraction)),
			[[true, true, true], [true, true, true]],
		);
	});
});
