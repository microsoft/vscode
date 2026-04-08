/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineSandboxRewriter } from '../../browser/tools/commandLineRewriter/commandLineSandboxRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from '../../common/terminalSandboxService.js';

suite('CommandLineSandboxRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	const stubSandboxService = (overrides: Partial<ITerminalSandboxService> = {}) => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => false,
			wrapCommand: (command, _requestUnsandboxedExecution) => {
				return {
					command,
					isSandboxWrapped: false,
				};
			},
			getSandboxConfigPath: async () => '/tmp/sandbox.json',
			checkForSandboxingPrereqs: async () => ({ enabled: false, sandboxConfigPath: undefined, failedCheck: TerminalSandboxPrerequisiteCheck.Config }),
			getTempDir: () => undefined,
			setNeedsForceUpdateConfigFile: () => { },
			...overrides
		});
	};

	function createRewriteOptions(command: string): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd: undefined,
			shell: 'bash',
			os: OperatingSystem.Linux
		};
	}

	test('returns undefined when sandbox is disabled', async () => {
		stubSandboxService();
		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('returns undefined when sandbox config is unavailable', async () => {
		stubSandboxService({
			wrapCommand: command => ({
				command: `wrapped:${command}`,
				isSandboxWrapped: true,
			}),
			checkForSandboxingPrereqs: async () => ({ enabled: false, sandboxConfigPath: undefined, failedCheck: TerminalSandboxPrerequisiteCheck.Config }),
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('returns undefined when sandbox dependencies are unavailable', async () => {
		stubSandboxService({
			checkForSandboxingPrereqs: async () => ({
				enabled: false,
				sandboxConfigPath: '/tmp/sandbox.json',
				failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
				missingDependencies: ['bubblewrap'],
			}),
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('wraps command when sandbox is enabled and config exists', async () => {
		const calls: string[] = [];
		stubSandboxService({
			wrapCommand: (command, _requestUnsandboxedExecution) => {
				calls.push('wrapCommand');
				return {
					command: `wrapped:${command}`,
					isSandboxWrapped: true,
				};
			},
			checkForSandboxingPrereqs: async () => {
				calls.push('checkForSandboxingPrereqs');
				return { enabled: true, sandboxConfigPath: '/tmp/sandbox.json', failedCheck: undefined };
			},
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result?.rewritten, 'wrapped:echo hello');
		strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
		deepStrictEqual(calls, ['checkForSandboxingPrereqs', 'wrapCommand']);
	});

	test('wraps command and forwards sandbox bypass flag when explicitly requested', async () => {
		const calls: string[] = [];
		stubSandboxService({
			wrapCommand: (command, requestUnsandboxedExecution) => {
				calls.push(`wrap:${command}:${String(requestUnsandboxedExecution)}`);
				return {
					command: `wrapped:${command}`,
					isSandboxWrapped: !requestUnsandboxedExecution,
				};
			},
			checkForSandboxingPrereqs: async () => {
				calls.push('prereqs');
				return { enabled: true, sandboxConfigPath: '/tmp/sandbox.json', failedCheck: undefined };
			},
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite({
			...createRewriteOptions('echo hello'),
			requestUnsandboxedExecution: true,
		});

		strictEqual(result?.rewritten, 'wrapped:echo hello');
		strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
		deepStrictEqual(calls, ['prereqs', 'wrap:echo hello:true']);
	});
});
