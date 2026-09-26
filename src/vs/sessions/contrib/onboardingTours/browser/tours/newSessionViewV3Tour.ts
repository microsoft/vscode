/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { RUN_ONBOARDING_STEP_KIND, IRunOnboardingStepPayload } from '../../../../../workbench/contrib/onboarding/browser/sequence/runOnboardingStep.js';
import { SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingSequencePayload, ONBOARDING_SEQUENCE_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/common/onboardingSequence.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';
import { createNewSessionViewRecentTourWhen, createNewSessionViewWorkspaceStep } from './newSessionViewTourShared.js';

export const NEW_SESSION_VIEW_V3_TOUR_ID = 'sessions.onboarding.newSessionViewV3';
export const NEW_SESSION_VIEW_V3_PROMPT_VARIATION = 'prompt';
export const NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION = 'githubPrompt';
export const NEW_SESSION_VIEW_V3_OPTIONS_VARIATION = 'options';
export const NEW_SESSION_VIEW_V3_VARIATION_TREATMENT = 'onb.newSessionViewV3.variation';
export const NEW_SESSION_VIEW_V3_VARIATIONS = [NEW_SESSION_VIEW_V3_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_GITHUB_PROMPT_VARIATION, NEW_SESSION_VIEW_V3_OPTIONS_VARIATION] as const;

const NEW_SESSION_VIEW_V3_EXPERIMENT = {
	behaviorFlag: 'onb.newSessionViewV3.show',
	assignmentContextIdFlag: 'onb.newSessionViewV3.id',
} as const;

export function createNewSessionViewV3Tour(
	signal: IObservable<boolean>,
	runPromptStep: (token: CancellationToken) => Promise<boolean> | boolean,
): IOnboardingScenario<IOnboardingSequencePayload> {
	return {
		id: NEW_SESSION_VIEW_V3_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		developerModeVariations: NEW_SESSION_VIEW_V3_VARIATIONS,
		when: createNewSessionViewRecentTourWhen(),
		trigger: { kind: 'observable', signal },
		priority: 120,
		experiment: NEW_SESSION_VIEW_V3_EXPERIMENT,
		presentation: {
			kind: ONBOARDING_SEQUENCE_PRESENTATION_KIND,
			payload: {
				steps: [
					{
						id: 'workspacePicker',
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: createNewSessionViewWorkspaceStep(),
					},
					{
						id: 'insertPrompt',
						kind: RUN_ONBOARDING_STEP_KIND,
						payload: {
							run: async token => ({ shown: await runPromptStep(token) }),
						} satisfies IRunOnboardingStepPayload,
					},
				],
			},
		},
	};
}
