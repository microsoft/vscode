/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { detectAvailableShells, IStatProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';


suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableShells', () => {
		if (isWindows) {
			suite('detectAvailableWindowsShells', async () => {
				test('should detect cygwin and provide args', async () => {
					const _paths = ['C:\\cygwin64\\bin\\bash.exe'];
					const shells = await detectAvailableShells(createStatProvider(_paths));
					const expected = [{ profileName: 'Cygwin', path: _paths[0], args: ['-l'] }];
					assert.deepStrictEqual(expected, shells);
				});
				test('should detect cmd prompt', async () => {
					const _paths = ['C:\\WINDOWS\\System32\\cmd.exe'];
					const shells = await detectAvailableShells(createStatProvider(_paths));
					const expected = [{ profileName: 'Command Prompt', path: _paths[0] }];
					assert.deepStrictEqual(expected, shells);
				});
				test('should detect wsl shells', async () => {
					const _paths = ['C:\\WINDOWS\\System32\\wsl.exe'];
					const shells = await detectAvailableShells(createStatProvider(_paths));
					const expected = [{ profileName: 'WSL Bash', path: _paths[0], args: ['-l'] }];
					assert.deepStrictEqual(expected, shells);
				});
			});
		}
	});
});

function createStatProvider(expectedPaths: string[]): IStatProvider {
	const provider = {
		stat(path: string) {
			return expectedPaths.includes(path);
		},
		lstat(path: string) {
			return expectedPaths.includes(path);
		}
	};
	return provider;
}
