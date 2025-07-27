/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Temporary type declarations for test framework globals
declare function suite(title: string, fn: () => void): void;
declare function test(title: string, fn: () => void | Promise<void>): void;
declare function setup(fn: () => void): void;

import assert, { ok } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { CommandLineAutoApprover } from '../../browser/commandLineAutoApprover.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';

suite('CommandLineAutoApprover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: IInstantiationService;
	let configurationService: TestConfigurationService;

	let commandLineAutoApprover: CommandLineAutoApprover;
	let shell: string;
	let os: OperatingSystem;

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);

		shell = 'bash';
		os = OperatingSystem.Linux;
		commandLineAutoApprover = store.add(instantiationService.createInstance(CommandLineAutoApprover));
	});

	function setAutoApprove(value: { [key: string]: boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setAutoApproveWithCommandLine(value: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	async function isAutoApproved(commandLine: string): Promise<boolean> {
		return (await commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os)).isAutoApproved;
	}

	async function isCommandLineAutoApproved(commandLine: string): Promise<boolean> {
		return (await commandLineAutoApprover.isCommandLineAutoApproved(commandLine, shell, os)).isAutoApproved;
	}

	suite('autoApprove with allow patterns only', () => {
		test('should auto-approve exact command match', async () => {
			setAutoApprove({
				"echo": true
			});
			assert.ok(await isAutoApproved('echo'));
		});

		test('should auto-approve command with arguments', async () => {
			setAutoApprove({
				"echo": true
			});
			assert.ok(await isAutoApproved('echo hello world'));
		});

		test('should not auto-approve when there is no match', async () => {
			setAutoApprove({
				"echo": true
			});
			assert.ok(!(await isAutoApproved('ls')));
		});

		test('should not auto-approve partial command matches', async () => {
			setAutoApprove({
				"echo": true
			});
			assert.ok(!(await isAutoApproved('echotest')));
		});

		test('should handle multiple commands in autoApprove', async () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true
			});
			assert.ok(await isAutoApproved('echo'));
			assert.ok(await isAutoApproved('ls -la'));
			assert.ok(await isAutoApproved('pwd'));
			assert.ok(!(await isAutoApproved('rm')));
		});
	});

	suite('autoApprove with deny patterns only', () => {
		test('should deny commands in autoApprove', async () => {
			setAutoApprove({
				"rm": false,
				"del": false
			});
			assert.ok(!(await isAutoApproved('rm file.txt')));
			assert.ok(!(await isAutoApproved('del file.txt')));
		});

		test('should not auto-approve safe commands when no allow patterns are present', async () => {
			setAutoApprove({
				"rm": false
			});
			assert.ok(!(await isAutoApproved('echo hello')));
			assert.ok(!(await isAutoApproved('ls')));
		});
	});

	suite('autoApprove with mixed allow and deny patterns', () => {
		test('should deny commands set to false even if other commands are set to true', async () => {
			setAutoApprove({
				"echo": true,
				"rm": false
			});
			ok(await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('rm file.txt'));
		});

		test('should auto-approve allow patterns not set to false', async () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true,
				"rm": false,
				"del": false
			});
			ok(await isAutoApproved('echo'));
			ok(await isAutoApproved('ls'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm'));
			ok(!await isAutoApproved('del'));
		});
	});

	suite('regex patterns', () => {
		test('should handle regex patterns in autoApprove', async () => {
			setAutoApprove({
				"/^echo/": true,
				"/^ls/": true,
				"pwd": true
			});

			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('ls -la'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm file'));
		});

		test('should handle regex patterns for deny', async () => {
			setAutoApprove({
				"echo": true,
				"rm": true,
				"/^rm\\s+/": false,
				"/^del\\s+/": false
			});

			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('rm'));
			ok(!await isAutoApproved('rm file.txt'));
			ok(!await isAutoApproved('del file.txt'));
		});

		test('should handle complex regex patterns', async () => {
			setAutoApprove({
				"/^(echo|ls|pwd)\\b/": true,
				"/^git (status|show\\b.*)$/": true,
				"/rm|del|kill/": false
			});

			ok(await isAutoApproved('echo test'));
			ok(await isAutoApproved('ls -la'));
			ok(await isAutoApproved('pwd'));
			ok(await isAutoApproved('git status'));
			ok(await isAutoApproved('git show'));
			ok(await isAutoApproved('git show HEAD'));
			ok(!await isAutoApproved('rm file'));
			ok(!await isAutoApproved('del file'));
			ok(!await isAutoApproved('kill process'));
		});

		suite('flags', () => {
			test('should handle case-insensitive regex patterns with i flag', async () => {
				setAutoApprove({
					"/^echo/i": true,
					"/^ls/i": true,
					"/rm|del/i": false
				});

				ok(await isAutoApproved('echo hello'));
				ok(await isAutoApproved('ECHO hello'));
				ok(await isAutoApproved('Echo hello'));
				ok(await isAutoApproved('ls -la'));
				ok(await isAutoApproved('LS -la'));
				ok(await isAutoApproved('Ls -la'));
				ok(!await isAutoApproved('rm file'));
				ok(!await isAutoApproved('RM file'));
				ok(!await isAutoApproved('del file'));
				ok(!await isAutoApproved('DEL file'));
			});

			test('should handle multiple regex flags', async () => {
				setAutoApprove({
					"/^git\\s+/gim": true,
					"/dangerous/gim": false
				});

				ok(await isAutoApproved('git status'));
				ok(await isAutoApproved('GIT status'));
				ok(await isAutoApproved('Git status'));
				ok(!await isAutoApproved('dangerous command'));
				ok(!await isAutoApproved('DANGEROUS command'));
			});

			test('should handle various regex flags', async () => {
				setAutoApprove({
					"/^echo.*/s": true,  // dotall flag
					"/^git\\s+/i": true, // case-insensitive flag
					"/rm|del/g": false   // global flag
				});

				ok(await isAutoApproved('echo hello\nworld'));
				ok(await isAutoApproved('git status'));
				ok(await isAutoApproved('GIT status'));
				ok(!await isAutoApproved('rm file'));
				ok(!await isAutoApproved('del file'));
			});

			test('should handle regex patterns without flags', async () => {
				setAutoApprove({
					"/^echo/": true,
					"/rm|del/": false
				});

				ok(await isAutoApproved('echo hello'));
				ok(!await isAutoApproved('ECHO hello'), 'Should be case-sensitive without i flag');
				ok(!await isAutoApproved('rm file'));
				ok(!await isAutoApproved('RM file'), 'Should be case-sensitive without i flag');
			});
		});
	});

	suite('edge cases', () => {
		test('should handle empty autoApprove', async () => {
			setAutoApprove({});

			ok(!await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ls'));
			ok(!await isAutoApproved('rm file'));
		});

		test('should handle empty command strings', async () => {
			setAutoApprove({
				"echo": true
			});

			ok(!await isAutoApproved(''));
			ok(!await isAutoApproved('   '));
		});

		test('should handle whitespace in commands', async () => {
			setAutoApprove({
				"echo": true
			});

			ok(await isAutoApproved('echo   hello   world'));
			ok(!await isAutoApproved('  echo hello'));
		});

		test('should be case-sensitive by default', async () => {
			setAutoApprove({
				"echo": true
			});

			ok(await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ECHO hello'));
			ok(!await isAutoApproved('Echo hello'));
		});

		// https://github.com/microsoft/vscode/issues/252411
		test('should handle string-based values with special regex characters', async () => {
			setAutoApprove({
				"pwsh.exe -File D:\\foo.bar\\a-script.ps1": true
			});

			ok(await isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1'));
			ok(await isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg'));
		});
	});

	suite('PowerShell-specific commands', () => {
		setup(() => {
			shell = 'pwsh';
		});

		test('should handle Windows PowerShell commands', async () => {
			setAutoApprove({
				"Get-ChildItem": true,
				"Get-Content": true,
				"Get-Location": true,
				"Remove-Item": false,
				"del": false
			});

			ok(await isAutoApproved('Get-ChildItem'));
			ok(await isAutoApproved('Get-Content file.txt'));
			ok(await isAutoApproved('Get-Location'));
			ok(!await isAutoApproved('Remove-Item file.txt'));
		});

		test('should handle ( prefixes', async () => {
			setAutoApprove({
				"Get-Content": true
			});

			ok(await isAutoApproved('Get-Content file.txt'));
			ok(await isAutoApproved('(Get-Content file.txt'));
			ok(!await isAutoApproved('[Get-Content'));
			ok(!await isAutoApproved('foo'));
		});
	});

	suite('isCommandLineAutoApproved - matchCommandLine functionality', () => {
		test('should auto-approve command line patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('echo hello'));
			ok(await isCommandLineAutoApproved('echo test && ls'));
		});

		test('should not auto-approve regular patterns with isCommandLineAutoApproved', async () => {
			setAutoApprove({
				"echo": true
			});

			// Regular patterns should not be matched by isCommandLineAutoApproved
			ok(!await isCommandLineAutoApproved('echo hello'));
		});

		test('should handle regex patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				"/echo.*world/": { approve: true, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('echo hello world'));
			ok(!await isCommandLineAutoApproved('echo hello'));
		});

		test('should handle case-insensitive regex with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				"/echo/i": { approve: true, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('echo hello'));
			ok(await isCommandLineAutoApproved('ECHO hello'));
			ok(await isCommandLineAutoApproved('Echo hello'));
		});

		test('should handle complex command line patterns', async () => {
			setAutoApproveWithCommandLine({
				"/^npm run build/": { approve: true, matchCommandLine: true },
				"/\.ps1/i": { approve: true, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('npm run build --production'));
			ok(await isCommandLineAutoApproved('powershell -File script.ps1'));
			ok(await isCommandLineAutoApproved('pwsh -File SCRIPT.PS1'));
			ok(!await isCommandLineAutoApproved('npm install'));
		});

		test('should return false for empty command line', async () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true }
			});

			ok(!await isCommandLineAutoApproved(''));
			ok(!await isCommandLineAutoApproved('   '));
		});

		test('should handle mixed configuration with matchCommandLine entries', async () => {
			setAutoApproveWithCommandLine({
				"echo": true,  // Regular pattern
				"ls": { approve: true, matchCommandLine: true },  // Command line pattern
				"rm": { approve: true, matchCommandLine: false }  // Explicit regular pattern
			});

			// Only the matchCommandLine: true entry should work with isCommandLineAutoApproved
			ok(await isCommandLineAutoApproved('ls -la'));
			ok(!await isCommandLineAutoApproved('echo hello'));
			ok(!await isCommandLineAutoApproved('rm file.txt'));
		});

		test('should handle deny patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true },
				"/dangerous/": { approve: false, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('echo hello'));
			ok(!await isCommandLineAutoApproved('echo dangerous command'));
			ok(!await isCommandLineAutoApproved('dangerous operation'));
		});

		test('should prioritize deny list over allow list for command line patterns', async () => {
			setAutoApproveWithCommandLine({
				"/echo/": { approve: true, matchCommandLine: true },
				"/echo.*dangerous/": { approve: false, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('echo hello'));
			ok(!await isCommandLineAutoApproved('echo dangerous command'));
		});

		test('should handle complex deny patterns with matchCommandLine', async () => {
			setAutoApproveWithCommandLine({
				"npm": { approve: true, matchCommandLine: true },
				"/npm.*--force/": { approve: false, matchCommandLine: true },
				"/\.ps1.*-ExecutionPolicy/i": { approve: false, matchCommandLine: true }
			});

			ok(await isCommandLineAutoApproved('npm install'));
			ok(await isCommandLineAutoApproved('npm run build'));
			ok(!await isCommandLineAutoApproved('npm install --force'));
			ok(!await isCommandLineAutoApproved('powershell -File script.ps1 -ExecutionPolicy Bypass'));
		});
	});

	suite('reasons', () => {
		async function getCommandReason(command: string): Promise<string> {
			return (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os)).reason;
		}

		async function getCommandLineReason(commandLine: string): Promise<string> {
			return (await commandLineAutoApprover.isCommandLineAutoApproved(commandLine, shell, os)).reason;
		}

		suite('command', () => {
			test('approved', async () => {
				setAutoApprove({ echo: true });
				assert.strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', async () => {
				setAutoApprove({ echo: false });
				assert.strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', async () => {
				setAutoApprove({});
				assert.strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' has no matching auto approve entries`);
			});
		});

		suite('command line', () => {
			test('approved', async () => {
				setAutoApproveWithCommandLine({ echo: { approve: true, matchCommandLine: true } });
				assert.strictEqual(await getCommandLineReason('echo hello'), `Command line 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', async () => {
				setAutoApproveWithCommandLine({ echo: { approve: false, matchCommandLine: true } });
				assert.strictEqual(await getCommandLineReason('echo hello'), `Command line 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', async () => {
				setAutoApproveWithCommandLine({});
				assert.strictEqual(await getCommandLineReason('echo hello'), `Command line 'echo hello' has no matching auto approve entries`);
			});
		});
	});
});
