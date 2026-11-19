/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';

/** Reveals the replied-to session after the first automatic Inbox navigation. */
export class InboxAutoAdvanceSpotlight extends Disposable {
	constructor(
		private readonly revealSession: () => IDisposable & { readonly targetId: string },
		private readonly openSession: () => void,
		private readonly hasNext: boolean,
		@IOnboardingScenarioService private readonly onboardingService: IOnboardingScenarioService,
	) {
		super();
	}

	async show(): Promise<void> {
		let returnToSession = false;
		const cancellation = new CancellationTokenSource();
		this._register(toDisposable(() => cancellation.dispose(true)));
		const id = 'sessions.inboxAutoAdvance';
		this._register(onboardingScenarioRegistry.register({
			id,
			when: ChatContextKeys.enabled,
			trigger: { kind: 'observable', signal: constObservable(false) },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [],
					resolveSteps: async () => {
						const target = this._register(this.revealSession());
						return [{
							id: 'repliedSession',
							targetId: target.targetId,
							title: localize('inboxAutoAdvanceSpotlight.title', "Your session is here"),
							description: localize('inboxAutoAdvanceSpotlight.description', "This is the session you replied to. It appears in Working while the agent processes your reply and returns to Inbox when it needs attention. {0} Choose Return to Session or select the session in the sidebar to return to the conversation. You can turn off automatic navigation in the Inbox Auto Advance setting.",
								this.hasNext
									? localize('inboxAutoAdvanceSpotlight.next', "Inbox opened the next session.")
									: localize('inboxAutoAdvanceSpotlight.empty', "No Inbox sessions remain, so focus moved to the Inbox heading."),
							),
							primaryAction: {
								label: localize('inboxAutoAdvanceSpotlight.return', "Return to Session"),
								run: () => { returnToSession = true; },
								advance: true,
							},
							endTourLabel: localize('inboxAutoAdvanceSpotlight.gotIt', "Got It"),
							focusEndTour: true,
							placement: 'right',
							allowTargetInteraction: true,
							advanceOnTargetClick: true,
							hideNext: false,
							missingTarget: { kind: 'abort' },
						}];
					},
				} satisfies ISpotlightPayload,
			},
		}));
		try {
			const outcome = await this.onboardingService.runScenario(id, cancellation.token);
			if (returnToSession && outcome === OnboardingOutcome.Completed && !cancellation.token.isCancellationRequested) {
				// Return after the spotlight has restored focus.
				this.openSession();
			}
		} finally {
			this.dispose();
		}
	}
}
