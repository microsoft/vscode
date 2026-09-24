/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, SessionHarnessPickerVisibleContext, SessionHasWorkspaceContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { resolveNewSessionViewV2TourVariation } from '../../browser/newSessionViewV2TourVariation.js';
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
				description: step.description,
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
					description: 'A workspace is the folder or repository where your agent reads context and makes changes. Choose one for project-specific work, or continue without one.',
					missingTarget: { kind: 'skip' },
					openTarget: true,
					allowTargetInteraction: true,
					advanceWhenWorkspaceSelected: false,
					requiresInteractiveHarnessPicker: false,
				},
				{
					id: 'harnessPicker',
					targetId: 'sessions.newSession.harnessPicker',
					description: 'A harness is the agent runtime that plans, uses tools, and carries out your task. Choose one based on the capabilities your work needs.',
					missingTarget: { kind: 'wait', timeoutMs: 5_000 },
					openTarget: false,
					allowTargetInteraction: true,
					advanceWhenWorkspaceSelected: false,
					requiresInteractiveHarnessPicker: true,
				},
				{
					id: 'modelPicker',
					targetId: 'sessions.newSession.modelPicker',
					description: 'The model powers your agent\'s reasoning. Choose one based on the balance of speed and capability your task needs.',
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

	test('resolves the workspace-and-model variation without changing the default flow', async () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenario = createNewSessionViewV2Tour(trigger, async () => 'workspaceAndModel');
		const steps = await scenario.presentation.payload.resolveSteps!();
		const defaultScenario = createNewSessionViewV2Tour(trigger, async () => 'default');
		const workspaceStep = steps[0];

		assert.deepStrictEqual({
			variations: scenario.developerModeVariations,
			stepIds: steps.map(step => step.id),
			workspace: {
				when: workspaceStep.when?.serialize(),
				openTarget: workspaceStep.openTarget,
				advanceOnTargetSelection: workspaceStep.advanceOnTargetSelection,
				advanceWhen: workspaceStep.advanceWhen,
				hideNext: workspaceStep.hideNext,
				allowTargetInteraction: workspaceStep.allowTargetInteraction,
			},
			model: { openTarget: steps[1].openTarget, allowTargetInteraction: steps[1].allowTargetInteraction },
			defaultStepsUnchanged: await defaultScenario.presentation.payload.resolveSteps!() === defaultScenario.presentation.payload.steps,
		}, {
			variations: ['default', 'workspaceAndModel'],
			stepIds: ['workspacePicker', 'modelPicker'],
			workspace: {
				when: SessionWorkspacePickerVisibleContext.serialize(),
				openTarget: 'ifUnselected',
				advanceOnTargetSelection: true,
				advanceWhen: undefined,
				hideNext: undefined,
				allowTargetInteraction: true,
			},
			model: { openTarget: false, allowTargetInteraction: true },
			defaultStepsUnchanged: true,
		});
	});

	test('selects the V2 variation from the experiment or an enabled developer override', async () => {
		const cases = [
			{ treatment: undefined, developerMode: false, override: undefined, expected: 'default', warnings: 0 },
			{ treatment: 'workspaceAndModel', developerMode: false, override: undefined, expected: 'workspaceAndModel', warnings: 0 },
			{ treatment: 'default', developerMode: true, override: 'workspaceAndModel', expected: 'workspaceAndModel', warnings: 0 },
			{ treatment: 'workspaceAndModel', developerMode: true, override: 'default', expected: 'default', warnings: 0 },
			{ treatment: 'default', developerMode: false, override: 'workspaceAndModel', expected: 'default', warnings: 0 },
			{ treatment: 'workspaceAndModel', developerMode: true, override: '', expected: 'workspaceAndModel', warnings: 0 },
			{ treatment: 'unsupported', developerMode: false, override: undefined, expected: 'default', warnings: 1 },
		];
		const results = [];
		for (const entry of cases) {
			const configurationService = new TestConfigurationService({
				[ONBOARDING_DEVELOPER_MODE_CONFIG]: { [NEW_SESSION_VIEW_V2_TOUR_ID]: entry.developerMode },
				[ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { [NEW_SESSION_VIEW_V2_TOUR_ID]: entry.override },
			});
			const requestedTreatments: string[] = [];
			const assignmentService = new class extends NullWorkbenchAssignmentService {
				override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
					requestedTreatments.push(name);
					return entry.treatment as T | undefined;
				}
			}();
			let warnings = 0;
			const logService = disposables.add(new class extends NullLogService {
				override warn(): void { warnings++; }
			}());
			results.push({
				variation: await resolveNewSessionViewV2TourVariation(configurationService, assignmentService, logService),
				warnings,
				requestedTreatments,
			});
		}
		assert.deepStrictEqual(results, cases.map(entry => ({
			variation: entry.expected,
			warnings: entry.warnings,
			requestedTreatments: entry.developerMode && entry.override ? [] : ['onb.newSessionViewV2.variation'],
		})));
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
