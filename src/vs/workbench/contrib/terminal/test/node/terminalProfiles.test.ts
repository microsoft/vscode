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
			suite.skip('detectAvailableWindowsProfiles', async () => {
				test.skip('should detect Git Bash and provide login args', async () => {
					const _paths = [`C:\\Program Files\\Git\\bin\\bash.exe`];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'Git Bash': { source: ProfileSource.GitBash }
							},
							linux: {},
							osx: {}
						},
						useWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'], isAutoDetected: undefined, overrideName: undefined }];
					assert.deepStrictEqual(profiles, expected);
				});
				test.skip('should allow source to have args', async () => {
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'PowerShell NoProfile': { source: ProfileSource.Pwsh, args: ['-NoProfile'], overrideName: true }
							},
							linux: {},
							osx: {},
						},
						useWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, undefined);
					const expected = [{ profileName: 'PowerShell NoProfile', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', overrideName: true, isAutoDetected: undefined, args: ['-NoProfile'] }];
					assert.deepStrictEqual(expected, profiles);
				});
				test.skip('configured args should override default source ones', async () => {
					const _paths = [`C:\\Program Files\\Git\\bin\\bash.exe`];
					const config: ITestTerminalConfig = {
						profiles: {
							windows: {
								'Git Bash': { source: ProfileSource.GitBash, args: [] }
							},
							linux: {},
							osx: {}
						},
						useWslProfiles: false
					};
					const profiles = await detectAvailableProfiles(true, undefined, config as ITerminalConfiguration, undefined, undefined, createStatProvider(_paths));
					const expected = [{ profileName: 'Git Bash', path: _paths[0], args: [], isAutoDetected: undefined, overrideName: undefined }];
					assert.deepStrictEqual(profiles, expected);
				});
			});
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
						useWslProfiles: false
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
						useWslProfiles: false
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
			async existsFile(path: string): Promise<boolean> {
				return expectedPaths.includes(path);
			}
		};
		return provider;
	}
});

export interface ITestTerminalConfig {
	profiles: ITerminalProfiles;
	useWslProfiles: boolean
}
