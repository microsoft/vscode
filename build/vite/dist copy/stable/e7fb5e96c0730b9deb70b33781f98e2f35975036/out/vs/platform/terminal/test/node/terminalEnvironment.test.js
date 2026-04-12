/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-test-async-suite */
import { deepStrictEqual, ok, strictEqual } from 'assert';
import { homedir, userInfo } from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { getShellIntegrationInjection, sanitizeEnvForLogging } from '../../node/terminalEnvironment.js';
import { getWindowsBuildNumberSync } from '../../../../base/node/windowsVersion.js';
const enabledProcessOptions = { shellIntegration: { enabled: true, suggestEnabled: false, nonce: '' }, windowsUseConptyDll: false, environmentVariableCollections: undefined, workspaceFolder: undefined, isScreenReaderOptimized: false };
const disabledProcessOptions = { shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' }, windowsUseConptyDll: false, environmentVariableCollections: undefined, workspaceFolder: undefined, isScreenReaderOptimized: false };
const pwshExe = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const repoRoot = process.platform === 'win32' ? process.cwd()[0].toLowerCase() + process.cwd().substring(1) : process.cwd();
const logService = new NullLogService();
const productService = { applicationName: 'vscode' };
const defaultEnvironment = {};
function deepStrictEqualIgnoreStableVar(actual, expected) {
    if (actual?.type === 'injection' && actual.envMixin) {
        delete actual.envMixin['VSCODE_STABLE'];
    }
    deepStrictEqual(actual, expected);
}
suite('platform - terminalEnvironment', async () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('getShellIntegrationInjection', async () => {
        suite('should not enable', async () => {
            // This test is only expected to work on Windows 10 build 18309 and above
            (getWindowsBuildNumberSync() < 18309 ? test.skip : test)('when isFeatureTerminal or when no executable is provided', async () => {
                strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo'], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo'], isFeatureTerminal: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'injection');
            });
        });
        // These tests are only expected to work on Windows 10 build 18309 and above
        (getWindowsBuildNumberSync() < 18309 ? suite.skip : suite)('pwsh', async () => {
            const expectedPs1 = process.platform === 'win32'
                ? `try { . "${repoRoot}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1" } catch {}`
                : `. "${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"`;
            suite('should override args', async () => {
                const enabledExpectedResult = Object.freeze({
                    type: 'injection',
                    newArgs: [
                        '-noexit',
                        '-command',
                        expectedPs1
                    ],
                    envMixin: {
                        VSCODE_A11Y_MODE: '0',
                        VSCODE_INJECTION: '1'
                    }
                });
                test('when undefined, []', async () => {
                    deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                    deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: undefined }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                });
                suite('when no logo', async () => {
                    test('array - case insensitive', async () => {
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ['-NoLogo'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ['-NOLOGO'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ['-nol'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ['-NOL'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                    });
                    test('string - case insensitive', async () => {
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: '-NoLogo' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: '-NOLOGO' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: '-nol' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: '-NOL' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                    });
                });
            });
            suite('should incorporate login arg', async () => {
                const enabledExpectedResult = Object.freeze({
                    type: 'injection',
                    newArgs: [
                        '-l',
                        '-noexit',
                        '-command',
                        expectedPs1
                    ],
                    envMixin: {
                        VSCODE_A11Y_MODE: '0',
                        VSCODE_INJECTION: '1'
                    }
                });
                test('when array contains no logo and login', async () => {
                    deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                });
                test('when string', async () => {
                    deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: '-l' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                });
            });
            suite('should not modify args', async () => {
                test('when shell integration is disabled', async () => {
                    strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                    strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: '-l' }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                    strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                });
                test('when using unrecognized arg', async () => {
                    strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo', '-i'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                });
                test('when using unrecognized arg (string)', async () => {
                    strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: '-i' }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                });
            });
        });
        if (process.platform !== 'win32') {
            suite('zsh', async () => {
                suite('should override args', async () => {
                    const username = userInfo().username;
                    const expectedDir = new RegExp(`.+\/${username}-vscode-zsh`);
                    const customZdotdir = '/custom/zsh/dotdir';
                    const expectedDests = [
                        new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshrc`),
                        new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zprofile`),
                        new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshenv`),
                        new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zlogin`)
                    ];
                    const expectedSources = [
                        /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-rc.zsh/,
                        /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-profile.zsh/,
                        /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-env.zsh/,
                        /.+\/out\/vs\/workbench\/contrib\/terminal\/common\/scripts\/shellIntegration-login.zsh/
                    ];
                    function assertIsEnabled(result, globalZdotdir = homedir()) {
                        strictEqual(Object.keys(result.envMixin).length, 3);
                        ok(result.envMixin['ZDOTDIR']?.match(expectedDir));
                        strictEqual(result.envMixin['USER_ZDOTDIR'], globalZdotdir);
                        ok(result.envMixin['VSCODE_INJECTION']?.match('1'));
                        strictEqual(result.filesToCopy?.length, 4);
                        ok(result.filesToCopy[0].dest.match(expectedDests[0]));
                        ok(result.filesToCopy[1].dest.match(expectedDests[1]));
                        ok(result.filesToCopy[2].dest.match(expectedDests[2]));
                        ok(result.filesToCopy[3].dest.match(expectedDests[3]));
                        ok(result.filesToCopy[0].source.match(expectedSources[0]));
                        ok(result.filesToCopy[1].source.match(expectedSources[1]));
                        ok(result.filesToCopy[2].source.match(expectedSources[2]));
                        ok(result.filesToCopy[3].source.match(expectedSources[3]));
                    }
                    test('when undefined, []', async () => {
                        const result1 = await getShellIntegrationInjection({ executable: 'zsh', args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
                        deepStrictEqual(result1?.newArgs, ['-i']);
                        assertIsEnabled(result1);
                        const result2 = await getShellIntegrationInjection({ executable: 'zsh', args: undefined }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
                        deepStrictEqual(result2?.newArgs, ['-i']);
                        assertIsEnabled(result2);
                    });
                    suite('should incorporate login arg', async () => {
                        test('when array', async () => {
                            const result = await getShellIntegrationInjection({ executable: 'zsh', args: ['-l'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
                            deepStrictEqual(result?.newArgs, ['-il']);
                            assertIsEnabled(result);
                        });
                    });
                    suite('should not modify args', async () => {
                        test('when shell integration is disabled', async () => {
                            strictEqual((await getShellIntegrationInjection({ executable: 'zsh', args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                            strictEqual((await getShellIntegrationInjection({ executable: 'zsh', args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                        });
                        test('when using unrecognized arg', async () => {
                            strictEqual((await getShellIntegrationInjection({ executable: 'zsh', args: ['-l', '-fake'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                        });
                    });
                    suite('should incorporate global ZDOTDIR env variable', async () => {
                        test('when custom ZDOTDIR', async () => {
                            const result1 = await getShellIntegrationInjection({ executable: 'zsh', args: [] }, enabledProcessOptions, { ...defaultEnvironment, ZDOTDIR: customZdotdir }, logService, productService, true);
                            deepStrictEqual(result1?.newArgs, ['-i']);
                            assertIsEnabled(result1, customZdotdir);
                        });
                        test('when undefined', async () => {
                            const result1 = await getShellIntegrationInjection({ executable: 'zsh', args: [] }, enabledProcessOptions, undefined, logService, productService, true);
                            deepStrictEqual(result1?.newArgs, ['-i']);
                            assertIsEnabled(result1);
                        });
                    });
                });
            });
            suite('bash', async () => {
                suite('forceShellIntegration', async () => {
                    test('should inject when isFeatureTerminal is true but forceShellIntegration overrides it', async () => {
                        strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: [], isFeatureTerminal: true, forceShellIntegration: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'injection');
                    });
                    test('should not inject when isFeatureTerminal is true and forceShellIntegration is false', async () => {
                        strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: [], isFeatureTerminal: true, forceShellIntegration: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                    });
                    test('should not inject when isFeatureTerminal is true and forceShellIntegration is not set', async () => {
                        strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: [], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                    });
                });
                suite('should override args', async () => {
                    test('when undefined, [], empty string', async () => {
                        const enabledExpectedResult = Object.freeze({
                            type: 'injection',
                            newArgs: [
                                '--init-file',
                                `${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh`
                            ],
                            envMixin: {
                                VSCODE_INJECTION: '1'
                            }
                        });
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: 'bash', args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: 'bash', args: '' }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: 'bash', args: undefined }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                    });
                    suite('should set login env variable and not modify args', async () => {
                        const enabledExpectedResult = Object.freeze({
                            type: 'injection',
                            newArgs: [
                                '--init-file',
                                `${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh`
                            ],
                            envMixin: {
                                VSCODE_INJECTION: '1',
                                VSCODE_SHELL_LOGIN: '1'
                            }
                        });
                        test('when array', async () => {
                            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: 'bash', args: ['-l'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
                        });
                    });
                    suite('should not modify args', async () => {
                        test('when shell integration is disabled', async () => {
                            strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                            strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                        });
                        test('when custom array entry', async () => {
                            strictEqual((await getShellIntegrationInjection({ executable: 'bash', args: ['-l', '-i'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, 'failure');
                        });
                    });
                });
            });
        }
        suite('custom shell integration nonce', async () => {
            test('should fail for unsupported shell but nonce should still be available', async () => {
                const customProcessOptions = {
                    shellIntegration: { enabled: true, suggestEnabled: false, nonce: 'custom-nonce-12345' },
                    windowsUseConptyDll: false,
                    environmentVariableCollections: undefined,
                    workspaceFolder: undefined,
                    isScreenReaderOptimized: false
                };
                // Test with an unsupported shell (julia)
                const result = await getShellIntegrationInjection({ executable: 'julia', args: ['-i'] }, customProcessOptions, defaultEnvironment, logService, productService, true);
                // Should fail due to unsupported shell
                strictEqual(result.type, 'failure');
                // But the nonce should be available in the process options for the terminal process to use
                strictEqual(customProcessOptions.shellIntegration.nonce, 'custom-nonce-12345');
            });
        });
    });
    suite('sanitizeEnvForLogging', () => {
        test('should return undefined for undefined input', () => {
            strictEqual(sanitizeEnvForLogging(undefined), undefined);
        });
        test('should return empty object for empty input', () => {
            deepStrictEqual(sanitizeEnvForLogging({}), {});
        });
        test('should pass through non-sensitive values', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                PATH: '/usr/bin',
                HOME: '/home/user',
                TERM: 'xterm-256color'
            }), {
                PATH: '/usr/bin',
                HOME: '/home/user',
                TERM: 'xterm-256color'
            });
        });
        test('should redact sensitive env var names', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                API_KEY: 'secret123',
                GITHUB_TOKEN: 'ghp_xxxx',
                MY_SECRET: 'hidden',
                PASSWORD: 'pass123',
                AWS_ACCESS_KEY: 'AKIA...',
                DATABASE_PASSWORD: 'dbpass',
                CLIENT_SECRET: 'client_secret_value',
                AUTH_TOKEN: 'auth_value',
                PRIVATE_KEY: 'private_key_value'
            }), {
                API_KEY: '<REDACTED>',
                GITHUB_TOKEN: '<REDACTED>',
                MY_SECRET: '<REDACTED>',
                PASSWORD: '<REDACTED>',
                AWS_ACCESS_KEY: '<REDACTED>',
                DATABASE_PASSWORD: '<REDACTED>',
                CLIENT_SECRET: '<REDACTED>',
                AUTH_TOKEN: '<REDACTED>',
                PRIVATE_KEY: '<REDACTED>'
            });
        });
        test('should redact JWT tokens by value pattern', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                SOME_VAR: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
            }), {
                SOME_VAR: '<REDACTED>'
            });
        });
        test('should redact GitHub tokens by value pattern', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                MY_GH: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
            }), {
                MY_GH: '<REDACTED>'
            });
        });
        test('should redact Google API keys by value pattern', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                GOOGLE_KEY: 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe'
            }), {
                GOOGLE_KEY: '<REDACTED>'
            });
        });
        test('should redact long alphanumeric strings (potential secrets)', () => {
            deepStrictEqual(sanitizeEnvForLogging({
                LONG_VALUE: 'abcdefghijklmnopqrstuvwxyz123456'
            }), {
                LONG_VALUE: '<REDACTED>'
            });
        });
        test('should skip undefined values', () => {
            const env = {
                DEFINED: 'value',
                UNDEFINED: undefined
            };
            deepStrictEqual(sanitizeEnvForLogging(env), {
                DEFINED: 'value'
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbnZpcm9ubWVudC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvdGVzdC9ub2RlL3Rlcm1pbmFsRW52aXJvbm1lbnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxtREFBbUQ7QUFDbkQsT0FBTyxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3ZDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUc1RCxPQUFPLEVBQUUsNEJBQTRCLEVBQTRFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEwsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFcEYsTUFBTSxxQkFBcUIsR0FBNEIsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsU0FBUyxFQUFFLHVCQUF1QixFQUFFLEtBQUssRUFBRSxDQUFDO0FBQ3BRLE1BQU0sc0JBQXNCLEdBQTRCLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUN0USxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDbkUsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDNUgsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztBQUN4QyxNQUFNLGNBQWMsR0FBRyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQXFCLENBQUM7QUFDeEUsTUFBTSxrQkFBa0IsR0FBRyxFQUFFLENBQUM7QUFFOUIsU0FBUyw4QkFBOEIsQ0FBQyxNQUF3RixFQUFFLFFBQTBDO0lBQzNLLElBQUksTUFBTSxFQUFFLElBQUksS0FBSyxXQUFXLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3JELE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBQ0QsZUFBZSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEtBQUssSUFBSSxFQUFFO0lBQ2xELHVDQUF1QyxFQUFFLENBQUM7SUFDMUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hELEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyQyx5RUFBeUU7WUFDekUsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsMERBQTBELEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQy9ILFdBQVcsQ0FBQyxDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUMxTixXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM5TixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsNEVBQTRFO1FBQzVFLENBQUMseUJBQXlCLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLElBQUksRUFBRTtZQUM3RSxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU87Z0JBQy9DLENBQUMsQ0FBQyxZQUFZLFFBQVEsNEZBQTRGO2dCQUNsSCxDQUFDLENBQUMsTUFBTSxRQUFRLHlFQUF5RSxDQUFDO1lBQzNGLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDeEMsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFtQztvQkFDN0UsSUFBSSxFQUFFLFdBQVc7b0JBQ2pCLE9BQU8sRUFBRTt3QkFDUixTQUFTO3dCQUNULFVBQVU7d0JBQ1YsV0FBVztxQkFDWDtvQkFDRCxRQUFRLEVBQUU7d0JBQ1QsZ0JBQWdCLEVBQUUsR0FBRzt3QkFDckIsZ0JBQWdCLEVBQUUsR0FBRztxQkFDckI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDckMsOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFDMU0sOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztnQkFDbE4sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsS0FBSyxDQUFDLGNBQWMsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDaEMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUMzQyw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQzt3QkFDbk4sOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLHFCQUFxQixDQUFDLENBQUM7d0JBQ25OLDhCQUE4QixDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO3dCQUNoTiw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFDak4sQ0FBQyxDQUFDLENBQUM7b0JBQ0gsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUM1Qyw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO3dCQUNqTiw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO3dCQUNqTiw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO3dCQUM5TSw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO29CQUMvTSxDQUFDLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNoRCxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQW1DO29CQUM3RSxJQUFJLEVBQUUsV0FBVztvQkFDakIsT0FBTyxFQUFFO3dCQUNSLElBQUk7d0JBQ0osU0FBUzt3QkFDVCxVQUFVO3dCQUNWLFdBQVc7cUJBQ1g7b0JBQ0QsUUFBUSxFQUFFO3dCQUNULGdCQUFnQixFQUFFLEdBQUc7d0JBQ3JCLGdCQUFnQixFQUFFLEdBQUc7cUJBQ3JCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3hELDhCQUE4QixDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztnQkFDMU4sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDOUIsOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztnQkFDN00sQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDMUMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUNyRCxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3ZMLFdBQVcsQ0FBQyxDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUNyTCxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDM0wsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUM5QyxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDek0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN2RCxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDdEwsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ2xDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3ZCLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDeEMsTUFBTSxRQUFRLEdBQUcsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDO29CQUNyQyxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLFFBQVEsYUFBYSxDQUFDLENBQUM7b0JBQzdELE1BQU0sYUFBYSxHQUFHLG9CQUFvQixDQUFDO29CQUMzQyxNQUFNLGFBQWEsR0FBRzt3QkFDckIsSUFBSSxNQUFNLENBQUMsUUFBUSxRQUFRLHdCQUF3QixDQUFDO3dCQUNwRCxJQUFJLE1BQU0sQ0FBQyxRQUFRLFFBQVEsMkJBQTJCLENBQUM7d0JBQ3ZELElBQUksTUFBTSxDQUFDLFFBQVEsUUFBUSx5QkFBeUIsQ0FBQzt3QkFDckQsSUFBSSxNQUFNLENBQUMsUUFBUSxRQUFRLHlCQUF5QixDQUFDO3FCQUNyRCxDQUFDO29CQUNGLE1BQU0sZUFBZSxHQUFHO3dCQUN2QixxRkFBcUY7d0JBQ3JGLDBGQUEwRjt3QkFDMUYsc0ZBQXNGO3dCQUN0Rix3RkFBd0Y7cUJBQ3hGLENBQUM7b0JBQ0YsU0FBUyxlQUFlLENBQUMsTUFBd0MsRUFBRSxhQUFhLEdBQUcsT0FBTyxFQUFFO3dCQUMzRixXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNyRCxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQzt3QkFDcEQsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFTLENBQUMsY0FBYyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7d0JBQzdELEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ3JELFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDM0MsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN2RCxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3ZELEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDdkQsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN2RCxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzNELEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDM0QsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMzRCxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVELENBQUM7b0JBQ0QsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUNyQyxNQUFNLE9BQU8sR0FBRyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQXFDLENBQUM7d0JBQ3JNLGVBQWUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDMUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUN6QixNQUFNLE9BQU8sR0FBRyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQXFDLENBQUM7d0JBQzVNLGVBQWUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDMUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUMxQixDQUFDLENBQUMsQ0FBQztvQkFDSCxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxJQUFJLEVBQUU7d0JBQ2hELElBQUksQ0FBQyxZQUFZLEVBQUUsS0FBSyxJQUFJLEVBQUU7NEJBQzdCLE1BQU0sTUFBTSxHQUFHLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQXFDLENBQUM7NEJBQ3hNLGVBQWUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDMUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUN6QixDQUFDLENBQUMsQ0FBQztvQkFDSixDQUFDLENBQUMsQ0FBQztvQkFDSCxLQUFLLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7d0JBQzFDLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLElBQUksRUFBRTs0QkFDckQsV0FBVyxDQUFDLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDOzRCQUNyTCxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQzt3QkFDekwsQ0FBQyxDQUFDLENBQUM7d0JBQ0gsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUM5QyxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO3dCQUMvTCxDQUFDLENBQUMsQ0FBQztvQkFDSixDQUFDLENBQUMsQ0FBQztvQkFDSCxLQUFLLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7d0JBQ2xFLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLElBQUksRUFBRTs0QkFDdEMsTUFBTSxPQUFPLEdBQUcsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLHFCQUFxQixFQUFFLEVBQUUsR0FBRyxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQXFDLENBQUM7NEJBQ3BPLGVBQWUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzs0QkFDMUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsQ0FBQzt3QkFDekMsQ0FBQyxDQUFDLENBQUM7d0JBQ0gsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUNqQyxNQUFNLE9BQU8sR0FBRyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFxQyxDQUFDOzRCQUM1TCxlQUFlLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7NEJBQzFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDMUIsQ0FBQyxDQUFDLENBQUM7b0JBQ0osQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3hCLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDekMsSUFBSSxDQUFDLHFGQUFxRixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUN0RyxXQUFXLENBQUMsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUMxTyxDQUFDLENBQUMsQ0FBQztvQkFDSCxJQUFJLENBQUMscUZBQXFGLEVBQUUsS0FBSyxJQUFJLEVBQUU7d0JBQ3RHLFdBQVcsQ0FBQyxDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3pPLENBQUMsQ0FBQyxDQUFDO29CQUNILElBQUksQ0FBQyx1RkFBdUYsRUFBRSxLQUFLLElBQUksRUFBRTt3QkFDeEcsV0FBVyxDQUFDLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUMzTSxDQUFDLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsQ0FBQztnQkFDSCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3hDLElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLElBQUksRUFBRTt3QkFDbkQsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFtQzs0QkFDN0UsSUFBSSxFQUFFLFdBQVc7NEJBQ2pCLE9BQU8sRUFBRTtnQ0FDUixhQUFhO2dDQUNiLEdBQUcsUUFBUSw0RUFBNEU7NkJBQ3ZGOzRCQUNELFFBQVEsRUFBRTtnQ0FDVCxnQkFBZ0IsRUFBRSxHQUFHOzZCQUNyQjt5QkFDRCxDQUFDLENBQUM7d0JBQ0gsOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQzt3QkFDek0sOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQzt3QkFDek0sOEJBQThCLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFDak4sQ0FBQyxDQUFDLENBQUM7b0JBQ0gsS0FBSyxDQUFDLG1EQUFtRCxFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUNyRSxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQW1DOzRCQUM3RSxJQUFJLEVBQUUsV0FBVzs0QkFDakIsT0FBTyxFQUFFO2dDQUNSLGFBQWE7Z0NBQ2IsR0FBRyxRQUFRLDRFQUE0RTs2QkFDdkY7NEJBQ0QsUUFBUSxFQUFFO2dDQUNULGdCQUFnQixFQUFFLEdBQUc7Z0NBQ3JCLGtCQUFrQixFQUFFLEdBQUc7NkJBQ3ZCO3lCQUNELENBQUMsQ0FBQzt3QkFDSCxJQUFJLENBQUMsWUFBWSxFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUM3Qiw4QkFBOEIsQ0FBQyxNQUFNLDRCQUE0QixDQUFDLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQzt3QkFDOU0sQ0FBQyxDQUFDLENBQUM7b0JBQ0osQ0FBQyxDQUFDLENBQUM7b0JBQ0gsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUMxQyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxJQUFJLEVBQUU7NEJBQ3JELFdBQVcsQ0FBQyxDQUFDLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQzs0QkFDdEwsV0FBVyxDQUFDLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7d0JBQzFMLENBQUMsQ0FBQyxDQUFDO3dCQUNILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTs0QkFDMUMsV0FBVyxDQUFDLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQzt3QkFDN0wsQ0FBQyxDQUFDLENBQUM7b0JBQ0osQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbEQsSUFBSSxDQUFDLHVFQUF1RSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN4RixNQUFNLG9CQUFvQixHQUE0QjtvQkFDckQsZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFO29CQUV2RixtQkFBbUIsRUFBRSxLQUFLO29CQUMxQiw4QkFBOEIsRUFBRSxTQUFTO29CQUN6QyxlQUFlLEVBQUUsU0FBUztvQkFDMUIsdUJBQXVCLEVBQUUsS0FBSztpQkFDOUIsQ0FBQztnQkFFRix5Q0FBeUM7Z0JBQ3pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sNEJBQTRCLENBQ2hELEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUNyQyxvQkFBb0IsRUFDcEIsa0JBQWtCLEVBQ2xCLFVBQVUsRUFDVixjQUFjLEVBQ2QsSUFBSSxDQUNKLENBQUM7Z0JBRUYsdUNBQXVDO2dCQUN2QyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFcEMsMkZBQTJGO2dCQUMzRixXQUFXLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDaEYsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNuQyxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsZUFBZSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtZQUNyRCxlQUFlLENBQUMscUJBQXFCLENBQUM7Z0JBQ3JDLElBQUksRUFBRSxVQUFVO2dCQUNoQixJQUFJLEVBQUUsWUFBWTtnQkFDbEIsSUFBSSxFQUFFLGdCQUFnQjthQUN0QixDQUFDLEVBQUU7Z0JBQ0gsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLElBQUksRUFBRSxZQUFZO2dCQUNsQixJQUFJLEVBQUUsZ0JBQWdCO2FBQ3RCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtZQUNsRCxlQUFlLENBQUMscUJBQXFCLENBQUM7Z0JBQ3JDLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixZQUFZLEVBQUUsVUFBVTtnQkFDeEIsU0FBUyxFQUFFLFFBQVE7Z0JBQ25CLFFBQVEsRUFBRSxTQUFTO2dCQUNuQixjQUFjLEVBQUUsU0FBUztnQkFDekIsaUJBQWlCLEVBQUUsUUFBUTtnQkFDM0IsYUFBYSxFQUFFLHFCQUFxQjtnQkFDcEMsVUFBVSxFQUFFLFlBQVk7Z0JBQ3hCLFdBQVcsRUFBRSxtQkFBbUI7YUFDaEMsQ0FBQyxFQUFFO2dCQUNILE9BQU8sRUFBRSxZQUFZO2dCQUNyQixZQUFZLEVBQUUsWUFBWTtnQkFDMUIsU0FBUyxFQUFFLFlBQVk7Z0JBQ3ZCLFFBQVEsRUFBRSxZQUFZO2dCQUN0QixjQUFjLEVBQUUsWUFBWTtnQkFDNUIsaUJBQWlCLEVBQUUsWUFBWTtnQkFDL0IsYUFBYSxFQUFFLFlBQVk7Z0JBQzNCLFVBQVUsRUFBRSxZQUFZO2dCQUN4QixXQUFXLEVBQUUsWUFBWTthQUN6QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsZUFBZSxDQUFDLHFCQUFxQixDQUFDO2dCQUNyQyxRQUFRLEVBQUUsOEdBQThHO2FBQ3hILENBQUMsRUFBRTtnQkFDSCxRQUFRLEVBQUUsWUFBWTthQUN0QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7WUFDekQsZUFBZSxDQUFDLHFCQUFxQixDQUFDO2dCQUNyQyxLQUFLLEVBQUUsMENBQTBDO2FBQ2pELENBQUMsRUFBRTtnQkFDSCxLQUFLLEVBQUUsWUFBWTthQUNuQixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDM0QsZUFBZSxDQUFDLHFCQUFxQixDQUFDO2dCQUNyQyxVQUFVLEVBQUUseUNBQXlDO2FBQ3JELENBQUMsRUFBRTtnQkFDSCxVQUFVLEVBQUUsWUFBWTthQUN4QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw2REFBNkQsRUFBRSxHQUFHLEVBQUU7WUFDeEUsZUFBZSxDQUFDLHFCQUFxQixDQUFDO2dCQUNyQyxVQUFVLEVBQUUsa0NBQWtDO2FBQzlDLENBQUMsRUFBRTtnQkFDSCxVQUFVLEVBQUUsWUFBWTthQUN4QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxHQUFHLEdBQTBDO2dCQUNsRCxPQUFPLEVBQUUsT0FBTztnQkFDaEIsU0FBUyxFQUFFLFNBQVM7YUFDcEIsQ0FBQztZQUNGLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDM0MsT0FBTyxFQUFFLE9BQU87YUFDaEIsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=