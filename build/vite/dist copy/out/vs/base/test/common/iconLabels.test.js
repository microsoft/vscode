/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { escapeIcons, getCodiconAriaLabel, markdownEscapeEscapedIcons, matchesFuzzyIconAware, parseLabelWithIcons, stripIcons } from '../../common/iconLabels.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
function filterOk(filter, word, target, highlights) {
    const r = filter(word, target);
    assert(r);
    if (highlights) {
        assert.deepStrictEqual(r, highlights);
    }
}
suite('Icon Labels', () => {
    test('Can get proper aria labels', () => {
        // note, the spaces in the results are important
        const testCases = new Map([
            ['', ''],
            ['asdf', 'asdf'],
            ['asdf$(squirrel)asdf', 'asdf squirrel asdf'],
            ['asdf $(squirrel) asdf', 'asdf  squirrel  asdf'],
            ['$(rocket)asdf', 'rocket asdf'],
            ['$(rocket) asdf', 'rocket  asdf'],
            ['$(rocket)$(rocket)$(rocket)asdf', 'rocket  rocket  rocket asdf'],
            ['$(rocket) asdf $(rocket)', 'rocket  asdf  rocket'],
            ['$(rocket)asdf$(rocket)', 'rocket asdf rocket'],
        ]);
        for (const [input, expected] of testCases) {
            assert.strictEqual(getCodiconAriaLabel(input), expected);
        }
    });
    test('matchesFuzzyIconAware', () => {
        // Camel Case
        filterOk(matchesFuzzyIconAware, 'ccr', parseLabelWithIcons('$(codicon)CamelCaseRocks$(codicon)'), [
            { start: 10, end: 11 },
            { start: 15, end: 16 },
            { start: 19, end: 20 }
        ]);
        filterOk(matchesFuzzyIconAware, 'ccr', parseLabelWithIcons('$(codicon) CamelCaseRocks $(codicon)'), [
            { start: 11, end: 12 },
            { start: 16, end: 17 },
            { start: 20, end: 21 }
        ]);
        filterOk(matchesFuzzyIconAware, 'iut', parseLabelWithIcons('$(codicon) Indent $(octico) Using $(octic) Tpaces'), [
            { start: 11, end: 12 },
            { start: 28, end: 29 },
            { start: 43, end: 44 },
        ]);
        // Prefix
        filterOk(matchesFuzzyIconAware, 'using', parseLabelWithIcons('$(codicon) Indent Using Spaces'), [
            { start: 18, end: 23 },
        ]);
        // Broken Codicon
        filterOk(matchesFuzzyIconAware, 'codicon', parseLabelWithIcons('This $(codicon Indent Using Spaces'), [
            { start: 7, end: 14 },
        ]);
        filterOk(matchesFuzzyIconAware, 'indent', parseLabelWithIcons('This $codicon Indent Using Spaces'), [
            { start: 14, end: 20 },
        ]);
        // Testing #59343
        filterOk(matchesFuzzyIconAware, 'unt', parseLabelWithIcons('$(primitive-dot) $(file-text) Untitled-1'), [
            { start: 30, end: 33 },
        ]);
        // Testing #136172
        filterOk(matchesFuzzyIconAware, 's', parseLabelWithIcons('$(loading~spin) start'), [
            { start: 16, end: 17 },
        ]);
    });
    test('stripIcons', () => {
        assert.strictEqual(stripIcons('Hello World'), 'Hello World');
        assert.strictEqual(stripIcons('$(Hello World'), '$(Hello World');
        assert.strictEqual(stripIcons('$(Hello) World'), ' World');
        assert.strictEqual(stripIcons('$(Hello) W$(oi)rld'), ' Wrld');
    });
    test('escapeIcons', () => {
        assert.strictEqual(escapeIcons('Hello World'), 'Hello World');
        assert.strictEqual(escapeIcons('$(Hello World'), '$(Hello World');
        assert.strictEqual(escapeIcons('$(Hello) World'), '\\$(Hello) World');
        assert.strictEqual(escapeIcons('\\$(Hello) W$(oi)rld'), '\\$(Hello) W\\$(oi)rld');
    });
    test('markdownEscapeEscapedIcons', () => {
        assert.strictEqual(markdownEscapeEscapedIcons('Hello World'), 'Hello World');
        assert.strictEqual(markdownEscapeEscapedIcons('$(Hello) World'), '$(Hello) World');
        assert.strictEqual(markdownEscapeEscapedIcons('\\$(Hello) World'), '\\\\$(Hello) World');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvbkxhYmVscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9pY29uTGFiZWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQXlCLDBCQUEwQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pMLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQU9yRSxTQUFTLFFBQVEsQ0FBQyxNQUFtQixFQUFFLElBQVksRUFBRSxNQUE2QixFQUFFLFVBQTZDO0lBQ2hJLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1YsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQixNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN2QyxDQUFDO0FBQ0YsQ0FBQztBQUVELEtBQUssQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO0lBQ3pCLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsZ0RBQWdEO1FBQ2hELE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFpQjtZQUN6QyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDUixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7WUFDaEIsQ0FBQyxxQkFBcUIsRUFBRSxvQkFBb0IsQ0FBQztZQUM3QyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDO1lBQ2pELENBQUMsZUFBZSxFQUFFLGFBQWEsQ0FBQztZQUNoQyxDQUFD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