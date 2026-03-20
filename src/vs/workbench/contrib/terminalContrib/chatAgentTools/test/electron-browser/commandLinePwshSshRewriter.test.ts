/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLinePwshSshRewriter } from '../../browser/tools/commandLineRewriter/commandLinePwshSshRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';

suite('CommandLinePwshSshRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let rewriter: CommandLinePwshSshRewriter;

	function createRewriteOptions(command: string, shell: string, os: OperatingSystem): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd: undefined,
			shell,
			os
		};
	}

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		rewriter = store.add(instantiationService.createInstance(CommandLinePwshSshRewriter));
	});

	suite('SSH $() subexpression rewriting', () => {
		async function t(originalCommandLine: string, expectedRewritten: string | undefined) {
			const options = createRewriteOptions(originalCommandLine, 'pwsh', OperatingSystem.Windows);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedRewritten);
		}

		test('should rewrite double-quoted SSH command with $() to single quotes', () =>
			t('ssh server "kill $(pgrep -f myapp)"', "ssh server 'kill $(pgrep -f myapp)'"));

		test('should rewrite SSH with flags and $() subexpression', () =>
			t('ssh -p 22 user@host "restart $(cat /tmp/service.pid)"', "ssh -p 22 user@host 'restart $(cat /tmp/service.pid)'"));

		test('should not modify SSH commands without $() in double quotes', () =>
			t('ssh server "echo hello world"', undefined));

		test('should not modify SSH commands already using single quotes', () =>
			t("ssh server 'kill $(pgrep -f myapp)'", undefined));

		test('should not modify non-SSH commands', () =>
			t('echo "$(Get-Process)"', undefined));

		test('should not modify commands in non-PowerShell shells', async () => {
			const options = createRewriteOptions('ssh server "kill $(pgrep -f myapp)"', 'bash', OperatingSystem.Linux);
			const result = await rewriter.rewrite(options);
			strictEqual(result, undefined);
		});

		test('should preserve $env: references (user wants local expansion)', () =>
			t('ssh server "echo $env:USERNAME connected via $(hostname)"', undefined));

		test('should handle ssh.exe variant', () =>
			t('ssh.exe server "kill $(pgrep -f myapp)"', "ssh.exe server 'kill $(pgrep -f myapp)'"));

		test('should handle complex remote command with multiple $() subexpressions', () =>
			t('ssh server "kill $(pgrep -f app) && restart $(cat /tmp/pid)"', "ssh server 'kill $(pgrep -f app) && restart $(cat /tmp/pid)'"));
	});

	suite('SSH nohup redirect rewriting', () => {
		async function t(originalCommandLine: string, expectedRewritten: string | undefined) {
			const options = createRewriteOptions(originalCommandLine, 'pwsh', OperatingSystem.Windows);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedRewritten);
		}

		test('should add redirect to SSH nohup command missing it', () =>
			t('ssh server "nohup python app.py &"', 'ssh server "nohup python app.py > /dev/null 2>&1 &"'));

		test('should not modify nohup command that already has redirect', () =>
			t('ssh server "nohup python app.py > /dev/null 2>&1 &"', undefined));

		test('should not modify nohup command with partial redirect', () =>
			t('ssh server "nohup python app.py > output.log &"', undefined));

		test('should handle nohup with flags', () =>
			t('ssh -p 2222 user@host "nohup /usr/bin/app --daemon &"', 'ssh -p 2222 user@host "nohup /usr/bin/app --daemon > /dev/null 2>&1 &"'));

		test('should not modify non-SSH nohup commands', () =>
			t('nohup python app.py &', undefined));

		test('should not modify in non-PowerShell shells', async () => {
			const options = createRewriteOptions('ssh server "nohup python app.py &"', 'bash', OperatingSystem.Linux);
			const result = await rewriter.rewrite(options);
			strictEqual(result, undefined);
		});
	});

	suite('Combined rewrites', () => {
		async function t(originalCommandLine: string, expectedRewritten: string | undefined) {
			const options = createRewriteOptions(originalCommandLine, 'pwsh', OperatingSystem.Windows);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedRewritten);
		}

		test('should handle Windows PowerShell 5.1 shell path', async () => {
			const options = createRewriteOptions(
				'ssh server "kill $(pgrep -f myapp)"',
				'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
				OperatingSystem.Windows
			);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, "ssh server 'kill $(pgrep -f myapp)'");
		});

		test('should handle pwsh-preview shell', async () => {
			const options = createRewriteOptions(
				'ssh server "kill $(pgrep -f myapp)"',
				'pwsh-preview',
				OperatingSystem.Windows
			);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, "ssh server 'kill $(pgrep -f myapp)'");
		});
	});
});
