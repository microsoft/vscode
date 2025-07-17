/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PosixShellType, WindowsShellType, GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { isInlineCompletionSupported } from '../../browser/terminalSuggestAddon.js';

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
