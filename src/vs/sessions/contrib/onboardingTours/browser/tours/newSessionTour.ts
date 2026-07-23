/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalContext } from '../../../../../workbench/common/contextkeys.js';
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
 * The new-session tour variants teach the same setup flow, so they record their
 * once-per-user state under this single key.
 *
 * The value matches {@link NEW_SESSION_TOUR_ID} so users who already saw the
 * original tour (state persisted under that id) are not shown the variant.
 */
export const NEW_SESSION_ONBOARDING_SEEN_KEY = NEW_SESSION_TOUR_ID;

/**
 * ExP treatment flag names for Tour 2's A/B experiment.
 *
 * - `behaviorFlag` — boolean: `true` shows the tour (treatment), `false` is control.
 * - `assignmentContextIdFlag` — string: this tour's assignment-context identifier,
 *   the key its scorecard groups on. Both arms MUST resolve it to the *same* value,
 *   which MUST start with the reserved `onb-` prefix (see
 *   `ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX`). It is distinct from Tour 1's id so the
 *   two tours report into separate scorecards.
 */
const NEW_SESSION_EXPERIMENT = {
	behaviorFlag: 'onb.newSession.show',
	assignmentContextIdFlag: 'onb.newSession.id',
} as const;

const newSessionPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.workspace.title', "Work Across Workspaces"),
			description: localize('sessions.onboarding.workspace.description', "Choose between the folders and repositories you work in. Run multiple sessions at once in a single workspace, or across many."),
			placement: 'above',
		},
		{
			id: 'isolation',
			targetId: 'sessions.newSession.isolation',
			title: localize('sessions.onboarding.isolation.title', "Isolate Your Work"),
			description: localize('sessions.onboarding.isolation.description', "Use a worktree to work on multiple tasks in the same project without conflicts. Each task stays isolated, so you can experiment freely and safely."),
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
 * The modal-editor gate keeps the tour hidden while a modal editor is showing.
 */
export function createNewSessionTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorPartModalContext.toNegated()),
		trigger: { kind: 'observable', signal },
		priority: 100,
		experiment: NEW_SESSION_EXPERIMENT,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionPayload,
		},
	};
}
