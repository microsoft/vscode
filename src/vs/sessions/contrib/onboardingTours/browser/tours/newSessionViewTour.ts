/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { localize } from '../../../../../nls.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';
import { IsNewChatSessionContext, SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';

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
 * Each step is additionally gated on a `*PickerVisible` context key the picker
 * keeps in sync with its real visibility. This skips a step whose picker is
 * rendered but not actually shown — e.g. the harness picker hidden because only
 * a single harness can serve the folder, or the isolation picker disabled
 * because the workspace has no git repository. A step whose target element is
 * missing entirely is also skipped automatically.
 */
export const NEW_SESSION_VIEW_TOUR_ID = 'sessions.onboarding.newSessionView';

/**
 * ExP treatment flag names for Tour 1's A/B experiment.
 *
 * - `behaviorFlag` — boolean: `true` shows the tour (treatment), `false` is control.
 * - `assignmentContextIdFlag` — string: this tour's assignment-context identifier,
 *   the key its scorecard groups on. Both arms MUST resolve it to the *same* value,
 *   which MUST start with the reserved `onb-` prefix (see
 *   `ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX`). It is distinct from Tour 2's id so the
 *   two tours report into separate scorecards.
 */
const NEW_SESSION_VIEW_EXPERIMENT = {
	behaviorFlag: 'onb.newSessionView.show',
	assignmentContextIdFlag: 'onb.newSessionView.id',
} as const;

const newSessionViewPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.newSessionView.workspace.title', "Work Across Workspaces"),
			description: localize('sessions.onboarding.newSessionView.workspace.description', "Choose between the folders and repositories you work in. Run multiple sessions at once in a single workspace, or across many."),
			placement: 'above',
			when: SessionWorkspacePickerVisibleContext,
			allowTargetInteraction: true,
		},
		{
			id: 'harnessPicker',
			targetId: 'sessions.newSession.harnessPicker',
			title: localize('sessions.onboarding.newSessionView.harness.title', "Choose a Harness"),
			description: localize('sessions.onboarding.newSessionView.harness.description', "Each has different strengths; choose what works best for your task and switch anytime."),
			placement: 'above',
			when: SessionHarnessPickerVisibleContext,
			allowTargetInteraction: true,
		},
		{
			id: 'isolation',
			targetId: 'sessions.newSession.isolation',
			title: localize('sessions.onboarding.newSessionView.isolation.title', "Isolate Your Work"),
			description: localize('sessions.onboarding.newSessionView.isolation.description', "Use a worktree to work on multiple tasks in the same project without conflicts. Each task stays isolated, so you can experiment freely and safely."),
			placement: 'below',
			when: SessionIsolationPickerVisibleContext,
			allowTargetInteraction: true,
		},
	],
};

/**
 * Builds the "new session view" tour scenario. The provided `signal` controls
 * *when* the spotlight steps become eligible — it is driven by
 * {@link NewSessionViewTourContribution}, which flips it once an eligible
 * (brand-new) user has the new-session view open and rendered.
 * `ChatContextKeys.enabled` keeps the tour hidden when AI features are disabled.
 * The modal-editor gate keeps the tour hidden while a modal editor is showing.
 *
 * Shares {@link NEW_SESSION_ONBOARDING_SEEN_KEY} with the pulsing-button
 * {@link createNewSessionTour} variant, so a user who has seen either tour is
 * never shown the other.
 */
export function createNewSessionViewTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_VIEW_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: ContextKeyExpr.and(ChatContextKeys.enabled, IsNewChatSessionContext, EditorPartModalVisibleContext.toNegated()),
		trigger: { kind: 'observable', signal },
		priority: 100,
		experiment: NEW_SESSION_VIEW_EXPERIMENT,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionViewPayload,
		},
	};
}
