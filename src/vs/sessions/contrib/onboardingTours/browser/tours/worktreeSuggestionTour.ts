/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { WORKTREE_SUGGESTION_TOUR_ID } from '../../../worktreeSuggestion/common/worktreeSuggestion.js';

onboardingScenarioRegistry.registerDescriptor({ id: WORKTREE_SUGGESTION_TOUR_ID });

export interface IWorktreeSuggestionTourOptions {
	/** Explains the uncommitted changes, e.g. "main has 3 uncommitted files." */
	readonly changes: string;
	readonly sendInWorktreeLabel: string;
	/** Labels the button that ends the tour and sends the request on Branch, which Escape also presses. */
	readonly sendLabel: string;
	/** Shows the isolation picker when the session options are collapsed. */
	readonly reveal: () => void;
	/** Records that the user chose to send the request in a new worktree. */
	readonly sendInWorktree: () => void;
	readonly onDidShow: () => void;
}

/**
 * Spotlights the isolation picker of the new-session composer as the user sends a request while Branch
 * is selected in a folder with uncommitted changes, asking whether to send it in a new worktree instead.
 * Only runs on demand: the worktree suggestion decides when it is relevant.
 */
export function createWorktreeSuggestionTour(options: IWorktreeSuggestionTourOptions): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: WORKTREE_SUGGESTION_TOUR_ID,
		trigger: { kind: 'command', commandId: WORKTREE_SUGGESTION_TOUR_ID },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'sendInWorktree',
					targetId: 'sessions.newSession.isolation',
					title: localize('worktreeSuggestion.spotlight.title', "Keep Your Changes Separate"),
					description: localize('worktreeSuggestion.spotlight.copyDescription', "{0} Send this request in a new worktree, so the agent works on a separate copy of the files and leaves your changes untouched.", options.changes),
					placement: 'below',
					primaryAction: {
						label: options.sendInWorktreeLabel,
						// The composer switches the isolation once the spotlight closes: switching re-renders the
						// isolation picker, which would replace this step's target.
						run: options.sendInWorktree,
						advance: true,
					},
					endTourLabel: options.sendLabel,
					missingTarget: { kind: 'wait', timeoutMs: 2000, onTimeout: 'abort' },
					onBeforeShow: options.reveal,
					onDidShow: options.onDidShow,
				}],
			},
		},
	};
}
