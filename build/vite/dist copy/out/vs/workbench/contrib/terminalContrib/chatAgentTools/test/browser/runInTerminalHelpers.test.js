/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { generateAutoApproveActions, TRUNCATION_MESSAGE, dedupeRules, isPowerShell, sanitizeTerminalOutput, truncateOutputKeepingTail, extractCdPrefix, normalizeTerminalCommandForDisplay } from '../../browser/runInTerminalHelpers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isAutoApproveRule } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
suite('isPowerShell', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('PowerShell executables', () => {
        test('should detect powershell.exe', () => {
            ok(isPowerShell('powershell.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('powershell', 3 /* OperatingSystem.Linux */));
        });
        test('should detect pwsh.exe', () => {
            ok(isPowerShell('pwsh.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('pwsh', 3 /* OperatingSystem.Linux */));
        });
        test('should detect powershell-preview', () => {
            ok(isPowerShell('powershell-preview.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('powershell-preview', 3 /* OperatingSystem.Linux */));
        });
        test('should detect pwsh-preview', () => {
            ok(isPowerShell('pwsh-preview.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('pwsh-preview', 3 /* OperatingSystem.Linux */));
        });
    });
    suite('PowerShell with full paths', () => {
        test('should detect Windows PowerShell with full path', () => {
            ok(isPowerShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should detect PowerShell Core with full path', () => {
            ok(isPowerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should detect PowerShell on Linux/macOS with full path', () => {
            ok(isPowerShell('/usr/bin/pwsh', 3 /* OperatingSystem.Linux */));
        });
        test('should detect PowerShell preview with full path', () => {
            ok(isPowerShell('/opt/microsoft/powershell/7-preview/pwsh-preview', 3 /* OperatingSystem.Linux */));
        });
        test('should detect nested path with powershell', () => {
            ok(isPowerShell('/some/deep/path/to/powershell.exe', 1 /* OperatingSystem.Windows */));
        });
    });
    suite('Case sensitivity', () => {
        test('should detect PowerShell regardless of case', () => {
            ok(isPowerShell('PowerShell.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('POWERSHELL.EXE', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('Pwsh.exe', 1 /* OperatingSystem.Windows */));
        });
    });
    suite('Non-PowerShell shells', () => {
        test('should not detect bash', () => {
            ok(!isPowerShell('bash', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect zsh', () => {
            ok(!isPowerShell('zsh', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect sh', () => {
            ok(!isPowerShell('sh', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect fish', () => {
            ok(!isPowerShell('fish', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect cmd.exe', () => {
            ok(!isPowerShell('cmd.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should not detect command.com', () => {
            ok(!isPowerShell('command.com', 1 /* OperatingSystem.Windows */));
        });
        test('should not detect dash', () => {
            ok(!isPowerShell('dash', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect tcsh', () => {
            ok(!isPowerShell('tcsh', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect csh', () => {
            ok(!isPowerShell('csh', 3 /* OperatingSystem.Linux */));
        });
    });
    suite('Non-PowerShell shells with full paths', () => {
        test('should not detect bash with full path', () => {
            ok(!isPowerShell('/bin/bash', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect zsh with full path', () => {
            ok(!isPowerShell('/usr/bin/zsh', 3 /* OperatingSystem.Linux */));
        });
        test('should not detect cmd.exe with full path', () => {
            ok(!isPowerShell('C:\\Windows\\System32\\cmd.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should not detect git bash', () => {
            ok(!isPowerShell('C:\\Program Files\\Git\\bin\\bash.exe', 1 /* OperatingSystem.Windows */));
        });
    });
    suite('Edge cases', () => {
        test('should handle empty string', () => {
            ok(!isPowerShell('', 1 /* OperatingSystem.Windows */));
        });
        test('should handle paths with spaces', () => {
            ok(isPowerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 1 /* OperatingSystem.Windows */));
            ok(!isPowerShell('C:\\Program Files\\Git\\bin\\bash.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should not match partial strings', () => {
            ok(!isPowerShell('notpowershell', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('powershellish', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('mypwsh', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('pwshell', 3 /* OperatingSystem.Linux */));
        });
        test('should handle strings containing powershell but not as basename', () => {
            ok(!isPowerShell('/powershell/bin/bash', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('/usr/pwsh/bin/zsh', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('C:\\powershell\\cmd.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should handle special characters in path', () => {
            ok(isPowerShell('/path/with-dashes/pwsh.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('/path/with_underscores/powershell', 3 /* OperatingSystem.Linux */));
            ok(isPowerShell('C:\\path\\with spaces\\pwsh.exe', 1 /* OperatingSystem.Windows */));
        });
        test('should handle relative paths', () => {
            ok(isPowerShell('./powershell.exe', 1 /* OperatingSystem.Windows */));
            ok(isPowerShell('../bin/pwsh', 3 /* OperatingSystem.Linux */));
            ok(isPowerShell('bin/powershell', 3 /* OperatingSystem.Linux */));
        });
        test('should not match similar named tools', () => {
            ok(!isPowerShell('powertool', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('shell', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('power', 3 /* OperatingSystem.Linux */));
            ok(!isPowerShell('pwshconfig', 3 /* OperatingSystem.Linux */));
        });
    });
});
suite('dedupeRules', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockRule(sourceText) {
        return {
            regex: new RegExp(sourceText),
            regexCaseInsensitive: new RegExp(sourceText, 'i'),
            sourceText,
            sourceTarget: 2 /* ConfigurationTarget.USER */,
            isDefaultRule: false
        };
    }
    function createMockResult(result, reason, rule) {
        return {
            result,
            reason,
            rule
        };
    }
    function getSourceText(result) {
        return isAutoApproveRule(result.rule) ? result.rule.sourceText : undefined;
    }
    test('should return empty array for empty input', () => {
        const result = dedupeRules([]);
        strictEqual(result.length, 0);
    });
    test('should return same array when no duplicates exist', () => {
        const result = dedupeRules([
            createMockResult('approved', 'approved by echo rule', createMockRule('echo')),
            createMockResult('approved', 'approved by ls rule', createMockRule('ls'))
        ]);
        strictEqual(result.length, 2);
        strictEqual(getSourceText(result[0]), 'echo');
        strictEqual(getSourceText(result[1]), 'ls');
    });
    test('should deduplicate rules with same sourceText', () => {
        const result = dedupeRules([
            createMockResult('approved', 'approved by echo rule', createMockRule('echo')),
            createMockResult('approved', 'approved by echo rule again', createMockRule('echo')),
            createMockResult('approved', 'approved by ls rule', createMockRule('ls'))
        ]);
        strictEqual(result.length, 2);
        strictEqual(getSourceText(result[0]), 'echo');
        strictEqual(getSourceText(result[1]), 'ls');
    });
    test('should preserve first occurrence when deduplicating', () => {
        const result = dedupeRules([
            createMockResult('approved', 'first echo rule', createMockRule('echo')),
            createMockResult('approved', 'second echo rule', createMockRule('echo'))
        ]);
        strictEqual(result.length, 1);
        strictEqual(result[0].reason, 'first echo rule');
    });
    test('should filter out results without rules', () => {
        const result = dedupeRules([
            createMockResult('noMatch', 'no rule applied'),
            createMockResult('approved', 'approved by echo rule', createMockRule('echo')),
            createMockResult('denied', 'denied without rule')
        ]);
        strictEqual(result.length, 1);
        strictEqual(getSourceText(result[0]), 'echo');
    });
    test('should handle mix of rules and no-rule results with duplicates', () => {
        const result = dedupeRules([
            createMockResult('approved', 'approved by echo rule', createMockRule('echo')),
            createMockResult('noMatch', 'no rule applied'),
            createMockResult('approved', 'approved by echo rule again', createMockRule('echo')),
            createMockResult('approved', 'approved by ls rule', createMockRule('ls')),
            createMockResult('denied', 'denied without rule')
        ]);
        strictEqual(result.length, 2);
        strictEqual(getSourceText(result[0]), 'echo');
        strictEqual(getSourceText(result[1]), 'ls');
    });
    test('should handle multiple duplicates of same rule', () => {
        const result = dedupeRules([
            createMockResult('approved', 'npm rule 1', createMockRule('npm')),
            createMockResult('approved', 'npm rule 2', createMockRule('npm')),
            createMockResult('approved', 'npm rule 3', createMockRule('npm')),
            createMockResult('approved', 'git rule', createMockRule('git'))
        ]);
        strictEqual(result.length, 2);
        strictEqual(getSourceText(result[0]), 'npm');
        strictEqual(result[0].reason, 'npm rule 1');
        strictEqual(getSourceText(result[1]), 'git');
    });
});
suite('truncateOutputKeepingTail', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns original when below limit', () => {
        const output = 'short output';
        strictEqual(truncateOutputKeepingTail(output, 100), output);
    });
    test('keeps tail and adds message when above limit', () => {
        const output = 'a'.repeat(200);
        const result = truncateOutputKeepingTail(output, 120);
        ok(result.startsWith(TRUNCATION_MESSAGE));
        strictEqual(result.length, 120);
    });
    test('gracefully handles tiny limits', () => {
        const result = truncateOutputKeepingTail('example', 5);
        strictEqual(result.length, 5);
    });
});
suite('sanitizeTerminalOutput', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('adds truncation notice when exceeding max length', () => {
        const longOutput = 'line\n'.repeat(20000);
        const result = sanitizeTerminalOutput(longOutput);
        ok(result.startsWith(TRUNCATION_MESSAGE));
        ok(result.endsWith('line'));
    });
});
suite('normalizeTerminalCommandForDisplay', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('removes escaped single and double quotes', () => {
        const input = 'git rev-parse \\\'stash@{0}\\\' && echo \\\"done\\\"';
        strictEqual(normalizeTerminalCommandForDisplay(input), 'git rev-parse \'stash@{0}\' && echo "done"');
    });
    test('normalizes escaped forward slashes', () => {
        const input = 'echo \\/Users\\/me\\/project';
        strictEqual(normalizeTerminalCommandForDisplay(input), 'echo /Users/me/project');
    });
    test('preserves non-quote escapes', () => {
        const input = 'echo path\\ with\\ spaces';
        strictEqual(normalizeTerminalCommandForDisplay(input), input);
    });
});
suite('generateAutoApproveActions', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockRule(sourceText) {
        // Escape special regex characters for test purposes to prevent regex errors
        const escapedText = sourceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
            regex: new RegExp(escapedText),
            regexCaseInsensitive: new RegExp(escapedText, 'i'),
            sourceText,
            sourceTarget: 2 /* ConfigurationTarget.USER */,
            isDefaultRule: false
        };
    }
    function createMockResult(result, reason, rule) {
        return {
            result,
            reason,
            rule
        };
    }
    test('should suggest mvn test when command is mvn test', () => {
        const commandLine = 'mvn test';
        const subCommands = ['mvn test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('mvn test'));
        ok(subCommandAction, 'Should suggest mvn test approval');
    });
    test('should suggest mvn -DskipIT test when flags appear before subcommand', () => {
        const commandLine = 'mvn -DskipIT test';
        const subCommands = ['mvn -DskipIT test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('mvn -DskipIT test'));
        ok(subCommandAction, 'Should suggest mvn -DskipIT test approval (including flags)');
    });
    test('should suggest mvn -X -DskipIT test when multiple flags appear before subcommand', () => {
        const commandLine = 'mvn -X -DskipIT test';
        const subCommands = ['mvn -X -DskipIT test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('mvn -X -DskipIT test'));
        ok(subCommandAction, 'Should suggest mvn -X -DskipIT test approval with multiple flags');
    });
    test('should suggest gradle --info build when flags appear before subcommand', () => {
        const commandLine = 'gradle --info build';
        const subCommands = ['gradle --info build'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('gradle --info build'));
        ok(subCommandAction, 'Should suggest gradle --info build approval');
    });
    test('should suggest npm --silent run test when flags appear before subcommand', () => {
        const commandLine = 'npm --silent run test';
        const subCommands = ['npm --silent run test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('npm --silent run test'));
        ok(subCommandAction, 'Should suggest npm --silent run test approval (sub-sub-command with flags)');
    });
    test('should suggest npm --silent run --verbose test when flags appear between subcommands', () => {
        const commandLine = 'npm --silent run --verbose test';
        const subCommands = ['npm --silent run --verbose test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('npm --silent run --verbose test'));
        ok(subCommandAction, 'Should suggest npm --silent run --verbose test with flags between subcommands');
    });
    test('should not suggest approval when only flags and no subcommand', () => {
        const commandLine = 'mvn -X -DskipIT';
        const subCommands = ['mvn -X -DskipIT'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('Always Allow Command:') && action.label.includes('mvn'));
        strictEqual(subCommandAction, undefined, 'Should not suggest mvn approval when no subcommand found');
    });
    test('should suggest exact command line when subcommand cannot be extracted', () => {
        const commandLine = 'mvn -X -DskipIT';
        const subCommands = ['mvn -X -DskipIT'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('noMatch', 'not approved')],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const exactCommandAction = actions.find(action => action.label.includes('Always Allow Exact Command Line'));
        ok(exactCommandAction, 'Should suggest exact command line approval');
    });
    test('should handle multiple subcommands with flags', () => {
        const commandLine = 'mvn -DskipIT test && gradle --info build';
        const subCommands = ['mvn -DskipIT test', 'gradle --info build'];
        const autoApproveResult = {
            subCommandResults: [
                createMockResult('noMatch', 'not approved'),
                createMockResult('noMatch', 'not approved')
            ],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('mvn -DskipIT test') && action.label.includes('gradle --info build'));
        ok(subCommandAction, 'Should suggest both mvn -DskipIT test and gradle --info build');
    });
    test('should not suggest when commands are denied', () => {
        const commandLine = 'mvn -DskipIT test';
        const subCommands = ['mvn -DskipIT test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('denied', 'denied by rule', createMockRule('mvn test'))],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('Always Allow Command:'));
        strictEqual(subCommandAction, undefined, 'Should not suggest approval for denied commands');
    });
    test('should not suggest when commands are already approved', () => {
        const commandLine = 'mvn -DskipIT test';
        const subCommands = ['mvn -DskipIT test'];
        const autoApproveResult = {
            subCommandResults: [createMockResult('approved', 'approved by rule', createMockRule('mvn test'))],
            commandLineResult: createMockResult('noMatch', 'not approved')
        };
        const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
        const subCommandAction = actions.find(action => action.label.includes('mvn -DskipIT test') && action.label.includes('Always Allow Command:'));
        strictEqual(subCommandAction, undefined, 'Should not suggest approval for already approved commands');
    });
});
suite('extractCdPrefix', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('Posix', () => {
        function t(commandLine, expectedDir, expectedCommand) {
            const result = extractCdPrefix(commandLine, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result?.directory, expectedDir);
            strictEqual(result?.command, expectedCommand);
        }
        test('should return undefined when no cd prefix', () => t('echo hello', undefined, undefined));
        test('should return undefined when cd has no suffix', () => t('cd /some/path', undefined, undefined));
        test('should extract cd prefix with && separator', () => t('cd /some/path && npm install', '/some/path', 'npm install'));
        test('should extract quoted path', () => t('cd "/some/path" && npm install', '/some/path', 'npm install'));
        test('should extract complex suffix', () => t('cd /path && npm install && npm test', '/path', 'npm install && npm test'));
        suite('unsupported patterns', () => {
            test('should return undefined for path with escaped space', () => t('cd /some/path\ with\ spaces && npm install', undefined, undefined));
        });
    });
    suite('PowerShell', () => {
        function t(commandLine, expectedDir, expectedCommand) {
            const result = extractCdPrefix(commandLine, 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result?.directory, expectedDir);
            strictEqual(result?.command, expectedCommand);
        }
        test('should extract cd with ; separator', () => t('cd C:\\path; npm test', 'C:\\path', 'npm test'));
        test('should extract cd /d with && separator', () => t('cd /d C:\\path && echo hello', 'C:\\path', 'echo hello'));
        test('should extract Set-Location', () => t('Set-Location C:\\path; npm test', 'C:\\path', 'npm test'));
        test('should extract Set-Location -Path', () => t('Set-Location -Path C:\\path; npm test', 'C:\\path', 'npm test'));
        suite('unsupported patterns', () => {
            test('should return undefined for quoted path with spaces', () => t('cd "C:\\path with spaces"; npm test', undefined, undefined));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuSW5UZXJtaW5hbEhlbHBlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcnVuSW5UZXJtaW5hbEhlbHBlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxzQkFBc0IsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUxTyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUd0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQXlCLE1BQU0sZ0VBQWdFLENBQUM7QUFFMUgsS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7SUFDMUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ3BDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsRUFBRSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0Isa0NBQTBCLENBQUMsQ0FBQztZQUM1RCxFQUFFLENBQUMsWUFBWSxDQUFDLFlBQVksZ0NBQXdCLENBQUMsQ0FBQztRQUN2RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7WUFDbkMsRUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLGtDQUEwQixDQUFDLENBQUM7WUFDdEQsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLGdDQUF3QixDQUFDLENB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