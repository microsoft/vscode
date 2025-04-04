/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-test-async-suite */
import { deepStrictEqual, ok, strictEqual } from 'assert';
import { homedir, userInfo } from 'os';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITerminalProcessOptions } from '../../common/terminal.js';
import { getShellIntegrationInjection, getWindowsBuildNumber, IShellIntegrationConfigInjection } from '../../node/terminalEnvironment.js';

const enabledProcessOptions: ITerminalProcessOptions = { shellIntegration: { enabled: true, suggestEnabled: false, nonce: '' }, windowsEnableConpty: true, windowsUseConptyDll: false, environmentVariableCollections: undefined, workspaceFolder: undefined };
const disabledProcessOptions: ITerminalProcessOptions = { shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' }, windowsEnableConpty: true, windowsUseConptyDll: false, environmentVariableCollections: undefined, workspaceFolder: undefined };
const winptyProcessOptions: ITerminalProcessOptions = { shellIntegration: { enabled: true, suggestEnabled: false, nonce: '' }, windowsEnableConpty: false, windowsUseConptyDll: false, environmentVariableCollections: undefined, workspaceFolder: undefined };
const pwshExe = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const repoRoot = process.platform === 'win32' ? process.cwd()[0].toLowerCase() + process.cwd().substring(1) : process.cwd();
const logService = new NullLogService();
const productService = { applicationName: 'vscode' } as IProductService;
const defaultEnvironment = {};

function deepStrictEqualIgnoreStableVar(actual: IShellIntegrationConfigInjection | undefined, expected: IShellIntegrationConfigInjection) {
	if (actual?.envMixin) {
		delete actual.envMixin['VSCODE_STABLE'];
	}
	deepStrictEqual(actual, expected);
}

suite('platform - terminalEnvironment', async () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	suite('getShellIntegrationInjection', () => {
		suite('should not enable', () => {
			// This test is only expected to work on Windows 10 build 18309 and above
			(getWindowsBuildNumber() < 18309 ? test.skip : test)('when isFeatureTerminal or when no executable is provided', async () => {
				ok(!(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo'], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)));
				ok(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo'], isFeatureTerminal: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true));
			});
			if (isWindows) {
				test('when on windows with conpty false', async () => {
					ok(!(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l'], isFeatureTerminal: false }, winptyProcessOptions, defaultEnvironment, logService, productService, true)));
				});
			}
		});

		// These tests are only expected to work on Windows 10 build 18309 and above
		(getWindowsBuildNumber() < 18309 ? suite.skip : suite)('pwsh', () => {
			const expectedPs1 = process.platform === 'win32'
				? `try { . "${repoRoot}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1" } catch {}`
				: `. "${repoRoot}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"`;
			suite('should override args', () => {
				const enabledExpectedResult = Object.freeze<IShellIntegrationConfigInjection>({
					newArgs: [
						'-noexit',
						'-command',
						expectedPs1
					],
					envMixin: {
						VSCODE_INJECTION: '1'
					}
				});
				test('when undefined, []', async () => {
					deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
					deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: undefined }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
				});
				suite('when no logo', () => {
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
			suite('should incorporate login arg', () => {
				const enabledExpectedResult = Object.freeze<IShellIntegrationConfigInjection>({
					newArgs: [
						'-l',
						'-noexit',
						'-command',
						expectedPs1
					],
					envMixin: {
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
			suite('should not modify args', () => {
				test('when shell integration is disabled', async () => {
					strictEqual(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
					strictEqual(await getShellIntegrationInjection({ executable: pwshExe, args: '-l' }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
					strictEqual(await getShellIntegrationInjection({ executable: pwshExe, args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
				});
				test('when using unrecognized arg', async () => {
					strictEqual(await getShellIntegrationInjection({ executable: pwshExe, args: ['-l', '-NoLogo', '-i'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
				});
				test('when using unrecognized arg (string)', async () => {
					strictEqual(await getShellIntegrationInjection({ executable: pwshExe, args: '-i' }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
				});
			});
		});

		if (process.platform !== 'win32') {
			suite('zsh', () => {
				suite('should override args', () => {
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
					function assertIsEnabled(result: IShellIntegrationConfigInjection, globalZdotdir = homedir()) {
						strictEqual(Object.keys(result.envMixin!).length, 3);
						ok(result.envMixin!['ZDOTDIR']?.match(expectedDir));
						strictEqual(result.envMixin!['USER_ZDOTDIR'], globalZdotdir);
						ok(result.envMixin!['VSCODE_INJECTION']?.match('1'));
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
					suite('should incorporate login arg', () => {
						test('when array', async () => {
							const result = await getShellIntegrationInjection({ executable: 'zsh', args: ['-l'] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
							deepStrictEqual(result?.newArgs, ['-il']);
							assertIsEnabled(result);
						});
					});
					suite('should not modify args', () => {
						test('when shell integration is disabled', async () => {
							strictEqual(await getShellIntegrationInjection({ executable: 'zsh', args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
							strictEqual(await getShellIntegrationInjection({ executable: 'zsh', args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
						});
						test('when using unrecognized arg', async () => {
							strictEqual(await getShellIntegrationInjection({ executable: 'zsh', args: ['-l', '-fake'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
						});
					});
					suite('should incorporate global ZDOTDIR env variable', () => {
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
			suite('bash', () => {
				suite('should override args', () => {
					test('when undefined, [], empty string', async () => {
						const enabledExpectedResult = Object.freeze<IShellIntegrationConfigInjection>({
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
					suite('should set login env variable and not modify args', () => {
						const enabledExpectedResult = Object.freeze<IShellIntegrationConfigInjection>({
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
					suite('should not modify args', () => {
						test('when shell integration is disabled', async () => {
							strictEqual(await getShellIntegrationInjection({ executable: 'bash', args: ['-l'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
							strictEqual(await getShellIntegrationInjection({ executable: 'bash', args: undefined }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
						});
						test('when custom array entry', async () => {
							strictEqual(await getShellIntegrationInjection({ executable: 'bash', args: ['-l', '-i'] }, disabledProcessOptions, defaultEnvironment, logService, productService, true), undefined);
						});
					});
				});
			});
		}
	});
});
