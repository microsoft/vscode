/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID } from '../../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { IRunOnboardingStepPayload } from '../../../../../workbench/contrib/onboarding/browser/sequence/runOnboardingStep.js';
import { ISpotlightStep } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionHasWorkspaceContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { createFirstTaskParallelTour, createFirstTaskParallelUpgradeTour, createFirstTaskReviewSteps, createFirstTaskReviewTour, createFirstTaskTour, FIRST_TASK_SESSION_MODEL_PICKER_TARGET, FirstTaskPlan, resolveFirstTaskPlan } from '../../browser/tours/firstTaskTour.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from '../../browser/tours/newSessionTour.js';
import { createNewSessionViewV2Tour } from '../../browser/tours/newSessionViewV2Tour.js';

suite('FirstTaskTour', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const noop = async () => { };

	function describeStep(step: ISpotlightStep) {
		return {
			id: step.id,
			targetId: step.targetId,
			title: step.title,
			primaryAction: step.primaryAction && { label: step.primaryAction.label, advance: step.primaryAction.advance },
			endTourLabel: step.endTourLabel,
			nextButtonLabel: step.nextButtonLabel,
		};
	}

	test('competes with the other new-session tours for the first impression', async () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenario = createFirstTaskTour(trigger, async () => true);
		const [workspace, starterTasks] = scenario.presentation.payload.steps;
		const workspaceStep = workspace.payload as ISpotlightStep;
		const comparisonSteps = await createNewSessionViewV2Tour(trigger, async () => 'mentalModelAndModels').presentation.payload.resolveSteps!();

		assert.deepStrictEqual({
			id: scenario.id,
			seenKey: scenario.seenKey,
			priority: scenario.priority,
			experiment: scenario.experiment,
			steps: scenario.presentation.payload.steps.map(step => ({ id: step.id, kind: step.kind })),
			workspace: {
				onlyWithoutPreselection: workspaceStep.when?.serialize(),
				openTarget: workspaceStep.openTarget,
				skipIfSelected: workspaceStep.skipIfSelected,
				advanceOnTargetSelection: workspaceStep.advanceOnTargetSelection,
				sameCopyAsMentalModelAndModels: workspaceStep.title === comparisonSteps[0].title && workspaceStep.description === comparisonSteps[0].description,
			},
			starterTasks: await (starterTasks.payload as IRunOnboardingStepPayload).run(CancellationToken.None),
		}, {
			id: 'sessions.onboarding.firstTask',
			seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
			priority: 130,
			experiment: { behaviorFlag: 'onb.firstTask.show', assignmentContextIdFlag: 'onb.firstTask.id' },
			steps: [{ id: 'workspacePicker', kind: 'spotlight' }, { id: 'starterTasks', kind: 'run' }],
			workspace: {
				onlyWithoutPreselection: `${SessionWorkspacePickerVisibleContext.key} && !${SessionHasWorkspaceContext.key}`,
				openTarget: 'ifUnselected',
				skipIfSelected: true,
				advanceOnTargetSelection: true,
				sameCopyAsMentalModelAndModels: true,
			},
			starterTasks: { shown: true },
		});
	});

	test('follows the first task without the experiment or the shared seen key', () => {
		const trigger = observableValue<boolean>(disposables, false);
		const scenarios = [
			createFirstTaskParallelTour(trigger, noop),
			createFirstTaskReviewTour(trigger, async () => ({ plan: undefined, canTryOtherAgents: false, showSessionsList: noop, openPlans: noop })),
			createFirstTaskParallelUpgradeTour(trigger, noop, noop),
		];

		assert.deepStrictEqual(scenarios.map(scenario => ({
			id: scenario.id,
			seenKey: scenario.seenKey,
			experiment: scenario.experiment,
			developerModeVariations: scenario.developerModeVariations,
			steps: scenario.presentation.payload.steps.map(describeStep),
		})), [
			{
				id: 'sessions.onboarding.firstTask.parallel',
				seenKey: undefined,
				experiment: undefined,
				developerModeVariations: undefined,
				steps: [{ id: 'newSession', targetId: 'sessions.newSession.button', title: 'Start another task while this runs', primaryAction: undefined, endTourLabel: undefined, nextButtonLabel: 'Got It' }],
			},
			{
				id: 'sessions.onboarding.firstTask.review',
				seenKey: undefined,
				experiment: undefined,
				developerModeVariations: ['free', 'paid'],
				steps: [],
			},
			{
				id: 'sessions.onboarding.firstTask.parallelUpgrade',
				seenKey: undefined,
				experiment: undefined,
				developerModeVariations: undefined,
				steps: [{ id: 'upgrade', targetId: 'sessions.newSession.button', title: 'Running agents side by side', primaryAction: { label: 'See Plans', advance: true }, endTourLabel: 'Later', nextButtonLabel: undefined }],
			},
		]);
	});

	test('reviews the changes, then pitches Copilot Pro to Free users or other agents to paid users', () => {
		const review = (plan: FirstTaskPlan | undefined, canTryOtherAgents: boolean) => createFirstTaskReviewSteps({ plan, canTryOtherAgents, showSessionsList: noop, openPlans: noop }).map(describeStep);
		const changes = { id: 'changes', targetId: CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID, title: 'Review what changed', primaryAction: undefined, endTourLabel: undefined, nextButtonLabel: undefined };

		assert.deepStrictEqual({
			free: review('free', true),
			paid: review('paid', true),
			paidWithoutOtherAgents: review('paid', false),
			unknownPlan: review(undefined, true),
		}, {
			free: [changes, { id: 'upgrade', targetId: FIRST_TASK_SESSION_MODEL_PICKER_TARGET, title: 'Nice, that\'s your first agent task', primaryAction: { label: 'See Plans', advance: true }, endTourLabel: 'Later', nextButtonLabel: undefined }],
			paid: [changes, { id: 'otherAgents', targetId: 'sessions.newSession.button', title: 'Try Claude or Codex agents too', primaryAction: undefined, endTourLabel: undefined, nextButtonLabel: 'Got It' }],
			paidWithoutOtherAgents: [changes],
			unknownPlan: [changes],
		});
	});

	test('opens the plans page from the upgrade card', async () => {
		let opened = 0;
		const [, upgrade] = createFirstTaskReviewSteps({ plan: 'free', canTryOtherAgents: false, showSessionsList: noop, openPlans: async () => { opened++; } });
		await upgrade.primaryAction!.run(CancellationToken.None);

		assert.strictEqual(opened, 1);
	});

	test('resolves the plan card from the entitlement unless developer mode previews one', () => {
		assert.deepStrictEqual([
			resolveFirstTaskPlan(ChatEntitlement.Free, undefined),
			resolveFirstTaskPlan(ChatEntitlement.Pro, undefined),
			resolveFirstTaskPlan(ChatEntitlement.Business, ''),
			resolveFirstTaskPlan(ChatEntitlement.Unresolved, undefined),
			resolveFirstTaskPlan(ChatEntitlement.Pro, 'free'),
			resolveFirstTaskPlan(ChatEntitlement.Free, 'paid'),
			resolveFirstTaskPlan(ChatEntitlement.Free, 'unsupported'),
		], ['free', 'paid', 'paid', undefined, 'free', 'paid', 'free']);
	});
});
