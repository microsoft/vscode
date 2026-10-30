/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NewSessionOnboardingHandoffContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';

export const PARALLEL_TASKS_TOUR_ID = 'sessions.onboarding.parallelTasks';
export const PARALLEL_TASKS_ONBOARDING_SEEN_KEY = 'sessions.onboarding.parallelTasks.seen';

onboardingScenarioRegistry.registerDescriptor({ id: PARALLEL_TASKS_TOUR_ID });

/** Shows new users how to start another task while their session runs. */
export function createParallelTasksTour(signal: IObservable<boolean>, showSessionsList: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: PARALLEL_TASKS_TOUR_ID,
		seenKey: PARALLEL_TASKS_ONBOARDING_SEEN_KEY,
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
			EditorPartModalVisibleContext.toNegated(),
			NewSessionOnboardingHandoffContext.toNegated(),
			SessionsWelcomeVisibleContext.toNegated(),
		),
		trigger: { kind: 'observable', signal },
		priority: 100,
		experiment: {
			behaviorFlag: 'onb.parallelTasks.show',
			assignmentContextIdFlag: 'onb.parallelTasks.id',
		},
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'newSession',
					targetId: 'sessions.newSession.button',
					title: localize('sessions.onboarding.parallelTasks.title', "Start another task while this runs"),
					description: localize('sessions.onboarding.parallelTasks.description', "Sessions run side by side, so you don't have to wait for this one to finish."),
					nextButtonLabel: localize('sessions.onboarding.parallelTasks.gotIt', "Got It"),
					placement: 'right',
					allowTargetInteraction: true,
					advanceOnTargetClick: true,
					hideNext: false,
					missingTarget: { kind: 'wait', timeoutMs: 5_000, onTimeout: 'skip' },
					onBeforeShow: showSessionsList,
				}],
			},
		},
	};
}
