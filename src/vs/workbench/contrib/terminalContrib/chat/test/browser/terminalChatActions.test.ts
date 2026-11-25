/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import '../../browser/terminalChatActions.js';
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from '../../browser/terminalChat.js';

suite('Terminal Chat actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function hasViewInChat(overrides: Record<string, ContextKeyValue>): boolean {
		const context: IContext = {
			getValue: <T extends ContextKeyValue>(key: string): T | undefined => overrides[key] as T | undefined,
		};
		return MenuRegistry.getMenuItems(MENU_TERMINAL_CHAT_WIDGET_STATUS)
			.filter(isIMenuItem)
			.some(item => item.command.id === TerminalChatCommandId.ViewInChat && (!item.when || item.when.evaluate(context)));
	}

	test('shows View in Chat only for local terminal chat sessions', () => {
		const base = {
			[TerminalChatContextKeys.responseContainsCodeBlock.key]: true,
			[TerminalChatContextKeys.requestActive.key]: false,
		};

		assert.deepStrictEqual({
			local: hasViewInChat({ ...base, [TerminalChatContextKeys.usesAgentHost.key]: false }),
			agentHost: hasViewInChat({ ...base, [TerminalChatContextKeys.usesAgentHost.key]: true }),
		}, {
			local: true,
			agentHost: false,
		});
	});
});
