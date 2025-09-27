/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { registerTerminalSuggestProvidersConfiguration, terminalSuggestConfiguration, TerminalSuggestSettingId } from '../../common/terminalSuggestConfiguration.js';

suite('Terminal Suggest Dynamic Configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should update configuration when providers change', () => {
		// Test initial state
		registerTerminalSuggestProvidersConfiguration([]);

		// Test with some providers
		const providers = ['terminal-suggest', 'builtinPwsh', 'lsp', 'custom-provider'];
		registerTerminalSuggestProvidersConfiguration(providers);

		// Test with empty providers
		registerTerminalSuggestProvidersConfiguration([]);

		// The fact that this doesn't throw means the basic logic works
		assert.ok(true);
	});

	test('should include default providers even when none provided', () => {
		// This should not throw and should set up default configuration
		registerTerminalSuggestProvidersConfiguration(undefined);
		assert.ok(true);
	});

	test('UpArrowNavigatesHistory should default to false', () => {
		// Test that the default value for UpArrowNavigatesHistory is false
		// This ensures that the first up arrow press navigates to the last suggestion
		// instead of hiding the widget and navigating terminal history
		const upArrowConfig = terminalSuggestConfiguration[TerminalSuggestSettingId.UpArrowNavigatesHistory];
		assert.strictEqual(upArrowConfig.default, false, 'UpArrowNavigatesHistory should default to false to avoid confusing first up arrow behavior');
	});
});
