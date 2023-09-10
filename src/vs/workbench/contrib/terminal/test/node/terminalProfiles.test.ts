/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, fail, ok, strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { ITerminalProfile, ProfileSource } from 'vs/platform/terminal/common/terminal';
import { ITerminalConfiguration, ITerminalProfiles } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectAvailableProfiles, IFsProvider } from 'vs/platform/terminal/node/terminalProfiles';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

/**
 * Assets that two profiles objects are equal, this will treat explicit undefined and unset
 * properties the same. Order of the profiles is ignored.
 */
function profilesEqual(actualProfiles: ITerminalProfile[], expectedProfiles: ITerminalProfile[]) {
	strictEqual(actualProfiles.length, expectedProfiles.length, `Actual: ${actualProfiles.map(e => e.profileName).join(',')}\nExpected: ${expectedProfiles.map(e => e.profileName).join(',')}`);
	for (const expected of expectedProfiles) {
		const actual = actualProfiles.find(e => e.profileName === expected.profileName);
		ok(actual, `Expected profile ${expected.profileName} not found`);
		strictEqual(actual.profileName, expected.profileName);
		strictEqual(actual.path, expected.path);
		deepStrictEqual(actual.args, expected.args);
		strictEqual(actual.isAutoDetected, expected.isAutoDetected);
		strictEqual(actual.overrideName, expected.overrideName);
	}
}

suite('Workbench - TerminalProfiles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('detectAvailableProfiles', () => {
		if (isWindows) {
			test('should detect Git Bash and provide login args', async () => {
				const fsProvider = createFsProvider([
					'C:\\Program Files\\Git\\bin\\bash.exe'
				]);
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
				const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
				const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, undefined);
				const expected = [
					{ profileName: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'], isDefault: true }
				];
				profilesEqual(profiles, expected);
			});
			test('should allow source to have args', async () => {
				const pwshSourcePaths = [
					'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
				];
				const fsProvider = createFsProvider(pwshSourcePaths);
				const config: ITestTerminalConfig = {
					profiles: {
						windows: {
							'PowerShell': { source: ProfileSource.Pwsh, args: ['-NoProfile'], overrideName: true }
						},
						linux: {},
						osx: {},
					},
					useWslProfiles: false
				};
				const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
				const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, pwshSourcePaths);
				const expected = [
					{ profileName: 'PowerShell', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', overrideName: true, args: ['-NoProfile'], isDefault: true }
				];
				profilesEqual(profiles, expected);
			});
			test('configured args should override default source ones', async () => {
				const fsProvider = createFsProvider([
					'C:\\Program Files\\Git\\bin\\bash.exe'
				]);
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
				const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
				const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, undefined);
				const expected = [{ profileName: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: [], isAutoDetected: undefined, overrideName: undefined, isDefault: true }];
				profilesEqual(profiles, expected);
			});
			suite('pwsh source detection/fallback', () => {
				const pwshSourceConfig = ({
					profiles: {
						windows: {
							'PowerShell': { source: ProfileSource.Pwsh }
						},
						linux: {},
						osx: {},
					},
					useWslProfiles: false
				} as ITestTerminalConfig) as ITerminalConfiguration;

				test('should prefer pwsh 7 to Windows PowerShell', async () => {
					const pwshSourcePaths = [
						'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
						'C:\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe',
						'C:\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
					];
					const fsProvider = createFsProvider(pwshSourcePaths);
					const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
					const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, pwshSourcePaths);
					const expected = [
						{ profileName: 'PowerShell', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', isDefault: true }
					];
					profilesEqual(profiles, expected);
				});
				test('should prefer pwsh 7 to pwsh 6', async () => {
					const pwshSourcePaths = [
						'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
						'C:\\Program Files\\PowerShell\\6\\pwsh.exe',
						'C:\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe',
						'C:\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
					];
					const fsProvider = createFsProvider(pwshSourcePaths);
					const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
					const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, pwshSourcePaths);
					const expected = [
						{ profileName: 'PowerShell', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', isDefault: true }
					];
					profilesEqual(profiles, expected);
				});
				test('should fallback to Windows PowerShell', async () => {
					const pwshSourcePaths = [
						'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe',
						'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
					];
					const fsProvider = createFsProvider(pwshSourcePaths);
					const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
					const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, pwshSourcePaths);
					strictEqual(profiles.length, 1);
					strictEqual(profiles[0].profileName, 'PowerShell');
				});
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
				const configurationService = new TestConfigurationService({ terminal: { integrated: absoluteConfig } });
				const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: '/bin/fakeshell1', isDefault: true },
					{ profileName: 'fakeshell3', path: '/bin/fakeshell3', isDefault: true }
				];
				profilesEqual(profiles, expected);
			});
			test('should auto detect shells via /etc/shells', async () => {
				const fsProvider = createFsProvider([
					'/bin/fakeshell1',
					'/bin/fakeshell3'
				], '/bin/fakeshell1\n/bin/fakeshell3');
				const configurationService = new TestConfigurationService({ terminal: { integrated: onPathConfig } });
				const profiles = await detectAvailableProfiles(undefined, undefined, true, configurationService, process.env, fsProvider, undefined, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: '/bin/fakeshell1', isFromPath: true, isDefault: true },
					{ profileName: 'fakeshell3', path: '/bin/fakeshell3', isFromPath: true, isDefault: true }
				];
				profilesEqual(profiles, expected);
			});
			test('should validate auto detected shells from /etc/shells exist', async () => {
				// fakeshell3 exists in /etc/shells but not on FS
				const fsProvider = createFsProvider([
					'/bin/fakeshell1'
				], '/bin/fakeshell1\n/bin/fakeshell3');
				const configurationService = new TestConfigurationService({ terminal: { integrated: onPathConfig } });
				const profiles = await detectAvailableProfiles(undefined, undefined, true, configurationService, process.env, fsProvider, undefined, undefined, undefined);
				const expected: ITerminalProfile[] = [
					{ profileName: 'fakeshell1', path: '/bin/fakeshell1', isFromPath: true, isDefault: true }
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
			async readFile(path: string): Promise<Buffer> {
				if (path !== '/etc/shells') {
					fail('Unexepected path');
				}
				return Buffer.from(etcShellsContent);
			}
		};
		return provider;
	}
});

export interface ITestTerminalConfig {
	profiles: ITerminalProfiles;
	useWslProfiles: boolean;
}
