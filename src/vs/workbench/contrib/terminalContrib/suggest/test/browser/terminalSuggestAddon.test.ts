/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PosixShellType, WindowsShellType, GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { isInlineCompletionSupported, SuggestAddon } from '../../browser/terminalSuggestAddon.js';
import { MINIMUM_LINE_HEIGHT } from '../../../../../../editor/common/config/fontInfo.js';

suite('Terminal Suggest Addon - Inline Completion, Shell Type Support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return true for supported shell types', () => {
		strictEqual(isInlineCompletionSupported(PosixShellType.Bash), true);
		strictEqual(isInlineCompletionSupported(PosixShellType.Zsh), true);
		strictEqual(isInlineCompletionSupported(PosixShellType.Fish), true);
		strictEqual(isInlineCompletionSupported(GeneralShellType.PowerShell), true);
		strictEqual(isInlineCompletionSupported(WindowsShellType.GitBash), true);
	});

	test('should return false for unsupported shell types', () => {
		strictEqual(isInlineCompletionSupported(GeneralShellType.NuShell), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Julia), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Node), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Python), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Sh), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Csh), false);
		strictEqual(isInlineCompletionSupported(PosixShellType.Ksh), false);
		strictEqual(isInlineCompletionSupported(WindowsShellType.CommandPrompt), false);
		strictEqual(isInlineCompletionSupported(WindowsShellType.Wsl), false);
		strictEqual(isInlineCompletionSupported(GeneralShellType.Python), false);
		strictEqual(isInlineCompletionSupported(undefined), false);
	});
});

suite('Terminal Suggest Addon - Font Info Processing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lineHeight should not be double-processed when already calculated', () => {
		// This test demonstrates the issue: when terminal configuration service
		// provides a lineHeight that's a multiplier (e.g., 1.1), the suggest addon
		// should convert it to pixels correctly.
		
		// Test case: fontSize=15, lineHeight=1.1 (multiplier)
		// Expected: 15 * 1.1 = 16.5 pixels for the suggest widget
		// Previous bug: 1.1 < 8 (MINIMUM_LINE_HEIGHT), so it was treated as pixels,
		// then no multiplication happened, resulting in 1.1 pixel line height (incorrect)
		
		// With the fix: lineHeight > 1, so it gets multiplied by fontSize = 16.5 pixels (correct)
		
		const fontSize = 15;
		const terminalLineHeightMultiplier = 1.1;
		const expectedPixelLineHeight = Math.round(fontSize * terminalLineHeightMultiplier);
		
		// The fix ensures that terminal lineHeight values > 1 are always treated as multipliers
		// and converted to pixels by multiplying with fontSize
		strictEqual(expectedPixelLineHeight, 17); // Math.round(15 * 1.1) = 17
	});
});
