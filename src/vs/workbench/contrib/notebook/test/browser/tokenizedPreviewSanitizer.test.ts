/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { sanitizeHtml } from '../../../../../base/browser/domSanitize.js';
import { getTokenizedPreviewSanitizerConfig } from '../../browser/view/cellParts/tokenizedPreviewSanitizer.js';

suite('Notebook tokenized preview sanitizer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps only monaco-tokenized-source on DIV', () => {
		const html = '<div class="monaco-tokenized-source other">text</div>';
		const result = sanitizeHtml(html, getTokenizedPreviewSanitizerConfig()).toString();
		assert.strictEqual(result, '<div class="monaco-tokenized-source">text</div>');
	});

	test('keeps only mtk classes on SPAN', () => {
		const html = '<span class="mtk1 mtkb other something">x</span>';
		const result = sanitizeHtml(html, getTokenizedPreviewSanitizerConfig()).toString();
		assert.strictEqual(result, '<span class="mtk1 mtkb">x</span>');
	});

	test('removes class attribute when empty after filtering', () => {
		const html = '<span class="nope also-nope">x</span>';
		const result = sanitizeHtml(html, getTokenizedPreviewSanitizerConfig()).toString();
		assert.strictEqual(result, '<span>x</span>');
	});

	test('does not add class when none present', () => {
		const html = '<div>plain</div>';
		const result = sanitizeHtml(html, getTokenizedPreviewSanitizerConfig()).toString();
		assert.strictEqual(result, '<div>plain</div>');
	});
});
