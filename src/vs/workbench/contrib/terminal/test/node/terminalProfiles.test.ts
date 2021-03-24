/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as assert from 'assert';
import assert = require('assert');
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { ITerminalConfiguration, ITerminalProfiles, ProfileSource } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableProfiles, IStatProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';

suite('Workbench - TerminalProfiles', () => {
	suite('detectAvailableProfiles', () => {
		if (isWindows) {
			suite('detectAvailableWindowsProfiles', async () => {
				test('should detect Git Bash and provide login args', async () => {
					const _paths = [`C:\\Program Files\\Git\\bin\\bash.exe`];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'Git Bash': { source: ProfileSource.GitBash }
							},
							linux: {},
							osx: {}
						},
						showQuickLaunchWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'] }];
					assert.deepStrictEqual(profiles, expected);
				});
				test.skip('should detect cmd prompt', async () => {
					const _paths = ['C:\\WINDOWS\\System32\\cmd.exe'];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'Command Prompt': { path: _paths }
							},
							linux: {},
							osx: {},
						},
						showQuickLaunchWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Command Prompt', path: _paths[0] }];
					assert.deepStrictEqual(expected, profiles);
				});
			}
			);
		} else if (isMacintosh) {
			suite.skip('detectAvailableOsxProfiles', async () => {
				test('should detect bash, zsh, tmux, fish', async () => {
					const _paths = ['bash', 'zsh', 'tmux', 'fish'];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {},
							osx: {
								'bash': {
									path: 'bash'
								},
								'zsh': {
									path: 'zsh'
								},
								'fish': {
									path: 'fish'
								},
								'tmux': {
									path: 'tmux'
								}
							},
							linux: {}
						},
						showQuickLaunchWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'bash', path: _paths[0] }, { profileName: 'bash', path: _paths[0] }, { profileName: 'zsh', path: _paths[1] }, { profileName: 'tmux', path: _paths[2] }, { profileName: 'fish', path: _paths[3] }];
					assert.deepStrictEqual(profiles, expected);
				});
			}
			);
		} else if (isLinux) {
			suite.skip('detectAvailableLinuxProfiles', async () => {
				test('should detect bash, zsh, tmux, fish', async () => {
					const _paths = ['bash', 'zsh', 'tmux', 'fish'];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {},
							linux: {
								'bash': {
									path: 'bash'
								},
								'zsh': {
									path: 'zsh'
								},
								'fish': {
									path: 'fish'
								},
								'tmux': {
									path: 'tmux'
								}
							},
							osx: {}
						},
						showQuickLaunchWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'bash', path: _paths[0] }, { profileName: 'bash', path: _paths[0] }, { profileName: 'zsh', path: _paths[1] }, { profileName: 'tmux', path: _paths[2] }, { profileName: 'fish', path: _paths[3] }];
					assert.deepStrictEqual(profiles, expected);
				});
			}
			);
		}
	});

	function createStatProvider(expectedPaths: string[]): IStatProvider {
		const provider = {
			async stat(path: string) {
				return {
					isFile: () => expectedPaths.includes(path),
					isSymbolicLink: () => false
				};
			},
			async lstat(path: string) {
				return {
					isFile: () => expectedPaths.includes(path),
					isSymbolicLink: () => false
				};
			}
		};
		return provider;
	}
});

export interface ITestTerminalConfig {
	profiles: ITerminalProfiles;
	showQuickLaunchWslProfiles: boolean
}
