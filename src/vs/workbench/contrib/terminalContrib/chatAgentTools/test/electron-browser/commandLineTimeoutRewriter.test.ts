/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineTimeoutRewriter } from '../../browser/tools/commandLineRewriter/commandLineTimeoutRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';

suite('CommandLineTimeoutRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let rewriter: CommandLineTimeoutRewriter;

	function createRewriteOptions(command: string, shell: string, os: OperatingSystem): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd: URI.file('/test/workspace'),
			shell,
			os
		};
	}

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		rewriter = store.add(instantiationService.createInstance(CommandLineTimeoutRewriter));
	});

	suite('Unix/Linux timeout command detection', () => {
		function t(commandLine: string, shell: string, expectedCommand: string | undefined, expectedTimeout: number | undefined) {
			const options = createRewriteOptions(commandLine, shell, OperatingSystem.Linux);
			const result = rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedCommand);
			strictEqual(result?.metadata?.extractedTimeout, expectedTimeout);
			if (expectedCommand !== undefined && expectedTimeout !== undefined) {
				strictEqual(result?.reasoning, `Removed timeout command prefix, will enforce ${expectedTimeout / 1000}s timeout using built-in mechanism`);
			}
		}

		test('should return undefined when no timeout command is present', () => t('npm test', 'bash', undefined, undefined));
		test('should return undefined when command starts with timeout but has no arguments', () => t('timeout', 'bash', undefined, undefined));
		test('should detect basic timeout command with seconds', () => t('timeout 10 npm test', 'bash', 'npm test', 10000));
		test('should detect timeout command with "s" suffix', () => t('timeout 10s npm test', 'bash', 'npm test', 10000));
		test('should detect timeout command with longer durations', () => t('timeout 300 npm run build', 'bash', 'npm run build', 300000));
		test('should detect timeout with complex command', () => t('timeout 5 npm install && npm test', 'bash', 'npm install && npm test', 5000));
		test('should detect timeout with --signal option', () => t('timeout --signal=KILL 10 npm test', 'bash', 'npm test', 10000));
		test('should detect timeout with -s short option', () => t('timeout -s KILL 10 npm test', 'bash', 'npm test', 10000));
		test('should detect timeout with signal and s suffix', () => t('timeout --signal=TERM 30s npm test', 'bash', 'npm test', 30000));
		test('should handle command with quotes', () => t('timeout 10 bash -c "npm test"', 'bash', 'bash -c "npm test"', 10000));
		test('should handle command with pipes', () => t('timeout 5 ls -la | grep test', 'bash', 'ls -la | grep test', 5000));
		test('should not match timeout in middle of command', () => t('npm test timeout 10', 'bash', undefined, undefined));
		test('should work with zsh', () => t('timeout 10 echo hello', 'zsh', 'echo hello', 10000));
		test('should work with fish', () => t('timeout 10 echo hello', 'fish', 'echo hello', 10000));
	});

	suite('Windows - no timeout support', () => {
		function t(commandLine: string, shell: string) {
			const options = createRewriteOptions(commandLine, shell, OperatingSystem.Windows);
			const result = rewriter.rewrite(options);
			strictEqual(result, undefined, 'Windows timeout commands should not be rewritten');
		}

		test('should not rewrite timeout commands on Windows (cmd)', () => t('timeout 10 npm test', 'cmd'));
		test('should not rewrite timeout commands on Windows (PowerShell)', () => t('timeout 10 npm test', 'pwsh'));
		test('should not rewrite timeout commands on Windows (bash in WSL context)', () => t('timeout 10 npm test', 'bash'));
	});

	suite('Edge cases', () => {
		function t(commandLine: string, expectedCommand: string | undefined, expectedTimeout: number | undefined) {
			const options = createRewriteOptions(commandLine, 'bash', OperatingSystem.Linux);
			const result = rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedCommand);
			strictEqual(result?.metadata?.extractedTimeout, expectedTimeout);
		}

		test('should handle zero timeout', () => t('timeout 0 npm test', undefined, undefined));
		test('should handle negative timeout', () => t('timeout -5 npm test', undefined, undefined));
		test('should handle very large timeout', () => t('timeout 86400 long-running-task', 'long-running-task', 86400000));
		test('should not match when command is missing', () => t('timeout 10', undefined, undefined));
		test('should not match when timeout value is missing', () => t('timeout npm test', undefined, undefined));
		test('should handle single character command', () => t('timeout 5 x', 'x', 5000));
	});
});
