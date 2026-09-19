/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { runRecentSelection } from '../../browser/terminalRunRecentQuickPick.js';

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
});
