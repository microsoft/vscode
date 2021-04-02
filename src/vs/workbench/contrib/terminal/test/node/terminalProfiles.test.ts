/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, fail, ok, strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalConfiguration, ITerminalProfile, ITerminalProfiles, ProfileSource } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableProfiles, IFsProvider } from 'vs/workbench/contrib/terminal/node/terminalProfiles';

/**
 * Assets that two profiles objects are equal, this will treat explicit undefined and unset
 * properties the same.
 */
function profilesEqual(actualProfiles: ITerminalProfile[], expectedProfiles: ITerminalProfile[]) {
	strictEqual(actualProfiles.length, expectedProfiles.length);
	for (const expected of expectedProfiles) {
		const actual = actualProfiles.find(e => e.profileName === expected.profileName);
		ok(actual, `Expected profile ${expected.profileName} not found`);
		strictEqual(actual.profileName, expected.profileName);
		strictEqual(actual.path, expected.path);
		deepStrictEqual(actual.args, expected.args);
		strictEqual(actual.isAutoDetected, expected.isAutoDetected);
		strictEqual(actual.isWorkspaceProfile, expected.isWorkspaceProfile);
		strictEqual(actual.overrideName, expected.overrideName);
	}
}

suite.only('Workbench - TerminalProfiles', () => {
	suite('detectAvailableProfiles', () => {
		if (isWindows) {
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
					useWslProfiles: false
				};
				const profiles = await detectAvailableProfiles(true, createFsProvider(_paths), undefined, config as ITerminalConfiguration, undefined, undefined);
				const expected = [{ profileName: 'Git Bash', path: _paths[0], args: ['--login'], isAutoDetected: undefined, overrideName: undefined }];
				deepStrictEqual(profiles, expected);
			});
			test('should allow source to have args', async () => {
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
				const profiles = await detectAvailableProfiles(true, undefined, undefined, config as ITerminalConfiguration, undefined, undefined);
				const expected = [{ profileName: 'PowerShell NoProfile', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', overrideName: true, isAutoDetected: undefined, args: ['-NoProfile'] }];
				deepStrictEqual(expected, profiles);
			});
			test('configured args should override default source ones', async () => {
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
				const profiles = await detectAvailableProfiles(true, createFsProvider(_paths), undefined, config as ITerminalConfiguration, undefined, undefined);
				const expected = [{ profileName: 'Git Bash', path: _paths[0], args: [], isAutoDetected: undefined, overrideName: undefined }];
				deepStrictEqual(profiles, expected);
			});
		} else {
			const absoluteConfig = ({
				profiles: {
					windows: {},
					osx: {
						'fakeshell1': { path: '/bin/fakeshell1' },
						'fakeshell2': { path: '/bin/fakeshell2' },
						'fakeshell3': { path: '/bin/fakeshell3' }
					},
					linux: {
						'fakeshell1': { path: '/bin/fakeshell1' },
						'fakeshell2': { path: '/bin/fakeshell2' },
						'fakeshell3': { path: '/bin/fakeshell3' }
					}
				},
				useWslProfiles: false
			} as ITestTerminalConfig) as ITerminalConfiguration;
			const onPathConfig = ({
				profiles: {
					windows: {},
					osx: {
						'fakeshell1': { path: 'fakeshell1' },
						'fakeshell2': { path: 'fakeshell2' },
						'fakeshell3': { path: 'fakeshell3' }
					},
					linux: {
						'fakeshell1': { path: 'fakeshell1' },
						'fakeshell2': { path: 'fakeshell2' },
						'fakeshell3': { path: 'fakeshell3' }
					}
				},
				useWslProfiles: false
			} as ITestTerminalConfig) as ITerminalConfiguration;

			test('should detect shells via absolute paths', async () => {
				const fsProvider = createFsProvider([
					'/bin/fakeshell1',
					'/bin/fakeshell3'
				]);
				const profiles = await detectAvailableProfiles(true, fsProvider, undefined, absoluteConfig, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: '/bin/fakeshell1' },
					{ profileName: 'fakeshell3', path: '/bin/fakeshell3' }
				];
				profilesEqual(profiles, expected);
			});
			test('should auto detect shells via /etc/shells', async () => {
				const fsProvider = createFsProvider([
					'/bin/fakeshell1',
					'/bin/fakeshell3'
				], '/bin/fakeshell1\n/bin/fakeshell3');
				const profiles = await detectAvailableProfiles(false, fsProvider, undefined, onPathConfig, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: 'fakeshell1' },
					{ profileName: 'fakeshell3', path: 'fakeshell3' }
				];
				profilesEqual(profiles, expected);
			});
			test('should validate auto detected shells from /etc/shells exist', async () => {
				// fakeshell3 exists in /etc/shells but not on FS
				const fsProvider = createFsProvider([
					'/bin/fakeshell1'
				], '/bin/fakeshell1\n/bin/fakeshell3');
				const profiles = await detectAvailableProfiles(false, fsProvider, undefined, onPathConfig, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: 'fakeshell1' }
				];
				profilesEqual(profiles, expected);
			});
		}
	});

	function createFsProvider(expectedPaths: string[], etcShellsContent: string = ''): IFsProvider {
		const provider = {
			async existsFile(path: string): Promise<boolean> {
				return expectedPaths.includes(path);
			},
			async readFile(path: string, options: { encoding: BufferEncoding, flag?: string | number } | BufferEncoding): Promise<string> {
				if (path !== '/etc/shells') {
					fail('Unexected path');
				}
				console.log('readfile', etcShellsContent);
				return etcShellsContent;
			}
		};
		return provider;
	}
});

export interface ITestTerminalConfig {
	profiles: ITerminalProfiles;
	useWslProfiles: boolean
}
