/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineAutoApproveAnalyzer } from '../../browser/tools/commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
import { RunInTerminalToolTelemetry } from '../../browser/runInTerminalToolTelemetry.js';
import { type IAutoApprovalCommandParseResult, TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../browser/treeSitterCommandParser.js';

suite('CommandLineAutoApproveAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: IInstantiationService;
	let analyzer: CommandLineAutoApproveAnalyzer;
	let parseResult: IAutoApprovalCommandParseResult;

	setup(() => {
		const configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);

		parseResult = { subCommands: [], hasUnanalyzableSyntax: false };
		const parser = {
			extractAutoApprovalSubCommands: async () => parseResult,
		} as unknown as TreeSitterCommandParser;
		const telemetry = {
			logPrepare: () => { },
		} as unknown as RunInTerminalToolTelemetry;

		analyzer = store.add(instantiationService.createInstance(
			CommandLineAutoApproveAnalyzer,
			parser,
			telemetry,
			() => { }
		));
	});

	test('should not allow auto approve when sub-command parsing returns an empty list', async () => {
		const options: ICommandLineAnalyzerOptions = {
			commandLine: 'rm -- file.txt',
			cwd: undefined,
			shell: 'pwsh',
			os: OperatingSystem.Windows,
			treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
			terminalToolSessionId: 'test',
			chatSessionResource: undefined,
		};

		const result = await analyzer.analyze(options);
		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, undefined);
		strictEqual(result.disclaimers?.length ?? 0, 0);
	});

	test('should not allow auto approve when parsing finds unanalyzable syntax', async () => {
		parseResult = { subCommands: ['git status'], hasUnanalyzableSyntax: true };
		const options: ICommandLineAnalyzerOptions = {
			commandLine: 'FOO=bar && git status',
			cwd: undefined,
			shell: 'bash',
			os: OperatingSystem.Linux,
			treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
			terminalToolSessionId: 'test',
			chatSessionResource: undefined,
		};

		const result = await analyzer.analyze(options);
		strictEqual(result.isAutoApproveAllowed, false);
		strictEqual(result.isAutoApproved, undefined);
		strictEqual(result.disclaimers?.length ?? 0, 0);
	});

	test('should auto approve empty command strings when sub-command parsing returns an empty list', async () => {
		const options: ICommandLineAnalyzerOptions = {
			commandLine: '   ',
			cwd: undefined,
			shell: 'pwsh',
			os: OperatingSystem.Windows,
			treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
			terminalToolSessionId: 'test',
			chatSessionResource: undefined,
		};

		const result = await analyzer.analyze(options);
		strictEqual(result.isAutoApproveAllowed, true);
		strictEqual(result.isAutoApproved, true);
		strictEqual(result.disclaimers?.length ?? 0, 0);
	});
});
