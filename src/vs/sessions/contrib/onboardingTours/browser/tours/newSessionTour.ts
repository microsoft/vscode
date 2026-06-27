/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { localize } from '../../../../../nls.js';

/**
 * Spotlight steps shown after the user presses the pulsing "New Session"
 * button. The tour runs in the new-session view and teaches the workspace and
 * isolation options:
 *
 *  1. The workspace picker.
 *  2. The isolation picker (worktree vs folder).
 *
 * Each `targetId` matches a `data-onboarding-id` set via `markOnboardingTarget`:
 *  - `sessions.newSession.workspacePicker` — contrib/chat/browser/sessionWorkspacePicker.ts
 *  - `sessions.newSession.isolation` — provider-specific config/isolation pickers
 */
export const NEW_SESSION_TOUR_ID = 'sessions.onboarding.newSession';

/**
 * Shared "shown" persistence key for the new-session onboarding tours. The
 * {@link createNewSessionTour} and `createNewSessionViewTour` variants teach the
 * same new-session pickers, so they record their once-per-user state under this
 * single key: once a user has seen either variant, neither runs again.
 *
 * The value matches {@link NEW_SESSION_TOUR_ID} so users who already saw the
 * original tour (state persisted under that id) are not shown the variant.
 */
export const NEW_SESSION_ONBOARDING_SEEN_KEY = NEW_SESSION_TOUR_ID;

const newSessionPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.workspace.title', "Work Across Workspaces"),
			description: localize('sessions.onboarding.workspace.description', "Pick any workspace — you can run multiple tasks in the same workspace as well as across several different workspaces at the same time."),
			placement: 'above',
		},
		{
			id: 'isolation',
			targetId: 'sessions.newSession.isolation',
			title: localize('sessions.onboarding.isolation.title', "Isolate Your Work"),
			description: localize('sessions.onboarding.isolation.description', "Choose a worktree to work on two different tasks in the same workspace while keeping the two tasks fully isolated from each other."),
			placement: 'below',
		},
	],
};

/**
 * Builds the "new session" tour scenario. The provided `signal` controls *when*
 * the spotlight steps become eligible — it is driven by
 * {@link NewSessionTourContribution}, which flips it after the eligible user
 * presses the pulsing New Session button.
 * `ChatContextKeys.enabled` keeps the tour hidden when AI features are disabled.
 */
export function createNewSessionTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: ChatContextKeys.enabled,
		trigger: { kind: 'observable', signal },
		priority: 100,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionPayload,
		},
	};
}
