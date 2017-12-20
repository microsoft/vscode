/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TerminalPanel } from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';
import * as platform from 'vs/base/common/platform';

suite('Workbench - TerminalPanel', () => {
	test('preparePathForTerminal', function () {
		if (platform.isWindows) {
			assert.equal(TerminalPanel.preparePathForTerminal('C:\\foo'), 'C:\\foo');
			assert.equal(TerminalPanel.preparePathForTerminal('C:\\foo bar'), '"C:\\foo bar"');
			return;
		}
		assert.equal(TerminalPanel.preparePathForTerminal('/a/\\foo bar"\'? ;\'??  :'), '/a/\\\\foo\\ bar\\"\\\'\\?\\ \\;\\\'\\?\\?\\ \\ \\:');
		assert.equal(TerminalPanel.preparePathForTerminal('/\\\'"?:;!*(){}[]'), '/\\\\\\\'\\"\\?\\:\\;\\!\\*\\(\\)\\{\\}\\[\\]');
	});
});