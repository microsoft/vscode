/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalProfileObject } from 'vs/workbench/contrib/terminal/common/terminal';
import { createStatProvider, detectAvailableProfiles } from 'vs/workbench/contrib/terminal/node/terminalProfiles';


export interface ITestTerminalConfiguration {
	detectWslProfiles: boolean;
	profiles: {
		windows: Map<string, ITerminalProfileObject>
	}
}
const config: ITestTerminalConfiguration = { detectWslProfiles: false, profiles: { windows: new Map<string, ITerminalProfileObject>() } };

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableProfiles', () => {
		if (isWindows) {
			suite('detectAvailableWindowsProfiles', async () => {
				test('should detect cmd prompt', async () => {
					const _paths = ['C:\\WINDOWS\\System32\\cmd.exe'];
					const shells = await detectAvailableProfiles(config, createStatProvider(_paths));
					const expected = [{ profileName: 'Command Prompt', path: _paths[0] }];
					assert.deepStrictEqual(expected, shells);
				});
				test('should detect cygwin and provide args', async () => {
					const _paths = ['C:\\cygwin64\\bin\\bash.exe'];
					const shells = await detectAvailableProfiles(config, createStatProvider(_paths));
					const expected = [{ profileName: 'Cygwin', path: _paths[0], args: ['-l'] }];
					assert.deepStrictEqual(expected, shells);
				});
				test('should detect Git Bash and provide login args', async () => {
					const _paths = ['C:\\Program Files\\Git\\bin\\bash.exe'];
					const shells = await detectAvailableProfiles(config, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'] }];
					assert.deepStrictEqual(expected, shells);
				});
			});
		}
	});
});
