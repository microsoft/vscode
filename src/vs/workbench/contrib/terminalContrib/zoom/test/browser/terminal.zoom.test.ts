/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { clampTerminalFontSize } from '../../browser/terminal.zoom.contribution.js';

suite('Terminal Mouse Wheel Zoom', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('clamps font size to minimum value when below bounds', () => {
		const result = clampTerminalFontSize(3 + (-2)); // 3 - 2 = 1, clamped to 6
		strictEqual(result, 6, 'Font size should be clamped to minimum value of 6');
	});

	test('clamps font size to maximum value when above bounds', () => {
		const result = clampTerminalFontSize(99 + 5); // 99 + 5 = 104, clamped to 100
		strictEqual(result, 100, 'Font size should be clamped to maximum value of 100');
	});

	test('preserves font size when within bounds', () => {
		const result = clampTerminalFontSize(12 + 3); // 12 + 3 = 15, within bounds
		strictEqual(result, 15, 'Font size should remain unchanged when within bounds');
	});

	test('clamps font size when going below minimum', () => {
		const result = clampTerminalFontSize(6 + (-1)); // 6 - 1 = 5, clamped to 6
		strictEqual(result, 6, 'Font size should be clamped when going below minimum');
	});

	test('clamps font size when going above maximum', () => {
		const result = clampTerminalFontSize(100 + 1); // 100 + 1 = 101, clamped to 100
		strictEqual(result, 100, 'Font size should be clamped when going above maximum');
	});
});
