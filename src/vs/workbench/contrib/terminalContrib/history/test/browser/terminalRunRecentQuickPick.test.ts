/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { isSafeTerminalHistoryText, runRecentSelection } from '../../browser/terminalRunRecentQuickPick.js';

suite('TerminalRunRecentQuickPick', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('contains rejected directory preparation without dispatching', async () => {
		const calls = { focused: 0, commands: [] as { text: string; execute: boolean }[] };
		const instance = {
			preparePathForShell: async () => { throw new Error('unsafe path'); },
			runCommand: (text: string, execute: boolean) => calls.commands.push({ text, execute }),
			focus: () => calls.focused++,
		} as unknown as ITerminalInstance;

		const didRun = await runRecentSelection(instance, 'cwd', '/unsafe', true);

		assert.deepStrictEqual({ didRun, calls }, {
			didRun: false,
			calls: { focused: 1, commands: [] },
		});
	});

	test('rejects terminal control characters', () => {
		const rejected = [0x00, 0x08, 0x09, 0x0A, 0x0D, 0x1B, 0x1F, 0x7F, 0x80, 0x85, 0x9B, 0x9F];
		assert.deepStrictEqual(
			rejected.map(code => isSafeTerminalHistoryText(`echo${String.fromCharCode(code)}value`)),
			rejected.map(() => false)
		);
		assert.deepStrictEqual(
			['echo value', `echo${String.fromCharCode(0x7E)}value`, `echo${String.fromCharCode(0xA0)}value`].map(isSafeTerminalHistoryText),
			[true, true, true]
		);
	});
});
