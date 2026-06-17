/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { applyBlockTextDirection } from '../../browser/textDirection.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('applyBlockTextDirection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function apply(html: string): HTMLElement {
		const root = document.createElement('div');
		root.innerHTML = html;
		applyBlockTextDirection(root);
		return root;
	}

	test('sets the right direction on each block-level text element', () => {
		const root = apply([
			'<h1>כותרת</h1>',
			'<p>שלום עולם</p>',
			'<p>Hello world</p>',
			'<ul><li>פריט</li></ul>',
			'<blockquote>ציטוט</blockquote>',
			'<pre><code>const x = 1;</code></pre>',
		].join(''));

		const dirOf = (selector: string) => root.querySelector(selector)?.getAttribute('dir') ?? null;
		assert.deepStrictEqual(
			{
				h1: dirOf('h1'),
				pHebrew: root.querySelectorAll('p')[0].getAttribute('dir'),
				pEnglish: root.querySelectorAll('p')[1].getAttribute('dir'),
				ul: dirOf('ul'),
				li: dirOf('li'),
				blockquote: dirOf('blockquote'),
				pre: dirOf('pre'),
				code: dirOf('code'),
			},
			{
				h1: 'rtl',
				pHebrew: 'rtl',
				pEnglish: 'auto',
				ul: 'rtl',       // the list flips its marker side with its content
				li: 'rtl',
				blockquote: 'rtl',
				pre: 'ltr',      // code is inherently left-to-right
				code: null,      // inline code keeps its natural bidi flow
			}
		);
	});

	test('does not touch non-text containers', () => {
		const root = apply('<div>שלום</div><span>שלום</span>');
		assert.strictEqual(root.querySelector('div')!.getAttribute('dir'), null);
		assert.strictEqual(root.querySelector('span')!.getAttribute('dir'), null);
	});

	test('preserves an explicit dir attribute', () => {
		const root = apply('<p dir="ltr">שלום עולם</p>');
		assert.strictEqual(root.querySelector('p')!.getAttribute('dir'), 'ltr');
	});
});
