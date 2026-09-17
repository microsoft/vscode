/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/onboarding.js';
import { IOnboardingTryout, registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { BROWSER_SHARE_WITH_AGENT_ONBOARDING_TARGET_ID, BROWSER_SHARE_WITH_AGENT_TRYOUT_ID, BROWSER_SHARE_WITH_AGENT_TRYOUT_URL } from '../../common/browserShareTryout.js';
import { BROWSER_SHARING_AVAILABLE_CONTEXT } from '../browserViewWorkbenchService.js';

export function createBrowserShareWithAgentTryout(): IOnboardingTryout<IGuidedTryoutPayload> {
	return {
		id: BROWSER_SHARE_WITH_AGENT_TRYOUT_ID,
		title: localize('browser.tryout.shareWithAgent.title', "Share a Browser Page with an Agent"),
		description: localize('browser.tryout.shareWithAgent.description', "Open the Visual Studio Code website in the Integrated Browser and locate Share with Agent. The page remains private unless you choose the control and confirm sharing."),
		isAI: true,
		when: BROWSER_SHARING_AVAILABLE_CONTEXT,
		unavailableMessage: localize('browser.tryout.shareWithAgent.unavailable', "Sharing browser pages requires Chat, agent mode, and browser tools to be enabled."),
		presentation: {
			kind: GUIDED_TRYOUT_PRESENTATION_KIND,
			payload: {
				launch: {
					kind: 'command',
					payload: {
						commandId: BrowserViewCommandId.Open,
						arguments: [{
							url: BROWSER_SHARE_WITH_AGENT_TRYOUT_URL,
							openInMainWindow: true,
							waitForPageLoad: true,
						}],
						captureTargetScope: true,
					},
				},
				steps: [{
					id: 'shareWithAgent',
					kind: SPOTLIGHT_PRESENTATION_KIND,
					payload: {
						id: 'shareWithAgent',
						targetId: BROWSER_SHARE_WITH_AGENT_ONBOARDING_TARGET_ID,
						title: localize('browser.tryout.shareWithAgent.step.title', "Share with Agent"),
						description: localize('browser.tryout.shareWithAgent.step.description', "Use this control when you want an agent to access this page. Sharing remains off until you select the control and confirm."),
						placement: 'below',
						allowTargetInteraction: true,
						missingTarget: { kind: 'wait', timeoutMs: 10_000 },
					},
				}],
				unavailableMessage: localize('browser.tryout.shareWithAgent.guidanceUnavailable', "The Visual Studio Code website opened, but Share with Agent could not be highlighted."),
			},
		},
	};
}

class BrowserShareWithAgentTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserShareWithAgentTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout(createBrowserShareWithAgentTryout()));
	}
}

registerWorkbenchContribution2(BrowserShareWithAgentTryoutContribution.ID, BrowserShareWithAgentTryoutContribution, WorkbenchPhase.BlockRestore);
