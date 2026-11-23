/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../browser/media/review.css';

suite('Comment Glyph Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('gutter glyphs use the product icon theme font and character', () => {
		const editor = dom.$('.monaco-editor');
		for (const icon of ['plus', 'comment-add', 'comment-unresolved', 'comment-draft']) {
			editor.style.setProperty(`--vscode-icon-${icon}-font-family`, '"product-icon-theme-font"');
			editor.style.setProperty(`--vscode-icon-${icon}-content`, '"\\f13c"');
		}
		const line = dom.append(dom.append(editor, dom.$('.margin-view-overlays')), dom.$('div'));
		mainWindow.document.body.appendChild(editor);
		store.add(toDisposable(() => editor.remove()));

		const actual = ['line-hover', 'comment-thread', 'comment-thread-unresolved', 'comment-thread-draft'].map(className => {
			const glyph = dom.append(line, dom.$(`.comment-range-glyph.${className}`));
			const style = mainWindow.getComputedStyle(glyph, '::before');
			return { className, content: style.content, fontFamily: style.fontFamily };
		});

		assert.deepStrictEqual(actual, [
			{ className: 'line-hover', content: '"\uf13c"', fontFamily: 'product-icon-theme-font' },
			{ className: 'comment-thread', content: '"\uf13c"', fontFamily: 'product-icon-theme-font' },
			{ className: 'comment-thread-unresolved', content: '"\uf13c"', fontFamily: 'product-icon-theme-font' },
			{ className: 'comment-thread-draft', content: '"\uf13c"', fontFamily: 'product-icon-theme-font' },
		]);
	});
});
