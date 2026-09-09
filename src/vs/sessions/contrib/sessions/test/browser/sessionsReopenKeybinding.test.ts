/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import '../../browser/sessionsActions.js';

const REOPEN_CLOSED_ITEM_ID = 'sessions.reopenLastClosedItem';
const REOPEN_CLOSED_CHAT_ID = 'sessions.chatCompositeBar.reopenLastClosedChat';
const CTRL_SHIFT_T = decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT, OS)!.getHashCode();

/** Minimal {@link IContext} over a plain record of context key values. */
function context(values: Record<string, boolean>): IContext {
	return { getValue: <T>(key: string) => values[key] as T | undefined };
}

suite('Sessions - Reopen Closed Chat or Session keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const boundToChord = () => KeybindingsRegistry.getDefaultKeybindings()
		.filter(item => item.keybinding?.getHashCode() === CTRL_SHIFT_T);

	test('takes Ctrl/Cmd+Shift+T from VS Code\'s Reopen Closed Editor only outside the editor scope', () => {
		const rule = boundToChord().find(item => item.command === REOPEN_CLOSED_ITEM_ID)!;
		const evaluate = (values: Record<string, boolean>) => rule.when?.evaluate(context(values)) ?? true;

		assert.deepStrictEqual({
			// A higher weight than Reopen Closed Editor, so the sessions rule is
			// consulted first and that command runs only when it does not match.
			winsOverReopenClosedEditor: rule.weight1 > KeybindingWeight.WorkbenchContrib,
			normalWindow: evaluate({}),
			sessionsList: evaluate({ isSessionsWindow: true }),
			editorArea: evaluate({ isSessionsWindow: true, editorAreaFocus: true }),
			sidePaneDetail: evaluate({ isSessionsWindow: true, auxiliaryBarFocus: true }),
		}, {
			winsOverReopenClosedEditor: true,
			normalWindow: false,
			sessionsList: true,
			editorArea: false,
			sidePaneDetail: false,
		});
	});

	test('supersedes the chord that Reopen Last Closed Chat used to own', () => {
		const commands = boundToChord().map(item => item.command);

		assert.deepStrictEqual({
			reopenClosedItem: commands.includes(REOPEN_CLOSED_ITEM_ID),
			reopenClosedChat: commands.includes(REOPEN_CLOSED_CHAT_ID),
		}, {
			reopenClosedItem: true,
			reopenClosedChat: false,
		});
	});
});
