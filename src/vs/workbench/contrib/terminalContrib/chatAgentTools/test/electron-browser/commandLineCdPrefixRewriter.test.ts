/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { CommandLineCdPrefixRewriter } from '../../browser/tools/commandLineRewriter/commandLineCdPrefixRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';

suite('CommandLineCdPrefixRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let workspaceService: TestContextService;
	let rewriter: CommandLineCdPrefixRewriter;

	function createRewriteOptions(command: string, cwd: URI | undefined, shell: string, os: OperatingSystem): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd,
			shell,
			os
		};
	}

	function setWorkspaceFolders(folders: URI[]) {
		workspaceService.setWorkspace(new Workspace(folders.reduce((prev, curr) => {
			return `${prev},${curr}`;
		}, ''), folders.map(e => toWorkspaceFolder(e))));
	}

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		workspaceService = instantiationService.get(IWorkspaceContextService) as TestContextService;
		rewriter = store.add(instantiationService.createInstance(CommandLineCdPrefixRewriter));
	});

	suite('cd <cwd> && <suffix> -> <suffix>', () => {
		(!isWindows ? suite : suite.skip)('Posix', () => {
			test('should return undefined when no cd prefix pattern matches', () => {
				const options = createRewriteOptions('echo hello world', undefined, 'bash', OperatingSystem.Linux);
				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should return undefined when cd pattern does not have suffix', () => {
				const options = createRewriteOptions('cd /some/path', undefined, 'bash', OperatingSystem.Linux);
				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should rewrite command with ; separator when directory matches cwd', () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir}; npm test`, undefined, 'pwsh', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should rewrite command with && separator when directory matches cwd', () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir} && npm install`, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm install');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should rewrite command when the path is wrapped in double quotes', () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd "${testDir}" && npm install`, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm install');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should not rewrite command when directory does not match cwd', () => {
				const testDir = '/test/workspace';
				const differentDir = '/different/path';
				const command = `cd ${differentDir} && npm install`;
				const options = createRewriteOptions(command, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should return undefined when no workspace folders available', () => {
				const command = 'cd /some/path && npm install';
				const options = createRewriteOptions(command, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([]);

				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should return undefined when multiple workspace folders available', () => {
				const command = 'cd /some/path && npm install';
				const options = createRewriteOptions(command, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([
					URI.file('/workspace1'),
					URI.file('/workspace2')
				]);

				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should handle commands with complex suffixes', () => {
				const testDir = '/test/workspace';
				const command = `cd ${testDir} && npm install && npm test && echo "done"`;
				const options = createRewriteOptions(command, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm install && npm test && echo "done"');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should ignore any trailing forward slash', () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir}/ && npm install`, undefined, 'bash', OperatingSystem.Linux);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm install');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});
		});

		(isWindows ? suite : suite.skip)('Windows', () => {
			test('should ignore any trailing back slash', () => {
				const testDir = 'c:\\test\\workspace';
				const options = createRewriteOptions(`cd ${testDir}\\ && npm install`, undefined, 'cmd', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm install');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should prioritize cwd option over workspace service', () => {
				const cwdDir = 'C:\\cwd\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${cwdDir} && npm test`;
				const options = createRewriteOptions(command, URI.file(cwdDir), 'cmd', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(workspaceDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should prioritize cwd option over workspace service - PowerShell style', () => {
				const cwdDir = 'C:\\cwd\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${cwdDir}; npm test`;
				const options = createRewriteOptions(command, URI.file(cwdDir), 'pwsh', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(workspaceDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should not rewrite when cwd differs from cd path', () => {
				const cwdDir = 'C:\\cwd\\workspace';
				const cdDir = 'C:\\different\\path';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${cdDir} && npm test`;
				const options = createRewriteOptions(command, URI.file(cwdDir), 'cmd', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(workspaceDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should fallback to workspace service when cwd is undefined', () => {
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd ${workspaceDir} && npm test`;
				const options = createRewriteOptions(command, undefined, 'cmd', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(workspaceDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should prioritize cwd over workspace service even when both match cd path', () => {
				const sharedDir = 'C:\\shared\\workspace';
				const command = `cd ${sharedDir} && npm build`;
				const options = createRewriteOptions(command, URI.file(sharedDir), 'cmd', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(sharedDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm build');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle case-insensitive comparison on Windows', () => {
				const cwdDir = 'C:\\Cwd\\Workspace';
				const cdDir = 'c:\\cwd\\workspace'; // Different case
				const command = `cd ${cdDir} && npm test`;
				const options = createRewriteOptions(command, URI.file(cwdDir), 'cmd', OperatingSystem.Windows);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle quoted paths with cwd priority', () => {
				const cwdDir = 'C:\\cwd\\workspace';
				const command = 'cd "C:\\cwd\\workspace" && npm test';
				const options = createRewriteOptions(command, URI.file(cwdDir), 'cmd', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file('C:\\different\\workspace')]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle cd /d flag when directory matches cwd', () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteOptions(`cd /d ${testDir} && echo hello`, undefined, 'pwsh', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'echo hello');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle cd /d flag with quoted paths when directory matches cwd', () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteOptions(`cd /d "${testDir}" && echo hello`, undefined, 'pwsh', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'echo hello');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle cd /d flag with quoted paths from issue example', () => {
				const testDir = 'd:\\microsoft\\vscode';
				const options = createRewriteOptions(`cd /d "${testDir}" && .\\scripts\\test.bat`, undefined, 'pwsh', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, '.\\scripts\\test.bat');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should not rewrite cd /d when directory does not match cwd', () => {
				const testDir = 'C:\\test\\workspace';
				const differentDir = 'C:\\different\\path';
				const command = `cd /d ${differentDir} ; echo hello`;
				const options = createRewriteOptions(command, undefined, 'pwsh', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result, undefined);
			});

			test('should handle cd /d flag with cwd priority', () => {
				const cwdDir = 'C:\\cwd\\workspace';
				const workspaceDir = 'C:\\workspace\\service';
				const command = `cd /d ${cwdDir} && npm test`;
				const options = createRewriteOptions(command, URI.file(cwdDir), 'pwsh', OperatingSystem.Windows);

				setWorkspaceFolders([URI.file(workspaceDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'npm test');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});

			test('should handle cd /d flag with semicolon separator', () => {
				const testDir = 'C:\\test\\workspace';
				const options = createRewriteOptions(`cd /d ${testDir}; echo hello`, undefined, 'pwsh', OperatingSystem.Windows);
				setWorkspaceFolders([URI.file(testDir)]);

				const result = rewriter.rewrite(options);

				strictEqual(result?.rewritten, 'echo hello');
				strictEqual(result?.reasoning, 'Removed redundant cd command');
			});
		});
	});
});
