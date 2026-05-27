/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import type { IOutputAnalyzerOptions } from '../../browser/tools/outputAnalyzer.js';
import { SandboxOutputAnalyzer } from '../../browser/tools/sandboxOutputAnalyzer.js';
import { shouldAutomaticallyRetryUnsandboxed, type IAutomaticUnsandboxRetryOptions } from '../../browser/tools/runInTerminalTool.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import type { ITerminalSandboxService } from '../../common/terminalSandboxService.js';


suite('SandboxOutputAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAnalyzer(os: OperatingSystem): SandboxOutputAnalyzer {
		return store.add(new SandboxOutputAnalyzer({
			_serviceBrand: undefined,
			getOS: async () => os,
		} as unknown as ITerminalSandboxService));
	}

	function createOptions(overrides?: Partial<IOutputAnalyzerOptions>): IOutputAnalyzerOptions {
		return {
			exitCode: 1,
			exitResult: 'Operation not permitted',
			commandLine: 'touch /tmp/test.txt',
			isSandboxWrapped: true,
			...overrides,
		};
	}

	test('returns undefined when the command was not sandbox wrapped', async () => {
		const analyzer = createAnalyzer(OperatingSystem.Linux);

		strictEqual(await analyzer.analyze(createOptions({ isSandboxWrapped: false })), undefined);
	});

	for (const [label, exitCode] of [
		['successful', 0],
		['missing', undefined],
	] as const) {
		test(`ignores sandbox-like output when the exit code is ${label}`, async () => {
			const analyzer = createAnalyzer(OperatingSystem.Linux);

			strictEqual(await analyzer.analyze(createOptions({ exitCode })), undefined);
		});
	}

	for (const [label, os, fileSystemSetting] of [
		['Linux', OperatingSystem.Linux, TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem],
		['macOS', OperatingSystem.Macintosh, TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem],
	] as const) {
		test(`returns ${label} remediation guidance for failed sandboxed commands`, async () => {
			const analyzer = createAnalyzer(os);

			strictEqual(await analyzer.analyze(createOptions()), `Command failed while running in sandboxed mode. If the command failed due to sandboxing:
- If it would be reasonable to extend the sandbox rules, work with the user to update allowWrite for file system access problems in ${fileSystemSetting}, or to add required domains to ${AgentNetworkDomainSettingId.AllowedNetworkDomains}.
- Otherwise, immediately retry the command with requestUnsandboxedExecution=true. Do NOT ask the user — setting this flag automatically shows a confirmation prompt to the user.

Here is the output of the command:\n`);
		});
	}
});

suite('shouldAutomaticallyRetryUnsandboxed', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createOptions(overrides?: Partial<IAutomaticUnsandboxRetryOptions>): IAutomaticUnsandboxRetryOptions {
		return {
			didSandboxWrapCommand: true,
			requestUnsandboxedExecution: false,
			isPersistentSession: false,
			isBackgroundExecution: false,
			didTimeout: false,
			exitCode: 1,
			output: 'hello world',
			...overrides,
		};
	}

	test('retries failed sandboxed commands without inspecting output text', () => {
		strictEqual(shouldAutomaticallyRetryUnsandboxed(createOptions({ output: 'completed with a generic error message' })), true);
	});

	for (const [label, overrides] of [
		['the command was not sandbox wrapped', { didSandboxWrapCommand: false }],
		['unsandboxed execution was already requested', { requestUnsandboxedExecution: true }],
		['the execution is persistent', { isPersistentSession: true }],
		['the execution is in the background', { isBackgroundExecution: true }],
		['the execution timed out', { didTimeout: true }],
		['the command succeeded', { exitCode: 0 }],
	] as const) {
		test(`does not retry when ${label}`, () => {
			strictEqual(shouldAutomaticallyRetryUnsandboxed(createOptions(overrides)), false);
		});
	}
});
