/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { IStringDictionary } from 'vs/base/common/collections';
import { isWindows, Platform } from 'vs/base/common/platform';
import { URI as Uri } from 'vs/base/common/uri';
import { addTerminalEnvironmentKeys, getCwd, getDefaultShell, getLangEnvVariable, mergeEnvironments, shouldSetLangEnvVariable } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';

suite('Workbench - TerminalEnvironment', () => {
	suite('addTerminalEnvironmentKeys', () => {
		test('should set expected variables', () => {
			const env: { [key: string]: any } = {};
			addTerminalEnvironmentKeys(env, '1.2.3', 'en', 'on');
			strictEqual(env['TERM_PROGRAM'], 'vscode');
			strictEqual(env['TERM_PROGRAM_VERSION'], '1.2.3');
			strictEqual(env['COLORTERM'], 'truecolor');
			strictEqual(env['LANG'], 'en_US.UTF-8');
		});
		test('should use language variant for LANG that is provided in locale', () => {
			const env: { [key: string]: any } = {};
			addTerminalEnvironmentKeys(env, '1.2.3', 'en-au', 'on');
			strictEqual(env['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');
		});
		test('should fallback to en_US when no locale is provided', () => {
			const env2: { [key: string]: any } = { FOO: 'bar' };
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
			const other: IStringDictionary<string | null> = {
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
			const other: IStringDictionary<string | null> = {
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
		function assertPathsMatch(a: string, b: string): void {
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

	suite('getDefaultShell', () => {
		test('should change Sysnative to System32 in non-WoW64 systems', async () => {
			const shell = await getDefaultShell(key => {
				return ({ 'terminal.integrated.shell.windows': 'C:\\Windows\\Sysnative\\cmd.exe' } as any)[key];
			}, 'DEFAULT', false, 'C:\\Windows', undefined, {} as any, false, Platform.Windows);
			strictEqual(shell, 'C:\\Windows\\System32\\cmd.exe');
		});

		test('should not change Sysnative to System32 in WoW64 systems', async () => {
			const shell = await getDefaultShell(key => {
				return ({ 'terminal.integrated.shell.windows': 'C:\\Windows\\Sysnative\\cmd.exe' } as any)[key];
			}, 'DEFAULT', true, 'C:\\Windows', undefined, {} as any, false, Platform.Windows);
			strictEqual(shell, 'C:\\Windows\\Sysnative\\cmd.exe');
		});

		test('should use automationShell when specified', async () => {
			const shell1 = await getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': 'shell',
					'terminal.integrated.automationShell.windows': undefined
				} as any)[key];
			}, 'DEFAULT', false, 'C:\\Windows', undefined, {} as any, false, Platform.Windows);
			strictEqual(shell1, 'shell', 'automationShell was false');
			const shell2 = await getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': 'shell',
					'terminal.integrated.automationShell.windows': undefined
				} as any)[key];
			}, 'DEFAULT', false, 'C:\\Windows', undefined, {} as any, true, Platform.Windows);
			strictEqual(shell2, 'shell', 'automationShell was true');
			const shell3 = await getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': 'shell',
					'terminal.integrated.automationShell.windows': 'automationShell'
				} as any)[key];
			}, 'DEFAULT', false, 'C:\\Windows', undefined, {} as any, true, Platform.Windows);
			strictEqual(shell3, 'automationShell', 'automationShell was true and specified in settings');
		});
	});
});
