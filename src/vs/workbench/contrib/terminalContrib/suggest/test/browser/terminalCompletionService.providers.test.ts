/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TerminalShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCompletionProvider, TerminalCompletionService } from '../../browser/terminalCompletionService.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from '../../browser/terminalCompletionItem.js';
import { TerminalSuggestSettingId } from '../../common/terminalSuggestConfiguration.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('TerminalCompletionService - Provider Configuration', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let terminalCompletionService: TerminalCompletionService;
	let capabilities: TerminalCapabilityStore;
	const disposables: IDisposable[] = [];

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());

		terminalCompletionService = instantiationService.createInstance(TerminalCompletionService);
		capabilities = new TerminalCapabilityStore();
	});

	teardown(() => {
		disposables.forEach(d => d.dispose());
		disposables.length = 0;
		terminalCompletionService.dispose();
	});

	// Mock provider for testing
	function createMockProvider(id: string): ITerminalCompletionProvider {
		return {
			id,
			provideCompletions: async () => [{
				label: `completion-from-${id}`,
				kind: TerminalCompletionItemKind.Method,
				replacementIndex: 0,
				replacementLength: 0
			}]
		};
	}

	test('should enable providers by default when no configuration exists', async () => {
		// Register two providers - one in default config, one not
		const defaultProvider = createMockProvider('terminal-suggest');
		const newProvider = createMockProvider('new-extension-provider');
		
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'terminal-suggest', defaultProvider));
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'new-extension-provider', newProvider));

		// Set empty configuration (no provider keys)
		configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {});

		const result = await terminalCompletionService.provideCompletions(
			'test',
			4,
			false,
			TerminalShellType.Bash,
			capabilities,
			CancellationToken.None
		);

		// Both providers should be enabled since they're not explicitly disabled
		assert.ok(result, 'Should have completions');
		assert.strictEqual(result.length, 2, 'Should have completions from both providers');
		
		const labels = result.map(c => c.label);
		assert.ok(labels.includes('completion-from-terminal-suggest'), 'Should include completion from default provider');
		assert.ok(labels.includes('completion-from-new-extension-provider'), 'Should include completion from new provider');
	});

	test('should disable providers when explicitly set to false', async () => {
		const provider1 = createMockProvider('provider1');
		const provider2 = createMockProvider('provider2');
		
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider1', provider1));
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider2', provider2));

		// Disable provider1, leave provider2 unconfigured
		configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
			'provider1': false
		});

		const result = await terminalCompletionService.provideCompletions(
			'test',
			4,
			false,
			TerminalShellType.Bash,
			capabilities,
			CancellationToken.None
		);

		// Only provider2 should be enabled
		assert.ok(result, 'Should have completions');
		assert.strictEqual(result.length, 1, 'Should have completions from only one provider');
		assert.strictEqual(result[0].label, 'completion-from-provider2', 'Should only include completion from enabled provider');
	});

	test('should enable providers when explicitly set to true', async () => {
		const provider1 = createMockProvider('provider1');
		const provider2 = createMockProvider('provider2');
		
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider1', provider1));
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider2', provider2));

		// Explicitly enable provider1, leave provider2 unconfigured
		configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
			'provider1': true
		});

		const result = await terminalCompletionService.provideCompletions(
			'test',
			4,
			false,
			TerminalShellType.Bash,
			capabilities,
			CancellationToken.None
		);

		// Both providers should be enabled
		assert.ok(result, 'Should have completions');
		assert.strictEqual(result.length, 2, 'Should have completions from both providers');
		
		const labels = result.map(c => c.label);
		assert.ok(labels.includes('completion-from-provider1'), 'Should include completion from explicitly enabled provider');
		assert.ok(labels.includes('completion-from-provider2'), 'Should include completion from default enabled provider');
	});

	test('should handle mixed configuration correctly', async () => {
		const provider1 = createMockProvider('provider1');
		const provider2 = createMockProvider('provider2');
		const provider3 = createMockProvider('provider3');
		
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider1', provider1));
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider2', provider2));
		disposables.push(terminalCompletionService.registerTerminalCompletionProvider('test-ext', 'provider3', provider3));

		// Mixed configuration: enable provider1, disable provider2, leave provider3 unconfigured
		configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
			'provider1': true,
			'provider2': false
		});

		const result = await terminalCompletionService.provideCompletions(
			'test',
			4,
			false,
			TerminalShellType.Bash,
			capabilities,
			CancellationToken.None
		);

		// provider1 and provider3 should be enabled, provider2 should be disabled
		assert.ok(result, 'Should have completions');
		assert.strictEqual(result.length, 2, 'Should have completions from two providers');
		
		const labels = result.map(c => c.label);
		assert.ok(labels.includes('completion-from-provider1'), 'Should include completion from explicitly enabled provider');
		assert.ok(labels.includes('completion-from-provider3'), 'Should include completion from default enabled provider');
		assert.ok(!labels.includes('completion-from-provider2'), 'Should not include completion from disabled provider');
	});
});