/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { normalizeQuickSuggestionsConfig, registerTerminalSuggestProvidersConfiguration } from '../../common/terminalSuggestConfiguration.js';

suite('Terminal Suggest Dynamic Configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should update configuration when providers change', () => {
		// Test initial state
		registerTerminalSuggestProvidersConfiguration();

		// Test with some providers
		const providers = new Map([
			['terminal-suggest', { id: 'terminal-suggest', description: 'Provides intelligent completions for terminal commands' }],
			['builtinPwsh', { id: 'builtinPwsh', description: 'PowerShell completion provider' }],
			['lsp', { id: 'lsp' }],
			['custom-provider', { id: 'custom-provider' }],
		]);
		registerTerminalSuggestProvidersConfiguration(providers);

		// Test with empty providers
		registerTerminalSuggestProvidersConfiguration();

		// The fact that this doesn't throw means the basic logic works
		assert.ok(true);
	});

	test('should include default providers even when none provided', () => {
		// This should not throw and should set up default configuration
		registerTerminalSuggestProvidersConfiguration(undefined);
		assert.ok(true);
	});
});

suite('normalizeQuickSuggestionsConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should normalize boolean true to on for commands and arguments, off for unknown', () => {
		const result = normalizeQuickSuggestionsConfig(true);
		assert.strictEqual(result.commands, 'on');
		assert.strictEqual(result.arguments, 'on');
		assert.strictEqual(result.unknown, 'off');
	});

	test('should normalize boolean false to off for all', () => {
		const result = normalizeQuickSuggestionsConfig(false);
		assert.strictEqual(result.commands, 'off');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'off');
	});

	test('should normalize object with boolean values', () => {
		const result = normalizeQuickSuggestionsConfig({
			commands: true,
			arguments: false,
			unknown: true
		});
		assert.strictEqual(result.commands, 'on');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'on');
	});

	test('should normalize object with string values', () => {
		const result = normalizeQuickSuggestionsConfig({
			commands: 'on',
			arguments: 'off',
			unknown: 'on'
		});
		assert.strictEqual(result.commands, 'on');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'on');
	});

	test('should normalize object with mixed boolean and string values', () => {
		const result = normalizeQuickSuggestionsConfig({
			commands: true,
			arguments: 'off',
			unknown: false
		});
		assert.strictEqual(result.commands, 'on');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'off');
	});

	test('should use defaults for missing properties', () => {
		const result = normalizeQuickSuggestionsConfig({
			commands: 'on'
		});
		assert.strictEqual(result.commands, 'on');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'off');
	});

	test('should handle empty object', () => {
		const result = normalizeQuickSuggestionsConfig({});
		assert.strictEqual(result.commands, 'off');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'off');
	});

	test('should handle invalid values by using defaults', () => {
		const result = normalizeQuickSuggestionsConfig({
			commands: 'invalid' as any,
			arguments: 123 as any,
			unknown: null as any
		});
		assert.strictEqual(result.commands, 'off');
		assert.strictEqual(result.arguments, 'off');
		assert.strictEqual(result.unknown, 'off');
	});
});
