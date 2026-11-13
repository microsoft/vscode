/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NewSessionOnboardingHandoffContext } from '../../../../common/agentsWindowContextKeys.js';

export const AUTOMATIONS_TOUR_ID = 'sessions.onboarding.automations';

onboardingScenarioRegistry.registerDescriptor({ id: AUTOMATIONS_TOUR_ID });

/** Introduces agent-assisted creation once, using the target shared by both catalogue states. */
export function createAutomationsTour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: AUTOMATIONS_TOUR_ID,
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ChatAutomationsEnabledContext,
			ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
			EditorPartModalVisibleContext.toNegated(),
			NewSessionOnboardingHandoffContext.toNegated(),
			SessionsWelcomeVisibleContext.toNegated(),
		),
		trigger: { kind: 'observable', signal },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'createWithAgent',
					targetId: 'sessions.automations.create',
					title: localize('sessions.onboarding.automations.title', "Create with agent"),
					description: localize('sessions.onboarding.automations.description', "Describe what you want automated, and the agent will set it up. This button closes this view and returns to the new session page."),
					nextButtonLabel: localize('sessions.onboarding.automations.gotIt', "Got It"),
					allowTargetInteraction: true,
					advanceOnTargetClick: true,
					hideNext: false,
				}],
			},
		},
	};
}
