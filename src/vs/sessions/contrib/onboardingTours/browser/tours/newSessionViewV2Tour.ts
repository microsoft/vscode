/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { SessionHarnessPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';
import { createNewSessionViewRecentTourWhen, createNewSessionViewWorkspaceStep } from './newSessionViewTourShared.js';

export const NEW_SESSION_VIEW_V2_TOUR_ID = 'sessions.onboarding.newSessionViewV2';
export const NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID = 'sessions.onboarding.newSessionViewV2.parallelWork';
export const NEW_SESSION_VIEW_V2_VARIATION_TREATMENT = 'onb.newSessionViewV2.variation';
export const NEW_SESSION_VIEW_V2_VARIATIONS = ['default', 'workspaceAndModel'] as const;
export type NewSessionViewV2Variation = typeof NEW_SESSION_VIEW_V2_VARIATIONS[number];

onboardingScenarioRegistry.registerDescriptor({ id: NEW_SESSION_VIEW_V2_TOUR_ID, developerModeVariations: NEW_SESSION_VIEW_V2_VARIATIONS });
onboardingScenarioRegistry.registerDescriptor({ id: NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID });

const NEW_SESSION_VIEW_V2_EXPERIMENT = {
	behaviorFlag: 'onb.newSessionViewV2.show',
	assignmentContextIdFlag: 'onb.newSessionViewV2.id',
} as const;

const WAIT_FOR_PICKER = { kind: 'wait', timeoutMs: 5_000 } as const;

const modelPickerStep: ISpotlightStep = {
	id: 'modelPicker',
	targetId: 'sessions.newSession.modelPicker',
	title: localize('sessions.onboarding.newSessionViewV2.model.title', "Choose a model"),
	description: localize('sessions.onboarding.newSessionViewV2.model.description', "The model powers your agent's reasoning. Choose one based on the balance of speed and capability your task needs."),
	placement: 'below',
	missingTarget: WAIT_FOR_PICKER,
	openTarget: true,
	allowTargetInteraction: true,
};

const newSessionViewV2Payload: ISpotlightPayload = {
	steps: [
		createNewSessionViewWorkspaceStep({ requireSelection: false }),
		{
			id: 'harnessPicker',
			targetId: 'sessions.newSession.harnessPicker',
			title: localize('sessions.onboarding.newSessionViewV2.harness.title', "Choose a harness"),
			description: localize('sessions.onboarding.newSessionViewV2.harness.description', "A harness is the agent runtime that plans, uses tools, and carries out your task. Choose one based on the capabilities your work needs."),
			placement: 'above',
			missingTarget: WAIT_FOR_PICKER,
			openTarget: false,
			when: SessionHarnessPickerVisibleContext,
			allowTargetInteraction: true,
		},
		modelPickerStep,
	],
};

const workspaceAndModelPayload: ISpotlightPayload = {
	steps: [
		{
			...createNewSessionViewWorkspaceStep({ requireSelection: false }),
			when: SessionWorkspacePickerVisibleContext,
			openTarget: 'ifUnselected',
			advanceOnTargetSelection: true,
		},
		{
			...modelPickerStep,
			openTarget: false,
		},
	],
};

/** Builds the interactive new-session view tour. */
export function createNewSessionViewV2Tour(
	signal: IObservable<boolean>,
	resolveVariation?: () => Promise<NewSessionViewV2Variation>,
	options: { enabledByDefault?: boolean } = {},
): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_VIEW_V2_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		developerModeVariations: NEW_SESSION_VIEW_V2_VARIATIONS,
		when: createNewSessionViewRecentTourWhen(),
		trigger: { kind: 'observable', signal },
		priority: 110,
		experiment: options.enabledByDefault ? undefined : NEW_SESSION_VIEW_V2_EXPERIMENT,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				...newSessionViewV2Payload,
				resolveSteps: resolveVariation ? async () => (await resolveVariation() === 'workspaceAndModel' ? workspaceAndModelPayload : newSessionViewV2Payload).steps : undefined,
			},
		},
	};
}

export function createNewSessionViewV2ParallelWorkTour(targetId: string, onBeforeShow: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		trigger: { kind: 'command', commandId: NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'runningSession',
					targetId,
					title: localize('sessions.onboarding.newSessionViewV2.runningSession.title', "Your session is here"),
					description: localize('sessions.onboarding.newSessionViewV2.runningSession.description', "Keep track of your running session in the sessions list while you start another task. Your agent can keep working in parallel."),
					placement: 'right',
					missingTarget: { kind: 'wait', timeoutMs: 5_000, onTimeout: 'abort' },
					onBeforeShow,
				}, ...workspaceAndModelPayload.steps],
			},
		},
	};
}
