/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';

export const SESSION_ARCHIVE_TOUR_ID = 'sessions.archiveNudge';

export function createSessionArchiveTour(targetId: string, wording: ChatSessionArchiveActionWording, onBeforeShow: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	const markAsDone = wording === ChatSessionArchiveActionWording.MarkAsDone;
	return {
		id: SESSION_ARCHIVE_TOUR_ID,
		trigger: { kind: 'command', commandId: SESSION_ARCHIVE_TOUR_ID },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'archiveFromList',
					targetId,
					title: markAsDone
						? localize('archiveOnboarding.doneTitle', "Mark sessions as done from the list")
						: localize('archiveOnboarding.archiveTitle', "Archive sessions from the list"),
					description: markAsDone
						? localize('archiveOnboarding.doneDescription', "You can mark any session as done directly from the sessions list. Hover over a session or focus it to show Mark as Done.")
						: localize('archiveOnboarding.archiveDescription', "You can archive any session directly from the sessions list. Hover over a session or focus it to show Archive."),
					nextButtonLabel: localize('archiveOnboarding.understood', "Understood"),
					advanceOnTargetClick: 'advanceOnly',
					hideNext: false,
					placement: 'right',
					missingTarget: { kind: 'abort' },
					onBeforeShow,
				}],
			},
		},
	};
}
