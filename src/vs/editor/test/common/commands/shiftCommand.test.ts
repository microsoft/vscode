/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ShiftCommand } from '../../../common/commands/shiftCommand.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ShiftCommand static indentation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #5394: tabs mode (tabSize == indentSize) is unchanged', () => {
		assert.strictEqual(ShiftCommand.shiftIndent('', 1, 4, 4, false), '\t');
		assert.strictEqual(ShiftCommand.shiftIndent('\t', 2, 4, 4, false), '\t\t');
		assert.strictEqual(ShiftCommand.unshiftIndent('\t', 2, 4, 4, false), '');
	});

	test('issue #5394: mixed mode (tabSize 8, indentSize 2)', () => {
		// shifting 2 columns of indent: spaces only
		assert.strictEqual(ShiftCommand.shiftIndent('', 1, 8, 2, false), '  ');
		assert.strictEqual(ShiftCommand.shiftIndent('  ', 3, 8, 2, false), '    ');
		// shifting 8 columns of indent by 2: one tab + 2 spaces
		assert.strictEqual(ShiftCommand.shiftIndent('        ', 9, 8, 2, false), '\t  ');
		// shifting 10 columns of indent by 2: one tab + 4 spaces
		assert.strictEqual(ShiftCommand.shiftIndent('\t  ', 4, 8, 2, false), '\t    ');
		// shifting 16 columns of indent: two tabs
		assert.strictEqual(ShiftCommand.shiftIndent('\t\t', 3, 8, 2, false), '\t\t  ');

		// unshifting 4 columns of indent: 2 columns remain
		assert.strictEqual(ShiftCommand.unshiftIndent('    ', 5, 8, 2, false), '  ');
		// unshifting 10 columns of indent -> 8 columns: one tab + 2 spaces
		assert.strictEqual(ShiftCommand.unshiftIndent('\t    ', 6, 8, 2, false), '\t  ');
		// unshifting 8 columns of indent -> 6 columns
		assert.strictEqual(ShiftCommand.unshiftIndent('\t', 2, 8, 2, false), '      ');
	});
});
