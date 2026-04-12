/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, fail, ok, strictEqual } from 'assert';
import { isWindows } from '../../../../../base/common/platform.js';
import { detectAvailableProfiles } from '../../../../../platform/terminal/node/terminalProfiles.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
/**
 * Assets that two profiles objects are equal, this will treat explicit undefined and unset
 * properties the same. Order of the profiles is ignored.
 */
function profilesEqual(actualProfiles, expectedProfiles) {
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
                const config = {
                    profiles: {
                        windows: {
                            'Git Bash': { source: "Git Bash" /* ProfileSource.GitBash */ }
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
                const config = {
                    profiles: {
                        windows: {
                            'PowerShell': { source: "PowerShell" /* ProfileSource.Pwsh */, args: ['-NoProfile'], overrideName: true }
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
                const config = {
                    profiles: {
                        windows: {
                            'Git Bash': { source: "Git Bash" /* ProfileSource.GitBash */, args: [] }
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
                const pwshSourceConfig = {
                    profiles: {
                        windows: {
                            'PowerShell': { source: "PowerShell" /* ProfileSource.Pwsh */ }
                        },
                        linux: {},
                        osx: {},
                    },
                    useWslProfiles: false
                };
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
        }
        else {
            const absoluteConfig = {
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
            };
            const onPathConfig = {
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
            };
            test('should detect shells via absolute paths', async () => {
                const fsProvider = createFsProvider([
                    '/bin/fakeshell1',
                    '/bin/fakeshell3'
                ]);
                const configurationService = new TestConfigurationService({ terminal: { integrated: absoluteConfig } });
                const profiles = await detectAvailableProfiles(undefined, undefined, false, configurationService, process.env, fsProvider, undefined, undefined, undefined);
                const expected = [
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
                const expected = [
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
                const expected = [
                    { profileName: 'fakeshell1', path: '/bin/fakeshell1', isFromPath: true, isDefault: true }
                ];
                profilesEqual(profiles, expected);
            });
        }
    });
    function createFsProvider(expectedPaths, etcShellsContent = '') {
        const provider = {
            async existsFile(path) {
                return expectedPaths.includes(path);
            },
            async readFile(path) {
                if (path !== '/etc/shells') {
                    fail('Unexepected path');
                }
                return Buffer.from(etcShellsContent);
            }
        };
        return provider;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9ub2RlL3Rlcm1pbmFsUHJvZmlsZXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUduRSxPQUFPLEVBQUUsdUJBQXVCLEVBQWUsTUFBTSwyREFBMkQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRzs7O0dBR0c7QUFDSCxTQUFTLGFBQWEsQ0FBQyxjQUFrQyxFQUFFLGdCQUFvQztJQUM5RixXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsV0FBVyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZUFBZSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUM1TCxLQUFLLE1BQU0sUUFBUSxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEtBQUssUUFB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