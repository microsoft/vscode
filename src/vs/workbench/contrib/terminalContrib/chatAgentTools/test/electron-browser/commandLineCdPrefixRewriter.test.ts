/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineCdPrefixRewriter } from '../../browser/tools/commandLineRewriter/commandLineCdPrefixRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';

suite('CommandLineCdPrefixRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let rewriter: CommandLineCdPrefixRewriter;

	function createRewriteOptions(command: string, cwd: URI | undefined, shell: string, os: OperatingSystem): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd,
			shell,
			os
		};
	}

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		rewriter = store.add(instantiationService.createInstance(CommandLineCdPrefixRewriter));
	});

	suite('cd <cwd> && <suffix> -> <suffix>', () => {
		(!isWindows ? suite : suite.skip)('Posix', () => {
			const cwd = URI.file('/test/workspace');

			function t(commandLine: string, shell: string, expectedResult: string | undefined) {
				const options = createRewriteOptions(commandLine, cwd, shell, OperatingSystem.Linux);
				const result = rewriter.rewrite(options);
				strictEqual(result?.rewritten, expectedResult);
				if (expectedResult !== undefined) {
					strictEqual(result?.reasoning, 'Removed redundant cd command');
				}
			}

			test('should return undefined when no cd prefix pattern matches', () => t('echo hello world', 'bash', undefined));
			test('should return undefined when cd pattern does not have suffix', () => t('cd /some/path', 'bash', undefined));
			test('should rewrite command with ; separator when directory matches cwd', () => t('cd /test/workspace; npm test', 'pwsh', 'npm test'));
			test('should rewrite command with && separator when directory matches cwd', () => t('cd /test/workspace && npm install', 'bash', 'npm install'));
			test('should rewrite command when the path is wrapped in double quotes', () => t('cd "/test/workspace" && npm install', 'bash', 'npm install'));
			test('should not rewrite command when directory does not match cwd', () => t('cd /different/path && npm install', 'bash', undefined));
			test('should handle commands with complex suffixes', () => t('cd /test/workspace && npm install && npm test && echo "done"', 'bash', 'npm install && npm test && echo "done"'));
			test('should ignore any trailing forward slash', () => t('cd /test/workspace/ && npm install', 'bash', 'npm install'));
		});

		(isWindows ? suite : suite.skip)('Windows', () => {
			const cwd = URI.file('C:\\test\\workspace');

			function t(commandLine: string, shell: string, expectedResult: string | undefined) {
				const options = createRewriteOptions(commandLine, cwd, shell, OperatingSystem.Windows);
				const result = rewriter.rewrite(options);
				strictEqual(result?.rewritten, expectedResult);
				if (expectedResult !== undefined) {
					strictEqual(result?.reasoning, 'Removed redundant cd command');
				}
			}

			test('should ignore any trailing back slash', () => t('cd c:\\test\\workspace\\ && npm install', 'cmd', 'npm install'));
			test('should rewrite command with && separator when directory matches cwd', () => t('cd C:\\test\\workspace && npm test', 'cmd', 'npm test'));
			test('should rewrite command with ; separator when directory matches cwd - PowerShell style', () => t('cd C:\\test\\workspace; npm test', 'pwsh', 'npm test'));
			test('should not rewrite when cwd differs from cd path', () => t('cd C:\\different\\path && npm test', 'cmd', undefined));
			test('should handle case-insensitive comparison on Windows', () => t('cd c:\\test\\workspace && npm test', 'cmd', 'npm test'));
			test('should handle quoted paths', () => t('cd "C:\\test\\workspace" && npm test', 'cmd', 'npm test'));
			test('should handle cd /d flag when directory matches cwd', () => t('cd /d C:\\test\\workspace && echo hello', 'pwsh', 'echo hello'));
			test('should handle cd /d flag with quoted paths when directory matches cwd', () => t('cd /d "C:\\test\\workspace" && echo hello', 'pwsh', 'echo hello'));
			test('should not rewrite cd /d when directory does not match cwd', () => t('cd /d C:\\different\\path ; echo hello', 'pwsh', undefined));
			test('should handle cd /d flag with semicolon separator', () => t('cd /d C:\\test\\workspace; echo hello', 'pwsh', 'echo hello'));
		});
	});
});
