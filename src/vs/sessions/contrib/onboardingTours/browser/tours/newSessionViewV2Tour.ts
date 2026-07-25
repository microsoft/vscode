/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../nls.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IsNewChatSessionContext, SessionHasWorkspaceContext, SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './newSessionTour.js';

export const NEW_SESSION_VIEW_V2_TOUR_ID = 'sessions.onboarding.newSessionViewV2';

const NEW_SESSION_VIEW_V2_EXPERIMENT = {
	behaviorFlag: 'onb.newSessionViewV2.show',
	assignmentContextIdFlag: 'onb.newSessionViewV2.id',
} as const;

const WAIT_FOR_PICKER = { kind: 'wait', timeoutMs: 5_000 } as const;

const newSessionViewV2Payload: ISpotlightPayload = {
	steps: [
		{
			id: 'workspacePicker',
			targetId: 'sessions.newSession.workspacePicker',
			title: localize('sessions.onboarding.newSessionViewV2.workspace.title', "Choose a workspace"),
			description: localize('sessions.onboarding.newSessionViewV2.workspace.description', "A workspace is the folder or repository where your agent reads context and makes changes. Choose one so it can understand your project and work on the right files."),
			placement: 'above',
			when: ContextKeyExpr.and(SessionWorkspacePickerVisibleContext, SessionHasWorkspaceContext.toNegated()),
			missingTarget: { kind: 'skip' },
			openTarget: true,
			allowTargetInteraction: true,
			advanceWhen: SessionHasWorkspaceContext,
		},
		{
			id: 'harnessPicker',
			targetId: 'sessions.newSession.harnessPicker',
			title: localize('sessions.onboarding.newSessionViewV2.harness.title', "Choose a harness"),
			description: localize('sessions.onboarding.newSessionViewV2.harness.description', "A harness is the agent runtime that plans, uses tools, and carries out your task. Choose one based on the capabilities your work needs."),
			placement: 'above',
			missingTarget: WAIT_FOR_PICKER,
			openTarget: false,
			allowTargetInteraction: true,
		},
		{
			id: 'modelPicker',
			targetId: 'sessions.newSession.modelPicker',
			title: localize('sessions.onboarding.newSessionViewV2.model.title', "Choose a model"),
			description: localize('sessions.onboarding.newSessionViewV2.model.description', "The model powers your agent's reasoning. Choose one based on the balance of speed and capability your task needs."),
			placement: 'below',
			missingTarget: WAIT_FOR_PICKER,
			openTarget: false,
			allowTargetInteraction: true,
		},
	],
};

/** Builds the interactive new-session view tour. */
export function createNewSessionViewV2Tour(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: NEW_SESSION_VIEW_V2_TOUR_ID,
		seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			IsNewChatSessionContext,
			ChatEntitlementContextKeys.Entitlement.signedOut.toNegated(),
			EditorPartModalVisibleContext.toNegated(),
		),
		trigger: { kind: 'observable', signal },
		priority: 110,
		experiment: NEW_SESSION_VIEW_V2_EXPERIMENT,
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: newSessionViewV2Payload,
		},
	};
}
