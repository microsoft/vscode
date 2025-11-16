/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Schemas } from '../../../../../../../base/common/network.js';
import { isWindows, OperatingSystem } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import type { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TreeSitterLibraryService } from '../../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineFileWriteAnalyzer } from '../../../browser/tools/commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../../browser/treeSitterCommandParser.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';

suite('CommandLineFileWriteAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;
	let analyzer: CommandLineFileWriteAnalyzer;
	let configurationService: TestConfigurationService;
	let workspaceContextService: TestContextService;

	const mockLog = (..._args: unknown[]) => { };

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

		analyzer = store.add(instantiationService.createInstance(
			CommandLineFileWriteAnalyzer,
			parser,
			mockLog
		));
	});

	(isWindows ? suite.skip : suite)('bash', () => {
		const cwd = URI.file('/workspace/project');

		async function t(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0, workspaceFolders: URI[] = [cwd]) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			// Setup workspace folders
			const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
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

		suite('no cwd provided', () => {
			async function tNoCwd(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
				configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

				const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
				workspaceContextService.setWorkspace(workspace);

				const options: ICommandLineAnalyzerOptions = {
					commandLine,
					cwd: undefined,
					shell: 'bash',
					os: OperatingSystem.Linux,
					treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
					terminalToolSessionId: 'test',
					chatSessionId: 'test',
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

		async function t(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0, workspaceFolders: URI[] = [cwd]) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			// Setup workspace folders
			const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'pwsh',
				os: OperatingSystem.Windows,
				treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
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
			test('quoted filename inside workspace - allow', () => t('Write-Host "hello" > "file with spaces.txt"', 'outsideWorkspace', true, 1));
			test('forward slashes on Windows (relative) - allow', () => t('Write-Host "hello" > subdir/file.txt', 'outsideWorkspace', true, 1));
		});
	});

	suite('disclaimer messages', () => {
		const cwd = URI.file('/workspace/project');

		async function checkDisclaimer(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedContains: string) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
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

		async function t(cwd: URI, commandLine: string, expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');

			const workspace = new Workspace('test', [workspace1, workspace2].map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
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
		async function t(cwdScheme: string, filePath: string, expectedAutoApprove: boolean) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');

			const cwd = URI.from({ scheme: cwdScheme, path: '/workspace/project' });
			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine: `echo hello > ${filePath}`,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove);
		}

		test('file scheme - relative path inside workspace', () => t('file', 'file.txt', true));
		test('vscode-remote scheme - relative path inside workspace', () => t('vscode-remote', 'file.txt', true));
		test('vscode-remote scheme - absolute path outside workspace', () => t('vscode-remote', '/tmp/file.txt', false));
	});
});
