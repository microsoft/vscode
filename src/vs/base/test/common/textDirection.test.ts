/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { detectTextDirection } from '../../common/textDirection.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('textDirection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns auto for empty text', () => {
		assert.strictEqual(detectTextDirection(''), 'auto');
	});

	test('returns auto for neutral characters only', () => {
		assert.strictEqual(detectTextDirection('123 !@# ...'), 'auto');
	});

	test('returns auto for pure English text', () => {
		assert.strictEqual(detectTextDirection('Hello world'), 'auto');
	});

	test('returns rtl for Hebrew text', () => {
		assert.strictEqual(detectTextDirection('שלום עולם'), 'rtl');
	});

	test('returns rtl for Arabic text', () => {
		assert.strictEqual(detectTextDirection('مرحبا بالعالم'), 'rtl');
	});

	test('returns rtl when an RTL word appears after an English prefix', () => {
		assert.strictEqual(detectTextDirection('REACT מאפשרת לבנות ממשקי משתמש'), 'rtl');
	});

	test('returns rtl when a single RTL word is embedded in English', () => {
		assert.strictEqual(detectTextDirection('The שלום framework is great'), 'rtl');
	});
});
