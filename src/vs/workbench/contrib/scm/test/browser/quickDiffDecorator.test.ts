/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { normalizeDiffDecorationsGutterWidth } from '../../browser/quickDiffDecorator.js';

suite('normalizeDiffDecorationsGutterWidth', () => {
	test('returns input for valid values', () => {
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(1), 1);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(3), 3);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(20), 20);
	});

	test('falls back for invalid values', () => {
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(0), 3);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(-1), 3);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(1.5), 3);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(21), 3);
		assert.strictEqual(normalizeDiffDecorationsGutterWidth(Number.NaN), 3);
	});
});
