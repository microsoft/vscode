/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createCodiconsChatBackgroundTryout } from '../../../browser/onboarding/chatBackgroundTryout.contribution.js';
import { APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID, CODICONS_CHAT_BACKGROUND_TRYOUT_ID, SESSIONS_CHAT_BACKGROUND_AVAILABLE_CONTEXT_KEY } from '../../../common/onboarding/chatBackgroundTryout.js';

suite('Codicons chat background tryout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies the built-in background only in an available Agents window', () => {
		const tryout = createCodiconsChatBackgroundTryout();

		assert.deepStrictEqual({
			id: tryout.id,
			title: tryout.title,
			description: tryout.description,
			isAI: tryout.isAI,
			targetWindow: tryout.targetWindow,
			when: tryout.when?.serialize(),
			unavailableMessage: tryout.unavailableMessage,
			presentation: tryout.presentation,
		}, {
			id: CODICONS_CHAT_BACKGROUND_TRYOUT_ID,
			title: 'Try the Codicons Chat Background',
			description: 'Set the Agents chat background for the current color theme to the built-in, theme-aware Codicons pattern. Use Set Background to change or remove it later.',
			isAI: true,
			targetWindow: 'agents',
			when: `chatIsEnabled && ${SESSIONS_CHAT_BACKGROUND_AVAILABLE_CONTEXT_KEY}`,
			unavailableMessage: 'Chat backgrounds are unavailable while a high contrast theme is active.',
			presentation: {
				kind: 'command',
				payload: {
					commandId: APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID,
				},
			},
		});
	});
});
