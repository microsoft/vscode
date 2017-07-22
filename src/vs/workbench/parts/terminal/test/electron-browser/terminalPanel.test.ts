/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TerminalPanel } from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';

suite('Workbench - TerminalPanel', () => {
	test('preparePathForTerminal', function () {
		assert.equal(TerminalPanel.prepareWindowsPathForTerminal('C:\\foo'), 'C:\\foo');
		assert.equal(TerminalPanel.prepareWindowsPathForTerminal('C:\\foo bar'), '"C:\\foo bar"');

		assert.equal(TerminalPanel.prepareUnixPathForTerminal('/a/\\foo bar"\'? ;\'??  :'), '/a/\\\\foo\\ bar\\"\\\'\\?\\ \\;\\\'\\?\\?\\ \\ \\:');
		assert.equal(TerminalPanel.prepareUnixPathForTerminal('/\\\'"?:;!*(){}[]'), '/\\\\\\\'\\"\\?\\:\\;\\!\\*\\(\\)\\{\\}\\[\\]');
	});
});
