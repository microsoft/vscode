/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';

export const AGENTS_WINDOW_INVITATION_TOUR_ID = 'sessions.onboarding.agentsWindowInvitation';

onboardingScenarioRegistry.registerDescriptor({ id: AGENTS_WINDOW_INVITATION_TOUR_ID });

export interface IAgentsWindowInvitationTourCopy {
	readonly title?: string;
	readonly description?: string;
	readonly newSessionTitle?: string;
	readonly newSessionDescription?: string;
}

export function createAgentsWindowInvitationTour(targetId: string, onBeforeShow: () => Promise<void>, resolveCopy?: () => Promise<IAgentsWindowInvitationTourCopy>, onBeforeShowNewSession?: () => Promise<void>): IOnboardingScenario<ISpotlightPayload> {
	const understood = localize('agentsWindowInvitation.understood', "Understood");
	const step: ISpotlightStep = {
		id: 'session',
		targetId,
		title: localize('agentsWindowInvitation.session.title', "Your session is here"),
		description: localize('agentsWindowInvitation.session.description', "Find this session here alongside your other agent sessions."),
		nextButtonLabel: onBeforeShowNewSession ? undefined : understood,
		placement: 'right',
		missingTarget: { kind: 'wait', timeoutMs: 5_000, onTimeout: 'abort' },
		onBeforeShow,
	};
	const newSessionStep: ISpotlightStep | undefined = onBeforeShowNewSession ? {
		id: 'newSession',
		targetId: 'sessions.newSession.button',
		title: localize('agentsWindowInvitation.newSession.title', "Create a new session from here"),
		description: localize('agentsWindowInvitation.newSession.description', "Start another task while your other sessions keep running."),
		nextButtonLabel: understood,
		allowTargetInteraction: true,
		advanceOnTargetClick: true,
		hideNext: false,
		placement: 'right',
		missingTarget: { kind: 'wait', timeoutMs: 5_000, onTimeout: 'abort' },
		onBeforeShow: onBeforeShowNewSession,
	} : undefined;
	return {
		id: AGENTS_WINDOW_INVITATION_TOUR_ID,
		repeatable: true,
		when: ChatContextKeys.enabled,
		trigger: { kind: 'command', commandId: AGENTS_WINDOW_INVITATION_TOUR_ID },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: newSessionStep ? [step, newSessionStep] : [step],
				resolveSteps: resolveCopy ? async () => {
					const copy = await resolveCopy();
					const session = { ...step, title: copy.title ?? step.title, description: copy.description ?? step.description };
					return newSessionStep
						? [session, { ...newSessionStep, title: copy.newSessionTitle ?? newSessionStep.title, description: copy.newSessionDescription ?? newSessionStep.description }]
						: [session];
				} : undefined,
			},
		},
	};
}
