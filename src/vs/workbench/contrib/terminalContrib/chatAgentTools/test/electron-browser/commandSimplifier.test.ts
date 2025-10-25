/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandSimplifier } from '../../browser/commandSimplifier.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IRunInTerminalInputParams } from '../../browser/tools/runInTerminalTool.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TreeSitterCommandParser } from '../../browser/treeSitterCommandParser.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { arch } from '../../../../../../base/common/process.js';

// TODO: The powershell grammar can cause an OOM crash on arm https://github.com/microsoft/vscode/issues/273177
(arch === 'arm' || arch === 'arm64' ? suite.skip : suite)('command re-writing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let workspaceService: TestContextService;

	let parser: TreeSitterCommandParser;
	let commandSimplifier: CommandSimplifier;

	function createRewriteParams(command: string, chatSessionId?: string): IRunInTerminalInputParams {
		return {
			command,
			explanation: 'Test command',
			isBackground: false
		};
	}

	function createInstanceWithCwd(uri: URI | undefined): Pick<ITerminalInstance, 'getCwdResource'> | undefined {
		return {
			getCwdResource: async () => uri
		};
	}

	function setWorkspaceFolders(folders: URI[]) {
		workspaceService.setWorkspace(new Workspace(folders.reduce((prev, curr) => {
			return `${prev},${curr}`;
		}, ''), folders.map(e => toWorkspaceFolder(e))));
	}

	setup(() => {
		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
		}, store);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		parser = instantiationService.createInstance(TreeSitterCommandParser);

		workspaceService = instantiationService.get(IWorkspaceContextService) as TestContextService;
	});

	suite('cd <cwd> && <suffix> -> <suffix>', () => {
		(!isWindows ? suite : suite.skip)('Posix', () => {
			setup(() => {
				commandSimplifier = instantiationService.createInstance(CommandSimplifier, Promise.resolve(OperatingSystem.Linux), parser);
			});

			test('should return original command when no cd prefix pattern matches', async () => {
				const parameters = createRewriteParams('echo hello world');
				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'pwsh');

				strictEqual(result, 'echo hello world');
			});

			test('should return original command when cd pattern does not have suffix', async () => {
				const parameters = createRewriteParams('cd /some/path');
				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'pwsh');

				strictEqual(result, 'cd /some/path');
			});

			test('should rewrite command with ; separator when directory matches cwd', async () => {
				const testDir = '/test/workspace';
				const parameters = createRewriteParams(`cd ${testDir}; npm test`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'pwsh');

				strictEqual(result, 'npm test');
			});

			test('should rewrite command with && separator when directory matches cwd', async () => {
				const testDir = '/test/workspace';
				const parameters = createRewriteParams(`cd ${testDir} && npm install`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should rewrite command when the path is wrapped in double quotes', async () => {
				const testDir = '/test/workspace';
				const parameters = createRewriteParams(`cd "${testDir}" && npm install`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should not rewrite command when directory does not match cwd', async () => {
				const testDir = '/test/workspace';
				const differentDir = '/different/path';
				const command = `cd ${differentDir} && npm install`;
				const parameters = createRewriteParams(command, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, command);
			});

			test('should return original command when no workspace folders available', async () => {
				const command = 'cd /some/path && npm install';
				const parameters = createRewriteParams(command, 'session-1');
				setWorkspaceFolders([]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, command);
			});

			test('should return original command when multiple workspace folders available', async () => {
				const command = 'cd /some/path && npm install';
				const parameters = createRewriteParams(command, 'session-1');
				setWorkspaceFolders([
					URI.file('/workspace1'),
					URI.file('/workspace2')
				]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, command);
			});

			test('should handle commands with complex suffixes', async () => {
				const testDir = '/test/workspace';
				const command = `cd ${testDir} && npm install && npm test && echo "done"`;
				const parameters = createRewriteParams(command, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, 'npm install && npm test && echo "done"');
			});

			test('should handle session without chatSessionId', async () => {
				const command = 'cd /some/path && npm install';
				const parameters = createRewriteParams(command);
				setWorkspaceFolders([URI.file('/some/path')]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should ignore any trailing forward slash', async () => {
				const testDir = '/test/workspace';
				const parameters = createRewriteParams(`cd ${testDir}/ && npm install`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'bash');

				strictEqual(result, 'npm install');
			});
		});

		(isWindows ? suite : suite.skip)('Windows', () => {
			setup(() => {
				commandSimplifier = instantiationService.createInstance(CommandSimplifier, Promise.resolve(OperatingSystem.Windows), parser);
			});

			test('should ignore any trailing back slash', async () => {
				const testDir = 'c:\\test\\workspace';
				const parameters = createRewriteParams(`cd ${testDir}\\ && npm install`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'cmd');

				strictEqual(result, 'npm install');
			});

			test('should prioritize instance cwd over workspace service', async () => {
				const instanceDir = 'C:\\instance\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${instanceDir} && npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(workspaceDir)]);
				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				strictEqual(result, 'npm test');
			});

			test('should prioritize instance cwd over workspace service - PowerShell style', async () => {
				const instanceDir = 'C:\\instance\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${instanceDir}; npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(workspaceDir)]);
				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'pwsh');

				strictEqual(result, 'npm test');
			});

			test('should not rewrite when instance cwd differs from cd path', async () => {
				const instanceDir = 'C:\\instance\\workspace';
				const cdDir = 'C:\\different\\path';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${cdDir} && npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(workspaceDir)]);
				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				// Should not rewrite since instance cwd doesn't match cd path
				strictEqual(result, command);
			});

			test('should fallback to workspace service when instance getCwdResource returns undefined', async () => {
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${workspaceDir} && npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(workspaceDir)]);
				const instance = createInstanceWithCwd(undefined);

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				strictEqual(result, 'npm test');
			});

			test('should prioritize instance cwd over workspace service even when both match cd path', async () => {
				const sharedDir = 'C:\\shared\\workspace';
				const command = `cd ${sharedDir} && npm build`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(sharedDir)]);
				const instance = createInstanceWithCwd(URI.file(sharedDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				strictEqual(result, 'npm build');
			});

			test('should handle case-insensitive comparison on Windows with instance', async () => {
				const instanceDir = 'C:\\Instance\\Workspace';
				const cdDir = 'c:\\instance\\workspace'; // Different case
				const command = `cd ${cdDir} && npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				strictEqual(result, 'npm test');
			});

			test('should handle quoted paths with instance priority', async () => {
				const instanceDir = 'C:\\instance\\workspace';
				const command = 'cd "C:\\instance\\workspace" && npm test';
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file('C:\\different\\workspace')]);
				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'cmd');

				strictEqual(result, 'npm test');
			});

			test('should handle cd /d flag when directory matches cwd', async () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteParams(`cd /d ${testDir} && echo hello`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(options, undefined, 'pwsh');

				strictEqual(result, 'echo hello');
			});

			test('should handle cd /d flag with quoted paths when directory matches cwd', async () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteParams(`cd /d "${testDir}" && echo hello`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(options, undefined, 'pwsh');

				strictEqual(result, 'echo hello');
			});

			test('should handle cd /d flag with quoted paths from issue example', async () => {
				const testDir = 'd:\\microsoft\\vscode';
				const options = createRewriteParams(`cd /d "${testDir}" && .\\scripts\\test.bat`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(options, undefined, 'pwsh');

				strictEqual(result, '.\\scripts\\test.bat');
			});

			test('should not rewrite cd /d when directory does not match cwd', async () => {
				const testDir = 'C:\\test\\workspace';
				const differentDir = 'C:\\different\\path';
				const command = `cd /d ${differentDir} ; echo hello`;
				const options = createRewriteParams(command, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(options, undefined, 'pwsh');

				strictEqual(result, command);
			});

			test('should handle cd /d flag with instance priority', async () => {
				const instanceDir = 'C:\\instance\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd /d ${instanceDir} && npm test`;
				const parameters = createRewriteParams(command, 'session-1');

				setWorkspaceFolders([URI.file(workspaceDir)]);
				const instance = createInstanceWithCwd(URI.file(instanceDir));

				const result = await commandSimplifier.rewriteIfNeeded(parameters, instance, 'pwsh');

				strictEqual(result, 'npm test');
			});

			test('should handle cd /d flag with semicolon separator', async () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteParams(`cd /d ${testDir}; echo hello`, 'session-1');
				setWorkspaceFolders([URI.file(testDir)]);

				const result = await commandSimplifier.rewriteIfNeeded(options, undefined, 'pwsh');

				strictEqual(result, 'echo hello');
			});
		});
	});

	suite('PowerShell: && -> ;', () => {
		async function t(originalCommandLine: string, expectedResult: string) {
			const parameters = createRewriteParams(originalCommandLine);
			const result = await commandSimplifier.rewriteIfNeeded(parameters, undefined, 'pwsh');
			strictEqual(result, expectedResult);
		}
		setup(() => {
			commandSimplifier = instantiationService.createInstance(CommandSimplifier, Promise.resolve(OperatingSystem.Windows), parser);
		});

		test('should rewrite && to ; in PowerShell commands', () => t('echo hello && echo world', 'echo hello ; echo world'));
		test('should rewrite multiple && to ; in PowerShell commands', () => t('echo first && echo second && echo third', 'echo first ; echo second ; echo third'));
		test('should handle complex commands with && operators', () => t('npm install && npm test && echo "build complete"', 'npm install ; npm test ; echo "build complete"'));
		test('should work with Windows PowerShell shell identifier', () => t('Get-Process && Stop-Process', 'Get-Process ; Stop-Process'));
		test('should preserve existing semicolons', () => t('echo hello; echo world && echo final', 'echo hello; echo world ; echo final'));
		test('should not rewrite strings', () => t('echo "&&" && Write-Host "&& &&" && "&&"', 'echo "&&" ; Write-Host "&& &&" ; "&&"'));
	});
});
