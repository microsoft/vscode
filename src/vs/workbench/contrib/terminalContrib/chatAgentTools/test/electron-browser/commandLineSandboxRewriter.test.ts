/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineSandboxRewriter } from '../../browser/tools/commandLineRewriter/commandLineSandboxRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';
import type { TreeSitterCommandParser } from '../../browser/treeSitterCommandParser.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, type ITerminalSandboxCommand } from '../../common/terminalSandboxService.js';

suite('CommandLineSandboxRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	const stubTreeSitterCommandParser = (commands: ITerminalSandboxCommand[] = []): TreeSitterCommandParser => ({
		extractCommands: async () => commands,
	} as unknown as TreeSitterCommandParser);

	const stubSandboxService = (overrides: Partial<ITerminalSandboxService> = {}) => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => false,
			isSandboxAllowNetworkEnabled: async () => false,
			wrapCommand: async (command, _requestUnsandboxedExecution) => {
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
		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter, stubTreeSitterCommandParser()));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('returns undefined when sandbox config is unavailable', async () => {
		stubSandboxService({
			wrapCommand: async command => ({
				command: `wrapped:${command}`,
				isSandboxWrapped: true,
			}),
			checkForSandboxingPrereqs: async () => ({ enabled: false, sandboxConfigPath: undefined, failedCheck: TerminalSandboxPrerequisiteCheck.Config }),
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter, stubTreeSitterCommandParser()));
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

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter, stubTreeSitterCommandParser()));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('wraps command when sandbox is enabled and config exists', async () => {
		const calls: string[] = [];
		stubSandboxService({
			wrapCommand: async (command, _requestUnsandboxedExecution, _shell, cwd, commandDetails) => {
				calls.push(`wrapCommand:${commandDetails?.map(command => command.keyword).join(',') ?? ''}:${cwd?.path ?? ''}`);
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

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter, stubTreeSitterCommandParser([{ keyword: 'node', args: [] }])));
		const result = await rewriter.rewrite({
			...createRewriteOptions('echo hello'),
			cwd: URI.file('/workspace')
		});
		strictEqual(result?.rewritten, 'wrapped:echo hello');
		strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
		deepStrictEqual(calls, ['checkForSandboxingPrereqs', 'wrapCommand:node:/workspace']);
	});

	test('wraps command and forwards sandbox bypass flag when explicitly requested', async () => {
		const calls: string[] = [];
		stubSandboxService({
			wrapCommand: async (command, requestUnsandboxedExecution, _shell, _cwd, commandDetails) => {
				calls.push(`wrap:${command}:${String(requestUnsandboxedExecution)}`);
				calls.push(`commands:${commandDetails?.map(command => command.keyword).join(',') ?? ''}`);
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

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter, stubTreeSitterCommandParser([{ keyword: 'git', args: [] }])));
		const result = await rewriter.rewrite({
			...createRewriteOptions('echo hello'),
			requestUnsandboxedExecution: true,
		});

		strictEqual(result?.rewritten, 'wrapped:echo hello');
		strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
		deepStrictEqual(calls, ['prereqs', 'wrap:echo hello:true', 'commands:']);
	});
});
