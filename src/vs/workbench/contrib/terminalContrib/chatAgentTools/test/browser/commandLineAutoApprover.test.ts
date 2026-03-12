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
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ok, strictEqual } from 'assert';
import { CommandLineAutoApprover } from '../../browser/tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js';
import { isAutoApproveRule } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';

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
		return (await commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os, undefined)).result === 'approved';
	}

	function isCommandLineAutoApproved(commandLine: string): boolean {
		return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).result === 'approved';
	}

	suite('autoApprove with allow patterns only', () => {
		test('should auto-approve exact command match', async () => {
			setAutoApprove({
				'echo': true
			});
			ok(await isAutoApproved('echo'));
		});

		test('should auto-approve command with arguments', async () => {
			setAutoApprove({
				'echo': true
			});
			ok(await isAutoApproved('echo hello world'));
		});

		test('should not auto-approve when there is no match', async () => {
			setAutoApprove({
				'echo': true
			});
			ok(!await isAutoApproved('ls'));
		});

		test('should not auto-approve partial command matches', async () => {
			setAutoApprove({
				'echo': true
			});
			ok(!await isAutoApproved('echotest'));
		});

		test('should handle multiple commands in autoApprove', async () => {
			setAutoApprove({
				'echo': true,
				'ls': true,
				'pwd': true
			});
			ok(await isAutoApproved('echo'));
			ok(await isAutoApproved('ls -la'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm'));
		});
	});

	suite('autoApprove with deny patterns only', () => {
		test('should deny commands in autoApprove', async () => {
			setAutoApprove({
				'rm': false,
				'del': false
			});
			ok(!await isAutoApproved('rm file.txt'));
			ok(!await isAutoApproved('del file.txt'));
		});

		test('should not auto-approve safe commands when no allow patterns are present', async () => {
			setAutoApprove({
				'rm': false
			});
			ok(!await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ls'));
		});
	});

	suite('autoApprove with mixed allow and deny patterns', () => {
		test('should deny commands set to false even if other commands are set to true', async () => {
			setAutoApprove({
				'echo': true,
				'rm': false
			});
			ok(await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('rm file.txt'));
		});

		test('should auto-approve allow patterns not set to false', async () => {
			setAutoApprove({
				'echo': true,
				'ls': true,
				'pwd': true,
				'rm': false,
				'del': false
			});
			ok(await isAutoApproved('echo'));
			ok(await isAutoApproved('ls'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm'));
			ok(!await isAutoApproved('del'));
		});
	});

	suite('regex patterns', () => {
		test('should handle /.*/', async () => {
			setAutoApprove({
				'/.*/': true,
			});

			ok(await isAutoApproved('echo hello'));
		});

		test('should handle regex patterns in autoApprove', async () => {
			setAutoApprove({
				'/^echo/': true,
				'/^ls/': true,
				'pwd': true
			});

			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('ls -la'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm file'));
		});

		test('should handle regex patterns for deny', async () => {
			setAutoApprove({
				'echo': true,
				'rm': true,
				'/^rm\\s+/': false,
				'/^del\\s+/': false
			});

			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('rm'));
			ok(!await isAutoApproved('rm file.txt'));
			ok(!await isAutoApproved('del file.txt'));
		});

		test('should handle complex regex patterns', async () => {
			setAutoApprove({
				'/^(echo|ls|pwd)\\b/': true,
				'/^git (status|show\\b.*)$/': true,
				'/rm|del|kill/': false
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

		test('should handle git patterns with -C and --no-pager', async () => {
			setAutoApprove({
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/': true,
				'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*-(d|D|m|M|-delete|-force)\\b/': false,
			});

			// Basic commands
			ok(await isAutoApproved('git status'));
			ok(await isAutoApproved('git log'));
			ok(await isAutoApproved('git show HEAD'));
			ok(await isAutoApproved('git diff'));
			ok(await isAutoApproved('git ls-files'));
			ok(await isAutoApproved('git grep pattern'));
			ok(await isAutoApproved('git branch'));

			// ls-files with options
			ok(await isAutoApproved('git ls-files --cached'));
			ok(await isAutoApproved('git -C /path ls-files'));
			ok(await isAutoApproved('git --no-pager ls-files'));

			// With -C path
			ok(await isAutoApproved('git -C /some/path status'));
			ok(await isAutoApproved('git -C ../relative log'));
			ok(await isAutoApproved('git -C . diff'));

			// With --no-pager
			ok(await isAutoApproved('git --no-pager status'));
			ok(await isAutoApproved('git --no-pager log'));
			ok(await isAutoApproved('git --no-pager diff HEAD~1'));

			// With both -C and --no-pager
			ok(await isAutoApproved('git -C /path --no-pager status'));
			ok(await isAutoApproved('git --no-pager -C /path log'));
			ok(await isAutoApproved('git -C /path1 -C /path2 status'));
			ok(await isAutoApproved('git --no-pager --no-pager log'));

			// Branch deletion should be denied
			ok(!await isAutoApproved('git branch -d feature'));
			ok(!await isAutoApproved('git branch -D feature'));
			ok(!await isAutoApproved('git branch --delete feature'));
			ok(!await isAutoApproved('git -C /path branch -d feature'));
			ok(!await isAutoApproved('git --no-pager branch -D feature'));
			ok(!await isAutoApproved('git -C /path --no-pager branch --force'));

			// Branch rename should be denied
			ok(!await isAutoApproved('git branch -m old new'));
			ok(!await isAutoApproved('git branch -M old new'));
			ok(!await isAutoApproved('git -C /path branch -m old new'));
		});

		suite('flags', () => {
			test('should handle case-insensitive regex patterns with i flag', async () => {
				setAutoApprove({
					'/^echo/i': true,
					'/^ls/i': true,
					'/rm|del/i': false
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
					'/^git\\s+/gim': true,
					'/dangerous/gim': false
				});

				ok(await isAutoApproved('git status'));
				ok(await isAutoApproved('GIT status'));
				ok(await isAutoApproved('Git status'));
				ok(!await isAutoApproved('dangerous command'));
				ok(!await isAutoApproved('DANGEROUS command'));
			});

			test('should handle various regex flags', async () => {
				setAutoApprove({
					'/^echo.*/s': true,  // dotall flag
					'/^git\\s+/i': true, // case-insensitive flag
					'/rm|del/g': false   // global flag
				});

				ok(await isAutoApproved('echo hello\nworld'));
				ok(await isAutoApproved('git status'));
				ok(await isAutoApproved('GIT status'));
				ok(!await isAutoApproved('rm file'));
				ok(!await isAutoApproved('del file'));
			});

			test('should handle regex patterns without flags', async () => {
				setAutoApprove({
					'/^echo/': true,
					'/rm|del/': false
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
				'echo': true
			});

			ok(!await isAutoApproved(''));
			ok(!await isAutoApproved('   '));
		});

		test('should handle whitespace in commands', async () => {
			setAutoApprove({
				'echo': true
			});

			ok(await isAutoApproved('echo   hello   world'));
		});

		test('should be case-sensitive by default', async () => {
			setAutoApprove({
				'echo': true
			});

			ok(await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ECHO hello'));
			ok(!await isAutoApproved('Echo hello'));
		});

		// https://github.com/microsoft/vscode/issues/252411
		test('should handle string-based values with special regex characters', async () => {
			setAutoApprove({
				'pwsh.exe -File D:\\foo.bar\\a-script.ps1': true
			});

			ok(await isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1'));
			ok(await isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg'));
		});

		test('should ignore the empty string key', async () => {
			setAutoApprove({
				'': true
			});

			ok(!await isAutoApproved('echo hello'));
		});

		test('should handle empty regex patterns that could cause endless loops', async () => {
			setAutoApprove({
				'//': true,
				'/(?:)/': true,
				'/*/': true,            // Invalid regex pattern
				'/.**/': true           // Invalid regex pattern
			});

			// These patterns should not cause endless loops and should not match any commands
			// Invalid patterns should be handled gracefully and not match anything
			ok(!await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ls'));
			ok(!await isAutoApproved(''));
		});

		test('should handle regex patterns that would cause endless loops', async () => {
			setAutoApprove({
				'/a*/': true,
				'/b?/': true,
				'/(x|)*/': true,
				'/(?:)*/': true
			});

			// Commands should still work normally, endless loop patterns should be safely handled
			ok(!await isAutoApproved('echo hello'));
			ok(!await isAutoApproved('ls'));
			ok(!await isAutoApproved('a'));
			ok(!await isAutoApproved('b'));
		});

		test('should handle mixed valid and problematic regex patterns', async () => {
			setAutoApprove({
				'/^echo/': true,        // Valid pattern
				'//': true,             // Empty pattern
				'/^ls/': true,          // Valid pattern
				'/a*/': true,           // Potential endless loop
				'pwd': true             // Valid string pattern
			});

			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('ls -la'));
			ok(await isAutoApproved('pwd'));
			ok(!await isAutoApproved('rm file'));
		});

		test('should handle invalid regex patterns gracefully', async () => {
			setAutoApprove({
				'/*/': true,                    // Invalid regex - nothing to repeat
				'/(?:+/': true,                 // Invalid regex - incomplete quantifier
				'/[/': true,                    // Invalid regex - unclosed character class
				'/^echo/': true,                // Valid pattern
				'ls': true                      // Valid string pattern
			});

			// Valid patterns should still work
			ok(await isAutoApproved('echo hello'));
			ok(await isAutoApproved('ls -la'));
			// Invalid patterns should not match anything and not cause crashes
			ok(!await isAutoApproved('random command'));
		});
	});

	suite('path-aware auto approval', () => {
		test('should handle path variations with forward slashes', async () => {
			setAutoApprove({
				'bin/foo': true
			});

			// Should approve the exact match
			ok(await isAutoApproved('bin/foo'));
			ok(await isAutoApproved('bin/foo --arg'));

			// Should approve with Windows backslashes
			ok(await isAutoApproved('bin\\foo'));
			ok(await isAutoApproved('bin\\foo --arg'));

			// Should approve with current directory prefixes
			ok(await isAutoApproved('./bin/foo'));
			ok(await isAutoApproved('.\\bin/foo'));
			ok(await isAutoApproved('./bin\\foo'));
			ok(await isAutoApproved('.\\bin\\foo'));

			// Should not approve partial matches
			ok(!await isAutoApproved('bin/foobar'));
			ok(!await isAutoApproved('notbin/foo'));
		});

		test('should handle path variations with backslashes', async () => {
			setAutoApprove({
				'bin\\script.bat': true
			});

			// Should approve the exact match
			ok(await isAutoApproved('bin\\script.bat'));
			ok(await isAutoApproved('bin\\script.bat --help'));

			// Should approve with forward slashes
			ok(await isAutoApproved('bin/script.bat'));
			ok(await isAutoApproved('bin/script.bat --help'));

			// Should approve with current directory prefixes
			ok(await isAutoApproved('./bin\\script.bat'));
			ok(await isAutoApproved('.\\bin\\script.bat'));
			ok(await isAutoApproved('./bin/script.bat'));
			ok(await isAutoApproved('.\\bin/script.bat'));
		});

		test('should handle deep paths', async () => {
			setAutoApprove({
				'src/utils/helper.js': true
			});

			ok(await isAutoApproved('src/utils/helper.js'));
			ok(await isAutoApproved('src\\utils\\helper.js'));
			ok(await isAutoApproved('src/utils\\helper.js'));
			ok(await isAutoApproved('src\\utils/helper.js'));
			ok(await isAutoApproved('./src/utils/helper.js'));
			ok(await isAutoApproved('.\\src\\utils\\helper.js'));
		});

		test('should not treat non-paths as paths', async () => {
			setAutoApprove({
				'echo': true,  // Not a path
				'ls': true,    // Not a path
				'git': true    // Not a path
			});

			// These should work as normal command matching, not path matching
			ok(await isAutoApproved('echo'));
			ok(await isAutoApproved('ls'));
			ok(await isAutoApproved('git'));

			// Should not be treated as paths, so these prefixes shouldn't work
			ok(!await isAutoApproved('./echo'));
			ok(!await isAutoApproved('.\\ls'));
		});

		test('should handle paths with mixed separators in config', async () => {
			setAutoApprove({
				'bin/foo\\bar': true  // Mixed separators in config
			});

			ok(await isAutoApproved('bin/foo\\bar'));
			ok(await isAutoApproved('bin\\foo/bar'));
			ok(await isAutoApproved('bin/foo/bar'));
			ok(await isAutoApproved('bin\\foo\\bar'));
			ok(await isAutoApproved('./bin/foo\\bar'));
			ok(await isAutoApproved('.\\bin\\foo\\bar'));
		});

		test('should work with command line auto approval for paths', async () => {
			setAutoApproveWithCommandLine({
				'bin/deploy': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('bin/deploy --prod'));
			ok(isCommandLineAutoApproved('bin\\deploy --prod'));
			ok(isCommandLineAutoApproved('./bin/deploy --prod'));
			ok(isCommandLineAutoApproved('.\\bin\\deploy --prod'));
		});

		test('should handle special characters in paths', async () => {
			setAutoApprove({
				'bin/my-script.sh': true,
				'scripts/build_all.py': true,
				'tools/run (debug).exe': true
			});

			ok(await isAutoApproved('bin/my-script.sh'));
			ok(await isAutoApproved('bin\\my-script.sh'));
			ok(await isAutoApproved('./bin/my-script.sh'));

			ok(await isAutoApproved('scripts/build_all.py'));
			ok(await isAutoApproved('scripts\\build_all.py'));

			ok(await isAutoApproved('tools/run (debug).exe'));
			ok(await isAutoApproved('tools\\run (debug).exe'));
		});
	});

	suite('PowerShell-specific commands', () => {
		setup(() => {
			shell = 'pwsh';
		});

		test('should handle Windows PowerShell commands', async () => {
			setAutoApprove({
				'Get-ChildItem': true,
				'Get-Content': true,
				'Get-Location': true,
				'Remove-Item': false,
				'del': false
			});

			ok(await isAutoApproved('Get-ChildItem'));
			ok(await isAutoApproved('Get-Content file.txt'));
			ok(await isAutoApproved('Get-Location'));
			ok(!await isAutoApproved('Remove-Item file.txt'));
		});

		test('should handle ( prefixes', async () => {
			setAutoApprove({
				'Get-Content': true
			});

			ok(await isAutoApproved('Get-Content file.txt'));
			ok(await isAutoApproved('(Get-Content file.txt'));
			ok(!await isAutoApproved('[Get-Content'));
			ok(!await isAutoApproved('foo'));
		});

		test('should be case-insensitive for PowerShell commands', async () => {
			setAutoApprove({
				'Get-ChildItem': true,
				'Get-Content': true,
				'Remove-Item': false
			});

			ok(await isAutoApproved('Get-ChildItem'));
			ok(await isAutoApproved('get-childitem'));
			ok(await isAutoApproved('GET-CHILDITEM'));
			ok(await isAutoApproved('Get-childitem'));
			ok(await isAutoApproved('get-ChildItem'));

			ok(await isAutoApproved('Get-Content file.txt'));
			ok(await isAutoApproved('get-content file.txt'));
			ok(await isAutoApproved('GET-CONTENT file.txt'));
			ok(await isAutoApproved('Get-content file.txt'));

			ok(!await isAutoApproved('Remove-Item file.txt'));
			ok(!await isAutoApproved('remove-item file.txt'));
			ok(!await isAutoApproved('REMOVE-ITEM file.txt'));
			ok(!await isAutoApproved('Remove-item file.txt'));
		});

		test('should be case-insensitive for PowerShell aliases', async () => {
			setAutoApprove({
				'ls': true,
				'dir': true,
				'rm': false,
				'del': false
			});

			// Test case-insensitive matching for aliases
			ok(await isAutoApproved('ls'));
			ok(await isAutoApproved('LS'));
			ok(await isAutoApproved('Ls'));

			ok(await isAutoApproved('dir'));
			ok(await isAutoApproved('DIR'));
			ok(await isAutoApproved('Dir'));

			ok(!await isAutoApproved('rm file.txt'));
			ok(!await isAutoApproved('RM file.txt'));
			ok(!await isAutoApproved('Rm file.txt'));

			ok(!await isAutoApproved('del file.txt'));
			ok(!await isAutoApproved('DEL file.txt'));
			ok(!await isAutoApproved('Del file.txt'));
		});

		test('should be case-insensitive with regex patterns', async () => {
			setAutoApprove({
				'/^Get-/': true,
				'/Remove-Item|rm/': false
			});

			ok(await isAutoApproved('Get-ChildItem'));
			ok(await isAutoApproved('get-childitem'));
			ok(await isAutoApproved('GET-PROCESS'));
			ok(await isAutoApproved('Get-Location'));

			ok(!await isAutoApproved('Remove-Item file.txt'));
			ok(!await isAutoApproved('remove-item file.txt'));
			ok(!await isAutoApproved('rm file.txt'));
			ok(!await isAutoApproved('RM file.txt'));
		});

		test('should handle case-insensitive PowerShell commands on different OS', async () => {
			setAutoApprove({
				'Get-Process': true,
				'Stop-Process': false
			});

			for (const currnetOS of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
				os = currnetOS;
				ok(await isAutoApproved('Get-Process'), `os=${os}`);
				ok(await isAutoApproved('get-process'), `os=${os}`);
				ok(await isAutoApproved('GET-PROCESS'), `os=${os}`);
				ok(!await isAutoApproved('Stop-Process'), `os=${os}`);
				ok(!await isAutoApproved('stop-process'), `os=${os}`);
			}
		});
	});

	suite('isCommandLineAutoApproved - matchCommandLine functionality', () => {
		test('should auto-approve command line patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('echo test && ls'));
		});

		test('should not auto-approve regular patterns with isCommandLineAutoApproved', async () => {
			setAutoApprove({
				'echo': true
			});

			// Regular patterns should not be matched by isCommandLineAutoApproved
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle regex patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				'/echo.*world/': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello world'));
			ok(!isCommandLineAutoApproved('echo hello'));
		});

		test('should handle case-insensitive regex with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				'/echo/i': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(isCommandLineAutoApproved('ECHO hello'));
			ok(isCommandLineAutoApproved('Echo hello'));
		});

		test('should handle complex command line patterns', async () => {
			setAutoApproveWithCommandLine({
				'/^npm run build/': { approve: true, matchCommandLine: true },
				'/\.ps1/i': { approve: true, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('npm run build --production'));
			ok(isCommandLineAutoApproved('powershell -File script.ps1'));
			ok(isCommandLineAutoApproved('pwsh -File SCRIPT.PS1'));
			ok(!isCommandLineAutoApproved('npm install'));
		});

		test('should return false for empty command line', async () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true }
			});

			ok(!isCommandLineAutoApproved(''));
			ok(!isCommandLineAutoApproved('   '));
		});

		test('should handle mixed configuration with matchCommandLine entries', async () => {
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

		test('should handle deny patterns with matchCommandLine: true', async () => {
			setAutoApproveWithCommandLine({
				'echo': { approve: true, matchCommandLine: true },
				'/dangerous/': { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
			ok(!isCommandLineAutoApproved('dangerous operation'));
		});

		test('should prioritize deny list over allow list for command line patterns', async () => {
			setAutoApproveWithCommandLine({
				'/echo/': { approve: true, matchCommandLine: true },
				'/echo.*dangerous/': { approve: false, matchCommandLine: true }
			});

			ok(isCommandLineAutoApproved('echo hello'));
			ok(!isCommandLineAutoApproved('echo dangerous command'));
		});

		test('should handle complex deny patterns with matchCommandLine', async () => {
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

		test('should handle empty regex patterns with matchCommandLine that could cause endless loops', async () => {
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

		test('should handle regex patterns with matchCommandLine that would cause endless loops', async () => {
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

		test('should handle mixed valid and problematic regex patterns with matchCommandLine', async () => {
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

		test('should handle invalid regex patterns with matchCommandLine gracefully', async () => {
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
		async function getCommandReason(command: string): Promise<string> {
			return (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, undefined)).reason;
		}

		function getCommandLineReason(commandLine: string): string {
			return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).reason;
		}

		suite('command', () => {
			test('approved', async () => {
				setAutoApprove({ echo: true });
				strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', async () => {
				setAutoApprove({ echo: false });
				strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', async () => {
				setAutoApprove({});
				strictEqual(await getCommandReason('echo hello'), `Command 'echo hello' has no matching auto approve entries`);
			});
		});

		suite('command line', () => {
			test('approved', async () => {
				setAutoApproveWithCommandLine({ echo: { approve: true, matchCommandLine: true } });
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' is approved by allow list rule: echo`);
			});
			test('not approved', async () => {
				setAutoApproveWithCommandLine({ echo: { approve: false, matchCommandLine: true } });
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' is denied by deny list rule: echo`);
			});
			test('no match', async () => {
				setAutoApproveWithCommandLine({});
				strictEqual(getCommandLineReason('echo hello'), `Command line 'echo hello' has no matching auto approve entries`);
			});
		});
	});

	suite('isDefaultRule logic', () => {
		async function getIsDefaultRule(command: string): Promise<boolean | undefined> {
			const rule = (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, undefined)).rule;
			return isAutoApproveRule(rule) ? rule.isDefaultRule : undefined;
		}

		function getCommandLineIsDefaultRule(commandLine: string): boolean | undefined {
			const rule = commandLineAutoApprover.isCommandLineAutoApproved(commandLine).rule;
			return isAutoApproveRule(rule) ? rule.isDefaultRule : undefined;
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

		test('should correctly identify default rules vs user-defined rules', async () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'ls': true, 'pwd': false },
				{ 'echo': true, 'cat': true }
			);

			strictEqual(await getIsDefaultRule('echo hello'), true, 'echo is in both default and user config with same value - should be marked as default');
			strictEqual(await getIsDefaultRule('ls -la'), false, 'ls is only in user config - should be marked as user-defined');
			strictEqual(await getIsDefaultRule('pwd'), false, 'pwd is only in user config - should be marked as user-defined');
			strictEqual(await getIsDefaultRule('cat file.txt'), true, 'cat is in both default and user config with same value - should be marked as default');
		});

		test('should mark as default when command is only in default config but not in user config', async () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'ls': true },  // User config (cat is NOT here)
				{ 'echo': true, 'cat': true }  // Default config (cat IS here)
			);

			// Test that merged config includes all commands
			strictEqual((await commandLineAutoApprover.isCommandAutoApproved('echo', shell, os, undefined)).result, 'approved', 'echo should be approved');
			strictEqual((await commandLineAutoApprover.isCommandAutoApproved('ls', shell, os, undefined)).result, 'approved', 'ls should be approved');

			// cat should be approved because it's in the merged config
			const catResult = await commandLineAutoApprover.isCommandAutoApproved('cat', shell, os, undefined);
			strictEqual(catResult.result, 'approved', 'cat should be approved from default config');

			// cat should be marked as default rule since it comes from default config only
			strictEqual(isAutoApproveRule(catResult.rule) ? catResult.rule.isDefaultRule : undefined, true, 'cat is only in default config, not in user config - should be marked as default');
		});

		test('should handle default rules with different values', async () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, 'rm': true },
				{ 'echo': false, 'rm': true }
			);

			strictEqual(await getIsDefaultRule('echo hello'), false, 'echo has different values in default vs user - should be marked as user-defined');
			strictEqual(await getIsDefaultRule('rm file.txt'), true, 'rm has same value in both - should be marked as default');
		});

		test('should handle regex patterns as default rules', async () => {
			setAutoApproveWithDefaults(
				{ '/^git/': true, '/^npm/': false },
				{ '/^git/': true, '/^docker/': true }
			);

			strictEqual(await getIsDefaultRule('git status'), true, 'git pattern matches default - should be marked as default');
			strictEqual(await getIsDefaultRule('npm install'), false, 'npm pattern is user-only - should be marked as user-defined');
		});

		test('should handle mixed string and regex patterns', async () => {
			setAutoApproveWithDefaults(
				{ 'echo': true, '/^ls/': false },
				{ 'echo': true, 'cat': true }
			);

			strictEqual(await getIsDefaultRule('echo hello'), true, 'String pattern matching default');
			strictEqual(await getIsDefaultRule('ls -la'), false, 'Regex pattern user-defined');
		});

		test('should handle command line rules with isDefaultRule', async () => {
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

		test('should handle command line rules with different matchCommandLine values', async () => {
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

		test('should handle boolean vs object format consistency', async () => {
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

			strictEqual(await getIsDefaultRule('echo hello'), true, 'Boolean format matching - should be default');
			strictEqual(getCommandLineIsDefaultRule('ls -la'), true, 'Object format matching using structural equality - should be default');
		});

		test('should return undefined for noMatch cases', async () => {
			setAutoApproveWithDefaults(
				{ 'echo': true },
				{ 'cat': true }
			);

			strictEqual(await getIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
			strictEqual(getCommandLineIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
		});

		test('should handle empty configurations', async () => {
			setAutoApproveWithDefaults(
				{},
				{}
			);

			strictEqual(await getIsDefaultRule('echo hello'), undefined);
			strictEqual(getCommandLineIsDefaultRule('echo hello'), undefined);
		});

		test('should handle only default config with no user overrides', async () => {
			setAutoApproveWithDefaults(
				{},
				{ 'echo': true, 'ls': false }
			);

			strictEqual(await getIsDefaultRule('echo hello'), true, 'Commands in default config should be marked as default rules even with empty user config');
			strictEqual(await getIsDefaultRule('ls -la'), true, 'Commands in default config should be marked as default rules even with empty user config');
		});

		test('should handle complex nested object rules', async () => {
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

		test('should handle PowerShell case-insensitive matching with defaults', async () => {
			shell = 'pwsh';
			os = OperatingSystem.Windows;

			setAutoApproveWithDefaults(
				{ 'Get-Process': true },
				{ 'Get-Process': true }
			);

			strictEqual(await getIsDefaultRule('Get-Process'), true, 'Case-insensitive PowerShell command matching default');
			strictEqual(await getIsDefaultRule('get-process'), true, 'Case-insensitive PowerShell command matching default');
			strictEqual(await getIsDefaultRule('GET-PROCESS'), true, 'Case-insensitive PowerShell command matching default');
		});

		test('should use structural equality for object comparison', async () => {
			// Test that objects with same content but different instances are treated as equal
			const userConfig = { 'test': { approve: true, matchCommandLine: true } };
			const defaultConfig = { 'test': { approve: true, matchCommandLine: true } };

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(getCommandLineIsDefaultRule('test command'), true, 'Even though userConfig and defaultConfig are different object instances, they have the same structure and values, so should be considered default');
		});

		test('should detect structural differences in objects', async () => {
			const userConfig = { 'test': { approve: true, matchCommandLine: true } };
			const defaultConfig = { 'test': { approve: true, matchCommandLine: false } };

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(getCommandLineIsDefaultRule('test command'), false, 'Objects have different matchCommandLine values, so should be user-defined');
		});

		test('should handle mixed types correctly', async () => {
			const userConfig = {
				'cmd1': true,
				'cmd2': { approve: false, matchCommandLine: true }
			};
			const defaultConfig = {
				'cmd1': true,
				'cmd2': { approve: false, matchCommandLine: true }
			};

			setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);

			strictEqual(await getIsDefaultRule('cmd1 arg'), true, 'Boolean type should match default');
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

		test('should include default rules when ignoreDefaultAutoApproveRules is false (default behavior)', async () => {
			setAutoApproveWithDefaults(
				{ 'ls': true },
				{ 'echo': true, 'cat': true }
			);
			setIgnoreDefaultAutoApproveRules(false);

			ok(await isAutoApproved('ls -la'), 'User-defined rule should work');
			ok(await isAutoApproved('echo hello'), 'Default rule should work when not ignored');
			ok(await isAutoApproved('cat file.txt'), 'Default rule should work when not ignored');
		});

		test('should exclude default rules when ignoreDefaultAutoApproveRules is true', async () => {
			setAutoApproveWithDefaults(
				{ 'ls': true },
				{ 'echo': true, 'cat': true }
			);
			setIgnoreDefaultAutoApproveRules(true);

			ok(await isAutoApproved('ls -la'), 'User-defined rule should still work');
			ok(!await isAutoApproved('echo hello'), 'Default rule should be ignored');
			ok(!await isAutoApproved('cat file.txt'), 'Default rule should be ignored');
		});
	});
});
