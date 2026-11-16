/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { markOnboardingTarget, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING } from '../../common/chatConstants.js';

export const COMPARE_AGENTS_SPOTLIGHT_ID = 'sessions.compareAgents';
/** Declares the spotlight scenario to the onboarding registry; called by the Agents window, not on import. */
export function registerCompareAgentsSpotlightDescriptor(): void {
	onboardingScenarioRegistry.registerDescriptor({ id: COMPARE_AGENTS_SPOTLIGHT_ID });
}

/** One-time guidance owned by the comparison toggle's rendered lifetime. */
export class CompareAgentsSpotlight extends Disposable {
	constructor(
		button: HTMLElement,
		reviewAvailable: boolean,
		@IConfigurationService configurationService: IConfigurationService,
		@IOnboardingScenarioService onboardingService: IOnboardingScenarioService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
	) {
		super();
		if (!configurationService.getValue<boolean>(COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING)
			|| onboardingScenarioRegistry.getScenario(COMPARE_AGENTS_SPOTLIGHT_ID)) {
			return;
		}

		const scenario: IOnboardingScenario<ISpotlightPayload> = {
			id: COMPARE_AGENTS_SPOTLIGHT_ID,
			when: ChatContextKeys.enabled,
			// Start only after this popup is positioned, never merely on registration.
			trigger: { kind: 'observable', signal: constObservable(false) },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [{
						id: 'compareAgents',
						targetId: COMPARE_AGENTS_SPOTLIGHT_ID,
						title: localize('compareAgentsSpotlight.title', "Try more than one approach"),
						description: reviewAvailable
							? localize('compareAgentsSpotlight.description', "Run your prompt across multiple models and agent harnesses in parallel. Optionally add a judge to recommend the best result and a synthesizer to combine the best parts of their approaches.")
							: localize('compareAgentsSpotlight.chatDescription', "Run your prompt across multiple models and agent harnesses in parallel and compare their responses side by side."),
						nextButtonLabel: localize('compareAgentsSpotlight.understood', "Understood"),
						placement: 'right',
						allowTargetInteraction: true,
						advanceOnTargetClick: true,
						hideNext: false,
						missingTarget: { kind: 'abort' },
					}],
				},
			},
		};
		this._register(markOnboardingTarget(button, COMPARE_AGENTS_SPOTLIGHT_ID));
		this._register(onboardingScenarioRegistry.register(scenario));
		const cancellation = new CancellationTokenSource();
		this._register(toDisposable(() => cancellation.dispose(true)));
		this._register(scheduleAtNextAnimationFrame(getWindow(button), () => {
			if (configurationService.getValue<boolean>(COMPARE_AGENTS_SHOW_SPOTLIGHT_SETTING)
				&& !entitlementService.sentiment.hidden
				&& !onboardingService.isPresenting.get()
				&& resolveOnboardingTarget(getWindow(button), COMPARE_AGENTS_SPOTLIGHT_ID)?.element === button
				&& onboardingService.shouldShowNudge(scenario.id)) {
				void onboardingService.runScenario(scenario.id, cancellation.token).catch(onUnexpectedError);
			}
		}));
	}
}
