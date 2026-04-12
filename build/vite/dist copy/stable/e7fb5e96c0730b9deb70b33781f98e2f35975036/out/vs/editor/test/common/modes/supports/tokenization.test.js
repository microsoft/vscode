/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ColorMap, ExternalThemeTrieElement, ParsedTokenThemeRule, ThemeTrieElementRule, TokenTheme, parseTokenTheme, strcmp } from '../../../../common/languages/supports/tokenization.js';
suite('Token theme matching', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('gives higher priority to deeper matches', () => {
        const theme = TokenTheme.createFromRawTokenTheme([
            { token: '', foreground: '100000', background: '200000' },
            { token: 'punctuation.definition.string.begin.html', foreground: '300000' },
            { token: 'punctuation.definition.string', foreground: '400000' },
        ], []);
        const colorMap = new ColorMap();
        colorMap.getId('100000');
        const _B = colorMap.getId('200000');
        colorMap.getId('400000');
        const _D = colorMap.getId('300000');
        const actual = theme._match('punctuation.definition.string.begin.html');
        assert.deepStrictEqual(actual, new ThemeTrieElementRule(0 /* FontStyle.None */, _D, _B));
    });
    test('can match', () => {
        const theme = TokenTheme.createFromRawTokenTheme([
            { token: '', foreground: 'F8F8F2', background: '272822' },
            { token: 'source', background: '100000' },
            { token: 'something', background: '100000' },
            { token: 'bar', background: '200000' },
            { token: 'baz', background: '200000' },
            { token: 'bar', fontStyle: 'bold' },
            { token: 'constant', fontStyle: 'italic', foreground: '300000' },
            { token: 'constant.numeric', foreground: '400000' },
            { token: 'constant.numeric.hex', fontStyle: 'bold' },
            { token: 'constant.numeric.oct', fontStyle: 'bold italic underline' },
            { token: 'constant.numeric.bin', fontStyle: 'bold strikethrough' },
            { token: 'constant.numeric.dec', fontStyle: '', foreground: '500000' },
            { token: 'storage.object.bar', fontStyle: '', foreground: '600000' },
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('F8F8F2');
        const _B = colorMap.getId('272822');
        const _C = colorMap.getId('200000');
        const _D = colorMap.getId('300000');
        const _E = colorMap.getId('400000');
        const _F = colorMap.getId('500000');
        const _G = colorMap.getId('100000');
        const _H = colorMap.getId('600000');
        function assertMatch(scopeName, expected) {
            const actual = theme._match(scopeName);
            assert.deepStrictEqual(actual, expected, 'when matching <<' + scopeName + '>>');
        }
        function assertSimpleMatch(scopeName, fontStyle, foreground, background) {
            assertMatch(scopeName, new ThemeTrieElementRule(fontStyle, foreground, background));
        }
        function assertNoMatch(scopeName) {
            assertMatch(scopeName, new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B));
        }
        // matches defaults
        assertNoMatch('');
        assertNoMatch('bazz');
        assertNoMatch('asdfg');
        // matches source
        assertSimpleMatch('source', 0 /* FontStyle.None */, _A, _G);
        assertSimpleMatch('source.ts', 0 /* FontStyle.None */, _A, _G);
        assertSimpleMatch('source.tss', 0 /* FontStyle.None */, _A, _G);
        // matches something
        assertSimpleMatch('something', 0 /* FontStyle.None */, _A, _G);
        assertSimpleMatch('something.ts', 0 /* FontStyle.None */, _A, _G);
        assertSimpleMatch('something.tss', 0 /* FontStyle.None */, _A, _G);
        // matches baz
        assertSimpleMatch('baz', 0 /* FontStyle.None */, _A, _C);
        assertSimpleMatch('baz.ts', 0 /* FontStyle.None */, _A, _C);
        assertSimpleMatch('baz.tss', 0 /* FontStyle.None */, _A, _C);
        // matches constant
        assertSimpleMatch('constant', 1 /* FontStyle.Italic */, _D, _B);
        assertSimpleMatch('constant.string', 1 /* FontStyle.Italic */, _D, _B);
        assertSimpleMatch('constant.hex', 1 /* FontStyle.Italic */, _D, _B);
        // matches constant.numeric
        assertSimpleMatch('constant.numeric', 1 /* FontStyle.Italic */, _E, _B);
        assertSimpleMatch('constant.numeric.baz', 1 /* FontStyle.Italic */, _E, _B);
        // matches constant.numeric.hex
        assertSimpleMatch('constant.numeric.hex', 2 /* FontStyle.Bold */, _E, _B);
        assertSimpleMatch('constant.numeric.hex.baz', 2 /* FontStyle.Bold */, _E, _B);
        // matches constant.numeric.oct
        assertSimpleMatch('constant.numeric.oct', 2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */ | 4 /* FontStyle.Underline */, _E, _B);
        assertSimpleMatch('constant.numeric.oct.baz', 2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */ | 4 /* FontStyle.Underline */, _E, _B);
        // matches constant.numeric.bin
        assertSimpleMatch('constant.numeric.bin', 2 /* FontStyle.Bold */ | 8 /* FontStyle.Strikethrough */, _E, _B);
        assertSimpleMatch('constant.numeric.bin.baz', 2 /* FontStyle.Bold */ | 8 /* FontStyle.Strikethrough */, _E, _B);
        // matches constant.numeric.dec
        assertSimpleMatch('constant.numeric.dec', 0 /* FontStyle.None */, _F, _B);
        assertSimpleMatch('constant.numeric.dec.baz', 0 /* FontStyle.None */, _F, _B);
        // matches storage.object.bar
        assertSimpleMatch('storage.object.bar', 0 /* FontStyle.None */, _H, _B);
        assertSimpleMatch('storage.object.bar.baz', 0 /* FontStyle.None */, _H, _B);
        // does not match storage.object.bar
        assertSimpleMatch('storage.object.bart', 0 /* FontStyle.None */, _A, _B);
        assertSimpleMatch('storage.object', 0 /* FontStyle.None */, _A, _B);
        assertSimpleMatch('storage', 0 /* FontStyle.None */, _A, _B);
        assertSimpleMatch('bar', 2 /* FontStyle.Bold */, _A, _C);
    });
});
suite('Token theme parsing', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('can parse', () => {
        const actual = parseTokenTheme([
            { token: '', foreground: 'F8F8F2', background: '272822' },
            { token: 'source', background: '100000' },
            { token: 'something', background: '100000' },
            { token: 'bar', background: '010000' },
            { token: 'baz', background: '010000' },
            { token: 'bar', fontStyle: 'bold' },
            { token: 'constant', fontStyle: 'italic', foreground: 'ff0000' },
            { token: 'constant.numeric', foreground: '00ff00' },
            { token: 'constant.numeric.hex', fontStyle: 'bold' },
            { token: 'constant.numeric.oct', fontStyle: 'bold italic underline' },
            { token: 'constant.numeric.dec', fontStyle: '', foreground: '0000ff' },
        ]);
        const expected = [
            new ParsedTokenThemeRule('', 0, -1 /* FontStyle.NotSet */, 'F8F8F2', '272822'),
            new ParsedTokenThemeRule('source', 1, -1 /* FontStyle.NotSet */, null, '100000'),
            new ParsedTokenThemeRule('something', 2, -1 /* FontStyle.NotSet */, null, '100000'),
            new ParsedTokenThemeRule('bar', 3, -1 /* FontStyle.NotSet */, null, '010000'),
            new ParsedTokenThemeRule('baz', 4, -1 /* FontStyle.NotSet */, null, '010000'),
            new ParsedTokenThemeRule('bar', 5, 2 /* FontStyle.Bold */, null, null),
            new ParsedTokenThemeRule('constant', 6, 1 /* FontStyle.Italic */, 'ff0000', null),
            new ParsedTokenThemeRule('constant.numeric', 7, -1 /* FontStyle.NotSet */, '00ff00', null),
            new ParsedTokenThemeRule('constant.numeric.hex', 8, 2 /* FontStyle.Bold */, null, null),
            new ParsedTokenThemeRule('constant.numeric.oct', 9, 2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */ | 4 /* FontStyle.Underline */, null, null),
            new ParsedTokenThemeRule('constant.numeric.dec', 10, 0 /* FontStyle.None */, '0000ff', null),
        ];
        assert.deepStrictEqual(actual, expected);
    });
});
suite('Token theme resolving', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('strcmp works', () => {
        const actual = ['bar', 'z', 'zu', 'a', 'ab', ''].sort(strcmp);
        const expected = ['', 'a', 'ab', 'bar', 'z', 'zu'];
        assert.deepStrictEqual(actual, expected);
    });
    test('always has defaults', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('000000');
        const _B = colorMap.getId('ffffff');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B)));
    });
    test('respects incoming defaults 1', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, null, null)
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('000000');
        const _B = colorMap.getId('ffffff');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B)));
    });
    test('respects incoming defaults 2', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, 0 /* FontStyle.None */, null, null)
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('000000');
        const _B = colorMap.getId('ffffff');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B)));
    });
    test('respects incoming defaults 3', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, 2 /* FontStyle.Bold */, null, null)
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('000000');
        const _B = colorMap.getId('ffffff');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _A, _B)));
    });
    test('respects incoming defaults 4', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, 'ff0000', null)
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('ff0000');
        const _B = colorMap.getId('ffffff');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B)));
    });
    test('respects incoming defaults 5', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, null, 'ff0000')
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('000000');
        const _B = colorMap.getId('ff0000');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B)));
    });
    test('can merge incoming defaults', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, null, 'ff0000'),
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, '00ff00', null),
            new ParsedTokenThemeRule('', -1, 2 /* FontStyle.Bold */, null, null),
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('00ff00');
        const _B = colorMap.getId('ff0000');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _A, _B)));
    });
    test('defaults are inherited', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, 'F8F8F2', '272822'),
            new ParsedTokenThemeRule('var', -1, -1 /* FontStyle.NotSet */, 'ff0000', null)
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('F8F8F2');
        const _B = colorMap.getId('272822');
        const _C = colorMap.getId('ff0000');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B), {
            'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _C, _B))
        });
        assert.deepStrictEqual(actual.getThemeTrieElement(), root);
    });
    test('same rules get merged', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, 'F8F8F2', '272822'),
            new ParsedTokenThemeRule('var', 1, 2 /* FontStyle.Bold */, null, null),
            new ParsedTokenThemeRule('var', 0, -1 /* FontStyle.NotSet */, 'ff0000', null),
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('F8F8F2');
        const _B = colorMap.getId('272822');
        const _C = colorMap.getId('ff0000');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B), {
            'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _C, _B))
        });
        assert.deepStrictEqual(actual.getThemeTrieElement(), root);
    });
    test('rules are inherited 1', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, 'F8F8F2', '272822'),
            new ParsedTokenThemeRule('var', -1, 2 /* FontStyle.Bold */, 'ff0000', null),
            new ParsedTokenThemeRule('var.identifier', -1, -1 /* FontStyle.NotSet */, '00ff00', null),
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('F8F8F2');
        const _B = colorMap.getId('272822');
        const _C = colorMap.getId('ff0000');
        const _D = colorMap.getId('00ff00');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B), {
            'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _C, _B), {
                'identifier': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _D, _B))
            })
        });
        assert.deepStrictEqual(actual.getThemeTrieElement(), root);
    });
    test('rules are inherited 2', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('', -1, -1 /* FontStyle.NotSet */, 'F8F8F2', '272822'),
            new ParsedTokenThemeRule('var', -1, 2 /* FontStyle.Bold */, 'ff0000', null),
            new ParsedTokenThemeRule('var.identifier', -1, -1 /* FontStyle.NotSet */, '00ff00', null),
            new ParsedTokenThemeRule('constant', 4, 1 /* FontStyle.Italic */, '100000', null),
            new ParsedTokenThemeRule('constant.numeric', 5, -1 /* FontStyle.NotSet */, '200000', null),
            new ParsedTokenThemeRule('constant.numeric.hex', 6, 2 /* FontStyle.Bold */, null, null),
            new ParsedTokenThemeRule('constant.numeric.oct', 7, 2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */ | 4 /* FontStyle.Underline */, null, null),
            new ParsedTokenThemeRule('constant.numeric.dec', 8, 0 /* FontStyle.None */, '300000', null),
        ], []);
        const colorMap = new ColorMap();
        const _A = colorMap.getId('F8F8F2');
        const _B = colorMap.getId('272822');
        const _C = colorMap.getId('100000');
        const _D = colorMap.getId('200000');
        const _E = colorMap.getId('300000');
        const _F = colorMap.getId('ff0000');
        const _G = colorMap.getId('00ff00');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
        const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _A, _B), {
            'var': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _F, _B), {
                'identifier': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _G, _B))
            }),
            'constant': new ExternalThemeTrieElement(new ThemeTrieElementRule(1 /* FontStyle.Italic */, _C, _B), {
                'numeric': new ExternalThemeTrieElement(new ThemeTrieElementRule(1 /* FontStyle.Italic */, _D, _B), {
                    'hex': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */, _D, _B)),
                    'oct': new ExternalThemeTrieElement(new ThemeTrieElementRule(2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */ | 4 /* FontStyle.Underline */, _D, _B)),
                    'dec': new ExternalThemeTrieElement(new ThemeTrieElementRule(0 /* FontStyle.None */, _E, _B)),
                })
            })
        });
        assert.deepStrictEqual(actual.getThemeTrieElement(), root);
    });
    test('custom colors are first in color map', () => {
        const actual = TokenTheme.createFromParsedTokenTheme([
            new ParsedTokenThemeRule('var', -1, -1 /* FontStyle.NotSet */, 'F8F8F2', null)
        ], [
            '000000', 'FFFFFF', '0F0F0F'
        ]);
        const colorMap = new ColorMap();
        colorMap.getId('000000');
        colorMap.getId('FFFFFF');
        colorMap.getId('0F0F0F');
        colorMap.getId('F8F8F2');
        assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemF0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUU1TCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBRWxDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtRQUNwRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsdUJBQXVCLENBQUM7WUFDaEQsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRTtZQUN6RCxFQUFFLEtBQUssRUFBRSwwQ0FBMEMsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFO1lBQzNFLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUU7U0FDaEUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVQLE1BQU0sUUFBUSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7UUFDaEMsUUFBUSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6QixNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BDLFFBQVEsQ0FBQyxLQUFLLENBQUMs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