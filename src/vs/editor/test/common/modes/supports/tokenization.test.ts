/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { strcmp, parseTheme, Theme, ParsedThemeRule, ColorMap, ExternalThemeTrieElement, ThemeTrieElementRule, FontStyle } from 'vs/editor/common/modes/supports/tokenization';

suite('Theme matching', () => {

	test('gives higher priority to deeper matches', () => {
		let theme = Theme.createFromRawTheme([
			{ token: '', foreground: '#100000', background: '#200000' },
			{ token: 'punctuation.definition.string.begin.html', foreground: '#300000' },
			{ token: 'punctuation.definition.string', foreground: '#400000' },
		]);

		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		colorMap.getId('#100000');
		colorMap.getId('#200000');
		colorMap.getId('#400000');
		const _D = colorMap.getId('#300000');

		let actual = theme.match('punctuation.definition.string.begin.html');

		assert.deepEqual(actual, new ThemeTrieElementRule(FontStyle.NotSet, _D, _NOT_SET));
	});

	test('can match', () => {
		let theme = Theme.createFromRawTheme([
			{ token: '', foreground: '#F8F8F2', background: '#272822' },
			{ token: 'source', background: '#100000' },
			{ token: 'something', background: '#100000' },
			{ token: 'bar', background: '#200000' },
			{ token: 'baz', background: '#200000' },
			{ token: 'bar', fontStyle: 'bold' },
			{ token: 'constant', fontStyle: 'italic', foreground: '#300000' },
			{ token: 'constant.numeric', foreground: '#400000' },
			{ token: 'constant.numeric.hex', fontStyle: 'bold' },
			{ token: 'constant.numeric.oct', fontStyle: 'bold italic underline' },
			{ token: 'constant.numeric.dec', fontStyle: '', foreground: '#500000' },
			{ token: 'storage.object.bar', fontStyle: '', foreground: '#600000' },
		]);

		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		colorMap.getId('#F8F8F2');
		colorMap.getId('#272822');
		const _C = colorMap.getId('#200000');
		const _D = colorMap.getId('#300000');
		const _E = colorMap.getId('#400000');
		const _F = colorMap.getId('#500000');
		const _G = colorMap.getId('#100000');
		const _H = colorMap.getId('#600000');

		function assertMatch(scopeName: string, expected: ThemeTrieElementRule): void {
			let actual = theme.match(scopeName);
			assert.deepEqual(actual, expected, 'when matching <<' + scopeName + '>>');
		}

		function assertSimpleMatch(scopeName: string, fontStyle: FontStyle, foreground: number, background: number): void {
			assertMatch(scopeName, new ThemeTrieElementRule(fontStyle, foreground, background));
		}

		function assertNoMatch(scopeName: string): void {
			assertMatch(scopeName, new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET));
		}

		// matches defaults
		assertNoMatch('');
		assertNoMatch('bazz');
		assertNoMatch('asdfg');

		// matches source
		assertSimpleMatch('source', FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('source.ts', FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('source.tss', FontStyle.NotSet, _NOT_SET, _G);

		// matches something
		assertSimpleMatch('something', FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('something.ts', FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('something.tss', FontStyle.NotSet, _NOT_SET, _G);

		// matches baz
		assertSimpleMatch('baz', FontStyle.NotSet, _NOT_SET, _C);
		assertSimpleMatch('baz.ts', FontStyle.NotSet, _NOT_SET, _C);
		assertSimpleMatch('baz.tss', FontStyle.NotSet, _NOT_SET, _C);

		// matches constant
		assertSimpleMatch('constant', FontStyle.Italic, _D, _NOT_SET);
		assertSimpleMatch('constant.string', FontStyle.Italic, _D, _NOT_SET);
		assertSimpleMatch('constant.hex', FontStyle.Italic, _D, _NOT_SET);

		// matches constant.numeric
		assertSimpleMatch('constant.numeric', FontStyle.Italic, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.baz', FontStyle.Italic, _E, _NOT_SET);

		// matches constant.numeric.hex
		assertSimpleMatch('constant.numeric.hex', FontStyle.Bold, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.hex.baz', FontStyle.Bold, _E, _NOT_SET);

		// matches constant.numeric.oct
		assertSimpleMatch('constant.numeric.oct', FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.oct.baz', FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _NOT_SET);

		// matches constant.numeric.dec
		assertSimpleMatch('constant.numeric.dec', FontStyle.None, _F, _NOT_SET);
		assertSimpleMatch('constant.numeric.dec.baz', FontStyle.None, _F, _NOT_SET);

		// matches storage.object.bar
		assertSimpleMatch('storage.object.bar', FontStyle.None, _H, _NOT_SET);
		assertSimpleMatch('storage.object.bar.baz', FontStyle.None, _H, _NOT_SET);

		// does not match storage.object.bar
		assertSimpleMatch('storage.object.bart', FontStyle.NotSet, _NOT_SET, _NOT_SET);
		assertSimpleMatch('storage.object', FontStyle.NotSet, _NOT_SET, _NOT_SET);
		assertSimpleMatch('storage', FontStyle.NotSet, _NOT_SET, _NOT_SET);

		assertSimpleMatch('bar', FontStyle.Bold, _NOT_SET, _C);
	});
});

suite('Theme parsing', () => {

	test('can parse', () => {

		let actual = parseTheme([
			{ token: '', foreground: '#F8F8F2', background: '#272822' },
			{ token: 'source', background: '#100000' },
			{ token: 'something', background: '#100000' },
			{ token: 'bar', background: '#010000' },
			{ token: 'baz', background: '#010000' },
			{ token: 'bar', fontStyle: 'bold' },
			{ token: 'constant', fontStyle: 'italic', foreground: '#ff0000' },
			{ token: 'constant.numeric', foreground: '#00ff00' },
			{ token: 'constant.numeric.hex', fontStyle: 'bold' },
			{ token: 'constant.numeric.oct', fontStyle: 'bold italic underline' },
			{ token: 'constant.numeric.dec', fontStyle: '', foreground: '#0000ff' },
		]);

		let expected = [
			new ParsedThemeRule('', 0, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('source', 1, FontStyle.NotSet, null, '#100000'),
			new ParsedThemeRule('something', 2, FontStyle.NotSet, null, '#100000'),
			new ParsedThemeRule('bar', 3, FontStyle.NotSet, null, '#010000'),
			new ParsedThemeRule('baz', 4, FontStyle.NotSet, null, '#010000'),
			new ParsedThemeRule('bar', 5, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant', 6, FontStyle.Italic, '#ff0000', null),
			new ParsedThemeRule('constant.numeric', 7, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('constant.numeric.hex', 8, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant.numeric.oct', 9, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
			new ParsedThemeRule('constant.numeric.dec', 10, FontStyle.None, '#0000ff', null),
		];

		assert.deepEqual(actual, expected);
	});
});

suite('Theme resolving', () => {

	test('strcmp works', () => {
		let actual = ['bar', 'z', 'zu', 'a', 'ab', ''].sort(strcmp);

		let expected = ['', 'a', 'ab', 'bar', 'z', 'zu'];
		assert.deepEqual(actual, expected);
	});

	test('always has defaults', () => {
		let actual = Theme.createFromParsedTheme([]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('respects incoming defaults 1', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('respects incoming defaults 2', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.None, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('respects incoming defaults 3', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.Bold, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.Bold, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('respects incoming defaults 4', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#ff0000', null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#ff0000');
		const _B = colorMap.getId('#ffffff');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('respects incoming defaults 5', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, null, '#ff0000')
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ff0000');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('can merge incoming defaults', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, null, '#ff0000'),
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('', -1, FontStyle.Bold, null, null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#00ff00');
		const _B = colorMap.getId('#ff0000');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.Bold, _A, _B));
		assert.deepEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET)));
	});

	test('defaults are inherited', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', -1, FontStyle.NotSet, '#ff0000', null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		let root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET), {
			'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _C, _NOT_SET))
		});
		assert.deepEqual(actual.getThemeTrieElement(), root);
	});

	test('same rules get merged', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', 1, FontStyle.Bold, null, null),
			new ParsedThemeRule('var', 0, FontStyle.NotSet, '#ff0000', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		let root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET), {
			'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _C, _NOT_SET))
		});
		assert.deepEqual(actual.getThemeTrieElement(), root);
	});

	test('rules are inherited 1', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', -1, FontStyle.Bold, '#ff0000', null),
			new ParsedThemeRule('var.identifier', -1, FontStyle.NotSet, '#00ff00', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		const _D = colorMap.getId('#00ff00');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		let root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET), {
			'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _C, _NOT_SET), {
				'identifier': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _D, _NOT_SET))
			})
		});
		assert.deepEqual(actual.getThemeTrieElement(), root);
	});

	test('rules are inherited 2', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', -1, FontStyle.Bold, '#ff0000', null),
			new ParsedThemeRule('var.identifier', -1, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('constant', 4, FontStyle.Italic, '#100000', null),
			new ParsedThemeRule('constant.numeric', 5, FontStyle.NotSet, '#200000', null),
			new ParsedThemeRule('constant.numeric.hex', 6, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant.numeric.oct', 7, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
			new ParsedThemeRule('constant.numeric.dec', 8, FontStyle.None, '#300000', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#100000');
		const _D = colorMap.getId('#200000');
		const _E = colorMap.getId('#300000');
		const _F = colorMap.getId('#ff0000');
		const _G = colorMap.getId('#00ff00');
		assert.deepEqual(actual.getColorMap(), colorMap.getColorMap());
		assert.deepEqual(actual.getDefaults(), new ThemeTrieElementRule(FontStyle.None, _A, _B));
		let root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, _NOT_SET, _NOT_SET), {
			'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _F, _NOT_SET), {
				'identifier': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _G, _NOT_SET))
			}),
			'constant': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Italic, _C, _NOT_SET), {
				'numeric': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Italic, _D, _NOT_SET), {
					'hex': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _D, _NOT_SET)),
					'oct': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _D, _NOT_SET)),
					'dec': new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _E, _NOT_SET)),
				})
			})
		});
		assert.deepEqual(actual.getThemeTrieElement(), root);
	});
});
