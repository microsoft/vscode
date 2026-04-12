/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ok, strictEqual } from 'assert';
import { CommandLineAutoApprover } from '../../browser/tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js';
import { isAutoApproveRule } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
suite('CommandLineAutoApprover', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let commandLineAutoApprover;
    let shell;
    let os;
    setup(() => {
        configurationService = new TestConfigurationService();
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService
        }, store);
        shell = 'bash';
        os = 3 /* OperatingSystem.Linux */;
        commandLineAutoApprover = store.add(instantiationService.createInstance(CommandLineAutoApprover));
    });
    function setAutoApprove(value) {
        setConfig("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, value);
    }
    function setAutoApproveWithCommandLine(value) {
        setConfig("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, value);
    }
    function setConfig(key, value) {
        configurationService.setUserConfiguration(key, value);
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: () => true,
            affectedKeys: new Set([key]),
            source: 2 /* ConfigurationTarget.USER */,
            change: null,
        });
    }
    async function isAutoApproved(commandLine) {
        return (await commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os, undefined)).result === 'approved';
    }
    function isCommandLineAutoApproved(commandLine) {
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
                    '/^echo.*/s': true, // dotall flag
                    '/^git\\s+/i': true, // case-insensitive flag
                    '/rm|del/g': false // global flag
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
                '/*/': true, // Invalid regex pattern
                '/.**/': true // Invalid regex pattern
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
                '/^echo/': true, // Valid pattern
                '//': true, // Empty pattern
                '/^ls/': true, // Valid pattern
                '/a*/': true, // Potential endless loop
                'pwd': true // Valid string pattern
            });
            ok(await isAutoApproved('echo hello'));
            ok(await isAutoApproved('ls -la'));
            ok(await isAutoApproved('pwd'));
            ok(!await isAutoApproved('rm file'));
        });
        test('should handle invalid regex patterns gracefully', async () => {
            setAutoApprove({
                '/*/': true, // Invalid regex - nothing to repeat
                '/(?:+/': true, // Invalid regex - incomplete quantifier
                '/[/': true, // Invalid regex - unclosed character class
                '/^echo/': true, // Valid pattern
                'ls': true // Valid string pattern
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
                'echo': true, // Not a path
                'ls': true, // Not a path
                'git': true // Not a path
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
                'bin/foo\\bar': true // Mixed separators in config
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
            for (const currnetOS of [1 /* OperatingSystem.Windows */, 3 /* OperatingSystem.Linux */, 2 /* OperatingSystem.Macintosh */]) {
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
                'echo': true, // Regular pattern
                'ls': { approve: true, matchCommandLine: true }, // Command line pattern
                'rm': { approve: true, matchCommandLine: false } // Explicit regular pattern
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
                '/*/': { approve: true, matchCommandLine: true }, // Invalid regex pattern
                '/.**/': { approve: true, matchCommandLine: true } // Invalid regex pattern
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
                '/^echo/': { approve: true, matchCommandLine: true }, // Valid pattern
                '//': { approve: true, matchCommandLine: true }, // Empty pattern
                '/^ls/': { approve: true, matchCommandLine: true }, // Valid pattern
                '/a*/': { approve: true, matchCommandLine: true }, // Potential endless loop
                'pwd': { approve: true, matchCommandLine: true } // Valid string pattern
            });
            ok(isCommandLineAutoApproved('echo hello'));
            ok(isCommandLineAutoApproved('ls -la'));
            ok(isCommandLineAutoApproved('pwd'));
            ok(!isCommandLineAutoApproved('rm file'));
        });
        test('should handle invalid regex patterns with matchCommandLine gracefully', async () => {
            setAutoApproveWithCommandLine({
                '/*/': { approve: true, matchCommandLine: true }, // Invalid regex - nothing to repeat
                '/(?:+/': { approve: true, matchCommandLine: true }, // Invalid regex - incomplete quantifier
                '/[/': { approve: true, matchCommandLine: true }, // Invalid regex - unclosed character class
                '/^echo/': { approve: true, matchCommandLine: true }, // Valid pattern
                'ls': { approve: true, matchCommandLine: true } // Valid string pattern
            });
            // Valid patterns should still work
            ok(isCommandLineAutoApproved('echo hello'));
            ok(isCommandLineAutoApproved('ls -la'));
            // Invalid patterns should not match anything and not cause crashes
            ok(!isCommandLineAutoApproved('random command'));
        });
    });
    suite('reasons', () => {
        async function getCommandReason(command) {
            return (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, undefined)).reason;
        }
        function getCommandLineReason(commandLine) {
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
        async function getIsDefaultRule(command) {
            const rule = (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, undefined)).rule;
            return isAutoApproveRule(rule) ? rule.isDefaultRule : undefined;
        }
        function getCommandLineIsDefaultRule(commandLine) {
            const rule = commandLineAutoApprover.isCommandLineAutoApproved(commandLine).rule;
            return isAutoApproveRule(rule) ? rule.isDefaultRule : undefined;
        }
        function setAutoApproveWithDefaults(userConfig, defaultConfig) {
            // Set up mock configuration with default values
            configurationService.setUserConfiguration("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, userConfig);
            // Mock the inspect method to return default values
            const originalInspect = configurationService.inspect;
            const originalGetValue = configurationService.getValue;
            configurationService.inspect = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
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
            configurationService.getValue = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
                    return { ...defaultConfig, ...userConfig };
                }
                return originalGetValue.call(configurationService, key);
            };
            // Trigger configuration update
            configurationService.onDidChangeConfigurationEmitter.fire({
                affectsConfiguration: () => true,
                affectedKeys: new Set(["chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */]),
                source: 2 /* ConfigurationTarget.USER */,
                change: null,
            });
        }
        function setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig) {
            // Set up mock configuration with default values for command line rules
            configurationService.setUserConfiguration("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, userConfig);
            // Mock the inspect method to return default values
            const originalInspect = configurationService.inspect;
            const originalGetValue = configurationService.getValue;
            configurationService.inspect = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
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
            configurationService.getValue = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
                    return { ...defaultConfig, ...userConfig };
                }
                return originalGetValue.call(configurationService, key);
            };
            // Trigger configuration update
            configurationService.onDidChangeConfigurationEmitter.fire({
                affectsConfiguration: () => true,
                affectedKeys: new Set(["chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */]),
                source: 2 /* ConfigurationTarget.USER */,
                change: null,
            });
        }
        test('should correctly identify default rules vs user-defined rules', async () => {
            setAutoApproveWithDefaults({ 'echo': true, 'ls': true, 'pwd': false }, { 'echo': true, 'cat': true });
            strictEqual(await getIsDefaultRule('echo hello'), true, 'echo is in both default and user config with same value - should be marked as default');
            strictEqual(await getIsDefaultRule('ls -la'), false, 'ls is only in user config - should be marked as user-defined');
            strictEqual(await getIsDefaultRule('pwd'), false, 'pwd is only in user config - should be marked as user-defined');
            strictEqual(await getIsDefaultRule('cat file.txt'), true, 'cat is in both default and user config with same value - should be marked as default');
        });
        test('should mark as default when command is only in default config but not in user config', async () => {
            setAutoApproveWithDefaults({ 'echo': true, 'ls': true }, // User config (cat is NOT here)
            { 'echo': true, 'cat': true } // Default config (cat IS here)
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
            setAutoApproveWithDefaults({ 'echo': true, 'rm': true }, { 'echo': false, 'rm': true });
            strictEqual(await getIsDefaultRule('echo hello'), false, 'echo has different values in default vs user - should be marked as user-defined');
            strictEqual(await getIsDefaultRule('rm file.txt'), true, 'rm has same value in both - should be marked as default');
        });
        test('should handle regex patterns as default rules', async () => {
            setAutoApproveWithDefaults({ '/^git/': true, '/^npm/': false }, { '/^git/': true, '/^docker/': true });
            strictEqual(await getIsDefaultRule('git status'), true, 'git pattern matches default - should be marked as default');
            strictEqual(await getIsDefaultRule('npm install'), false, 'npm pattern is user-only - should be marked as user-defined');
        });
        test('should handle mixed string and regex patterns', async () => {
            setAutoApproveWithDefaults({ 'echo': true, '/^ls/': false }, { 'echo': true, 'cat': true });
            strictEqual(await getIsDefaultRule('echo hello'), true, 'String pattern matching default');
            strictEqual(await getIsDefaultRule('ls -la'), false, 'Regex pattern user-defined');
        });
        test('should handle command line rules with isDefaultRule', async () => {
            setAutoApproveWithDefaultsCommandLine({
                'echo': { approve: true, matchCommandLine: true },
                'ls': { approve: false, matchCommandLine: true }
            }, {
                'echo': { approve: true, matchCommandLine: true },
                'cat': { approve: true, matchCommandLine: true }
            });
            strictEqual(getCommandLineIsDefaultRule('echo hello world'), true, 'echo matches default config exactly using structural equality - should be marked as default');
            strictEqual(getCommandLineIsDefaultRule('ls -la'), false, 'ls is user-defined only - should be marked as user-defined');
        });
        test('should handle command line rules with different matchCommandLine values', async () => {
            setAutoApproveWithDefaultsCommandLine({
                'echo': { approve: true, matchCommandLine: true },
                'ls': { approve: true, matchCommandLine: false }
            }, {
                'echo': { approve: true, matchCommandLine: false },
                'ls': { approve: true, matchCommandLine: false }
            });
            strictEqual(getCommandLineIsDefaultRule('echo hello'), false, 'echo has different matchCommandLine value - should be user-defined');
            strictEqual(getCommandLineIsDefaultRule('ls -la'), undefined, 'ls matches exactly - should be default (but won\'t match command line check since matchCommandLine is false)');
        });
        test('should handle boolean vs object format consistency', async () => {
            setAutoApproveWithDefaultsCommandLine({
                'echo': true,
                'ls': { approve: true, matchCommandLine: true }
            }, {
                'echo': true,
                'ls': { approve: true, matchCommandLine: true }
            });
            strictEqual(await getIsDefaultRule('echo hello'), true, 'Boolean format matching - should be default');
            strictEqual(getCommandLineIsDefaultRule('ls -la'), true, 'Object format matching using structural equality - should be default');
        });
        test('should return undefined for noMatch cases', async () => {
            setAutoApproveWithDefaults({ 'echo': true }, { 'cat': true });
            strictEqual(await getIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
            strictEqual(getCommandLineIsDefaultRule('unknown-command'), undefined, 'Command that matches neither user nor default config');
        });
        test('should handle empty configurations', async () => {
            setAutoApproveWithDefaults({}, {});
            strictEqual(await getIsDefaultRule('echo hello'), undefined);
            strictEqual(getCommandLineIsDefaultRule('echo hello'), undefined);
        });
        test('should handle only default config with no user overrides', async () => {
            setAutoApproveWithDefaults({}, { 'echo': true, 'ls': false });
            strictEqual(await getIsDefaultRule('echo hello'), true, 'Commands in default config should be marked as default rules even with empty user config');
            strictEqual(await getIsDefaultRule('ls -la'), true, 'Commands in default config should be marked as default rules even with empty user config');
        });
        test('should handle complex nested object rules', async () => {
            setAutoApproveWithDefaultsCommandLine({
                'npm': { approve: true, matchCommandLine: true },
                'git': { approve: false, matchCommandLine: false }
            }, {
                'npm': { approve: true, matchCommandLine: true },
                'docker': { approve: true, matchCommandLine: true }
            });
            strictEqual(getCommandLineIsDefaultRule('npm install'), true, 'npm matches default exactly using structural equality - should be default');
            strictEqual(getCommandLineIsDefaultRule('git status'), undefined, 'git is user-defined - should be user-defined (but won\'t match command line since matchCommandLine is false)');
        });
        test('should handle PowerShell case-insensitive matching with defaults', async () => {
            shell = 'pwsh';
            os = 1 /* OperatingSystem.Windows */;
            setAutoApproveWithDefaults({ 'Get-Process': true }, { 'Get-Process': true });
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
        function setAutoApproveWithDefaults(userConfig, defaultConfig) {
            // Set up mock configuration with default values
            configurationService.setUserConfiguration("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, userConfig);
            // Mock the inspect method to return default values
            const originalInspect = configurationService.inspect;
            const originalGetValue = configurationService.getValue;
            configurationService.inspect = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
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
            configurationService.getValue = (key) => {
                if (key === "chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) {
                    return { ...defaultConfig, ...userConfig };
                }
                return originalGetValue.call(configurationService, key);
            };
            // Trigger configuration update
            configurationService.onDidChangeConfigurationEmitter.fire({
                affectsConfiguration: () => true,
                affectedKeys: new Set(["chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */]),
                source: 2 /* ConfigurationTarget.USER */,
                change: null,
            });
        }
        function setIgnoreDefaultAutoApproveRules(value) {
            setConfig("chat.tools.terminal.ignoreDefaultAutoApproveRules" /* TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules */, value);
        }
        test('should include default rules when ignoreDefaultAutoApproveRules is false (default behavior)', async () => {
            setAutoApproveWithDefaults({ 'ls': true }, { 'echo': true, 'cat': true });
            setIgnoreDefaultAutoApproveRules(false);
            ok(await isAutoApproved('ls -la'), 'User-defined rule should work');
            ok(await isAutoApproved('echo hello'), 'Default rule should work when not ignored');
            ok(await isAutoApproved('cat file.txt'), 'Default rule should work when not ignored');
        });
        test('should exclude default rules when ignoreDefaultAutoApproveRules is true', async () => {
            setAutoApproveWithDefaults({ 'ls': true }, { 'echo': true, 'cat': true });
            setIgnoreDefaultAutoApproveRules(true);
            ok(await isAutoApproved('ls -la'), 'User-defined rule should still work');
            ok(!await isAutoApproved('echo hello'), 'Default rule should be ignored');
            ok(!await isAutoApproved('cat file.txt'), 'Default rule should be ignored');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVBdXRvQXBwcm92ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvY29tbWFuZExpbmVBdXRvQXBwcm92ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUU1SCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUdyRyxPQUFPLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnRkFBZ0YsQ0FBQztBQUN6SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVuRyxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxvQkFBMkMsQ0FBQztJQUNoRCxJQUFJLG9CQUE4QyxDQUFDO0lBRW5ELElBQUksdUJBQWdELENBQUM7SUFDckQsSUFBSSxLQUFhLENBQUM7SUFDbEIsSUFBSSxFQUFtQixDQUFDO0lBRXhCLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7UUFDdEQsb0JBQW9CLEdBQUcsNkJBQTZCLENBQUM7WUFDcEQsb0JBQW9CLEVBQUUsR0FBRyxFQUFFLENBQUMsb0JBQW9CO1NBQ2hELEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFVixLQUFLLEdBQUcsTUFB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