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
 * Onboarding tour shown once the user has created their first session (the chat
 * view is visible, not the new-session view). It teaches running sessions in
 * parallel and the workspace/isolation options:
 *
 *  1. The "New Session" button in the sessions list — advancing when the user
 *     presses it, which opens the new-session view that hosts steps 2 & 3.
 *  2. The isolation picker (worktree vs folder).
 *  3. The workspace picker.
 *
 * Each `targetId` matches a `data-onboarding-id` set via `markOnboardingTarget`:
 *  - `sessions.newSession.button` — newSessionButtonTarget.ts (this contrib)
 *  - `sessions.newSession.isolation` — contrib/providers/copilotChatSessions/browser/isolationPicker.ts
 *  - `sessions.newSession.workspacePicker` — contrib/chat/browser/newChatWidget.ts
 */
const newSessionPayload: ISpotlightPayload = {
	steps: [
		{
			id: 'newSessionButton',
			targetId: 'sessions.newSession.button',
			title: localize('sessions.onboarding.parallel.title', "Run Sessions in Parallel"),
			description: localize('sessions.onboarding.parallel.description', "Start another session to work on a different task at the same time. The Agents window runs multiple sessions in parallel."),
			placement: 'right',
			// Advance when the user actually presses the button, which opens the
			// new-session view that hosts the next two steps.
			advanceOnTargetClick: true,
		},
		{
			id: 'isolation',
			targetId: 'sessions.newSession.isolation',
			title: localize('sessions.onboarding.isolation.title', "Isolate Your Work"),
			description: localize('sessions.onboarding.isolation.description', "Choose a worktree to work on two different tasks in the same workspace while keeping the two tasks fully isolated from each other."),
			placement: 'above',
		},
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.workspace.title', "Work Across Workspaces"),
			description: localize('sessions.onboarding.workspace.description', "Pick any workspace — you can run multiple tasks in the same workspace as well as across several different workspaces at the same time."),
			placement: 'above',
		},
	],
};

/**
 * Builds the "new session" tour scenario. The provided `signal` controls *when*
 * the tour becomes eligible — it is driven by {@link NewSessionTourContribution},
 * which only flips it on for new users a short while after they send a request.
 * `ChatContextKeys.enabled` keeps the tour hidden when AI features are disabled.
 */
export function createNewSessionTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: 'sessions.onboarding.newSession',
		when: ChatContextKeys.enabled,
		trigger: { kind: 'observable', signal },
		priority: 100,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionPayload,
		},
	};
}
