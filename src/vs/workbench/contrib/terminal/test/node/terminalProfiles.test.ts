/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalExecutable, ITerminalProfileObject, ProfileGenerator } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableProfiles, IStatProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';


export interface ITestTerminalConfiguration {
	detectWslProfiles: boolean;
	profiles: {
		windows: Map<string, ITerminalProfileObject>
	}
}
let config: ITestTerminalConfiguration = { detectWslProfiles: false, profiles: { windows: new Map<string, ITerminalProfileObject>() } };

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableProfiles', () => {
		if (isWindows) {
			suite('detectAvailableWindowsProfiles', async () => {
				test('should detect cmd prompt', async () => {
					const _paths = ['C:\\WINDOWS\\System32\\cmd.exe'];
					let exec = ({ path: _paths } as ITerminalExecutable);
					config.profiles.windows.set('Command Prompt', exec);
					const profiles = await detectAvailableProfiles(config, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Command Prompt', path: _paths[0] }];
					assert.deepStrictEqual(expected, profiles);
				});
				test('should detect Git Bash and provide login args', async () => {
					const _paths = [`Program Files\\Git\\bin\\bash.exe`];
					config.profiles.windows.set('Git Bash', { generator: ProfileGenerator['Git Bash'] });
					const profiles = await detectAvailableProfiles(config, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'] }];
					assert.deepStrictEqual(expected, profiles);
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
