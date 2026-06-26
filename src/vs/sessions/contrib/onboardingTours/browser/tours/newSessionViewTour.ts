/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { localize } from '../../../../../nls.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';

/**
 * Spotlight steps that walk a brand-new user through the new-session view the
 * first time they open the Agents window with it showing. The tour teaches the
 * three pickers that shape a session:
 *
 *  1. The workspace picker — work in one workspace or many at the same time.
 *  2. The harness picker — choose Copilot, Claude or Codex, each running the
 *     agent with its own agent loop.
 *  3. The isolation picker — pick a worktree to run several tasks at once in the
 *     same workspace, fully isolated from each other.
 *
 * Each `targetId` matches a `data-onboarding-id` set via `markOnboardingTarget`:
 *  - `sessions.newSession.workspacePicker` — contrib/chat/browser/sessionWorkspacePicker.ts
 *  - `sessions.newSession.harnessPicker` — contrib/chat/browser/sessionTypePicker.ts
 *  - `sessions.newSession.isolation` — provider-specific config/isolation pickers
 *
 * A step whose target is not rendered (e.g. the harness picker is hidden because
 * only a single harness can serve the folder) is skipped automatically.
 */
export const NEW_SESSION_VIEW_TOUR_ID = 'sessions.onboarding.newSessionView';

const newSessionViewPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.newSessionView.workspace.title', "Work Across Workspaces"),
			description: localize('sessions.onboarding.newSessionView.workspace.description', "Pick the workspace to work in — you can run several sessions in the same workspace and across multiple workspaces at the same time."),
			placement: 'above',
		},
		{
			id: 'harnessPicker',
			targetId: 'sessions.newSession.harnessPicker',
			title: localize('sessions.onboarding.newSessionView.harness.title', "Choose a Harness"),
			description: localize('sessions.onboarding.newSessionView.harness.description', "Pick a harness such as Copilot, Claude or Codex — each one uses its own agent loop to run the agent."),
			placement: 'above',
		},
		{
			id: 'isolation',
			targetId: 'sessions.newSession.isolation',
			title: localize('sessions.onboarding.newSessionView.isolation.title', "Isolate Your Work"),
			description: localize('sessions.onboarding.newSessionView.isolation.description', "Choose a worktree to work on several tasks at the same time in the same workspace while keeping each task fully isolated."),
			placement: 'below',
		},
	],
};

/**
 * Builds the "new session view" tour scenario. The provided `signal` controls
 * *when* the spotlight steps become eligible — it is driven by
 * {@link NewSessionViewTourContribution}, which flips it once an eligible
 * (brand-new) user has the new-session view open and rendered.
 * `ChatContextKeys.enabled` keeps the tour hidden when AI features are disabled.
 *
 * Shares {@link NEW_SESSION_ONBOARDING_SEEN_KEY} with the pulsing-button
 * {@link createNewSessionTour} variant, so a user who has seen either tour is
 * never shown the other.
 */
export function createNewSessionViewTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_VIEW_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: ChatContextKeys.enabled,
		trigger: { kind: 'observable', signal },
		priority: 100,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionViewPayload,
		},
	};
}
