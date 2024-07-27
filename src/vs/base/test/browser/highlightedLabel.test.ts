/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('HighlightedLabel', () => {
	let label: HighlightedLabel;

	setup(() => {
		label = new HighlightedLabel(document.createElement('div'), { supportIcons: true });
	});

	test('empty label', function () {
		assert.strictEqual(label.element.innerHTML, '');
	});

	test('no decorations', function () {
		label.set('hello');
		assert.strictEqual(label.element.innerHTML, 'hello');
	});

	test('escape html', function () {
		label.set('hel<lo');
		assert.strictEqual(label.element.innerHTML, 'hel&lt;lo');
	});

	test('everything highlighted', function () {
		label.set('hello', [{ start: 0, end: 5 }]);
		assert.strictEqual(label.element.innerHTML, '<span class="highlight">hello</span>');
	});

	test('beginning highlighted', function () {
		label.set('hellothere', [{ start: 0, end: 5 }]);
		assert.strictEqual(label.element.innerHTML, '<span class="highlight">hello</span>there');
	});

	test('ending highlighted', function () {
		label.set('goodbye', [{ start: 4, end: 7 }]);
		assert.strictEqual(label.element.innerHTML, 'good<span class="highlight">bye</span>');
	});

	test('middle highlighted', function () {
		label.set('foobarfoo', [{ start: 3, end: 6 }]);
		assert.strictEqual(label.element.innerHTML, 'foo<span class="highlight">bar</span>foo');
	});

	test('escapeNewLines', () => {

		let highlights = [{ start: 0, end: 5 }, { start: 7, end: 9 }, { start: 11, end: 12 }];// before,after,after
		let escaped = HighlightedLabel.escapeNewLines('ACTION\r\n_TYPE2', highlights);
		assert.strictEqual(escaped, 'ACTION\u23CE_TYPE2');
		assert.deepStrictEqual(highlights, [{ start: 0, end: 5 }, { start: 6, end: 8 }, { start: 10, end: 11 }]);

		highlights = [{ start: 5, end: 9 }, { start: 11, end: 12 }];//overlap,after
		escaped = HighlightedLabel.escapeNewLines('ACTION\r\n_TYPE2', highlights);
		assert.strictEqual(escaped, 'ACTION\u23CE_TYPE2');
		assert.deepStrictEqual(highlights, [{ start: 5, end: 8 }, { start: 10, end: 11 }]);
	});

	teardown(() => {
		label.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
