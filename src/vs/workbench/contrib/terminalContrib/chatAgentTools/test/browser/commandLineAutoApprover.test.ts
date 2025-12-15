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
		return commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os).result === 'approved';
	}

	function isCommandLineAutoApproved(commandLine: string): boolean {
		return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).result === 'approved';
	}

	suite('autoApprove with allow patterns only', () => {
		test('should auto-approve exact command match', () => {
			setAutoApprove({
				'echo': true
			});
			ok(isAutoApproved('echo'));
		});

		test('should auto-approve command with arguments', () => {
			setAutoApprove({
				'echo': true
			});
			ok(isAutoApproved('echo hello world'));
		});

		test('should not auto-approve when there is no match', () => {
			setAutoApprove({
				'echo': true
			});
			ok(!isAutoApproved('ls'));
		});

		test('should not auto-approve partial command matches', () => {
			setAutoApprove({
				'echo': true
			});
			ok(!isAutoApproved('echotest'));
		});

		test('should handle multiple commands in autoApprove', () => {
			setAutoApprove({
				'echo': true,
				'ls': true,
				'pwd': true
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
				'rm': false,
				'del': false
			});
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should not auto-approve safe commands when no allow patterns are present', () => {
			setAutoApprove({
				'rm': false
			});
			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
		});
	});

	suite('autoApprove with mixed allow and deny patterns', () => {
		test('should deny commands set to false even if other commands are set to true', () => {
			setAutoApprove({
				'echo': true,
				'rm': false
			});
			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('rm file.txt'));
		});

		test('should auto-approve allow patterns not set to false', () => {
			setAutoApprove({
				'echo': true,
				'ls': true,
				'pwd': true,
				'rm': false,
				'del': false
			});
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm'));
			ok(!isAutoApproved('del'));
		});
	});

	suite('regex patterns', () => {
		test('should handle /.*/', () => {
			setAutoApprove({
				'/.*/': true,
			});

			ok(isAutoApproved('echo hello'));
		});

		test('should handle regex patterns in autoApprove', () => {
			setAutoApprove({
				'/^echo/': true,
				'/^ls/': true,
				'pwd': true
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle regex patterns for deny', () => {
			setAutoApprove({
				'echo': true,
				'rm': true,
				'/^rm\\s+/': false,
				'/^del\\s+/': false
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('rm'));
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should handle complex regex patterns', () => {
			setAutoApprove({
				'/^(echo|ls|pwd)\\b/': true,
				'/^git (status|show\\b.*)$/': true,
				'/rm|del|kill/': false
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
					'/^echo/i': true,
					'/^ls/i': true,
					'/rm|del/i': false
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
					'/^git\\s+/gim': true,
					'/dangerous/gim': false
				});

				ok(isAutoApproved('git status'));
				ok(isAutoApproved('GIT status'));
				ok(isAutoApproved('Git status'));
				ok(!isAutoApproved('dangerous command'));
				ok(!isAutoApproved('DANGEROUS command'));
			});

			test('should handle various regex flags', () => {
				setAutoApprove({
					'/^echo.*/s': true,  // dotall flag
					'/^git\\s+/i': true, // case-insensitive flag
					'/rm|del/g': false   // global flag
				});

				ok(isAutoApproved('echo hello\nworld'));
				ok(isAutoApproved('git status'));
				ok(isAutoApproved('GIT status'));
				ok(!isAutoApproved('rm file'));
				ok(!isAutoApproved('del file'));
			});

			test('should handle regex patterns without flags', () => {
				setAutoApprove({
					'/^echo/': true,
					'/rm|del/': false
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
				'echo': true
			});

			ok(!isAutoApproved(''));
			ok(!isAutoApproved('   '));
		});

		test('should handle whitespace in commands', () => {
			setAutoApprove({
				'echo': true
			});

			ok(isAutoApproved('echo   hello   world'));
		});

		test('should be case-sensitive by default', () => {
			setAutoApprove({
				'echo': true
			});

			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('ECHO hello'));
			ok(!isAutoApproved('Echo hello'));
		});

		// https://github.com/microsoft/vscode/issues/252411
		test('should handle string-based values with special regex characters', () => {
			setAutoApprove({
				'pwsh.exe -File D:\\foo.bar\\a-script.ps1': true
			});

			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1'));
			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg'));
		});

		test('should ignore the empty string key', () => {
			setAutoApprove({
				'': true
			});

			ok(!isAutoApproved('echo hello'));
		});

		test('should handle empty regex patterns that could cause endless loops', () => {
			setAutoApprove({
				'//': true,
				'/(?:)/': true,
				'/*/': true,            // Invalid regex pattern
				'/.**/': true           // Invalid regex pattern
			});

			// These patterns should not cause endless loops and should not match any commands
			// Invalid patterns should be handled gracefully and not match anything
			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
			ok(!isAutoApproved(''));
		});

		test('should handle regex patterns that would cause endless loops', () => {
			setAutoApprove({
				'/a*/': true,
				'/b?/': true,
				'/(x|)*/': true,
				'/(?:)*/': true
			});

			// Commands should still work normally, endless loop patterns should be safely handled
			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
			ok(!isAutoApproved('a'));
			ok(!isAutoApproved('b'));
		});

		test('should handle mixed valid and problematic regex patterns', () => {
			setAutoApprove({
				'/^echo/': true,        // Valid pattern
				'//': true,             // Empty pattern
				'/^ls/': true,          // Valid pattern
				'/a*/': true,           // Potential endless loop
				'pwd': true             // Valid string pattern
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle invalid regex patterns gracefully', () => {
			setAutoApprove({
				'/*/': true,                    // Invalid regex - nothing to repeat
				'/(?:+/': true,                 // Invalid regex - incomplete quantifier
				'/[/': true,                    // Invalid regex - unclosed character class
				'/^echo/': true,                // Valid pattern
				'ls': true                      // Valid string pattern
			});

			// Valid patterns should still work
			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('ls -la'));
			// Invalid patterns should not match anything and not cause crashes
			ok(!isAutoApproved('random command'));
		});
	});

	suite('path-aware auto approval', () => {
		test('should handle path variations with forward slashes', () => {
			setAutoApprove({
				'bin/foo': true
			});

			// Should approve the exact match
			ok(isAutoApproved('bin/foo'));
			ok(isAutoApproved('bin/foo --arg'));

			// Should approve with Windows backslashes
			ok(isAutoApproved('bin\\foo'));
			ok(isAutoApproved('bin\\foo --arg'));

			// Should approve with current directory prefixes
			ok(isAutoApproved('./bin/foo'));
			ok(isAutoApproved('.\\bin/foo'));
			ok(isAutoApproved('./bin\\foo'));
			ok(isAutoApproved('.\\bin\\foo'));

			// Should not approve partial matches
			ok(!isAutoApproved('bin/foobar'));
			ok(!isAutoApproved('notbin/foo'));
		});

		test('should handle path variations with backslashes', () => {
			setAutoApprove({
				'bin\\script.bat': true
			});

			// Should approve the exact match
			ok(isAutoApproved('bin\\script.bat'));
			ok(isAutoApproved('bin\\script.bat --help'));

			// Should approve with forward slashes
			ok(isAutoApproved('bin/script.bat'));
			ok(isAutoApproved('bin/script.bat --help'));

			// Should approve with current directory prefixes
			ok(isAutoApproved('./bin\\script.bat'));
			ok(isAutoApproved('.\\bin\\script.bat'));
			ok(isAutoApproved('./bin/script.bat'));
			ok(isAutoApproved('.\\bin/script.bat'));
		});

		test('should handle deep paths', () => {
			setAutoApprove({
				'src/utils/helper.js': true
			});

			ok(isAutoApproved('src/utils/helper.js'));
			ok(isAutoApproved('src\\utils\\helper.js'));
			ok(isAutoApproved('src/utils\\helper.js'));
			ok(isAutoApproved('src\\utils/helper.js'));
			ok(isAutoApproved('./src/utils/helper.js'));
			ok(isAutoApproved('.\\src\\utils\\helper.js'));
		});

		test('should not treat non-paths as paths', () => {
			setAutoApprove({
				'echo': true,  // Not a path
				'ls': true,    // Not a path
				'git': true    // Not a path
			});

			// These should work as normal command matching, not path matching
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls'));
			ok(isAutoApproved('git'));

			// Should not be treated as paths, so these prefixes shouldn't work
			ok(!isAutoApproved('./echo'));
			ok(!isAutoApproved('.\\ls'));
		});

		test('should handle paths with mixed separators in config', () => {
			setAutoApprove({
				'bin/foo\\bar': true  // Mixed separators in config
			});

			ok(isAutoApproved('bin/foo\\bar'));
			ok(isAutoApproved('bin\\foo/bar'));
			ok(isAutoApproved('bin/foo/bar'));
			ok(isAutoApproved('bin\\foo\\bar'));
			ok(isAutoApproved('./bin/foo\\bar'));
			ok(isAutoApproved('.\\bin\\foo\\bar'));
		});

		test('should work with command line auto approval for paths', () => {
			setAutoApproveWithCommandLine({
				'bin/deploy': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('bin/deploy --prod'));
			ok(isCommandLineAutoApproved('bin\\deploy --prod'));
			ok(isCommandLineAutoApproved('./bin/deploy --prod'));
			ok(isCommandLineAutoApproved('.\\bin\\deploy --prod'));
		});

		test('should handle special characters in paths', () => {
			setAutoApprove({
				'bin/my-script.sh': true,
				'scripts/build_all.py': true,
				'tools/run (debug).exe': true
			});

			ok(isAutoApproved('bin/my-script.sh'));
			ok(isAutoApproved('bin\\my-script.sh'));
			ok(isAutoApproved('./bin/my-script.sh'));

			ok(isAutoApproved('scripts/build_all.py'));
			ok(isAutoApproved('scripts\\build_all.py'));

			ok(isAutoApproved('tools/run (debug).exe'));
			ok(isAutoApproved('tools\\run (debug).exe'));
		});
	});

	suite('PowerShell-specific commands', () => {
		setup(() => {
			shell = 'pwsh';
		});

		test('should handle Windows PowerShell commands', () => {
			setAutoApprove({
				'Get-ChildItem': true,
				'Get-Content': true,
				'Get-Location': true,
				'Remove-Item': false,
				'del': false
			});

			ok(isAutoApproved('Get-ChildItem'));
			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('Get-Location'));
			ok(!isAutoApproved('Remove-Item file.txt'));
		});

		test('should handle ( prefixes', () => {
			setAutoApprove({
				'Get-Content': true
			});

			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('(Get-Content file.txt'));
			ok(!isAutoApproved('[Get-Content'));
			ok(!isAutoApproved('foo'));
		});

		test('should be case-insensitive for PowerShell commands', () => {
			setAutoApprove({
				'Get-ChildItem': true,
				'Get-Content': true,
				'Remove-Item': false
			});

			ok(isAutoApproved('Get-ChildItem'));
			ok(isAutoApproved('get-childitem'));
			ok(isAutoApproved('GET-CHILDITEM'));
			ok(isAutoApproved('Get-childitem'));
			ok(isAutoApproved('get-ChildItem'));

			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('get-content file.txt'));
			ok(isAutoApproved('GET-CONTENT file.txt'));
			ok(isAutoApproved('Get-content file.txt'));

			ok(!isAutoApproved('Remove-Item file.txt'));
			ok(!isAutoApproved('remove-item file.txt'));
			ok(!isAutoApproved('REMOVE-ITEM file.txt'));
			ok(!isAutoApproved('Remove-item file.txt'));
		});

		test('should be case-insensitive for PowerShell aliases', () => {
			setAutoApprove({
				'ls': true,
				'dir': true,
				'rm': false,
				'del': false
			});

			// Test case-insensitive matching for aliases
			ok(isAutoApproved('ls'));
			ok(isAutoApproved('LS'));
			ok(isAutoApproved('Ls'));

			ok(isAutoApproved('dir'));
			ok(isAutoApproved('DIR'));
			ok(isAutoApproved('Dir'));

			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('RM file.txt'));
			ok(!isAutoApproved('Rm file.txt'));

			ok(!isAutoApproved('del file.txt'));
			ok(!isAutoApproved('DEL file.txt'));
			ok(!isAutoApproved('Del file.txt'));
		});

		test('should be case-insensitive with regex patterns', () => {
			setAutoApprove({
				'/^Get-/': true,
				'/Remove-Item|rm/': false
			});

			ok(isAutoApproved('Get-ChildItem'));
			ok(isAutoApproved('get-childitem'));
			ok(isAutoApproved('GET-PROCESS'));
			ok(isAutoApproved('Get-Location'));

			ok(!isAutoApproved('Remove-Item file.txt'));
			ok(!isAutoApproved('remove-item file.txt'));
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('RM file.txt'));
		});

		test('should handle case-insensitive PowerShell commands on different OS', () => {
			setAutoApprove({
				'Get-Process': true,
				'Stop-Process': false
			});

			for (const currnetOS of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
				os = currnetOS;
				ok(isAutoApproved('Get-Process'), `os=${os}`);
				ok(isAutoApproved('get-process'), `os=${os}`);
				ok(isAutoApproved('GET-PROCESS'), `os=${os}`);
				ok(!isAutoApproved('Stop-Process'), `os=${os}`);
				ok(!isAutoApproved('stop-process'), `os=${os}`);
			}
		});
	});

	suite('isCommandLineAutoApproved - matchCommandLine functionality', () => {
		test('should auto-approve command line patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('echo test && ls'));
		});

		test('should not auto-approve regular patterns with isCommandLineAutoApproved', () => {
			setAutoApprove({
				'echo': true
			});

			// Regular patterns should not be matched by isCommandLineAutoApproved
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle regex patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				'/echo.*world/': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello world'));
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle case-insensitive regex with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				'/echo/i': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('ECHO hello'));
			ok(isCommandLineAutoApproved('Echo hello'));
		});

		test('should handle complex command line patterns', () => {
			setAutoApproveWithCommandLine({
				'/^npm run build/': { approve: true, matchCommandLine: true },
				'/\.ps1/i': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('npm run build --production'));
			ok(isCommandLineAutoApproved('powershell -File script.ps1'));
			ok(isCommandLineAutoApproved('pwsh -File SCRIPT.PS1'));
			ok(!isCommandLineAutoApproved('npm install'));
		});

		test('should return false for empty command line', () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true }
			});

			ok(!isCommandLineAutoApproved(''));
			ok(!isCommandLineAutoApproved('   '));
		});

		test('should handle mixed configuration with matchCommandLine entries', () => {
			setAutoApproveWithCommandLine({
				'echo': true,  // Regular pattern
				'ls': { approve: true, matchCommandLine: true },  // Command line pattern
				'rm': { approve: true, matchCommandLine: false }  // Explicit regular pattern
			});

			// Only the matchCommandLine: true entry should work with isCommandLineAutoApproved
			ok(isCommandLineAutoApproved('ls -la'));
			ok(!isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('rm file.txt'));
		});

		test('should handle deny patterns with matchCommandLine: true', () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true },
				'/dangerous/': { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
			ok(!isCommandLineAutoApproved('dangerous operation'));
		});

		test('should prioritize deny list over allow list for command line patterns', () => {
			setAutoApproveWithCommandLine({
				'/echo/': { approve: true, matchCommandLine: true },
				'/echo.*dangerous/': { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
		});

		test('should handle complex deny patterns with matchCommandLine', () => {
			setAutoApproveWithCommandLine({
				'npm': { approve: true, matchCommandLine: true },
				'/npm.*--force/': { approve: false, matchCommandLine: true },
				'/\.ps1.*-ExecutionPolicy/i': { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('npm install'));
			ok(isCommandLineAutoApproved('npm run build'));
			ok(!isCommandLineAutoApproved('npm install --force'));
			ok(!isCommandLineAutoApproved('powershell -File script.ps1 -ExecutionPolicy Bypass'));
		});

		test('should handle empty regex patterns with matchCommandLine that could cause endless loops', () => {
			setAutoApproveWithCommandLine({
				'//': { approve: true, matchCommandLine: true },
				'/(?:)/': { approve: true, matchCommandLine: true },
				'/*/': { approve: true, matchCommandLine: true },            // Invalid regex pattern
				'/.**/': { approve: true, matchCommandLine: true }           // Invalid regex pattern
			});

			// These patterns should not cause endless loops and should not match any commands
			// Invalid patterns should be handled gracefully and not match anything
			ok(!isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('ls'));
			ok(!isCommandLineAutoApproved(''));
		});

		test('should handle regex patterns with matchCommandLine that would cause endless loops', () => {
			setAutoApproveWithCommandLine({
				'/a*/': { approve: true, matchCommandLine: true },
				'/b?/': { approve: true, matchCommandLine: true },
				'/(x|)*/': { approve: true, matchCommandLine: true },
				'/(?:)*/': { approve: true, matchCommandLine: true }
			});

			// Commands should still work normally, endless loop patterns should be safely handled
			ok(!isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('ls'));
			ok(!isCommandLineAutoApproved('a'));
			ok(!isCommandLineAutoApproved('b'));
		});

		test('should handle mixed valid and problematic regex patterns with matchCommandLine', () => {
			setAutoApproveWithCommandLine({
				'/^echo/': { approve: true, matchCommandLine: true },        // Valid pattern
				'//': { approve: true, matchCommandLine: true },             // Empty pattern
				'/^ls/': { approve: true, matchCommandLine: true },          // Valid pattern
				'/a*/': { approve: true, matchCommandLine: true },           // Potential endless loop
				'pwd': { approve: true, matchCommandLine: true }             // Valid string pattern
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('ls -la'));
			ok(isCommandLineAutoApproved('pwd'));
			ok(!isCommandLineAutoApproved('rm file'));
		});

		test('should handle invalid regex patterns with matchCommandLine gracefully', () => {
			setAutoApproveWithCommandLine({
				'/*/': { approve: true, matchCommandLine: true },                    // Invalid regex - nothing to repeat
				'/(?:+/': { approve: true, matchCommandLine: true },                 // Invalid regex - incomplete quantifier
				'/[/': { approve: true, matchCommandLine: true },                    // Invalid regex - unclosed character class
				'/^echo/': { approve: true, matchCommandLine: true },                // Valid pattern
				'ls': { approve: true, matchCommandLine: true }                      // Valid string pattern
			});

			// Valid patterns should still work
			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('ls -la'));
			// Invalid patterns should not match anything and not cause crashes
			ok(!isCommandLineAutoApproved('random command'));
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

	suite('isDefaultRule logic', () => {
		function getIsDefaultRule(command: string): boolean | undefined {
			return commandLineAutoApprover.isCommandAutoApproved(command, shell, os).rule?.isDefaultRule;
		}

		function getCommandLineIsDefaultRule(commandLine: string): boolean | undefined {
			return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).rule?.isDefaultRule;
		}

		function setAutoApproveWithDefaults(userConfig: { [key: string]: boolean }, defaultConfig: { [key: string]: boolean }) {
			// Set up mock configuration with default values
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);

			// Mock the inspect method to return default values
			const originalInspect = configurationService.inspect;
			const originalGetValue = configurationService.getValue;

			configurationService.inspect = (key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return {
						default: { value: defaultConfig },
						user: { value: userConfig },
						workspace: undefined,
						workspaceFolder: undefined,
						application: undefined,
						policy: undefined,
						memory: undefined,
						value: { ...defaultConfig, ...userConfig }
					};
				}
				return originalInspect.call(configurationService, key);
			};

			configurationService.getValue = (key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return { ...defaultConfig, ...userConfig };
				}
				return originalGetValue.call(configurationService, key);
			};

			// Trigger configuration update
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true,
				affectedKeys: new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
				source: ConfigurationTarget.USER,
				change: null!,
			});
		}

		function setAutoApproveWithDefaultsCommandLine(
			userConfig: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean },
			defaultConfig: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean }
		) {
			// Set up mock configuration with default values for command line rules
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);

			// Mock the inspect method to return default values
			const originalInspect = configurationService.inspect;
			const originalGetValue = configurationService.getValue;

			configurationService.inspect = <T>(key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return {
						default: { value: defaultConfig },
						user: { value: userConfig },
						workspace: undefined,
						workspaceFolder: undefined,
						application: undefined,
						policy: undefined,
						memory: undefined,
						value: { ...defaultConfig, ...userConfig }
					};
				}
				return originalInspect.call(configurationService, key);
			};

			configurationService.getValue = (key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return { ...defaultConfig, ...userConfig };
				}
				return originalGetValue.call(configurationService, key);
			};

			// Trigger configuration update
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true,
				affectedKeys: new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
				source: ConfigurationTarget.USER,
				change: null!,
			});
		}

		test('should correctly identify default rules vs user-defined rules', () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'ls': true, 'pwd': false },
				{ 'echo': true, 'cat': true }
			);

			strictEqual(getIsDefaultRule('echo hello'), true, 'echo is in both default and user config with same value - should be marked as default');
			strictEqual(getIsDefaultRule('ls -la'), false, 'ls is only in user config - should be marked as user-defined');
			strictEqual(getIsDefaultRule('pwd'), false, 'pwd is only in user config - should be marked as user-defined');
			strictEqual(getIsDefaultRule('cat file.txt'), true, 'cat is in both default and user config with same value - should be marked as default');
		});

		test('should mark as default when command is only in default config but not in user config', () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'ls': true },  // User config (cat is NOT here)
				{ 'echo': true, 'cat': true }  // Default config (cat IS here)
			);

			// Test that merged config includes all commands
			strictEqual(commandLineAutoApprover.isCommandAutoApproved('echo', shell, os).result, 'approved', 'echo should be approved');
			strictEqual(commandLineAutoApprover.isCommandAutoApproved('ls', shell, os).result, 'approved', 'ls should be approved');

			// cat should be approved because it's in the merged config
			const catResult = commandLineAutoApprover.isCommandAutoApproved('cat', shell, os);
			strictEqual(catResult.result, 'approved', 'cat should be approved from default config');

			// cat should be marked as default rule since it comes from default config only
			strictEqual(catResult.rule?.isDefaultRule, true, 'cat is only in default config, not in user config - should be marked as default');
		});

		test('should handle default rules with different values', () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'rm': true },
				{ 'echo': false, 'rm': true }
			);

			strictEqual(getIsDefaultRule('echo hello'), false, 'echo has different values in default vs user - should be marked as user-defined');
			strictEqual(getIsDefaultRule('rm file.txt'), true, 'rm has same value in both - should be marked as default');
		});

		test('should handle regex patterns as default rules', () => {
			setAutoApproveWithDefaults(
				{ '/^git/': true, '/^npm/': false },
				{ '/^git/': true, '/^docker/': true }
			);

			strictEqual(getIsDefaultRule('git status'), true, 'git pattern matches default - should be marked as default');
			strictEqual(getIsDefaultRule('npm install'), false, 'npm pattern is user-only - should be marked as user-defined');
		});

		test('should handle mixed string and regex patterns', () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, '/^ls/': false },
				{ 'echo': true, 'cat': true }
			);

			strictEqual(getIsDefaultRule('echo hello'), true, 'String pattern matching default');
			strictEqual(getIsDefaultRule('ls -la'), false, 'Regex pattern user-defined');
		});

		test('should handle command line rules with isDefaultRule', () => {
			setAutoApproveWithDefaultsCommandLine(
				{
					'echo': { approve: true, matchCommandLine: true },
					'ls': { approve: false, matchCommandLine: true }
				},
				{
					'echo': { approve: true, matchCommandLine: true },
					'cat': { approve: true, matchCommandLine: true }
				}
			);

			strictEqual(getCommandLineIsDefaultRule('echo hello world'), true, 'echo matches default config exactly using structural equality - should be marked as default');
			strictEqual(getCommandLineIsDefaultRule('ls -la'), false, 'ls is user-defined only - should be marked as user-defined');
		});

		test('should handle command line rules with different matchCommandLine values', () => {
			setAutoApproveWithDefaultsCommandLine(
				{
					'echo': { approve: true, matchCommandLine: true },
					'ls': { approve: true, matchCommandLine: false }
				},
				{
					'echo': { approve: true, matchCommandLine: false },
					'ls': { approve: true, matchCommandLine: false }
				}
			);

			strictEqual(getCommandLineIsDefaultRule('echo hello'), false, 'echo has different matchCommandLine value - should be user-defined');
			strictEqual(getCommandLineIsDefaultRule('ls -la'), undefined, 'ls matches exactly - should be default (but won\'t match command line check since matchCommandLine is false)');
		});

		test('should handle boolean vs object format consistency', () => {
			setAutoApproveWithDefaultsCommandLine(
				{
					'echo': true,
					'ls': { approve: true, matchCommandLine: true }
				},
				{
					'echo': true,
					'ls': { approve: true, matchCommandLine: true }
				}
			);

			strictEqual(getIsDefaultRule('echo hello'), true, 'Boolean format matching - should be default');
			strictEqual(getCommandLineIsDefaultRule('ls -la'), true, 'Object format matching using structural equality - should be default');
		});

		test('should return undefined for noMatch cases', () => {
			setAutoApproveWithDefaults(
				{ 'echo': true },
				{ 'cat': true }
			);

			strictEqual(getIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
			strictEqual(getCommandLineIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
		});

		test('should handle empty configurations', () => {
			setAutoApproveWithDefaults(
				{},
				{}
			);

			strictEqual(getIsDefaultRule('echo hello'), undefined);
			strictEqual(getCommandLineIsDefaultRule('echo hello'), undefined);
		});

		test('should handle only default config with no user overrides', () => {
			setAutoApproveWithDefaults(
				{},
				{ 'echo': true, 'ls': false }
			);

			strictEqual(getIsDefaultRule('echo hello'), true, 'Commands in default config should be marked as default rules even with empty user config');
			strictEqual(getIsDefaultRule('ls -la'), true, 'Commands in default config should be marked as default rules even with empty user config');
		});

		test('should handle complex nested object rules', () => {
			setAutoApproveWithDefaultsCommandLine(
				{
					'npm': { approve: true, matchCommandLine: true },
					'git': { approve: false, matchCommandLine: false }
				},
				{
					'npm': { approve: true, matchCommandLine: true },
					'docker': { approve: true, matchCommandLine: true }
				}
			);

			strictEqual(getCommandLineIsDefaultRule('npm install'), true, 'npm matches default exactly using structural equality - should be default');
			strictEqual(getCommandLineIsDefaultRule('git status'), undefined, 'git is user-defined - should be user-defined (but won\'t match command line since matchCommandLine is false)');
		});

		test('should handle PowerShell case-insensitive matching with defaults', () => {
			shell = 'pwsh';
			os = OperatingSystem.Windows;

			setAutoApproveWithDefaults(
				{ 'Get-Process': true },
				{ 'Get-Process': true }
			);

			strictEqual(getIsDefaultRule('Get-Process'), true, 'Case-insensitive PowerShell command matching default');
			strictEqual(getIsDefaultRule('get-process'), true, 'Case-insensitive PowerShell command matching default');
			strictEqual(getIsDefaultRule('GET-PROCESS'), true, 'Case-insensitive PowerShell command matching default');
		});

		test('should use structural equality for object comparison', () => {
			// Test that objects with same content but different instances are treated as equal
			const userConfig = { 'test': { approve: true, matchCommandLine: true } };
			const defaultConfig = { 'test': { approve: true, matchCommandLine: true } };

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(getCommandLineIsDefaultRule('test command'), true, 'Even though userConfig and defaultConfig are different object instances, they have the same structure and values, so should be considered default');
		});

		test('should detect structural differences in objects', () => {
			const userConfig = { 'test': { approve: true, matchCommandLine: true } };
			const defaultConfig = { 'test': { approve: true, matchCommandLine: false } };

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(getCommandLineIsDefaultRule('test command'), false, 'Objects have different matchCommandLine values, so should be user-defined');
		});

		test('should handle mixed types correctly', () => {
			const userConfig = {
				'cmd1': true,
				'cmd2': { approve: false, matchCommandLine: true }
			};
			const defaultConfig = {
				'cmd1': true,
				'cmd2': { approve: false, matchCommandLine: true }
			};

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(getIsDefaultRule('cmd1 arg'), true, 'Boolean type should match default');
			strictEqual(getCommandLineIsDefaultRule('cmd2 arg'), true, 'Object type should match default using structural equality (even though it\'s a deny rule)');
		});
	});

	suite('ignoreDefaultAutoApproveRules', () => {
		function setAutoApproveWithDefaults(userConfig: { [key: string]: boolean }, defaultConfig: { [key: string]: boolean }) {
			// Set up mock configuration with default values
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);

			// Mock the inspect method to return default values
			const originalInspect = configurationService.inspect;
			const originalGetValue = configurationService.getValue;

			configurationService.inspect = (key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return {
						default: { value: defaultConfig },
						user: { value: userConfig },
						workspace: undefined,
						workspaceFolder: undefined,
						application: undefined,
						policy: undefined,
						memory: undefined,
						value: { ...defaultConfig, ...userConfig }
					};
				}
				return originalInspect.call(configurationService, key);
			};

			configurationService.getValue = (key: string): any => {
				if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
					return { ...defaultConfig, ...userConfig };
				}
				return originalGetValue.call(configurationService, key);
			};

			// Trigger configuration update
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true,
				affectedKeys: new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
				source: ConfigurationTarget.USER,
				change: null!,
			});
		}

		function setIgnoreDefaultAutoApproveRules(value: boolean) {
			setConfig(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules, value);
		}

		test('should include default rules when ignoreDefaultAutoApproveRules is false (default behavior)', () => {
			setAutoApproveWithDefaults(
				{ 'ls': true },
				{ 'echo': true, 'cat': true }
			);
			setIgnoreDefaultAutoApproveRules(false);

			ok(isAutoApproved('ls -la'), 'User-defined rule should work');
			ok(isAutoApproved('echo hello'), 'Default rule should work when not ignored');
			ok(isAutoApproved('cat file.txt'), 'Default rule should work when not ignored');
		});

		test('should exclude default rules when ignoreDefaultAutoApproveRules is true', () => {
			setAutoApproveWithDefaults(
				{ 'ls': true },
				{ 'echo': true, 'cat': true }
			);
			setIgnoreDefaultAutoApproveRules(true);

			ok(isAutoApproved('ls -la'), 'User-defined rule should still work');
			ok(!isAutoApproved('echo hello'), 'Default rule should be ignored');
			ok(!isAutoApproved('cat file.txt'), 'Default rule should be ignored');
		});
	});
});
