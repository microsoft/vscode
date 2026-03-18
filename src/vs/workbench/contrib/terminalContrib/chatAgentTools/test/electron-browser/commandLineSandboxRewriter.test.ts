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
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('CommandLineSandboxRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	const stubSandboxService = (overrides: Partial<ITerminalSandboxService> = {}) => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => false,
			wrapCommand: command => command,
			getSandboxConfigPath: async () => '/tmp/sandbox.json',
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
			isEnabled: async () => true,
			wrapCommand: command => `wrapped:${command}`,
			getSandboxConfigPath: async () => undefined,
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result, undefined);
	});

	test('wraps command when sandbox is enabled and config exists', async () => {
		const calls: string[] = [];
		stubSandboxService({
			isEnabled: async () => true,
			wrapCommand: command => {
				calls.push('wrapCommand');
				return `wrapped:${command}`;
			},
			getSandboxConfigPath: async () => {
				calls.push('getSandboxConfigPath');
				return '/tmp/sandbox.json';
			},
		});

		const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
		const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
		strictEqual(result?.rewritten, 'wrapped:echo hello');
		strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
		deepStrictEqual(calls, ['getSandboxConfigPath', 'wrapCommand']);
	});
});
