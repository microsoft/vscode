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
			function t(commandLine: string, cwd: URI | undefined, workspaceFolders: URI[], shell: string, expectedResult: string | undefined) {
				setWorkspaceFolders(workspaceFolders);
				const options = createRewriteOptions(commandLine, cwd, shell, OperatingSystem.Linux);
				const result = rewriter.rewrite(options);
				strictEqual(result?.rewritten, expectedResult);
				if (expectedResult !== undefined) {
					strictEqual(result?.reasoning, 'Removed redundant cd command');
				}
			}

			test('should return undefined when no cd prefix pattern matches', () => t('echo hello world', undefined, [], 'bash', undefined));
			test('should return undefined when cd pattern does not have suffix', () => t('cd /some/path', undefined, [], 'bash', undefined));
			test('should rewrite command with ; separator when directory matches cwd', () => t('cd /test/workspace; npm test', undefined, [URI.file('/test/workspace')], 'pwsh', 'npm test'));
			test('should rewrite command with && separator when directory matches cwd', () => t('cd /test/workspace && npm install', undefined, [URI.file('/test/workspace')], 'bash', 'npm install'));
			test('should rewrite command when the path is wrapped in double quotes', () => t('cd "/test/workspace" && npm install', undefined, [URI.file('/test/workspace')], 'bash', 'npm install'));
			test('should not rewrite command when directory does not match cwd', () => t('cd /different/path && npm install', undefined, [URI.file('/test/workspace')], 'bash', undefined));
			test('should return undefined when no workspace folders available', () => t('cd /some/path && npm install', undefined, [], 'bash', undefined));
			test('should return undefined when multiple workspace folders available', () => t('cd /some/path && npm install', undefined, [URI.file('/workspace1'), URI.file('/workspace2')], 'bash', undefined));
			test('should handle commands with complex suffixes', () => t('cd /test/workspace && npm install && npm test && echo "done"', undefined, [URI.file('/test/workspace')], 'bash', 'npm install && npm test && echo "done"'));
			test('should ignore any trailing forward slash', () => t('cd /test/workspace/ && npm install', undefined, [URI.file('/test/workspace')], 'bash', 'npm install'));
		});

		(isWindows ? suite : suite.skip)('Windows', () => {
			function t(commandLine: string, cwd: URI | undefined, workspaceFolders: URI[], shell: string, expectedResult: string | undefined) {
				setWorkspaceFolders(workspaceFolders);
				const options = createRewriteOptions(commandLine, cwd, shell, OperatingSystem.Windows);
				const result = rewriter.rewrite(options);
				strictEqual(result?.rewritten, expectedResult);
				if (expectedResult !== undefined) {
					strictEqual(result?.reasoning, 'Removed redundant cd command');
				}
			}

			test('should ignore any trailing back slash', () => t('cd c:\\test\\workspace\\ && npm install', undefined, [URI.file('c:\\test\\workspace')], 'cmd', 'npm install'));
			test('should prioritize cwd option over workspace service', () => t('cd C:\\cwd\\workspace && npm test', URI.file('C:\\cwd\\workspace'), [URI.file('C:\\workspace\\service')], 'cmd', 'npm test'));
			test('should prioritize cwd option over workspace service - PowerShell style', () => t('cd C:\\cwd\\workspace; npm test', URI.file('C:\\cwd\\workspace'), [URI.file('C:\\workspace\\service')], 'pwsh', 'npm test'));
			test('should not rewrite when cwd differs from cd path', () => t('cd C:\\different\\path && npm test', URI.file('C:\\cwd\\workspace'), [URI.file('C:\\workspace\\service')], 'cmd', undefined));
			test('should fallback to workspace service when cwd is undefined', () => t('cd C:\\workspace\\service && npm test', undefined, [URI.file('C:\\workspace\\service')], 'cmd', 'npm test'));
			test('should prioritize cwd over workspace service even when both match cd path', () => t('cd C:\\shared\\workspace && npm build', URI.file('C:\\shared\\workspace'), [URI.file('C:\\shared\\workspace')], 'cmd', 'npm build'));
			test('should handle case-insensitive comparison on Windows', () => t('cd c:\\cwd\\workspace && npm test', URI.file('C:\\Cwd\\Workspace'), [], 'cmd', 'npm test'));
			test('should handle quoted paths with cwd priority', () => t('cd "C:\\cwd\\workspace" && npm test', URI.file('C:\\cwd\\workspace'), [URI.file('C:\\different\\workspace')], 'cmd', 'npm test'));
			test('should handle cd /d flag when directory matches cwd', () => t('cd /d C:\\test\\workspace && echo hello', undefined, [URI.file('C:\\test\\workspace')], 'pwsh', 'echo hello'));
			test('should handle cd /d flag with quoted paths when directory matches cwd', () => t('cd /d "C:\\test\\workspace" && echo hello', undefined, [URI.file('C:\\test\\workspace')], 'pwsh', 'echo hello'));
			test('should handle cd /d flag with quoted paths from issue example', () => t('cd /d "d:\\microsoft\\vscode" && .\\scripts\\test.bat', undefined, [URI.file('d:\\microsoft\\vscode')], 'pwsh', '.\\scripts\\test.bat'));
			test('should not rewrite cd /d when directory does not match cwd', () => t('cd /d C:\\different\\path ; echo hello', undefined, [URI.file('C:\\test\\workspace')], 'pwsh', undefined));
			test('should handle cd /d flag with cwd priority', () => t('cd /d C:\\cwd\\workspace && npm test', URI.file('C:\\cwd\\workspace'), [URI.file('C:\\workspace\\service')], 'pwsh', 'npm test'));
			test('should handle cd /d flag with semicolon separator', () => t('cd /d C:\\test\\workspace; echo hello', undefined, [URI.file('C:\\test\\workspace')], 'pwsh', 'echo hello'));
		});
	});
});
