/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { getMapForWordSeparators } from '../../../common/core/wordCharacterClassifier.js';
import { USUAL_WORD_SEPARATORS } from '../../../common/core/wordHelper.js';
import { EndOfLineSequence, FindMatch, SearchData } from '../../../common/model.js';
import { TextModel } from '../../../common/model/textModel.js';
import { SearchParams, TextModelSearch, isMultilineRegexSource } from '../../../common/model/textModelSearch.js';
import { createTextModel } from '../testTextModel.js';

// --------- Find
suite('TextModelSearch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const usualWordSeparators = getMapForWordSeparators(USUAL_WORD_SEPARATORS, []);

	function assertFindMatch(actual: FindMatch | null, expectedRange: Range, expectedMatches: string[] | null = null): void {
		assert.deepStrictEqual(actual, new FindMatch(expectedRange, expectedMatches));
	}

	function _assertFindMatches(model: TextModel, searchParams: SearchParams, expectedMatches: FindMatch[]): void {
		const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), false, 1000);
		assert.deepStrictEqual(actual, expectedMatches, 'findMatches OK');

		// test `findNextMatch`
		let startPos = new Position(1, 1);
		let match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
		assert.deepStrictEqual(match, expectedMatches[0], `findNextMatch ${startPos}`);
		for (const expectedMatch of expectedMatches) {
			startPos = expectedMatch.range.getStartPosition();
			match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
			assert.deepStrictEqual(match, expectedMatch, `findNextMatch ${startPos}`);
		}

		// test `findPrevMatch`
		startPos = new Position(model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
		match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
		assert.deepStrictEqual(match, expectedMatches[expectedMatches.length - 1], `findPrevMatch ${startPos}`);
		for (const expectedMatch of expectedMatches) {
			startPos = expectedMatch.range.getEndPosition();
			match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
			assert.deepStrictEqual(match, expectedMatch, `findPrevMatch ${startPos}`);
		}
	}

	function assertFindMatches(text: string, searchString: string, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, _expected: [number, number, number, number][]): void {
		const expectedRanges = _expected.map(entry => new Range(entry[0], entry[1], entry[2], entry[3]));
		const expectedMatches = expectedRanges.map(entry => new FindMatch(entry, null));
		const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);

		const model = createTextModel(text);
		_assertFindMatches(model, searchParams, expectedMatches);
		model.dispose();


		const model2 = createTextModel(text);
		model2.setEOL(EndOfLineSequence.CRLF);
		_assertFindMatches(model2, searchParams, expectedMatches);
		model2.dispose();
	}

	const regularText = [
		'This is some foo - bar text which contains foo and bar - as in Barcelona.',
		'Now it begins a word fooBar and now it is caps Foo-isn\'t this great?',
		'And here\'s a dull line with nothing interesting in it',
		'It is also interesting if it\'s part of a word like amazingFooBar',
		'Again nothing interesting here'
	];

	test('Simple find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, false, null,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25],
				[2, 48, 2, 51],
				[4, 59, 4, 62]
			]
		);
	});

	test('Case sensitive find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, true, null,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25]
			]
		);
	});

	test('Whole words find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'foo', false, false, USUAL_WORD_SEPARATORS,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 48, 2, 51]
			]
		);
	});

	test('/^/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'^', true, false, null,
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1]
			]
		);
	});

	test('/$/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'$', true, false, null,
			[
				[1, 74, 1, 74],
				[2, 69, 2, 69],
				[3, 54, 3, 54],
				[4, 65, 4, 65],
				[5, 31, 5, 31]
			]
		);
	});

	test('/.*/ find', () => {
		assertFindMatches(
			regularText.join('\n'),
			'.*', true, false, null,
			[
				[1, 1, 1, 74],
				[2, 1, 2, 69],
				[3, 1, 3, 54],
				[4, 1, 4, 65],
				[5, 1, 5, 31]
			]
		);
	});

	test('/^$/ find', () => {
		assertFindMatches(
			[
				'This is some foo - bar text which contains foo and bar - as in Barcelona.',
				'',
				'And here\'s a dull line with nothing interesting in it',
				'',
				'Again nothing interesting here'
			].join('\n'),
			'^$', true, false, null,
			[
				[2, 1, 2, 1],
				[4, 1, 4, 1]
			]
		);
	});

	test('multiline find 1', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\n', true, false, null,
			[
				[1, 16, 2, 1],
				[2, 16, 3, 1],
			]
		);
	});

	test('multiline find 2', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\nJust', true, false, null,
			[
				[1, 16, 2, 5]
			]
		);
	});

	test('multiline find 3', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'\\nagain', true, false, null,
			[
				[3, 16, 4, 6]
			]
		);
	});

	test('multiline find 4', () => {
		assertFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'.*\\nJust.*\\n', true, false, null,
			[
				[1, 1, 3, 1]
			]
		);
	});

	test('multiline find with line beginning regex', () => {
		assertFindMatches(
			[
				'if',
				'else',
				'',
				'if',
				'else'
			].join('\n'),
			'^if\\nelse', true, false, null,
			[
				[1, 1, 2, 5],
				[4, 1, 5, 5]
			]
		);
	});

	test('matching empty lines using boundary expression', () => {
		assertFindMatches(
			[
				'if',
				'',
				'else',
				'  ',
				'if',
				' ',
				'else'
			].join('\n'),
			'^\\s*$\\n', true, false, null,
			[
				[2, 1, 3, 1],
				[4, 1, 5, 1],
				[6, 1, 7, 1]
			]
		);
	});

	test('matching lines starting with A and ending with B', () => {
		assertFindMatches(
			[
				'a if b',
				'a',
				'ab',
				'eb'
			].join('\n'),
			'^a.*b$', true, false, null,
			[
				[1, 1, 1, 7],
				[3, 1, 3, 3]
			]
		);
	});

	test('multiline find with line ending regex', () => {
		assertFindMatches(
			[
				'if',
				'else',
				'',
				'if',
				'elseif',
				'else'
			].join('\n'),
			'if\\nelse$', true, false, null,
			[
				[1, 1, 2, 5],
				[5, 5, 6, 5]
			]
		);
	});

	test('issue #4836 - ^.*$', () => {
		assertFindMatches(
			[
				'Just some text text',
				'',
				'some text again',
				'',
				'again some text'
			].join('\n'),
			'^.*$', true, false, null,
			[
				[1, 1, 1, 20],
				[2, 1, 2, 1],
				[3, 1, 3, 16],
				[4, 1, 4, 1],
				[5, 1, 5, 16],
			]
		);
	});

	test('multiline find for non-regex string', () => {
		assertFindMatches(
			[
				'Just some text text',
				'some text text',
				'some text again',
				'again some text',
				'but not some'
			].join('\n'),
			'text\nsome', false, false, null,
			[
				[1, 16, 2, 5],
				[2, 11, 3, 5],
			]
		);
	});

	test('issue #3623: Match whole word does not work for not latin characters', () => {
		assertFindMatches(
			[
				'я',
				'компилятор',
				'обфускация',
				':я-я'
			].join('\n'),
			'я', false, false, USUAL_WORD_SEPARATORS,
			[
				[1, 1, 1, 2],
				[4, 2, 4, 3],
				[4, 4, 4, 5],
			]
		);
	});

	test('issue #27459: Match whole words regression', () => {
		assertFindMatches(
			[
				'this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {',
				'	this._viewController.emitKeyDown(e);',
				'}));',
			].join('\n'),
			'((e: ', false, false, USUAL_WORD_SEPARATORS,
			[
				[1, 45, 1, 50]
			]
		);
	});

	test('issue #27594: Search results disappear', () => {
		assertFindMatches(
			[
				'this.server.listen(0);',
			].join('\n'),
			'listen(', false, false, USUAL_WORD_SEPARATORS,
			[
				[1, 13, 1, 20]
			]
		);
	});

	test('findNextMatch without regex', () => {
		const model = createTextModel('line line one\nline two\nthree');

		const searchParams = new SearchParams('line', false, false, null);

		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(1, 6, 1, 10));

		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
		assertFindMatch(actual, new Range(1, 6, 1, 10));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(2, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		model.dispose();
	});

	test('findNextMatch with beginning boundary regex', () => {
		const model = createTextModel('line one\nline two\nthree');

		const searchParams = new SearchParams('^line', true, false, null);

		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(2, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
		assertFindMatch(actual, new Range(2, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		model.dispose();
	});

	test('findNextMatch with beginning boundary regex and line has repetitive beginnings', () => {
		const model = createTextModel('line line one\nline two\nthree');

		const searchParams = new SearchParams('^line', true, false, null);

		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(2, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
		assertFindMatch(actual, new Range(2, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(1, 1, 1, 5));

		model.dispose();
	});

	test('findNextMatch with beginning boundary multiline regex and line has repetitive beginnings', () => {
		const model = createTextModel('line line one\nline two\nline three\nline four');

		const searchParams = new SearchParams('^line.*\\nline', true, false, null);

		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
		assertFindMatch(actual, new Range(1, 1, 2, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(3, 1, 4, 5));

		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(2, 1), false);
		assertFindMatch(actual, new Range(2, 1, 3, 5));

		model.dispose();
	});

	test('findNextMatch with ending boundary regex', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('line$', true, false, null);

		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
		assertFindMatch(actual, new Range(1, 10, 1, 14));

		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 4), false);
		assertFindMatch(actual, new Range(1, 10, 1, 14));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(2, 5, 2, 9));

		actual = TextModelSearch.findNextMatch(model, searchParams, actual!.range.getEndPosition(), false);
		assertFindMatch(actual, new Range(1, 10, 1, 14));

		model.dispose();
	});

	test('findMatches with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)', true, false, null);

		const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
		assert.deepStrictEqual(actual, [
			new FindMatch(new Range(1, 5, 1, 9), ['line', 'line', 'in']),
			new FindMatch(new Range(1, 10, 1, 14), ['line', 'line', 'in']),
			new FindMatch(new Range(2, 5, 2, 9), ['line', 'line', 'in']),
		]);

		model.dispose();
	});

	test('findMatches multiline with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)\\n', true, false, null);

		const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
		assert.deepStrictEqual(actual, [
			new FindMatch(new Range(1, 10, 2, 1), ['line\n', 'line', 'in']),
			new FindMatch(new Range(2, 5, 3, 1), ['line\n', 'line', 'in']),
		]);

		model.dispose();
	});

	test('findNextMatch with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)', true, false, null);

		const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		assertFindMatch(actual, new Range(1, 5, 1, 9), ['line', 'line', 'in']);

		model.dispose();
	});

	test('findNextMatch multiline with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)\\n', true, false, null);

		const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		assertFindMatch(actual, new Range(1, 10, 2, 1), ['line\n', 'line', 'in']);

		model.dispose();
	});

	test('findPreviousMatch with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)', true, false, null);

		const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
		assertFindMatch(actual, new Range(2, 5, 2, 9), ['line', 'line', 'in']);

		model.dispose();
	});

	test('findPreviousMatch multiline with capturing matches', () => {
		const model = createTextModel('one line line\ntwo line\nthree');

		const searchParams = new SearchParams('(l(in)e)\\n', true, false, null);

		const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
		assertFindMatch(actual, new Range(2, 5, 3, 1), ['line\n', 'line', 'in']);

		model.dispose();
	});

	test('\\n matches \\r\\n', () => {
		const model = createTextModel('a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni');

		assert.strictEqual(model.getEOL(), '\r\n');

		let searchParams = new SearchParams('h\\n', true, false, null);
		let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1000)[0];
		assertFindMatch(actual, new Range(8, 1, 9, 1), ['h\n']);

		searchParams = new SearchParams('g\\nh\\n', true, false, null);
		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1000)[0];
		assertFindMatch(actual, new Range(7, 1, 9, 1), ['g\nh\n']);

		searchParams = new SearchParams('\\ni', true, false, null);
		actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1000)[0];
		assertFindMatch(actual, new Range(8, 2, 9, 2), ['\ni']);

		model.dispose();
	});

	test('\\r can never be found', () => {
		const model = createTextModel('a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni');

		assert.strictEqual(model.getEOL(), '\r\n');

		const searchParams = new SearchParams('\\r\\n', true, false, null);
		const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
		assert.strictEqual(actual, null);
		assert.deepStrictEqual(TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1000), []);

		model.dispose();
	});

	function assertParseSearchResult(searchString: string, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, expected: SearchData | null): void {
		const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
		const actual = searchParams.parseSearchRequest();

		if (expected === null) {
			assert.ok(actual === null);
		} else {
			assert.deepStrictEqual(actual!.regex, expected.regex);
			assert.deepStrictEqual(actual!.simpleSearch, expected.simpleSearch);
			if (wordSeparators) {
				assert.ok(actual!.wordSeparators !== null);
			} else {
				assert.ok(actual!.wordSeparators === null);
			}
		}
	}

	test('parseSearchRequest invalid', () => {
		assertParseSearchResult('', true, true, USUAL_WORD_SEPARATORS, null);
		assertParseSearchResult('(', true, false, null, null);
	});

	test('parseSearchRequest non regex', () => {
		assertParseSearchResult('foo', false, false, null, new SearchData(/foo/giu, null, null));
		assertParseSearchResult('foo', false, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
		assertParseSearchResult('foo', false, true, null, new SearchData(/foo/gu, null, 'foo'));
		assertParseSearchResult('foo', false, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, 'foo'));
		assertParseSearchResult('foo\\n', false, false, null, new SearchData(/foo\\n/giu, null, null));
		assertParseSearchResult('foo\\\\n', false, false, null, new SearchData(/foo\\\\n/giu, null, null));
		assertParseSearchResult('foo\\r', false, false, null, new SearchData(/foo\\r/giu, null, null));
		assertParseSearchResult('foo\\\\r', false, false, null, new SearchData(/foo\\\\r/giu, null, null));
	});

	test('parseSearchRequest regex', () => {
		assertParseSearchResult('foo', true, false, null, new SearchData(/foo/giu, null, null));
		assertParseSearchResult('foo', true, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
		assertParseSearchResult('foo', true, true, null, new SearchData(/foo/gu, null, null));
		assertParseSearchResult('foo', true, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, null));
		assertParseSearchResult('foo\\n', true, false, null, new SearchData(/foo\n/gimu, null, null));
		assertParseSearchResult('foo\\\\n', true, false, null, new SearchData(/foo\\n/giu, null, null));
		assertParseSearchResult('foo\\r', true, false, null, new SearchData(/foo\r/gimu, null, null));
		assertParseSearchResult('foo\\\\r', true, false, null, new SearchData(/foo\\r/giu, null, null));
	});

	test('issue #53415. \W should match line break.', () => {
		assertFindMatches(
			[
				'text',
				'180702-',
				'180703-180704'
			].join('\n'),
			'\\d{6}-\\W', true, false, null,
			[
				[2, 1, 3, 1]
			]
		);

		assertFindMatches(
			[
				'Just some text',
				'',
				'Just'
			].join('\n'),
			'\\W', true, false, null,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 3, 1]
			]
		);

		// Line break doesn't affect the result as we always use \n as line break when doing search
		assertFindMatches(
			[
				'Just some text',
				'',
				'Just'
			].join('\r\n'),
			'\\W', true, false, null,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 3, 1]
			]
		);

		assertFindMatches(
			[
				'Just some text',
				'\tJust',
				'Just'
			].join('\n'),
			'\\W', true, false, null,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 2, 2],
				[2, 6, 3, 1],
			]
		);

		// line break is seen as one non-word character
		assertFindMatches(
			[
				'Just  some text',
				'',
				'Just'
			].join('\n'),
			'\\W{2}', true, false, null,
			[
				[1, 5, 1, 7],
				[1, 16, 3, 1]
			]
		);

		// even if it's \r\n
		assertFindMatches(
			[
				'Just  some text',
				'',
				'Just'
			].join('\r\n'),
			'\\W{2}', true, false, null,
			[
				[1, 5, 1, 7],
				[1, 16, 3, 1]
			]
		);
	});

	test('Simple find using unicode escape sequences', () => {
		assertFindMatches(
			regularText.join('\n'),
			'\\u{0066}\\u006f\\u006F', true, false, null,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25],
				[2, 48, 2, 51],
				[4, 59, 4, 62]
			]
		);
	});

	test('isMultilineRegexSource', () => {
		assert(!isMultilineRegexSource('foo'));
		assert(!isMultilineRegexSource(''));
		assert(!isMultilineRegexSource('foo\\sbar'));
		assert(!isMultilineRegexSource('\\\\notnewline'));

		assert(isMultilineRegexSource('foo\\nbar'));
		assert(isMultilineRegexSource('foo\\nbar\\s'));
		assert(isMultilineRegexSource('foo\\r\\n'));
		assert(isMultilineRegexSource('\\n'));
		assert(isMultilineRegexSource('foo\\W'));
		assert(isMultilineRegexSource('foo\n'));
		assert(isMultilineRegexSource('foo\r\n'));
	});

	test('isMultilineRegexSource correctly identifies multiline patterns', () => {
		const singleLinePatterns = [
			'MARK:\\s*(?<label>.*)$',
			'^// Header$',
			'\\s*[-=]+\\s*',
		];

		const multiLinePatterns = [
			'^\/\/ =+\\n^\/\/ (?<label>[^\\n]+?)\\n^\/\/ =+$',
			'header\\r\\nfooter',
			'start\\r|\\nend',
			'top\nmiddle\r\nbottom'
		];

		for (const pattern of singleLinePatterns) {
			assert.strictEqual(isMultilineRegexSource(pattern), false, `Pattern should not be multiline: ${pattern}`);
		}

		for (const pattern of multiLinePatterns) {
			assert.strictEqual(isMultilineRegexSource(pattern), true, `Pattern should be multiline: ${pattern}`);
		}
	});

	test('issue #74715. \\d* finds empty string and stops searching.', () => {
		const model = createTextModel('10.243.30.10');

		const searchParams = new SearchParams('\\d*', true, false, null);

		const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
		assert.deepStrictEqual(actual, [
			new FindMatch(new Range(1, 1, 1, 3), ['10']),
			new FindMatch(new Range(1, 3, 1, 3), ['']),
			new FindMatch(new Range(1, 4, 1, 7), ['243']),
			new FindMatch(new Range(1, 7, 1, 7), ['']),
			new FindMatch(new Range(1, 8, 1, 10), ['30']),
			new FindMatch(new Range(1, 10, 1, 10), ['']),
			new FindMatch(new Range(1, 11, 1, 13), ['10'])
		]);

		model.dispose();
	});

	test('issue #100134. Zero-length matches should properly step over surrogate pairs', () => {
		// 1[Laptop]1 - there shoud be no matches inside of [Laptop] emoji
		assertFindMatches('1\uD83D\uDCBB1', '()', true, false, null,
			[
				[1, 1, 1, 1],
				[1, 2, 1, 2],
				[1, 4, 1, 4],
				[1, 5, 1, 5],

			]
		);
		// 1[Hacker Cat]1 = 1[Cat Face][ZWJ][Laptop]1 - there shoud be matches between emoji and ZWJ
		// there shoud be no matches inside of [Cat Face] and [Laptop] emoji
		assertFindMatches('1\uD83D\uDC31\u200D\uD83D\uDCBB1', '()', true, false, null,
			[
				[1, 1, 1, 1],
				[1, 2, 1, 2],
				[1, 4, 1, 4],
				[1, 5, 1, 5],
				[1, 7, 1, 7],
				[1, 8, 1, 8]
			]
		);
	});
});
