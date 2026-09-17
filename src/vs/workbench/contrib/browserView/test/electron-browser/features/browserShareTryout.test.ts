/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { BrowserViewCommandId } from '../../../../../../platform/browserView/common/browserView.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/onboarding.js';
import { BROWSER_SHARE_WITH_AGENT_ONBOARDING_TARGET_ID, BROWSER_SHARE_WITH_AGENT_TRYOUT_ID, BROWSER_SHARE_WITH_AGENT_TRYOUT_URL } from '../../../common/browserShareTryout.js';
import { createBrowserShareWithAgentTryout } from '../../../electron-browser/features/browserShareTryout.contribution.js';

suite('Browser Share with Agent tryout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the VS Code website and guides the scoped share control without sharing', () => {
		const tryout = createBrowserShareWithAgentTryout();

		assert.deepStrictEqual({
			id: tryout.id,
			isAI: tryout.isAI,
			when: tryout.when?.serialize(),
			presentation: tryout.presentation,
		}, {
			id: BROWSER_SHARE_WITH_AGENT_TRYOUT_ID,
			isAI: true,
			when: 'chatIsEnabled && config.chat.agent.enabled && config.workbench.browser.enableChatTools && sessions.isAgentHostSession || chatIsEnabled && config.chat.agent.enabled && config.workbench.browser.enableChatTools && !isSessionsWindow || chatIsEnabled && config.chat.agent.enabled && config.workbench.browser.enableChatTools && sessionType == \'local\'',
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
							title: 'Share with Agent',
							description: 'Use this control when you want an agent to access this page. Sharing remains off until you select the control and confirm.',
							placement: 'below',
							allowTargetInteraction: true,
							missingTarget: { kind: 'wait', timeoutMs: 10_000 },
						},
					}],
					unavailableMessage: 'The Visual Studio Code website opened, but Share with Agent could not be highlighted.',
				},
			},
		});
	});

	test('explains the sharing prerequisite without changing settings', () => {
		const tryout = createBrowserShareWithAgentTryout();

		assert.deepStrictEqual({
			unavailableMessage: tryout.unavailableMessage,
			setup: tryout.setup,
		}, {
			unavailableMessage: 'Sharing browser pages requires Chat, agent mode, and browser tools to be enabled.',
			setup: undefined,
		});
	});
});
