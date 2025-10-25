/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeTerminalCompletionLabel } from '../../browser/terminalCompletionService.js';
import { GeneralShellType, PosixShellType, TerminalShellType, WindowsShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { strict as assert } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('escapeTerminalCompletionLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const shellType: TerminalShellType = PosixShellType.Bash;
	const pathSeparator = '/';
	const cases = [
		{ char: '[', label: '[abc', expected: '\\[abc' },
		{ char: ']', label: 'abc]', expected: 'abc\\]' },
		{ char: '(', label: '(abc', expected: '\\(abc' },
		{ char: ')', label: 'abc)', expected: 'abc\\)' },
		{ char: '\'', label: `'abc`, expected: `\\'abc` },
		{ char: '"', label: '"abc', expected: '\\"abc' },
		{ char: '\\', label: 'abc\\', expected: 'abc\\\\' },
		{ char: '`', label: '`abc', expected: '\\`abc' },
		{ char: '*', label: '*abc', expected: '\\*abc' },
		{ char: '?', label: '?abc', expected: '\\?abc' },
		{ char: ';', label: ';abc', expected: '\\;abc' },
		{ char: '&', label: '&abc', expected: '\\&abc' },
		{ char: '|', label: '|abc', expected: '\\|abc' },
		{ char: '<', label: '<abc', expected: '\\<abc' },
		{ char: '>', label: '>abc', expected: '\\>abc' },
	];

	for (const { char, label, expected } of cases) {
		test(`should escape '${char}' in "${label}"`, () => {
			const result = escapeTerminalCompletionLabel(label, shellType, pathSeparator);
			assert.equal(result, expected);
		});
	}

	test('should not escape when no special chars', () => {
		const result = escapeTerminalCompletionLabel('abc', shellType, pathSeparator);
		assert.equal(result, 'abc');
	});

	test('should not escape for PowerShell', () => {
		const result = escapeTerminalCompletionLabel('[abc', GeneralShellType.PowerShell, pathSeparator);
		assert.equal(result, '[abc');
	});

	test('should not escape for CommandPrompt', () => {
		const result = escapeTerminalCompletionLabel('[abc', WindowsShellType.CommandPrompt, pathSeparator);
		assert.equal(result, '[abc');
	});
});
