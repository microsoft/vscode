/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as assert from 'assert';
import assert = require('assert');
import { isWindows } from 'vs/base/common/platform';
import { ITerminalProfiles, ProfileSource } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableProfiles, IStatProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';

export interface ITestTerminalConfig {
	profiles: ITerminalProfiles;
	quickLaunchWslProfiles: boolean
}

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableProfiles', () => {
		if (isWindows) {
			suite('detectAvailableWindowsProfiles', async () => {
				test('should detect Git Bash and provide login args', async () => {
					const _paths = [`C:\\Program Files\\Git\\bin\\bash.exe`];
					let config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'Git Bash': { source: ProfileSource.GitBash }
							},
							linux: {},
							osx: {}
						},
						quickLaunchWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'] }];
					assert.deepStrictEqual(profiles, expected);
				});
				// 	test('should detect cmd prompt', async () => {
				// 		const _paths = ['C:\\WINDOWS\\System32\\cmd.exe'];
				// 		let config: ITestTerminalConfig = {
				// 			profiles: {
				// 				windows: {
				// 					'Command Prompt': { pathOrPaths: _paths }
				// 				},
				// 				linux: {},
				// 				osx: {},
				// 			},
				// 			quickLaunchWslProfiles: false
				// 		};
				// 		const profiles = await detectAvailableProfiles(true, undefined, config, undefined, undefined, createStatProvider(_paths));
				// 		const expected = [{ profileName: 'Command Prompt', path: _paths[0] }];
				// 		assert.deepStrictEqual(expected, profiles);
				// 	});
			}
			);
		}

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
});
