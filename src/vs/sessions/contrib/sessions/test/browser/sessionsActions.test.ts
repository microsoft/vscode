/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { SessionsFocusContext, SessionActiveChatIsClosableContext } from '../../../../common/contextkeys.js';

import '../../browser/sessionsActions.js';

suite('Sessions - Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('close chat keybinding only matches Sessions part focus', () => {
		const closeChatWhen = KeybindingsRegistry.getDefaultKeybindingsForOS(OperatingSystem.Macintosh)
			.find(binding => binding.command === 'sessions.chatCompositeBar.closeChat')
			?.when;
		if (!closeChatWhen) {
			assert.fail('Close Chat keybinding should have a when clause');
		}

		const evaluate = (when: ContextKeyExpression, values: Record<string, ContextKeyValue>) =>
			when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
		const closeableChat = {
			[IsSessionsWindowContext.key]: true,
			[SessionActiveChatIsClosableContext.key]: true,
		};

		assert.deepStrictEqual({
			chat: evaluate(closeChatWhen, { ...closeableChat, [SessionsFocusContext.key]: true, [EditorAreaFocusContext.key]: false }),
			editor: evaluate(closeChatWhen, { ...closeableChat, [SessionsFocusContext.key]: false, [EditorAreaFocusContext.key]: true }),
			filesPlaceholder: evaluate(closeChatWhen, { ...closeableChat, [SessionsFocusContext.key]: false, [EditorAreaFocusContext.key]: false }),
			nonAgentsWindow: evaluate(closeChatWhen, { ...closeableChat, [IsSessionsWindowContext.key]: false, [SessionsFocusContext.key]: true }),
			mainChat: evaluate(closeChatWhen, { ...closeableChat, [SessionsFocusContext.key]: true, [SessionActiveChatIsClosableContext.key]: false }),
		}, {
			chat: true,
			editor: false,
			filesPlaceholder: false,
			nonAgentsWindow: false,
			mainChat: false,
		});
	});
});
