/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OneLineRange, TextSearchMatch, SearchRange, isFilePatternMatch } from '../../common/search.js';
suite('TextSearchResult', () => {
    const previewOptions1 = {
        matchLines: 1,
        charsPerLine: 100
    };
    function assertOneLinePreviewRangeText(text, result) {
        assert.strictEqual(result.rangeLocations.length, 1);
        assert.strictEqual(result.previewText.substring((result.rangeLocations[0].preview).startColumn, (result.rangeLocations[0].preview).endColumn), text);
    }
    function getFirstSourceFromResult(result) {
        return result.rangeLocations.map(e => e.source)[0];
    }
    ensureNoDisposablesAreLeakedInTestSuite();
    test('empty without preview options', () => {
        const range = new OneLineRange(5, 0, 0);
        const result = new TextSearchMatch('', range);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('', result);
    });
    test('empty with preview options', () => {
        const range = new OneLineRange(5, 0, 0);
        const result = new TextSearchMatch('', range, previewOptions1);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('', result);
    });
    test('short without preview options', () => {
        const range = new OneLineRange(5, 4, 7);
        const result = new TextSearchMatch('foo bar', range);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('bar', result);
    });
    test('short with preview options', () => {
        const range = new OneLineRange(5, 4, 7);
        const result = new TextSearchMatch('foo bar', range, previewOptions1);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('bar', result);
    });
    test('leading', () => {
        const range = new OneLineRange(5, 25, 28);
        const result = new TextSearchMatch('long text very long text foo', range, previewOptions1);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('foo', result);
    });
    test('trailing', () => {
        const range = new OneLineRange(5, 0, 3);
        const result = new TextSearchMatch('foo long text very long text long text very long text long text very long text long text very long text long text very long text', range, previewOptions1);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('foo', result);
    });
    test('middle', () => {
        const range = new OneLineRange(5, 30, 33);
        const result = new TextSearchMatch('long text very long text long foo text very long text long text very long text long text very long text long text very long text', range, previewOptions1);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('foo', result);
    });
    test('truncating match', () => {
        const previewOptions = {
            matchLines: 1,
            charsPerLine: 1
        };
        const range = new OneLineRange(0, 4, 7);
        const result = new TextSearchMatch('foo bar', range, previewOptions);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assertOneLinePreviewRangeText('b', result);
    });
    test('one line of multiline match', () => {
        const previewOptions = {
            matchLines: 1,
            charsPerLine: 10000
        };
        const range = new SearchRange(5, 4, 6, 3);
        const result = new TextSearchMatch('foo bar\nfoo bar', range, previewOptions);
        assert.deepStrictEqual(getFirstSourceFromResult(result), range);
        assert.strictEqual(result.previewText, 'foo bar\nfoo bar');
        assert.strictEqual(result.rangeLocations.length, 1);
        assert.strictEqual(result.rangeLocations[0].preview.startLineNumber, 0);
        assert.strictEqual(result.rangeLocations[0].preview.startColumn, 4);
        assert.strictEqual(result.rangeLocations[0].preview.endLineNumber, 1);
        assert.strictEqual(result.rangeLocations[0].preview.endColumn, 3);
    });
    test('compacts multiple ranges on long lines', () => {
        const previewOptions = {
            matchLines: 1,
            charsPerLine: 10
        };
        const range1 = new SearchRange(5, 4, 5, 7);
        const range2 = new SearchRange(5, 133, 5, 136);
        const range3 = new SearchRange(5, 141, 5, 144);
        const result = new TextSearchMatch('foo bar 123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890 foo bar baz bar', [range1, range2, range3], previewOptions);
        assert.deepStrictEqual(result.rangeLocations.map(e => e.preview), [new OneLineRange(0, 4, 7), new OneLineRange(0, 42, 45), new OneLineRange(0, 50, 53)]);
        assert.strictEqual(result.previewText, 'foo bar 123456⟪ 117 characters skipped ⟫o bar baz bar');
    });
    test('trims lines endings', () => {
        const range = new SearchRange(5, 3, 5, 5);
        const previewOptions = {
            matchLines: 1,
            charsPerLine: 10000
        };
        assert.strictEqual(new TextSearchMatch('foo bar\n', range, previewOptions).previewText, 'foo bar');
        assert.strictEqual(new TextSearchMatch('foo bar\r\n', range, previewOptions).previewText, 'foo bar');
    });
    // test('all lines of multiline match', () => {
    // 	const previewOptions: ITextSearchPreviewOptions = {
    // 		matchLines: 5,
    // 		charsPerLine: 10000
    // 	};
    // 	const range = new SearchRange(5, 4, 6, 3);
    // 	const result = new TextSearchResult('foo bar\nfoo bar', range, previewOptions);
    // 	assert.deepStrictEqual(result.range, range);
    // 	assertPreviewRangeText('bar\nfoo', result);
    // });
});
suite('isFilePatternMatch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('glob match is case-sensitive by default', () => {
        const candidate = { relativePath: 'src/Foo.ts', searchPath: undefined };
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.ts', false), true);
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.TS', false), false);
    });
    test('glob match is case-insensitive when ignoreCase is true', () => {
        const candidate = { relativePath: 'src/Foo.ts', searchPath: undefined };
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.TS', false, true), true);
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.Ts', false, true), true);
    });
    test('glob match with mixed case pattern', () => {
        const candidate = { relativePath: 'src/MyComponent.TSX', searchPath: undefined };
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.tsx', false), false);
        assert.strictEqual(isFilePatternMatch(candidate, '**/*.tsx', false, true), true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3QvY29tbW9uL3NlYXJjaC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQTZCLFlBQVksRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFbkksS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUU5QixNQUFNLGVBQWUsR0FBOEI7UUFDbEQsVUFBVSxFQUFFLENBQUM7UUFDYixZQUFZLEVBQUUsR0FBRztLQUNqQixDQUFDO0lBRUYsU0FBUyw2QkFBNkIsQ0FBQyxJQUFZLEVBQUUsTUFBdUI7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUNqQixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFDMUgsSUFBSSxDQUFDLENBQUM7SUFDUixDQUFDO0lBRUQsU0FBUyx3QkFBd0IsQ0FBQyxNQUF1QjtRQUN4RCxPQUFPLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxD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