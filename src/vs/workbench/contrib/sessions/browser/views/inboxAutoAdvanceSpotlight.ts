/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';
import { SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING } from '../../common/sessionConfig.js';

/** Reveals the replied-to session after the first automatic Inbox navigation. */
export class InboxAutoAdvanceSpotlight extends Disposable {
	constructor(
		private readonly revealSession: () => IDisposable & { readonly targetId: string },
		private readonly openSession: () => void,
		private readonly hasNext: boolean,
		private readonly onDidShow: () => void,
		@IOnboardingScenarioService private readonly onboardingService: IOnboardingScenarioService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super();
	}

	async show(): Promise<void> {
		let returnToSession = false;
		let openSettings = false;
		const settingsLink = 'command:workbench.action.openSettings';
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
							onDidShow: this.onDidShow,
							title: localize('inboxAutoAdvanceSpotlight.title', "Your session is here"),
							description: new MarkdownString(localize('inboxAutoAdvanceSpotlight.description', "Your session moved to Working. {0} [Change auto-advance]({1}).",
								this.hasNext
									? localize('inboxAutoAdvanceSpotlight.next', "Inbox opened the next session.")
									: localize('inboxAutoAdvanceSpotlight.empty', "Inbox is now empty."),
								settingsLink,
							), { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }),
							onDidClickLink: link => {
								if (link === settingsLink) {
									openSettings = true;
									cancellation.cancel();
								}
							},
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
							// The list can briefly recycle the row as the send and automatic navigation settle.
							missingTarget: { kind: 'wait', timeoutMs: 2000, onTimeout: 'abort' },
						}];
					},
				} satisfies ISpotlightPayload,
			},
		}));
		try {
			const outcome = await this.onboardingService.runScenario(id, cancellation.token);
			if (openSettings && !this._store.isDisposed) {
				await this.preferencesService.openSettings({ query: `@id:${SESSIONS_LIST_INBOX_AUTO_ADVANCE_SETTING}` });
			} else if (returnToSession && outcome === OnboardingOutcome.Completed && !cancellation.token.isCancellationRequested) {
				// Return after the spotlight has restored focus.
				this.openSession();
			}
		} finally {
			this.dispose();
		}
	}
}
