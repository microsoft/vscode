/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { Schemas } from '../../../../../../../base/common/network.js';
import { isWindows } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TreeSitterLibraryService } from '../../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import { CommandLineFileWriteAnalyzer } from '../../../browser/tools/commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { TreeSitterCommandParser } from '../../../browser/treeSitterCommandParser.js';
suite('CommandLineFileWriteAnalyzer', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let parser;
    let analyzer;
    let configurationService;
    let workspaceContextService;
    const mockLog = (..._args) => { };
    setup(() => {
        const fileService = store.add(new FileService(new NullLogService()));
        const fileSystemProvider = new TestIPCFileSystemProvider();
        store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        configurationService = new TestConfigurationService();
        workspaceContextService = new TestContextService();
        instantiationService = workbenchInstantiationService({
            fileService: () => fileService,
            configurationService: () => configurationService
        }, store);
        instantiationService.stub(IWorkspaceContextService, workspaceContextService);
        const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
        treeSitterLibraryService.isTest = true;
        instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
        parser = store.add(instantiationService.createInstance(TreeSitterCommandParser));
        analyzer = store.add(instantiationService.createInstance(CommandLineFileWriteAnalyzer, parser, mockLog));
    });
    (isWindows ? suite.skip : suite)('bash', () => {
        const cwd = URI.file('/workspace/project');
        async function t(commandLine, blockDetectedFileWrites, expectedAutoApprove, expectedDisclaimers = 0, workspaceFolders = [cwd]) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, blockDetectedFileWrites);
            // Setup workspace folders
            const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
            strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
        }
        suite('blockDetectedFileWrites: never', () => {
            test('relative path - simple output redirection', () => t('echo hello > file.txt', 'never', true, 1));
            test('relative path - append redirection', () => t('echo hello >> file.txt', 'never', true, 1));
            test('relative paths - multiple redirections', () => t('echo hello > file1.txt && echo world > file2.txt', 'never', true, 1));
            test('relative path - error redirection', () => t('cat missing.txt 2> error.log', 'never', true, 1));
            test('no redirections', () => t('echo hello', 'never', true, 0));
            test('absolute path - /dev/null allowed with never', () => t('echo hello > /dev/null', 'never', true, 1));
        });
        suite('blockDetectedFileWrites: outsideWorkspace', () => {
            // Relative paths (joined with cwd)
            test('relative path - file in workspace root - allow', () => t('echo hello > file.txt', 'outsideWorkspace', true, 1));
            test('relative path - file in subdirectory - allow', () => t('echo hello > subdir/file.txt', 'outsideWorkspace', true, 1));
            test('relative path - parent directory - block', () => t('echo hello > ../file.txt', 'outsideWorkspace', false, 1));
            test('relative path - grandparent directory - block', () => t('echo hello > ../../file.txt', 'outsideWorkspace', false, 1));
            // Absolute paths (parsed as-is)
            test('absolute path - /tmp - block', () => t('echo hello > /tmp/file.txt', 'outsideWorkspace', false, 1));
            test('absolute path - /etc - block', () => t('echo hello > /etc/config.txt', 'outsideWorkspace', false, 1));
            test('absolute path - /home - block', () => t('echo hello > /home/user/file.txt', 'outsideWorkspace', false, 1));
            test('absolute path - root - block', () => t('echo hello > /file.txt', 'outsideWorkspace', false, 1));
            test('absolute path - /dev/null - allow (null device)', () => t('echo hello > /dev/null', 'outsideWorkspace', true, 1));
            // Special cases
            test('no workspace folders - block', () => t('echo hello > file.txt', 'outsideWorkspace', false, 1, []));
            test('no workspace folders - /dev/null allowed', () => t('echo hello > /dev/null', 'outsideWorkspace', true, 1, []));
            test('no redirections - allow', () => t('echo hello', 'outsideWorkspace', true, 0));
            test('variable in filename - block', () => t('echo hello > $HOME/file.txt', 'outsideWorkspace', false, 1));
            test('command substitution - block', () => t('echo hello > $(pwd)/file.txt', 'outsideWorkspace', false, 1));
            test('brace expansion - block', () => t('echo hello > {a,b}.txt', 'outsideWorkspace', false, 1));
        });
        suite('blockDetectedFileWrites: all', () => {
            test('inside workspace - block', () => t('echo hello > file.txt', 'all', false, 1));
            test('outside workspace - block', () => t('echo hello > /tmp/file.txt', 'all', false, 1));
            test('no redirections - allow', () => t('echo hello', 'all', true, 0));
            test('multiple inside workspace - block', () => t('echo hello > file1.txt && echo world > file2.txt', 'all', false, 1));
        });
        suite('complex scenarios', () => {
            test('pipeline with redirection inside workspace', () => t('cat file.txt | grep "test" > output.txt', 'outsideWorkspace', true, 1));
            test('multiple redirections mixed inside/outside', () => t('echo hello > file.txt && echo world > /tmp/file.txt', 'outsideWorkspace', false, 1));
            test('here-document', () => t('cat > file.txt << EOF\nhello\nEOF', 'outsideWorkspace', true, 1));
            test('error output to /dev/null - allow', () => t('cat missing.txt 2> /dev/null', 'outsideWorkspace', true, 1));
        });
        suite('sed in-place editing', () => {
            // Basic -i flag variants (inside workspace)
            test('sed -i inside workspace - allow', () => t('sed -i \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            test('sed -I (uppercase) inside workspace - allow', () => t('sed -I \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            test('sed --in-place inside workspace - allow', () => t('sed --in-place \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            // Backup suffix variants (inside workspace)
            test('sed -i.bak inside workspace - allow', () => t('sed -i.bak \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            test('sed --in-place=.bak inside workspace - allow', () => t('sed --in-place=.bak \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            test('sed -i with empty backup (macOS) inside workspace - allow', () => t('sed -i \'\' \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            // Combined flags (inside workspace)
            test('sed -ni inside workspace - allow', () => t('sed -ni \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            test('sed -n -i inside workspace - allow', () => t('sed -n -i \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
            // Multiple files (inside workspace)
            test('sed -i multiple files inside workspace - allow', () => t('sed -i \'s/foo/bar/\' file1.txt file2.txt', 'outsideWorkspace', true, 1));
            // Outside workspace
            test('sed -i outside workspace - block', () => t('sed -i \'s/foo/bar/\' /tmp/file.txt', 'outsideWorkspace', false, 1));
            test('sed -i absolute path outside workspace - block', () => t('sed -i \'s/foo/bar/\' /etc/config', 'outsideWorkspace', false, 1));
            test('sed -i mixed inside/outside - block', () => t('sed -i \'s/foo/bar/\' file.txt /tmp/other.txt', 'outsideWorkspace', false, 1));
            // With blockDetectedFileWrites: all
            test('sed -i with all setting - block', () => t('sed -i \'s/foo/bar/\' file.txt', 'all', false, 1));
            // With blockDetectedFileWrites: never
            test('sed -i with never setting - allow', () => t('sed -i \'s/foo/bar/\' file.txt', 'never', true, 1));
            // Without -i flag (should not detect as file write)
            test('sed without -i - no file write detected', () => t('sed \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 0));
            test('sed with pipe - no file write detected', () => t('cat file.txt | sed \'s/foo/bar/\'', 'outsideWorkspace', true, 0));
        });
        suite('no cwd provided', () => {
            async function tNoCwd(commandLine, blockDetectedFileWrites, expectedAutoApprove, expectedDisclaimers = 0) {
                configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, blockDetectedFileWrites);
                const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
                workspaceContextService.setWorkspace(workspace);
                const options = {
                    commandLine,
                    cwd: undefined,
                    shell: 'bash',
                    os: 3 /* OperatingSystem.Linux */,
                    treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                    terminalToolSessionId: 'test',
                    chatSessionResource: undefined,
                };
                const result = await analyzer.analyze(options);
                strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
                strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
            }
            // When cwd is undefined, relative paths remain as strings and are blocked
            test('relative path - never setting - allow', () => tNoCwd('echo hello > file.txt', 'never', true, 1));
            test('relative path - outsideWorkspace setting - block (unknown cwd)', () => tNoCwd('echo hello > file.txt', 'outsideWorkspace', false, 1));
            test('relative path - all setting - block', () => tNoCwd('echo hello > file.txt', 'all', false, 1));
            // Absolute paths are converted to URIs and checked normally
            test('absolute path inside workspace - outsideWorkspace setting - allow', () => tNoCwd('echo hello > /workspace/project/file.txt', 'outsideWorkspace', true, 1));
            test('absolute path outside workspace - outsideWorkspace setting - block', () => tNoCwd('echo hello > /tmp/file.txt', 'outsideWorkspace', false, 1));
            test('absolute path - all setting - block', () => tNoCwd('echo hello > /tmp/file.txt', 'all', false, 1));
        });
    });
    (isWindows ? suite : suite.skip)('pwsh', () => {
        const cwd = URI.file('C:/workspace/project');
        async function t(commandLine, blockDetectedFileWrites, expectedAutoApprove, expectedDisclaimers = 0, workspaceFolders = [cwd]) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, blockDetectedFileWrites);
            // Setup workspace folders
            const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'pwsh',
                os: 1 /* OperatingSystem.Windows */,
                treeSitterLanguage: "powershell" /* TreeSitterCommandParserLanguage.PowerShell */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
            strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
        }
        suite('blockDetectedFileWrites: never', () => {
            test('simple output redirection', () => t('Write-Host "hello" > file.txt', 'never', true, 1));
            test('append redirection', () => t('Write-Host "hello" >> file.txt', 'never', true, 1));
            test('multiple redirections', () => t('Write-Host "hello" > file1.txt ; Write-Host "world" > file2.txt', 'never', true, 1));
            test('error redirection', () => t('Get-Content missing.txt 2> error.log', 'never', true, 1));
            test('no redirections', () => t('Write-Host "hello"', 'never', true, 0));
        });
        suite('blockDetectedFileWrites: outsideWorkspace', () => {
            // Relative paths (joined with cwd)
            test('relative path - file in workspace root - allow', () => t('Write-Host "hello" > file.txt', 'outsideWorkspace', true, 1));
            test('relative path - file in subdirectory - allow', () => t('Write-Host "hello" > subdir\\file.txt', 'outsideWorkspace', true, 1));
            test('relative path - parent directory - block', () => t('Write-Host "hello" > ..\\file.txt', 'outsideWorkspace', false, 1));
            test('relative path - grandparent directory - block', () => t('Write-Host "hello" > ..\\..\\file.txt', 'outsideWorkspace', false, 1));
            // Absolute paths - Windows drive letters (parsed as-is)
            test('absolute path - C: drive - block', () => t('Write-Host "hello" > C:\\temp\\file.txt', 'outsideWorkspace', false, 1));
            test('absolute path - D: drive - block', () => t('Write-Host "hello" > D:\\data\\config.txt', 'outsideWorkspace', false, 1));
            test('absolute path - different drive than workspace - block', () => t('Write-Host "hello" > E:\\external\\file.txt', 'outsideWorkspace', false, 1));
            // Absolute paths - UNC paths
            test('absolute path - UNC path - block', () => t('Write-Host "hello" > \\\\server\\share\\file.txt', 'outsideWorkspace', false, 1));
            // Special cases
            test('no workspace folders - block', () => t('Write-Host "hello" > file.txt', 'outsideWorkspace', false, 1, []));
            test('no redirections - allow', () => t('Write-Host "hello"', 'outsideWorkspace', true, 0));
            test('variable in filename - block', () => t('Write-Host "hello" > $env:TEMP\\file.txt', 'outsideWorkspace', false, 1));
            test('subexpression - block', () => t('Write-Host "hello" > $(Get-Date).log', 'outsideWorkspace', false, 1));
        });
        suite('blockDetectedFileWrites: all', () => {
            test('inside workspace - block', () => t('Write-Host "hello" > file.txt', 'all', false, 1));
            test('outside workspace - block', () => t('Write-Host "hello" > C:\\temp\\file.txt', 'all', false, 1));
            test('no redirections - allow', () => t('Write-Host "hello"', 'all', true, 0));
            test('multiple inside workspace - block', () => t('Write-Host "hello" > file1.txt ; Write-Host "world" > file2.txt', 'all', false, 1));
        });
        suite('complex scenarios', () => {
            test('pipeline with redirection inside workspace', () => t('Get-Process | Where-Object {$_.CPU -gt 100} > processes.txt', 'outsideWorkspace', true, 1));
            test('multiple redirections mixed inside/outside', () => t('Write-Host "hello" > file.txt ; Write-Host "world" > C:\\temp\\file.txt', 'outsideWorkspace', false, 1));
            test('all streams redirection', () => t('Get-Process *> all.log', 'outsideWorkspace', true, 1));
            test('multiple stream redirections', () => t('Get-Content missing.txt > output.txt 2> error.txt 3> warning.txt', 'outsideWorkspace', true, 1));
        });
        suite('edge cases', () => {
            test('redirection to $null (PowerShell null device) - allow', () => t('Write-Host "hello" > $null', 'outsideWorkspace', true, 1));
            test('relative path with backslashes - allow', () => t('Write-Host "hello" > server\\share\\file.txt', 'outsideWorkspace', true, 1));
            test('forward slashes on Windows (relative) - allow', () => t('Write-Host "hello" > subdir/file.txt', 'outsideWorkspace', true, 1));
        });
        suite('quoted file paths', () => {
            // Double-quoted paths
            test('double-quoted relative path inside workspace - allow', () => t('Write-Host "hello" > "file.txt"', 'outsideWorkspace', true, 1));
            test('double-quoted relative path with spaces inside workspace - allow', () => t('Write-Host "hello" > "file with spaces.txt"', 'outsideWorkspace', true, 1));
            test('double-quoted absolute path outside workspace - block', () => t('Write-Host "hello" > "C:\\temp\\file.txt"', 'outsideWorkspace', false, 1));
            test('double-quoted absolute path to different drive - block', () => t('Write-Host "hello" > "D:\\data\\file.txt"', 'outsideWorkspace', false, 1));
            // Single-quoted paths
            test('single-quoted relative path inside workspace - allow', () => t('Write-Host \'hello\' > \'file.txt\'', 'outsideWorkspace', true, 1));
            test('single-quoted relative path with spaces inside workspace - allow', () => t('Write-Host \'hello\' > \'file with spaces.txt\'', 'outsideWorkspace', true, 1));
            test('single-quoted absolute path outside workspace - block', () => t('Write-Host \'hello\' > \'C:\\temp\\file.txt\'', 'outsideWorkspace', false, 1));
            test('single-quoted absolute path to different drive - block', () => t('Write-Host \'hello\' > \'D:\\data\\file.txt\'', 'outsideWorkspace', false, 1));
        });
    });
    suite('disclaimer messages', () => {
        const cwd = URI.file('/workspace/project');
        async function checkDisclaimer(commandLine, blockDetectedFileWrites, expectedContains) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, blockDetectedFileWrites);
            const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            const disclaimers = result.disclaimers || [];
            strictEqual(disclaimers.length > 0, true, 'Expected at least one disclaimer');
            const combinedDisclaimers = disclaimers.join(' ');
            strictEqual(combinedDisclaimers.includes(expectedContains), true, `Expected disclaimer to contain "${expectedContains}" but got: ${combinedDisclaimers}`);
        }
        test('blocked disclaimer - absolute path outside workspace', () => checkDisclaimer('echo hello > /tmp/file.txt', 'outsideWorkspace', 'cannot be auto approved'));
        test('allowed disclaimer - relative path inside workspace', () => checkDisclaimer('echo hello > file.txt', 'outsideWorkspace', 'File write operations detected'));
        test('blocked disclaimer - all setting blocks everything', () => checkDisclaimer('echo hello > file.txt', 'all', 'cannot be auto approved'));
    });
    suite('multiple workspace folders', () => {
        const workspace1 = URI.file('/workspace/project1');
        const workspace2 = URI.file('/workspace/project2');
        async function t(cwd, commandLine, expectedAutoApprove, expectedDisclaimers = 0) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, 'outsideWorkspace');
            const workspace = new Workspace('test', [workspace1, workspace2].map(uri => toWorkspaceFolder(uri)));
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
            strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
        }
        test('relative path in same workspace - allow', () => t(workspace1, 'echo hello > file.txt', true, 1));
        test('absolute path to other workspace - allow', () => t(workspace1, 'echo hello > /workspace/project2/file.txt', true, 1));
        test('absolute path outside all workspaces - block', () => t(workspace1, 'echo hello > /tmp/file.txt', false, 1));
        test('relative path to parent of workspace - block', () => t(workspace1, 'echo hello > ../file.txt', false, 1));
    });
    suite('uri schemes', () => {
        async function t(cwdScheme, cwdAuthority, filePath, expectedAutoApprove) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, 'outsideWorkspace');
            const cwd = URI.from({ scheme: cwdScheme, authority: cwdAuthority, path: '/workspace/project' });
            const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine: `echo hello > ${filePath}`,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove);
        }
        test('file scheme - relative path inside workspace', () => t('file', undefined, 'file.txt', true));
        test('vscode-remote scheme - relative path inside workspace', () => t('vscode-remote', 'wsl+debian', 'file.txt', true));
        test('vscode-remote scheme - absolute path inside workspace', () => t('vscode-remote', 'wsl+debian', '/workspace/project/file.txt', true));
        test('vscode-remote scheme - absolute path outside workspace', () => t('vscode-remote', 'wsl+debian', '/tmp/file.txt', false));
        test('vscode-remote scheme - absolute path to home directory outside workspace', () => t('vscode-remote', 'wsl+debian', '/home/user/file.txt', false));
    });
    suite('quoted file paths', () => {
        const cwd = URI.file('/workspace/project');
        async function t(commandLine, blockDetectedFileWrites, expectedAutoApprove, expectedDisclaimers = 0) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, blockDetectedFileWrites);
            const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
            strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
        }
        // Double-quoted paths
        test('double-quoted relative path inside workspace - allow', () => t('echo hello > "file.txt"', 'outsideWorkspace', true, 1));
        test('double-quoted relative path with spaces inside workspace - allow', () => t('echo hello > "file with spaces.txt"', 'outsideWorkspace', true, 1));
        test('double-quoted absolute path outside workspace - block', () => t('echo hello > "/tmp/file.txt"', 'outsideWorkspace', false, 1));
        test('double-quoted absolute path to home - block', () => t('echo hello > "/home/user/foo.txt"', 'outsideWorkspace', false, 1));
        // Single-quoted paths
        test('single-quoted relative path inside workspace - allow', () => t('echo hello > \'file.txt\'', 'outsideWorkspace', true, 1));
        test('single-quoted relative path with spaces inside workspace - allow', () => t('echo hello > \'file with spaces.txt\'', 'outsideWorkspace', true, 1));
        test('single-quoted absolute path outside workspace - block', () => t('echo hello > \'/tmp/file.txt\'', 'outsideWorkspace', false, 1));
        test('single-quoted absolute path to home - block', () => t('echo hello > \'/home/user/foo.txt\'', 'outsideWorkspace', false, 1));
        // Note: Backticks in bash are command substitution, not quoting, so no tests for backtick-quoted paths
    });
    suite('remote workspace with quoted absolute paths', () => {
        async function t(commandLine, expectedAutoApprove, expectedDisclaimers = 0) {
            configurationService.setUserConfiguration("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, 'outsideWorkspace');
            // Simulate a remote workspace (e.g., WSL)
            const cwd = URI.from({ scheme: 'vscode-remote', authority: 'wsl+debian', path: '/home/user/workspace' });
            const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
            workspaceContextService.setWorkspace(workspace);
            const options = {
                commandLine,
                cwd,
                shell: 'bash',
                os: 3 /* OperatingSystem.Linux */,
                treeSitterLanguage: "bash" /* TreeSitterCommandParserLanguage.Bash */,
                terminalToolSessionId: 'test',
                chatSessionResource: undefined,
            };
            const result = await analyzer.analyze(options);
            strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
            strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
        }
        // These tests verify that absolute paths preserve the remote scheme/authority
        // and are correctly compared against workspace folders
        test('quoted absolute path inside remote workspace - allow', () => t('echo hello > "/home/user/workspace/file.txt"', true, 1));
        test('quoted absolute path outside remote workspace - block', () => t('echo hello > "/home/user/other/file.txt"', false, 1));
        test('quoted absolute path to different home dir - block', () => t('echo hello > "/home/otheruser/file.txt"', false, 1));
        test('quoted absolute path to settings.json - block', () => t('echo hello > "/home/user/.vscode/settings.json"', false, 1));
        test('unquoted absolute path inside remote workspace - allow', () => t('echo hello > /home/user/workspace/file.txt', true, 1));
        test('unquoted absolute path outside remote workspace - block', () => t('echo hello > /home/user/other/file.txt', false, 1));
        test('relative path in remote workspace - allow', () => t('echo hello > file.txt', true, 1));
        test('relative path with subdirectory in remote workspace - allow', () => t('echo hello > subdir/file.txt', true, 1));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lRmlsZVdyaXRlQW5hbHl6ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsU0FBUyxFQUFtQixNQUFNLDhDQUE4QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvRkFBb0YsQ0FBQztBQUMvSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFeEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzFILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUNqRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUNySCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsa0JBQWtC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