/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createCSSRule, createStyleSheet, removeCSSRules, removeCSSRulesContainingSelector } from '../../browser/domStylesheets.js';
import { DisposableStore, toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('domStylesheets', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestStyleSheet(): HTMLStyleElement {
		const disposables = store.add(new DisposableStore());
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		return createStyleSheet(container, undefined, disposables);
	}

	function readSelectors(styleSheet: HTMLStyleElement): string[] {
		return Array.from(styleSheet.sheet!.cssRules).map(rule => (rule as CSSStyleRule).selectorText);
	}

	test('createCSSRule returns the inserted rule', () => {
		const styleSheet = createTestStyleSheet();

		const rule = createCSSRule('.a', 'color:red;', styleSheet);

		assert.strictEqual(rule, styleSheet.sheet!.cssRules[0]);
		assert.strictEqual(createCSSRule('.a', '', styleSheet), undefined);
	});

	test('removeCSSRules removes exactly the given rules', () => {
		const styleSheet = createTestStyleSheet();

		const a = createCSSRule('.a', 'color:red;', styleSheet)!;
		createCSSRule('.b', 'color:green;', styleSheet);
		const c = createCSSRule('.c', 'color:blue;', styleSheet)!;

		assert.deepStrictEqual(readSelectors(styleSheet), ['.c', '.b', '.a']);

		removeCSSRules(new Set([a, c]), styleSheet);

		assert.deepStrictEqual(readSelectors(styleSheet), ['.b']);
	});

	test('removeCSSRules ignores rules that are no longer in the stylesheet', () => {
		const styleSheet = createTestStyleSheet();

		const a = createCSSRule('.a', 'color:red;', styleSheet)!;
		createCSSRule('.b', 'color:green;', styleSheet);

		removeCSSRules(new Set([a]), styleSheet);
		removeCSSRules(new Set([a]), styleSheet);

		assert.deepStrictEqual(readSelectors(styleSheet), ['.b']);
	});

	test('removeCSSRules only removes the rule it was given for repeated selectors', () => {
		const styleSheet = createTestStyleSheet();

		const first = createCSSRule('.a', 'color:red;', styleSheet)!;
		createCSSRule('.a', 'color:green;', styleSheet);

		removeCSSRules(new Set([first]), styleSheet);

		assert.strictEqual(styleSheet.sheet!.cssRules.length, 1);
		assert.strictEqual((styleSheet.sheet!.cssRules[0] as CSSStyleRule).style.color, 'green');
	});

	test('removeCSSRulesContainingSelector still matches on substrings', () => {
		const styleSheet = createTestStyleSheet();

		createCSSRule('.foo', 'color:red;', styleSheet);
		createCSSRule('.foo.bar', 'color:green;', styleSheet);
		createCSSRule('.baz', 'color:blue;', styleSheet);

		removeCSSRulesContainingSelector('.foo', styleSheet);

		assert.deepStrictEqual(readSelectors(styleSheet), ['.baz']);
	});
});
