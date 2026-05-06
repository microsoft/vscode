/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineSandboxAnalyzer } from '../../browser/tools/commandLineAnalyzer/commandLineSandboxAnalyzer.js';
import { TreeSitterCommandParserLanguage } from '../../browser/treeSitterCommandParser.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('CommandLineSandboxAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let sandboxEnabled: boolean;
	let analyzer: CommandLineSandboxAnalyzer;

	setup(() => {
		configurationService = new TestConfigurationService();
		sandboxEnabled = true;

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => sandboxEnabled,
			isSandboxAllowNetworkEnabled: async () => false,
		} as unknown as ITerminalSandboxService);

		analyzer = store.add(instantiationService.createInstance(CommandLineSandboxAnalyzer));
	});

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	function createOptions(options?: Partial<ICommandLineAnalyzerOptions>): ICommandLineAnalyzerOptions {
		return {
			commandLine: 'echo hello',
			cwd: undefined,
			shell: 'bash',
			os: OperatingSystem.Linux,
			treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
			terminalToolSessionId: 'test',
			chatSessionResource: undefined,
			...options,
		};
	}

	test('should force auto approval for sandboxed commands when auto approve is enabled', async () => {
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);

		const result = await analyzer.analyze(createOptions());

		strictEqual(result.isAutoApproveAllowed, true);
		strictEqual(result.forceAutoApproval, true);
	});

	test('should not force auto approval for sandboxed commands when auto approve is disabled', async () => {
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);

		const result = await analyzer.analyze(createOptions());

		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.forceAutoApproval, false);
	});

	test('should not force auto approval when unsandbox confirmation is required', async () => {
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);

		const result = await analyzer.analyze(createOptions({ requiresUnsandboxConfirmation: true }));

		strictEqual(result.isAutoApproveAllowed, true);
		strictEqual(result.forceAutoApproval, false);
	});

	test('should set auto approval allowed from setting when sandbox is disabled', async () => {
		sandboxEnabled = false;
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);

		const result = await analyzer.analyze(createOptions());

		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.forceAutoApproval, undefined);
	});
});
