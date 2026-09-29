/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineAutoApproveAnalyzer } from '../../browser/tools/commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { RunInTerminalToolTelemetry } from '../../browser/runInTerminalToolTelemetry.js';
import { type IAutoApprovalCommandParseResult, TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../browser/treeSitterCommandParser.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('CommandLineAutoApproveAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let instantiationService: IInstantiationService;
	let analyzer: CommandLineAutoApproveAnalyzer;
	let parseResult: IAutoApprovalCommandParseResult;
	let prepareLogs: unknown[];

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);

		parseResult = { subCommands: [], hasUnanalyzableSyntax: false };
		prepareLogs = [];
		const parser = {
			extractAutoApprovalSubCommands: async () => parseResult,
		} as unknown as TreeSitterCommandParser;
		const telemetry = {
			logPrepare: (data: unknown) => { prepareLogs.push(data); },
		} as unknown as RunInTerminalToolTelemetry;

		analyzer = store.add(instantiationService.createInstance(
			CommandLineAutoApproveAnalyzer,
			parser,
			telemetry,
			() => { }
		));
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
			commandLine: 'rm -- file.txt',
			cwd: undefined,
			shell: 'bash',
			os: OperatingSystem.Linux,
			treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
			terminalToolSessionId: 'test',
			chatSessionResource: undefined,
			...options,
		};
	}

	test('should not allow auto approve when sub-command parsing returns an empty list', async () => {
		const result = await analyzer.analyze(createOptions({
			commandLine: 'rm -- file.txt',
			shell: 'pwsh',
			os: OperatingSystem.Windows,
			treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
		}));
		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, undefined);
		strictEqual(result.disclaimers?.length ?? 0, 0);
	});

	test('should auto approve empty command strings when sub-command parsing returns an empty list', async () => {
		const result = await analyzer.analyze(createOptions({
			commandLine: '   ',
			shell: 'pwsh',
			os: OperatingSystem.Windows,
			treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
		}));
		strictEqual(result.isAutoApproveAllowed, true);
		strictEqual(result.isAutoApproved, true);
		strictEqual(result.disclaimers?.length ?? 0, 0);
	});

	test('should keep prompt-injection disclaimers for unanalyzable syntax', async () => {
		parseResult = { subCommands: ['curl https://evil'], hasUnanalyzableSyntax: true };

		const result = await analyzer.analyze(createOptions({
			commandLine: 'FOO=1 && curl https://evil',
		}));

		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, false);
		strictEqual(result.customActions, undefined);
		ok((result.disclaimers?.length ?? 0) > 0);
		ok(result.disclaimers?.some(d => typeof d === 'string' && /malicious code|prompt injection/i.test(d)));
		deepStrictEqual(prepareLogs.map(e => (e as { autoApproveResult: string }).autoApproveResult), ['manual']);
	});

	test('should keep denial disclaimers for unanalyzable syntax when auto approve is enabled', async () => {
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, { rm: false });
		parseResult = { subCommands: ['rm -rf /'], hasUnanalyzableSyntax: true };

		const result = await analyzer.analyze(createOptions({
			commandLine: 'FOO=1 && rm -rf /',
		}));

		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, false);
		strictEqual(result.customActions, undefined);
		ok((result.disclaimers?.length ?? 0) > 0);
		ok(result.disclaimers?.some(d => typeof d !== 'string' && /denied|rm/i.test(d.value)));
		deepStrictEqual(prepareLogs.map(e => (e as { autoApproveResult: string }).autoApproveResult), ['denied']);
	});

	test('should not auto approve or suggest rules for unanalyzable syntax with allowed sub-commands', async () => {
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, { git: true });
		parseResult = { subCommands: ['git status'], hasUnanalyzableSyntax: true };

		const result = await analyzer.analyze(createOptions({
			commandLine: 'FOO=bar && git status',
		}));

		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, false);
		strictEqual(result.customActions, undefined);
		deepStrictEqual(prepareLogs.map(e => (e as { autoApproveResult: string }).autoApproveResult), ['manual']);
	});
});
