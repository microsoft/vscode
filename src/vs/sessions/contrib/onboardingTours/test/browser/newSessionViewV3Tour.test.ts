/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRunOnboardingStepPayload } from '../../../../../workbench/contrib/onboarding/browser/sequence/runOnboardingStep.js';
import { createNewSessionViewV2Tour } from '../../browser/tours/newSessionViewV2Tour.js';
import { createNewSessionViewV3Tour, NEW_SESSION_VIEW_V3_TOUR_ID } from '../../browser/tours/newSessionViewV3Tour.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';

suite('NewSessionViewV3Tour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reuses V2 criteria and workspace step, then runs the variation step', async () => {
		const trigger = observableValue<boolean>(disposables, false);
		let receivedToken: CancellationToken | undefined;
		const scenario = createNewSessionViewV3Tour(trigger, token => {
			receivedToken = token;
			return true;
		});
		const v2Scenario = createNewSessionViewV2Tour(trigger);
		const steps = scenario.presentation.payload.steps;
		const v2WorkspaceStep = v2Scenario.presentation.payload.steps[0];
		const workspaceStep = steps[0].payload as typeof v2WorkspaceStep;
		const runPromptStep = steps[1].payload as IRunOnboardingStepPayload;
		const runResult = await runPromptStep.run(CancellationToken.None);

		const summarizeWorkspaceStep = (step: typeof v2WorkspaceStep) => ({
			id: step.id,
			targetId: step.targetId,
			title: step.title,
			description: step.description,
			placement: step.placement,
			when: step.when?.serialize(),
			missingTarget: step.missingTarget,
			openTarget: step.openTarget,
			allowTargetInteraction: step.allowTargetInteraction,
			advanceWhen: step.advanceWhen?.serialize(),
		});

		assert.deepStrictEqual({
			id: scenario.id,
			seenKey: scenario.seenKey,
			priority: scenario.priority,
			experiment: scenario.experiment,
			developerModeVariations: scenario.developerModeVariations,
			criteriaMatchV2: scenario.when?.serialize() === v2Scenario.when?.serialize(),
			presentationKind: scenario.presentation.kind,
			steps: steps.map(step => ({ id: step.id, kind: step.kind })),
			workspaceStep: summarizeWorkspaceStep(workspaceStep),
			v2WorkspaceStep: summarizeWorkspaceStep(v2WorkspaceStep),
			receivedTokenIsForwarded: receivedToken === CancellationToken.None,
			runResult,
		}, {
			id: NEW_SESSION_VIEW_V3_TOUR_ID,
			seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
			priority: 120,
			experiment: {
				behaviorFlag: 'onb.newSessionViewV3.show',
				assignmentContextIdFlag: 'onb.newSessionViewV3.id',
			},
			developerModeVariations: ['prompt', 'githubPrompt', 'options'],
			criteriaMatchV2: true,
			presentationKind: 'sequence',
			steps: [
				{ id: 'workspacePicker', kind: 'spotlight' },
				{ id: 'insertPrompt', kind: 'run' },
			],
			workspaceStep: {
				id: 'workspacePicker',
				targetId: 'sessions.newSession.workspacePicker',
				title: 'Choose a workspace',
				description: 'A workspace is the folder or repository where your agent reads context and makes changes. Choose one so it can understand your project and work on the right files.',
				placement: 'above',
				when: 'sessionWorkspacePickerVisible && !sessionHasWorkspace',
				missingTarget: { kind: 'skip' },
				openTarget: true,
				allowTargetInteraction: true,
				advanceWhen: 'sessionHasWorkspace',
			},
			v2WorkspaceStep: {
				id: 'workspacePicker',
				targetId: 'sessions.newSession.workspacePicker',
				title: 'Choose a workspace',
				description: 'A workspace is the folder or repository where your agent reads context and makes changes. Choose one so it can understand your project and work on the right files.',
				placement: 'above',
				when: 'sessionWorkspacePickerVisible && !sessionHasWorkspace',
				missingTarget: { kind: 'skip' },
				openTarget: true,
				allowTargetInteraction: true,
				advanceWhen: 'sessionHasWorkspace',
			},
			receivedTokenIsForwarded: true,
			runResult: { shown: true },
		});
	});
});
