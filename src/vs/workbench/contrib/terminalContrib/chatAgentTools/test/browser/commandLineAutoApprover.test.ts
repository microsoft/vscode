/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { CommandLineAutoApprover } from '../../browser/commandLineAutoApprover.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ok, strictEqual } from 'assert';

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

	function isAutoApproved(commandLine: string): boolean {
		return commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os).isAutoApproved;
	}

	function isCommandLineAutoApproved(commandLine: string): boolean {
		return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).isAutoApproved;
	}

	suite('autoApprove with allow patterns only', () => {
		test('should auto-approve exact command match', () => {
			setAutoApprove({
				"echo": true
			});
			ok(isAutoApproved('echo'));
		});

		test('should auto-approve command with arguments', () => {
			setAutoApprove({
				"echo": true
			});
			ok(isAutoApproved('echo hello world'));
		});

		test('should not auto-approve when there is no match', () => {
			setAutoApprove({
				"echo": true
			});
			ok(!isAutoApproved('ls'));
		});

		test('should not auto-approve partial command matches', () => {
			setAutoApprove({
				"echo": true
			});
			ok(!isAutoApproved('echotest'));
		});

		test('should handle multiple commands in autoApprove', () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true
			});
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm'));
		});
	});

	suite('autoApprove with deny patterns only', () => {
		test('should deny commands in autoApprove', () => {
			setAutoApprove({
				"rm": false,
				"del": false
			});
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should not auto-approve safe commands when no allow patterns are present', () => {
			setAutoApprove({
				"rm": false
			});
			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
		});
	});

	suite('autoApprove with mixed allow and deny patterns', () => {
		test('should deny commands set to false even if other commands are set to true', () => {
			setAutoApprove({
				"echo": true,
				"rm": false
			});
			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('rm file.txt'));
		});

		test('should auto-approve allow patterns not set to false', () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true,
				"rm": false,
				"del": false
			});
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm'));
			ok(!isAutoApproved('del'));
		});
	});

	suite('regex patterns', () => {
		test('should handle regex patterns in autoApprove', () => {
			setAutoApprove({
				"/^echo/": true,
				"/^ls/": true,
				"pwd": true
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle regex patterns for deny', () => {
			setAutoApprove({
				"echo": true,
				"rm": true,
				"/^rm\\s+/": false,
				"/^del\\s+/": false
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('rm'));
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should handle complex regex patterns', () => {
			setAutoApprove({
				"/^(echo|ls|pwd)\\b/": true,
				"/^git (status|show\\b.*)$/": true,
				"/rm|del|kill/": false
			});

			ok(isAutoApproved('echo test'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(isAutoApproved('git status'));
			ok(isAutoApproved('git show'));
			ok(isAutoApproved('git show HEAD'));
			ok(!isAutoApproved('rm file'));
			ok(!isAutoApproved('del file'));
			ok(!isAutoApproved('kill process'));
		});

		suite('flags', () => {
			test('should handle case-insensitive regex patterns with i flag', () => {
				setAutoApprove({
					"/^echo/i": true,
					"/^ls/i": true,
					"/rm|del/i": false
				});

				ok(isAutoApproved('echo hello'));
				ok(isAutoApproved('ECHO hello'));
				ok(isAutoApproved('Echo hello'));
				ok(isAutoApproved('ls -la'));
				ok(isAutoApproved('LS -la'));
				ok(isAutoApproved('Ls -la'));
				ok(!isAutoApproved('rm file'));
				ok(!isAutoApproved('RM file'));
				ok(!isAutoApproved('del file'));
				ok(!isAutoApproved('DEL file'));
			});

			test('should handle multiple regex flags', () => {
				setAutoApprove({
					"/^git\\s+/gim": true,
					"/dangerous/gim": false
				});

				ok(isAutoApproved('git status'));
				ok(isAutoApproved('GIT status'));
				ok(isAutoApproved('Git status'));
				ok(!isAutoApproved('dangerous command'));
				ok(!isAutoApproved('DANGEROUS command'));
			});

			test('should handle various regex flags', () => {
				setAutoApprove({
					"/^echo.*/s": true,  // dotall flag
					"/^git\\s+/i": true, // case-insensitive flag
					"/rm|del/g": false   // global flag
				});

				ok(isAutoApproved('echo hello\nworld'));
				ok(isAutoApproved('git status'));
				ok(isAutoApproved('GIT status'));
				ok(!isAutoApproved('rm file'));
				ok(!isAutoApproved('del file'));
			});

			test('should handle regex patterns without flags', () => {
				setAutoApprove({
					"/^echo/": true,
					"/rm|del/": false
				});

				ok(isAutoApproved('echo hello'));
				ok(!isAutoApproved('ECHO hello'), 'Should be case-sensitive without i flag');
				ok(!isAutoApproved('rm file'));
				ok(!isAutoApproved('RM file'), 'Should be case-sensitive without i flag');
			});
		});
	});

	suite('edge cases', () => {
		test('should handle empty autoApprove', () => {
			setAutoApprove({});

			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle empty command strings', () => {
			setAutoApprove({
				"echo": true
			});

			ok(!isAutoApproved(''));
			ok(!isAutoApproved('   '));
		});

		test('should handle whitespace in commands', () => {
			setAutoApprove({
				"echo": true
			});

			ok(isAutoApproved('echo   hello   world'));
			ok(!isAutoApproved('  echo hello'));
		});

		test('should be case-sensitive by default', () => {
			setAutoApprove({
				"echo": true
			});

			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('ECHO hello'));
			ok(!isAutoApproved('Echo hello'));
		});

		// https://github.com/microsoft/vscode/issues/252411
		test('should handle string-based values with special regex characters', () => {
			setAutoApprove({
				"pwsh.exe -File D:\\foo.bar\\a-script.ps1": true
			});

			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1'));
			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg'));
		});
	});

	suite('PowerShell-specific commands', () => {
		setup(() => {
			shell = 'pwsh';
		});

		test('should handle Windows PowerShell commands', () => {
			setAutoApprove({
				"Get-ChildItem": true,
				"Get-Content": true,
				"Get-Location": true,
				"Remove-Item": false,
				"del": false
			});

			ok(isAutoApproved('Get-ChildItem'));
			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('Get-Location'));
			ok(!isAutoApproved('Remove-Item file.txt'));
		});

		test('should handle ( prefixes', () => {
			setAutoApprove({
				"Get-Content": true
			});

			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('(Get-Content file.txt'));
			ok(!isAutoApproved('[Get-Content'));
			ok(!isAutoApproved('foo'));
		});
	});

	suite('isCommandLineAutoApproved - matchCommandLine functionality', () => {
		test('should auto-approve command line patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('echo test && ls'));
		});

		test('should not auto-approve regular patterns with isCommandLineAutoApproved', () => {
			setAutoApprove({
				"echo": true
			});

			// Regular patterns should not be matched by isCommandLineAutoApproved
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle regex patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				"/echo.*world/": { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello world'));
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle case-insensitive regex with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				"/echo/i": { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('ECHO hello'));
			ok(isCommandLineAutoApproved('Echo hello'));
		});

		test('should handle complex command line patterns', () => {
			setAutoApproveWithCommandLine({
				"/^npm run build/": { approve: true, matchCommandLine: true },
				"/\.ps1/i": { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('npm run build --production'));
			ok(isCommandLineAutoApproved('powershell -File script.ps1'));
			ok(isCommandLineAutoApproved('pwsh -File SCRIPT.PS1'));
			ok(!isCommandLineAutoApproved('npm install'));
		});

		test('should return false for empty command line', () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true }
			});

			ok(!isCommandLineAutoApproved(''));
			ok(!isCommandLineAutoApproved('   '));
		});

		test('should handle mixed configuration with matchCommandLine entries', () => {
			setAutoApproveWithCommandLine({
				"echo": true,  // Regular pattern
				"ls": { approve: true, matchCommandLine: true },  // Command line pattern
				"rm": { approve: true, matchCommandLine: false }  // Explicit regular pattern
			});

			// Only the matchCommandLine: true entry should work with isCommandLineAutoApproved
			ok(isCommandLineAutoApproved('ls -la'));
			ok(!isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('rm file.txt'));
		});

		test('should handle deny patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				"echo": { approve: true, matchCommandLine: true },
				"/dangerous/": { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
			ok(!isCommandLineAutoApproved('dangerous operation'));
		});

		test('should prioritize deny list over allow list for command line patterns', () => {
			setAutoApproveWithCommandLine({
				"/echo/": { approve: true, matchCommandLine: true },
				"/echo.*dangerous/": { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
		});

		test('should handle complex deny patterns with matchCommandLine', () => {
			setAutoApproveWithCommandLine({
				"npm": { approve: true, matchCommandLine: true },
				"/npm.*--force/": { approve: false, matchCommandLine: true },
				"/\.ps1.*-ExecutionPolicy/i": { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('npm install'));
			ok(isCommandLineAutoApproved('npm run build'));
			ok(!isCommandLineAutoApproved('npm install --force'));
			ok(!isCommandLineAutoApproved('powershell -File script.ps1 -ExecutionPolicy Bypass'));
		});
	});

	suite('reasons', () => {
		function getCommandReason(command: string): string {
			return commandLineAutoApprover.isCommandAutoApproved(command, shell, os).reason;
		}

		function getCommandLineReason(commandLine: string): string {
			return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).reason;
		}

		suite('command', () => {
			test('approved', () => {
				setAutoApprove({ echo: true });
				strictEqual(getCommandReason('echo hello'), `Command 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', () => {
				setAutoApprove({ echo: false });
				strictEqual(getCommandReason('echo hello'), `Command 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', () => {
				setAutoApprove({});
				strictEqual(getCommandReason('echo hello'), `Command 'echo hello' has no matching auto approve entries`);
			});
		});

		suite('command line', () => {
			test('approved', () => {
				setAutoApproveWithCommandLine({ echo: { approve: true, matchCommandLine: true } });
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', () => {
				setAutoApproveWithCommandLine({ echo: { approve: false, matchCommandLine: true } });
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', () => {
				setAutoApproveWithCommandLine({});
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' has no matching auto approve entries`);
			});
		});
	});
});
