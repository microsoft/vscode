/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextSearchPreviewOptions, OneLineRange, TextSearchMatch, SearchRange } from '../../common/search.js';

suite('TextSearchResult', () => {

	const previewOptions1: ITextSearchPreviewOptions = {
		matchLines: 1,
		charsPerLine: 100
	};

	function assertOneLinePreviewRangeText(text: string, result: TextSearchMatch): void {
		assert.strictEqual(result.rangeLocations.length, 1);
		assert.strictEqual(
			result.previewText.substring((result.rangeLocations[0].preview).startColumn, (result.rangeLocations[0].preview).endColumn),
			text);
	}

	function getFirstSourceFromResult(result: TextSearchMatch): OneLineRange {
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
		const previewOptions: ITextSearchPreviewOptions = {
			matchLines: 1,
			charsPerLine: 1
		};

		const range = new OneLineRange(0, 4, 7);
		const result = new TextSearchMatch('foo bar', range, previewOptions);
		assert.deepStrictEqual(getFirstSourceFromResult(result), range);
		assertOneLinePreviewRangeText('b', result);
	});

	test('one line of multiline match', () => {
		const previewOptions: ITextSearchPreviewOptions = {
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
		const previewOptions: ITextSearchPreviewOptions = {
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
		const previewOptions: ITextSearchPreviewOptions = {
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
