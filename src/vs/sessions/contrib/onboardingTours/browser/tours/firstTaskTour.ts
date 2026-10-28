/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID } from '../../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { IRunOnboardingStepPayload, RUN_ONBOARDING_STEP_KIND } from '../../../../../workbench/contrib/onboarding/browser/sequence/runOnboardingStep.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND, SpotlightMissingTargetBehavior, SpotlightPlacement } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingSequencePayload, ONBOARDING_SEQUENCE_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/common/onboardingSequence.js';
import { ChatEntitlement, ChatEntitlementContextKeys, isProUser } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NewSessionOnboardingHandoffContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';
import { createNewSessionViewRecentTourWhen, createNewSessionViewWorkspaceStep, getNewSessionViewMentalModelWorkspaceCopy } from './newSessionViewTourShared.js';

/**
 * The first-task tour gets a new user to a first agent result, then follows that task:
 *
 *  1. {@link FIRST_TASK_TOUR_ID} asks for a folder only when none is preselected, then offers
 *     starter tasks from the user's repository. It shares {@link NEW_SESSION_ONBOARDING_SEEN_KEY}
 *     with the other new-session tours, so an experiment can compare it with them.
 *  2. {@link FIRST_TASK_PARALLEL_TOUR_ID} shows New Session while that first task runs.
 *  3. {@link FIRST_TASK_REVIEW_TOUR_ID} shows the changes once it finishes, then pitches
 *     Copilot Pro to Free users, or other agents to paid users.
 *  4. {@link FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID} repeats the Copilot Pro pitch to Free users
 *     when agents run side by side.
 *
 * Steps 2 to 4 only follow users who were shown step 1, unless developer mode is enabled for them.
 */
export const FIRST_TASK_TOUR_ID = 'sessions.onboarding.firstTask';
export const FIRST_TASK_PARALLEL_TOUR_ID = 'sessions.onboarding.firstTask.parallel';
export const FIRST_TASK_REVIEW_TOUR_ID = 'sessions.onboarding.firstTask.review';
export const FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID = 'sessions.onboarding.firstTask.parallelUpgrade';

/** Developer-mode variations of {@link FIRST_TASK_REVIEW_TOUR_ID} that preview a plan's card. */
export const FIRST_TASK_PLANS = ['free', 'paid'] as const;
export type FirstTaskPlan = typeof FIRST_TASK_PLANS[number];

onboardingScenarioRegistry.registerDescriptor({ id: FIRST_TASK_TOUR_ID });
onboardingScenarioRegistry.registerDescriptor({ id: FIRST_TASK_PARALLEL_TOUR_ID });
onboardingScenarioRegistry.registerDescriptor({ id: FIRST_TASK_REVIEW_TOUR_ID, developerModeVariations: FIRST_TASK_PLANS });
onboardingScenarioRegistry.registerDescriptor({ id: FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID });

const FIRST_TASK_EXPERIMENT = {
	behaviorFlag: 'onb.firstTask.show',
	assignmentContextIdFlag: 'onb.firstTask.id',
} as const;

/** The model picker of the active session's chat input, registered by the tour's contribution. */
export const FIRST_TASK_SESSION_MODEL_PICKER_TARGET = 'sessions.onboarding.firstTask.modelPicker';
const NEW_SESSION_BUTTON_TARGET = 'sessions.newSession.button';

const WAIT_FOR_TARGET: SpotlightMissingTargetBehavior = { kind: 'wait', timeoutMs: 5_000, onTimeout: 'skip' };
/** The changes pill only renders when the task changed files. */
const SKIP_WITHOUT_CHANGES: SpotlightMissingTargetBehavior = { kind: 'wait', timeoutMs: 3_000, onTimeout: 'skip' };

const FIRST_TASK_ENTRY_PRIORITY = 130;
const FIRST_TASK_FOLLOW_UP_PRIORITY = 100;

/** What the review tour knows about the finished task when it starts. */
export interface IFirstTaskReviewContext {
	/** The plan whose card to show, or `undefined` to only show the changes. */
	readonly plan: FirstTaskPlan | undefined;
	/** Whether Claude or Codex can start a session in the task's folder. */
	readonly canTryOtherAgents: boolean;
	readonly showSessionsList: () => Promise<void>;
	readonly openPlans: () => Promise<void>;
}

/** The plan card a review shows: a developer-mode preview, otherwise the user's plan. */
export function resolveFirstTaskPlan(entitlement: ChatEntitlement, developerVariation: string | undefined): FirstTaskPlan | undefined {
	const preview = FIRST_TASK_PLANS.find(plan => plan === developerVariation);
	if (preview) {
		return preview;
	}
	if (entitlement === ChatEntitlement.Free) {
		return 'free';
	}
	return isProUser(entitlement) ? 'paid' : undefined;
}

function createFollowUpWhen(): ContextKeyExpression | undefined {
	return ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
		EditorPartModalVisibleContext.toNegated(),
		NewSessionOnboardingHandoffContext.toNegated(),
		SessionsWelcomeVisibleContext.toNegated(),
	);
}

function gotIt(): string {
	return localize('sessions.onboarding.firstTask.gotIt', "Got It");
}

function createUpgradeStep(id: string, targetId: string, title: string, description: string, placement: SpotlightPlacement, openPlans: () => Promise<void>, onBeforeShow?: () => Promise<void>): ISpotlightStep {
	return {
		id,
		targetId,
		title,
		description,
		placement,
		primaryAction: {
			label: localize('sessions.onboarding.firstTask.seePlans', "See Plans"),
			run: () => openPlans(),
			advance: true,
		},
		endTourLabel: localize('sessions.onboarding.firstTask.later', "Later"),
		missingTarget: WAIT_FOR_TARGET,
		onBeforeShow,
	};
}

/** Builds the entry tour that gets a new user to their first prompt. */
export function createFirstTaskTour(
	signal: IObservable<boolean>,
	runStarterTasks: (token: CancellationToken) => Promise<boolean>,
): IOnboardingScenario<IOnboardingSequencePayload> {
	return {
		id: FIRST_TASK_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: createNewSessionViewRecentTourWhen(),
		trigger: { kind: 'observable', signal },
		priority: FIRST_TASK_ENTRY_PRIORITY,
		experiment: FIRST_TASK_EXPERIMENT,
		presentation: {
			kind: ONBOARDING_SEQUENCE_PRESENTATION_KIND,
			payload: {
				steps: [
					{
						id: 'workspacePicker',
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: {
							...createNewSessionViewWorkspaceStep({ requireSelection: false }),
							...getNewSessionViewMentalModelWorkspaceCopy(),
							openTarget: 'ifUnselected',
							skipIfSelected: true,
							advanceOnTargetSelection: true,
						} satisfies ISpotlightStep,
					},
					{
						id: 'starterTasks',
						kind: RUN_ONBOARDING_STEP_KIND,
						payload: {
							run: async token => ({ shown: await runStarterTasks(token) }),
						} satisfies IRunOnboardingStepPayload,
					},
				],
			},
		},
	};
}

/** Builds the tour that shows New Session while the first task runs. */
export function createFirstTaskParallelTour(signal: IObservable<boolean>, showSessionsList: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: FIRST_TASK_PARALLEL_TOUR_ID,
		when: createFollowUpWhen(),
		trigger: { kind: 'observable', signal },
		priority: FIRST_TASK_FOLLOW_UP_PRIORITY,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'newSession',
					targetId: NEW_SESSION_BUTTON_TARGET,
					title: localize('sessions.onboarding.firstTask.parallel.title', "Start another task while this runs"),
					description: localize('sessions.onboarding.firstTask.parallel.description', "Sessions run side by side, so you don't have to wait for this one to finish."),
					nextButtonLabel: gotIt(),
					placement: 'right',
					allowTargetInteraction: true,
					advanceOnTargetClick: true,
					hideNext: false,
					missingTarget: WAIT_FOR_TARGET,
					onBeforeShow: showSessionsList,
				}],
			},
		},
	};
}

/** Creates the review steps for a finished first task. */
export function createFirstTaskReviewSteps(context: IFirstTaskReviewContext): ISpotlightStep[] {
	const steps: ISpotlightStep[] = [{
		id: 'changes',
		targetId: CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID,
		title: localize('sessions.onboarding.firstTask.review.changes.title', "Review what changed"),
		description: localize('sessions.onboarding.firstTask.review.changes.description', "See every edit the agent made, then keep the changes or open a pull request."),
		placement: 'above',
		allowTargetInteraction: true,
		advanceOnTargetClick: true,
		hideNext: false,
		missingTarget: SKIP_WITHOUT_CHANGES,
	}];
	if (context.plan === 'free') {
		steps.push(createUpgradeStep(
			'upgrade',
			FIRST_TASK_SESSION_MODEL_PICKER_TARGET,
			localize('sessions.onboarding.firstTask.review.upgrade.title', "Nice, that's your first agent task"),
			localize('sessions.onboarding.firstTask.review.upgrade.description', "Copilot Pro unlocks the most capable models and more requests for bigger jobs."),
			'above',
			context.openPlans,
		));
	} else if (context.plan === 'paid' && context.canTryOtherAgents) {
		steps.push({
			id: 'otherAgents',
			targetId: NEW_SESSION_BUTTON_TARGET,
			title: localize('sessions.onboarding.firstTask.review.otherAgents.title', "Try Claude or Codex agents too"),
			description: localize('sessions.onboarding.firstTask.review.otherAgents.description', "Start a new session and pick a different agent. Each one works in its own way."),
			nextButtonLabel: gotIt(),
			placement: 'right',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			hideNext: false,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: context.showSessionsList,
		});
	}
	return steps;
}

/** Builds the tour that reviews the first task once it finishes. */
export function createFirstTaskReviewTour(signal: IObservable<boolean>, resolveContext: () => Promise<IFirstTaskReviewContext>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: FIRST_TASK_REVIEW_TOUR_ID,
		developerModeVariations: FIRST_TASK_PLANS,
		when: createFollowUpWhen(),
		trigger: { kind: 'observable', signal },
		priority: FIRST_TASK_FOLLOW_UP_PRIORITY,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [],
				resolveSteps: async () => createFirstTaskReviewSteps(await resolveContext()),
			},
		},
	};
}

/** Builds the tour that repeats the Copilot Pro pitch when a Free user runs agents side by side. */
export function createFirstTaskParallelUpgradeTour(signal: IObservable<boolean>, showSessionsList: () => Promise<void>, openPlans: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: FIRST_TASK_PARALLEL_UPGRADE_TOUR_ID,
		when: createFollowUpWhen(),
		trigger: { kind: 'observable', signal },
		priority: FIRST_TASK_FOLLOW_UP_PRIORITY,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [createUpgradeStep(
					'upgrade',
					NEW_SESSION_BUTTON_TARGET,
					localize('sessions.onboarding.firstTask.parallelUpgrade.title', "Running agents side by side"),
					localize('sessions.onboarding.firstTask.parallelUpgrade.description', "Copilot Pro gives you more requests and the most capable models, so more of your work can run at once."),
					'right',
					openPlans,
					showSessionsList,
				)],
			},
		},
	};
}
