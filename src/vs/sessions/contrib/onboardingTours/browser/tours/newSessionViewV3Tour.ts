/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { RUN_ONBOARDING_STEP_KIND, IRunOnboardingStepPayload } from '../../../../../workbench/contrib/onboarding/browser/sequence/runOnboardingStep.js';
import { SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingSequencePayload, ONBOARDING_SEQUENCE_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/common/onboardingSequence.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';
import { createNewSessionViewRecentTourWhen, createNewSessionViewWorkspaceStep } from './newSessionViewTourShared.js';

export const NEW_SESSION_VIEW_V3_TOUR_ID = 'sessions.onboarding.newSessionViewV3';

const NEW_SESSION_VIEW_V3_EXPERIMENT = {
	behaviorFlag: 'onb.newSessionViewV3.show',
	assignmentContextIdFlag: 'onb.newSessionViewV3.id',
} as const;

const PROMPT_TYPING_DURATION_MS = 2_500;
const NEW_SESSION_VIEW_V3_TASK_PLACEHOLDER = localize('sessions.onboarding.newSessionViewV3.prompt.taskPlaceholder', "[describe the coding task]");
const NEW_SESSION_VIEW_V3_PROMPT = localize('sessions.onboarding.newSessionViewV3.prompt.text', "Help me complete {0} in this project. First, inspect the relevant files and explain your approach briefly. Then implement the solution using existing project conventions, avoid unrelated changes, and run the most relevant tests or checks. If anything is unclear, make a reasonable assumption and state it. When finished, summarize what changed and mention any remaining issues.", NEW_SESSION_VIEW_V3_TASK_PLACEHOLDER);

export function createNewSessionViewV3Tour(
	signal: IObservable<boolean>,
	runPromptStep: (prompt: string, durationMs: number, taskPlaceholder: string, token: CancellationToken) => Promise<void> | void,
): IOnboardingScenario<IOnboardingSequencePayload> {
	return {
		id: NEW_SESSION_VIEW_V3_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
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
							run: token => runPromptStep(NEW_SESSION_VIEW_V3_PROMPT, PROMPT_TYPING_DURATION_MS, NEW_SESSION_VIEW_V3_TASK_PLACEHOLDER, token),
						} satisfies IRunOnboardingStepPayload,
					},
				],
			},
		},
	};
}
