/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { detectAvailableShells } from 'vs/workbench/contrib/terminal/node/terminalProfiles';

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableShells', () => {
		test('should change Sysnative to System32 in non-WoW64 systems', () => {
			const shell = detectAvailableShells();
			const expected = { label: 'Cmd Prompt', path: 'C:\\Windows\\System32\\cmd.exe', args: undefined };
			assert.equal(shell, expected);
		});
	});
});
