/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PosixShellType, WindowsShellType, GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { isShellTypeSupportedForSuggestions } from '../../browser/terminalSuggestAddon.js';

suite('Terminal Suggest Addon - Shell Type Support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return true for supported shell types', () => {
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Bash), true);
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Zsh), true);
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Fish), true);
		strictEqual(isShellTypeSupportedForSuggestions(GeneralShellType.PowerShell), true);
		strictEqual(isShellTypeSupportedForSuggestions(WindowsShellType.GitBash), true);
		strictEqual(isShellTypeSupportedForSuggestions(GeneralShellType.Python), true);
	});

	test('should return false for unsupported shell types', () => {
		strictEqual(isShellTypeSupportedForSuggestions(GeneralShellType.NuShell), false);
		strictEqual(isShellTypeSupportedForSuggestions(GeneralShellType.Julia), false);
		strictEqual(isShellTypeSupportedForSuggestions(GeneralShellType.Node), false);
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Sh), false);
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Csh), false);
		strictEqual(isShellTypeSupportedForSuggestions(PosixShellType.Ksh), false);
		strictEqual(isShellTypeSupportedForSuggestions(WindowsShellType.CommandPrompt), false);
		strictEqual(isShellTypeSupportedForSuggestions(WindowsShellType.Wsl), false);
		strictEqual(isShellTypeSupportedForSuggestions(undefined), false);
	});
});