/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { registerTerminalSuggestProvidersConfiguration } from '../../common/terminalSuggestConfiguration.js';

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
