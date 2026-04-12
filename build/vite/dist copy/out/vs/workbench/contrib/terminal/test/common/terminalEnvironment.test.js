/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI as Uri } from '../../../../../base/common/uri.js';
import { addTerminalEnvironmentKeys, createTerminalEnvironment, getUriLabelForShell, getCwd, getLangEnvVariable, getWorkspaceForTerminal, mergeEnvironments, preparePathForShell, shouldSetLangEnvVariable } from '../../common/terminalEnvironment.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestContextService, TestHistoryService } from '../../../../test/common/workbenchTestServices.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
const wslPathBackend = {
    getWslPath: async (original, direction) => {
        if (direction === 'unix-to-win') {
            const match = original.match(/^\/mnt\/(?<drive>[a-zA-Z])\/(?<path>.+)$/);
            const groups = match?.groups;
            if (!groups) {
                return original;
            }
            return `${groups.drive}:\\${groups.path.replace(/\//g, '\\')}`;
        }
        const match = original.match(/(?<drive>[a-zA-Z]):\\(?<path>.+)/);
        const groups = match?.groups;
        if (!groups) {
            return original;
        }
        return `/mnt/${groups.drive.toLowerCase()}/${groups.path.replace(/\\/g, '/')}`;
    }
};
suite('Workbench - TerminalEnvironment', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('addTerminalEnvironmentKeys', () => {
        test('should set expected variables', () => {
            const env = {};
            addTerminalEnvironmentKeys(env, '1.2.3', 'en', 'on');
            strictEqual(env['TERM_PROGRAM'], 'vscode');
            strictEqual(env['TERM_PROGRAM_VERSION'], '1.2.3');
            strictEqual(env['COLORTERM'], 'truecolor');
            strictEqual(env['LANG'], 'en_US.UTF-8');
        });
        test('should use language variant for LANG that is provided in locale', () => {
            const env = {};
            addTerminalEnvironmentKeys(env, '1.2.3', 'en-au', 'on');
            strictEqual(env['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');
        });
        test('should fallback to en_US when no locale is provided', () => {
            const env2 = { FOO: 'bar' };
            addTerminalEnvironmentKeys(env2, '1.2.3', undefined, 'on');
            strictEqual(env2['LANG'], 'en_US.UTF-8', 'LANG is equal to en_US.UTF-8 as fallback.'); // More info on issue #14586
        });
        test('should fallback to en_US when an invalid locale is provided', () => {
            const env3 = { LANG: 'replace' };
            addTerminalEnvironmentKeys(env3, '1.2.3', undefined, 'on');
            strictEqual(env3['LANG'], 'en_US.UTF-8', 'LANG is set to the fallback LANG');
        });
        test('should override existing LANG', () => {
            const env4 = { LANG: 'en_AU.UTF-8' };
            addTerminalEnvironmentKeys(env4, '1.2.3', undefined, 'on');
            strictEqual(env4['LANG'], 'en_US.UTF-8', 'LANG is equal to the parent environment\'s LANG');
        });
    });
    suite('shouldSetLangEnvVariable', () => {
        test('auto', () => {
            strictEqual(shouldSetLangEnvVariable({}, 'auto'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US' }, 'auto'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf' }, 'auto'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf8' }, 'auto'), false);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.UTF-8' }, 'auto'), false);
        });
        test('off', () => {
            strictEqual(shouldSetLangEnvVariable({}, 'off'), false);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US' }, 'off'), false);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf' }, 'off'), false);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf8' }, 'off'), false);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.UTF-8' }, 'off'), false);
        });
        test('on', () => {
            strictEqual(shouldSetLangEnvVariable({}, 'on'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US' }, 'on'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf' }, 'on'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.utf8' }, 'on'), true);
            strictEqual(shouldSetLangEnvVariable({ LANG: 'en-US.UTF-8' }, 'on'), true);
        });
    });
    suite('getLangEnvVariable', () => {
        test('should fallback to en_US when no locale is provided', () => {
            strictEqual(getLangEnvVariable(undefined), 'en_US.UTF-8');
            strictEqual(getLangEnvVariable(''), 'en_US.UTF-8');
        });
        test('should fallback to default language variants when variant isn\'t provided', () => {
            strictEqual(getLangEnvVariable('af'), 'af_ZA.UTF-8');
            strictEqual(getLangEnvVariable('am'), 'am_ET.UTF-8');
            strictEqual(getLangEnvVariable('be'), 'be_BY.UTF-8');
            strictEqual(getLangEnvVariable('bg'), 'bg_BG.UTF-8');
            strictEqual(getLangEnvVariable('ca'), 'ca_ES.UTF-8');
            strictEqual(getLangEnvVariable('cs'), 'cs_CZ.UTF-8');
            strictEqual(getLangEnvVariable('da'), 'da_DK.UTF-8');
            strictEqual(getLangEnvVariable('de'), 'de_DE.UTF-8');
            strictEqual(getLangEnvVariable('el'), 'el_GR.UTF-8');
            strictEqual(getLangEnvVariable('en'), 'en_US.UTF-8');
            strictEqual(getLangEnvVariable('es'), 'es_ES.UTF-8');
            strictEqual(getLangEnvVariable('et'), 'et_EE.UTF-8');
            strictEqual(getLangEnvVariable('eu'), 'eu_ES.UTF-8');
            strictEqual(getLangEnvVariable('fi'), 'fi_FI.UTF-8');
            strictEqual(getLangEnvVariable('fr'), 'fr_FR.UTF-8');
            strictEqual(getLangEnvVariable('he'), 'he_IL.UTF-8');
            strictEqual(getLangEnvVariable('hr'), 'hr_HR.UTF-8');
            strictEqual(getLangEnvVariable('hu'), 'hu_HU.UTF-8');
            strictEqual(getLangEnvVariable('hy'), 'hy_AM.UTF-8');
            strictEqual(getLangEnvVariable('is'), 'is_IS.UTF-8');
            strictEqual(getLangEnvVariable('it'), 'it_IT.UTF-8');
            strictEqual(getLangEnvVariable('ja'), 'ja_JP.UTF-8');
            strictEqual(getLangEnvVariable('kk'), 'kk_KZ.UTF-8');
            strictEqual(getLangEnvVariable('ko'), 'ko_KR.UTF-8');
            strictEqual(getLangEnvVariable('lt'), 'lt_LT.UTF-8');
            strictEqual(getLangEnvVariable('nl'), 'nl_NL.UTF-8');
            strictEqual(getLangEnvVariable('no'), 'no_NO.UTF-8');
            strictEqual(getLangEnvVariable('pl'), 'pl_PL.UTF-8');
            strictEqual(getLangEnvVariable('pt'), 'pt_BR.UTF-8');
            strictEqual(getLangEnvVariable('ro'), 'ro_RO.UTF-8');
            strictEqual(getLangEnvVariable('ru'), 'ru_RU.UTF-8');
            strictEqual(getLangEnvVariable('sk'), 'sk_SK.UTF-8');
            strictEqual(getLangEnvVariable('sl'), 'sl_SI.UTF-8');
            strictEqual(getLangEnvVariable('sr'), 'sr_YU.UTF-8');
            strictEqual(getLangEnvVariable('sv'), 'sv_SE.UTF-8');
            strictEqual(getLangEnvVariable('tr'), 'tr_TR.UTF-8');
            strictEqual(getLangEnvVariable('uk'), 'uk_UA.UTF-8');
            strictEqual(getLangEnvVariable('zh'), 'zh_CN.UTF-8');
        });
        test('should set language variant based on full locale', () => {
            strictEqual(getLangEnvVariable('en-AU'), 'en_AU.UTF-8');
            strictEqual(getLangEnvVariable('en-au'), 'en_AU.UTF-8');
            strictEqual(getLangEnvVariable('fa-ke'), 'fa_KE.UTF-8');
        });
    });
    suite('mergeEnvironments', () => {
        test('should add keys', () => {
            const parent = {
                a: 'b'
            };
            const other = {
                c: 'd'
            };
            mergeEnvironments(parent, other);
            deepStrictEqual(parent, {
                a: 'b',
                c: 'd'
            });
        });
        (!isWindows ? test.skip : test)('should add keys ignoring case on Windows', () => {
            const parent = {
                a: 'b'
            };
            const other = {
                A: 'c'
            };
            mergeEnvironments(parent, other);
            deepStrictEqual(parent, {
                a: 'c'
            });
        });
        test('null values should delete keys from the parent env', () => {
            const parent = {
                a: 'b',
                c: 'd'
            };
            const other = {
                a: null
            };
            mergeEnvironments(parent, other);
            deepStrictEqual(parent, {
                c: 'd'
            });
        });
        (!isWindows ? test.skip : test)('null values should delete keys from the parent env ignoring case on Windows', () => {
            const parent = {
                a: 'b',
                c: 'd'
            };
            const other = {
                A: null
            };
            mergeEnvironments(parent, other);
            deepStrictEqual(parent, {
                c: 'd'
            });
        });
    });
    suite('getCwd', () => {
        // This helper checks the paths in a cross-platform friendly manner
        function assertPathsMatch(a, b) {
            strictEqual(Uri.file(a).fsPath, Uri.file(b).fsPath);
        }
        test('should default to userHome for an empty workspace', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined), '/userHome/');
        });
        test('should use to the workspace if it exists', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, Uri.file('/foo'), undefined), '/foo');
        });
        test('should use an absolute custom cwd as is', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, '/foo'), '/foo');
        });
        test('should normalize a relative custom cwd against the workspace path', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, Uri.file('/bar'), 'foo'), '/bar/foo');
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, Uri.file('/bar'), './foo'), '/bar/foo');
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, Uri.file('/bar'), '../foo'), '/foo');
        });
        test('should fall back for relative a custom cwd that doesn\'t have a workspace', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, 'foo'), '/userHome/');
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, './foo'), '/userHome/');
            assertPathsMatch(await getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, '../foo'), '/userHome/');
        });
        test('should ignore custom cwd when told to ignore', async () => {
            assertPathsMatch(await getCwd({ executable: undefined, args: [], ignoreConfigurationCwd: true }, '/userHome/', undefined, Uri.file('/bar'), '/foo'), '/bar');
        });
    });
    suite('preparePathForShell', () => {
        suite('Windows frontend, Windows backend', () => {
            test('Command Prompt', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `c:\\foo\\bar`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `c:\\foo\\bar'baz`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `"c:\\foo\\bar$(echo evil)baz"`);
            });
            test('PowerShell', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `c:\\foo\\bar`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `& 'c:\\foo\\bar''baz'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `& 'c:\\foo\\bar$(echo evil)baz'`);
            });
            test('Git Bash', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `'c:/foo/bar'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `'c:/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), `'c:/foo/bar(echo evil)baz'`);
            });
            test('WSL', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'bash', 'bash', "wsl" /* WindowsShellType.Wsl */, wslPathBackend, 1 /* OperatingSystem.Windows */, true), '/mnt/c/foo/bar');
            });
        });
        suite('Windows frontend, Linux backend', () => {
            test('Bash', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar(echo evil)baz'`);
            });
            test('Zsh', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar(echo evil)baz'`);
            });
            test('Fish', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, true), `'/foo/bar(echo evil)baz'`);
            });
        });
        suite('Linux frontend, Windows backend', () => {
            test('Command Prompt', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `c:\\foo\\bar`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `c:\\foo\\bar'baz`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'cmd', 'cmd', "cmd" /* WindowsShellType.CommandPrompt */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `"c:\\foo\\bar$(echo evil)baz"`);
            });
            test('PowerShell', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `c:\\foo\\bar`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `& 'c:\\foo\\bar''baz'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'pwsh', 'pwsh', "pwsh" /* GeneralShellType.PowerShell */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `& 'c:\\foo\\bar$(echo evil)baz'`);
            });
            test('Git Bash', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `'c:/foo/bar'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar\'baz', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `'c:/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('c:\\foo\\bar$(echo evil)baz', 'bash', 'bash', "gitbash" /* WindowsShellType.GitBash */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), `'c:/foo/bar(echo evil)baz'`);
            });
            test('WSL', async () => {
                strictEqual(await preparePathForShell('c:\\foo\\bar', 'bash', 'bash', "wsl" /* WindowsShellType.Wsl */, wslPathBackend, 1 /* OperatingSystem.Windows */, false), '/mnt/c/foo/bar');
            });
        });
        suite('Linux frontend, Linux backend', () => {
            test('Bash', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'bash', 'bash', "bash" /* PosixShellType.Bash */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar(echo evil)baz'`);
            });
            test('Zsh', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'zsh', 'zsh', "zsh" /* PosixShellType.Zsh */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar(echo evil)baz'`);
            });
            test('Fish', async () => {
                strictEqual(await preparePathForShell('/foo/bar', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar'`);
                strictEqual(await preparePathForShell('/foo/bar\'baz', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar\\'baz'`);
                strictEqual(await preparePathForShell('/foo/bar$(echo evil)baz', 'fish', 'fish', "fish" /* PosixShellType.Fish */, wslPathBackend, 3 /* OperatingSystem.Linux */, false), `'/foo/bar(echo evil)baz'`);
            });
        });
    });
    suite('createTerminalEnvironment', () => {
        const commonVariables = {
            COLORTERM: 'truecolor',
            TERM_PROGRAM: 'vscode'
        };
        test('should retain variables equal to the empty string', async () => {
            deepStrictEqual(await createTerminalEnvironment({}, undefined, undefined, undefined, 'off', { foo: 'bar', empty: '' }), { foo: 'bar', empty: '', ...commonVariables });
        });
    });
    suite('getWorkspaceForTerminal', () => {
        test('should resolve workspace folder from cwd, not last active workspace', () => {
            const folderA = Uri.file('/workspace/proj1');
            const folderB = Uri.file('/workspace/proj2');
            const contextService = new TestContextService(testWorkspace(folderA, folderB));
            const historyService = new TestHistoryService(folderA);
            const result = getWorkspaceForTerminal(folderB, contextService, historyService);
            strictEqual(result?.uri.fsPath, folderB.fsPath);
        });
        test('should fall back to last active workspace when cwd is not in any workspace folder', () => {
            const folderA = Uri.file('/workspace/proj1');
            const contextService = new TestContextService(testWorkspace(folderA));
            const historyService = new TestHistoryService(folderA);
            const result = getWorkspaceForTerminal(Uri.file('/other/path'), contextService, historyService);
            strictEqual(result?.uri.fsPath, folderA.fsPath);
        });
        test('should fall back to last active workspace when cwd is undefined', () => {
            const folderA = Uri.file('/workspace/proj1');
            const contextService = new TestContextService(testWorkspace(folderA));
            const historyService = new TestHistoryService(folderA);
            strictEqual(getWorkspaceForTerminal(undefined, contextService, historyService)?.uri.fsPath, folderA.fsPath);
        });
        test('should return undefined when cwd and history are both unavailable', () => {
            const contextService = new TestContextService(testWorkspace(Uri.file('/workspace/proj1')));
            const historyService = new TestHistoryService(undefined);
            strictEqual(getWorkspaceForTerminal(undefined, contextService, historyService), undefined);
        });
    });
    suite('formatUriForShellDisplay', () => {
        test('Wsl', async () => {
            strictEqual(await getUriLabelForShell('c:\\foo\\bar', wslPathBackend, "wsl" /* WindowsShellType.Wsl */, 1 /* OperatingSystem.Windows */, true), '/mnt/c/foo/bar');
            strictEqual(await getUriLabelForShell('c:/foo/bar', wslPathBackend, "wsl" /* WindowsShellType.Wsl */, 1 /* OperatingSystem.Windows */, false), '/mnt/c/foo/bar');
        });
        test('GitBash', async () => {
            strictEqual(await getUriLabelForShell('c:\\foo\\bar', wslPathBackend, "gitbash" /* WindowsShellType.GitBash */, 1 /* OperatingSystem.Windows */, true), '/c/foo/bar');
            strictEqual(await getUriLabelForShell('c:/foo/bar', wslPathBackend, "gitbash" /* WindowsShellType.GitBash */, 1 /* OperatingSystem.Windows */, false), '/c/foo/bar');
        });
        suite('PowerShell', () => {
            test('Windows frontend', async () => {
                strictEqual(await getUriLabelForShell('c:\\foo\\bar', wslPathBackend, "pwsh" /* GeneralShellType.PowerShell */, 1 /* OperatingSystem.Windows */, true), 'c:\\foo\\bar');
                strictEqual(await getUriLabelForShell('C:\\Foo\\Bar', wslPathBackend, "pwsh" /* GeneralShellType.PowerShell */, 1 /* OperatingSystem.Windows */, true), 'C:\\Foo\\Bar');
            });
            test('Non-Windows frontend', async () => {
                strictEqual(await getUriLabelForShell('c:/foo/bar', wslPathBackend, "pwsh" /* GeneralShellType.PowerShell */, 1 /* OperatingSystem.Windows */, false), 'c:\\foo\\bar');
                strictEqual(await getUriLabelForShell('C:/Foo/Bar', wslPathBackend, "pwsh" /* GeneralShellType.PowerShell */, 1 /* OperatingSystem.Windows */, false), 'C:\\Foo\\Bar');
            });
        });
        suite('Bash', () => {
            test('Windows frontend', async () => {
                strictEqual(await getUriLabelForShell('\\foo\\bar', wslPathBackend, "bash" /* PosixShellType.Bash */, 3 /* OperatingSystem.Linux */, true), '/foo/bar');
                strictEqual(await getUriLabelForShell('/foo/bar', wslPathBackend, "bash" /* PosixShellType.Bash */, 3 /* OperatingSystem.Linux */, true), '/foo/bar');
            });
            test('Non-Windows frontend', async () => {
                strictEqual(await getUriLabelForShell('\\foo\\bar', wslPathBackend, "bash" /* PosixShellType.Bash */, 3 /* OperatingSystem.Linux */, false), '\\foo\\bar');
                strictEqual(await getUriLabelForShell('/foo/bar', wslPathBackend, "bash" /* PosixShellType.Bash */, 3 /* OperatingSystem.Linux */, false), '/foo/bar');
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFbnZpcm9ubWVudC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBRXRELE9BQU8sRUFBRSxTQUFTLEVBQW1CLE1BQU0sd0NBQXdDLENBQUM7QUFDcEYsT0FBTyxFQUFFLEdBQUcsSUFBSSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUseUJBQXlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLHdCQUF3QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFeFAsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDMUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRS9GLE1BQU0sY0FBYyxHQUFHO0lBQ3RCLFVBQVUsRUFBRSxLQUFLLEVBQUUsUUFBZ0IsRUFBRSxTQUF3QyxFQUFFLEVBQUU7UUFDaEYsSUFBSSxTQUFTLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDakMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1lBQ3pFLE1BQU0sTUFBTSxHQUFHLEtBQUssRUFBRSxNQUFNLENBQUM7WUFDN0IsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dC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QUUsR0FBRyxFQUFFO1lBQ3RGLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNyRCxXQUFXLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxhQUFh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QUFnQixDQUFDLE1BQU0sTUFBTSxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDekgsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEYsZ0JBQWdCLENBQUMsTUFBTSxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDbEksZ0JBQWdCLENBQUMsTUFBTSxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDcEksZ0JBQWdCLENBQUMsTUFBTSxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbEksQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkVBQTJFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUYsZ0JBQWdCLENBQUMsTUFBTSxNQUFNLENBQUMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxZQUFZLENB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