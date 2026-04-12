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
import { FindMatch, SearchData } from '../../../common/model.js';
import { SearchParams, TextModelSearch, isMultilineRegexSource } from '../../../common/model/textModelSearch.js';
import { createTextModel } from '../testTextModel.js';
// --------- Find
suite('TextModelSearch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const usualWordSeparators = getMapForWordSeparators(USUAL_WORD_SEPARATORS, []);
    function assertFindMatch(actual, expectedRange, expectedMatches = null) {
        assert.deepStrictEqual(actual, new FindMatch(expectedRange, expectedMatches));
    }
    function _assertFindMatches(model, searchParams, expectedMatches) {
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
    function assertFindMatches(text, searchString, isRegex, matchCase, wordSeparators, _expected) {
        const expectedRanges = _expected.map(entry => new Range(entry[0], entry[1], entry[2], entry[3]));
        const expectedMatches = expectedRanges.map(entry => new FindMatch(entry, null));
        const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
        const model = createTextModel(text);
        _assertFindMatches(model, searchParams, expectedMatches);
        model.dispose();
        const model2 = createTextModel(text);
        model2.setEOL(1 /* EndOfLineSequence.CRLF */);
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
        assertFindMatches(regularText.join('\n'), 'foo', false, false, null, [
            [1, 14, 1, 17],
            [1, 44, 1, 47],
            [2, 22, 2, 25],
            [2, 48, 2, 51],
            [4, 59, 4, 62]
        ]);
    });
    test('Case sensitive find', () => {
        assertFindMatches(regularText.join('\n'), 'foo', false, true, null, [
            [1, 14, 1, 17],
            [1, 44, 1, 47],
            [2, 22, 2, 25]
        ]);
    });
    test('Whole words find', () => {
        assertFindMatches(regularText.join('\n'), 'foo', false, false, USUAL_WORD_SEPARATORS, [
            [1, 14, 1, 17],
            [1, 44, 1, 47],
            [2, 48, 2, 51]
        ]);
    });
    test('/^/ find', () => {
        assertFindMatches(regularText.join('\n'), '^', true, false, null, [
            [1, 1, 1, 1],
            [2, 1, 2, 1],
            [3, 1, 3, 1],
            [4, 1, 4, 1],
            [5, 1, 5, 1]
        ]);
    });
    test('/$/ find', () => {
        assertFindMatches(regularText.join('\n'), '$', true, false, null, [
            [1, 74, 1, 74],
            [2, 69, 2, 69],
            [3, 54, 3, 54],
            [4, 65, 4, 65],
            [5, 31, 5, 31]
        ]);
    });
    test('/.*/ find', () => {
        assertFindMatches(regularText.join('\n'), '.*', true, false, null, [
            [1, 1, 1, 74],
            [2, 1, 2, 69],
            [3, 1, 3, 54],
            [4, 1, 4, 65],
            [5, 1, 5, 31]
        ]);
    });
    test('/^$/ find', () => {
        assertFindMatches([
            'This is some foo - bar text which contains foo and bar - as in Barcelona.',
            '',
            'And here\'s a dull line with nothing interesting in it',
            '',
            'Again nothing interesting here'
        ].join('\n'), '^$', true, false, null, [
            [2, 1, 2, 1],
            [4, 1, 4, 1]
        ]);
    });
    test('multiline find 1', () => {
        assertFindMatches([
            'Just some text text',
            'Just some text text',
            'some text again',
            'again some text'
        ].join('\n'), 'text\\n', true, false, null, [
            [1, 16, 2, 1],
            [2, 16, 3, 1],
        ]);
    });
    test('multiline find 2', () => {
        assertFindMatches([
            'Just some text text',
            'Just some text text',
            'some text again',
            'again some text'
        ].join('\n'), 'text\\nJust', true, false, null, [
            [1, 16, 2, 5]
        ]);
    });
    test('multiline find 3', () => {
        assertFindMatches([
            'Just some text text',
            'Just some text text',
            'some text again',
            'again some text'
        ].join('\n'), '\\nagain', true, false, null, [
            [3, 16, 4, 6]
        ]);
    });
    test('multiline find 4', () => {
        assertFindMatches([
            'Just some text text',
            'Just some text text',
            'some text again',
            'again some text'
        ].join('\n'), '.*\\nJust.*\\n', true, false, null, [
            [1, 1, 3, 1]
        ]);
    });
    test('multiline find with line beginning regex', () => {
        assertFindMatches([
            'if',
            'else',
            '',
            'if',
            'else'
        ].join('\n'), '^if\\nelse', true, false, null, [
            [1, 1, 2, 5],
            [4, 1, 5, 5]
        ]);
    });
    test('matching empty lines using boundary expression', () => {
        assertFindMatches([
            'if',
            '',
            'else',
            '  ',
            'if',
            ' ',
            'else'
        ].join('\n'), '^\\s*$\\n', true, false, null, [
            [2, 1, 3, 1],
            [4, 1, 5, 1],
            [6, 1, 7, 1]
        ]);
    });
    test('matching lines starting with A and ending with B', () => {
        assertFindMatches([
            'a if b',
            'a',
            'ab',
            'eb'
        ].join('\n'), '^a.*b$', true, false, null, [
            [1, 1, 1, 7],
            [3, 1, 3, 3]
        ]);
    });
    test('multiline find with line ending regex', () => {
        assertFindMatches([
            'if',
            'else',
            '',
            'if',
            'elseif',
            'else'
        ].join('\n'), 'if\\nelse$', true, false, null, [
            [1, 1, 2, 5],
            [5, 5, 6, 5]
        ]);
    });
    test('issue #4836 - ^.*$', () => {
        assertFindMatches([
            'Just some text text',
            '',
            'some text again',
            '',
            'again some text'
        ].join('\n'), '^.*$', true, false, null, [
            [1, 1, 1, 20],
            [2, 1, 2, 1],
            [3, 1, 3, 16],
            [4, 1, 4, 1],
            [5, 1, 5, 16],
        ]);
    });
    test('multiline find for non-regex string', () => {
        assertFindMatches([
            'Just some text text',
            'some text text',
            'some text again',
            'again some text',
            'but not some'
        ].join('\n'), 'text\nsome', false, false, null, [
            [1, 16, 2, 5],
            [2, 11, 3, 5],
        ]);
    });
    test('issue #3623: Match whole word does not work for not latin characters', () => {
        assertFindMatches([
            'я',
            'компилятор',
            'обфускация',
            ':я-я'
        ].join('\n'), 'я', false, false, USUAL_WORD_SEPARATORS, [
            [1, 1, 1, 2],
            [4, 2, 4, 3],
            [4, 4, 4, 5],
        ]);
    });
    test('issue #27459: Match whole words regression', () => {
        assertFindMatches([
            'this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {',
            '	this._viewController.emitKeyDown(e);',
            '}));',
        ].join('\n'), '((e: ', false, false, USUAL_WORD_SEPARATORS, [
            [1, 45, 1, 50]
        ]);
    });
    test('issue #27594: Search results disappear', () => {
        assertFindMatches([
            'this.server.listen(0);',
        ].join('\n'), 'listen(', false, false, USUAL_WORD_SEPARATORS, [
            [1, 13, 1, 20]
        ]);
    });
    test('findNextMatch without regex', () => {
        const model = createTextModel('line line one\nline two\nthree');
        const searchParams = new SearchParams('line', false, false, null);
        let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(1, 6, 1, 10));
        actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
        assertFindMatch(actual, new Range(1, 6, 1, 10));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(2, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        model.dispose();
    });
    test('findNextMatch with beginning boundary regex', () => {
        const model = createTextModel('line one\nline two\nthree');
        const searchParams = new SearchParams('^line', true, false, null);
        let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(2, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
        assertFindMatch(actual, new Range(2, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        model.dispose();
    });
    test('findNextMatch with beginning boundary regex and line has repetitive beginnings', () => {
        const model = createTextModel('line line one\nline two\nthree');
        const searchParams = new SearchParams('^line', true, false, null);
        let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(2, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
        assertFindMatch(actual, new Range(2, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(1, 1, 1, 5));
        model.dispose();
    });
    test('findNextMatch with beginning boundary multiline regex and line has repetitive beginnings', () => {
        const model = createTextModel('line line one\nline two\nline three\nline four');
        const searchParams = new SearchParams('^line.*\\nline', true, false, null);
        let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
        assertFindMatch(actual, new Range(1, 1, 2, 5));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
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
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
        assertFindMatch(actual, new Range(2, 5, 2, 9));
        actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
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
    function assertParseSearchResult(searchString, isRegex, matchCase, wordSeparators, expected) {
        const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
        const actual = searchParams.parseSearchRequest();
        if (expected === null) {
            assert.ok(actual === null);
        }
        else {
            assert.deepStrictEqual(actual.regex, expected.regex);
            assert.deepStrictEqual(actual.simpleSearch, expected.simpleSearch);
            if (wordSeparators) {
                assert.ok(actual.wordSeparators !== null);
            }
            else {
                assert.ok(actual.wordSeparators === null);
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
        assertFindMatches([
            'text',
            '180702-',
            '180703-180704'
        ].join('\n'), '\\d{6}-\\W', true, false, null, [
            [2, 1, 3, 1]
        ]);
        assertFindMatches([
            'Just some text',
            '',
            'Just'
        ].join('\n'), '\\W', true, false, null, [
            [1, 5, 1, 6],
            [1, 10, 1, 11],
            [1, 15, 2, 1],
            [2, 1, 3, 1]
        ]);
        // Line break doesn't affect the result as we always use \n as line break when doing search
        assertFindMatches([
            'Just some text',
            '',
            'Just'
        ].join('\r\n'), '\\W', true, false, null, [
            [1, 5, 1, 6],
            [1, 10, 1, 11],
            [1, 15, 2, 1],
            [2, 1, 3, 1]
        ]);
        assertFindMatches([
            'Just some text',
            '\tJust',
            'Just'
        ].join('\n'), '\\W', true, false, null, [
            [1, 5, 1, 6],
            [1, 10, 1, 11],
            [1, 15, 2, 1],
            [2, 1, 2, 2],
            [2, 6, 3, 1],
        ]);
        // line break is seen as one non-word character
        assertFindMatches([
            'Just  some text',
            '',
            'Just'
        ].join('\n'), '\\W{2}', true, false, null, [
            [1, 5, 1, 7],
            [1, 16, 3, 1]
        ]);
        // even if it's \r\n
        assertFindMatches([
            'Just  some text',
            '',
            'Just'
        ].join('\r\n'), '\\W{2}', true, false, null, [
            [1, 5, 1, 7],
            [1, 16, 3, 1]
        ]);
    });
    test('Simple find using unicode escape sequences', () => {
        assertFindMatches(regularText.join('\n'), '\\u{0066}\\u006f\\u006F', true, false, null, [
            [1, 14, 1, 17],
            [1, 44, 1, 47],
            [2, 22, 2, 25],
            [2, 48, 2, 51],
            [4, 59, 4, 62]
        ]);
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
        assertFindMatches('1\uD83D\uDCBB1', '()', true, false, null, [
            [1, 1, 1, 1],
            [1, 2, 1, 2],
            [1, 4, 1, 4],
            [1, 5, 1, 5],
        ]);
        // 1[Hacker Cat]1 = 1[Cat Face][ZWJ][Laptop]1 - there shoud be matches between emoji and ZWJ
        // there shoud be no matches inside of [Cat Face] and [Laptop] emoji
        assertFindMatches('1\uD83D\uDC31\u200D\uD83D\uDCBB1', '()', true, false, null, [
            [1, 1, 1, 1],
            [1, 2, 1, 2],
            [1, 4, 1, 4],
            [1, 5, 1, 5],
            [1, 7, 1, 7],
            [1, 8, 1, 8]
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsU2VhcmNoLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFxQixTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEYsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFdEQsaUJBQWlCO0FBQ2pCLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFFN0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRS9FLFNBQVMsZUFBZSxDQUFDLE1BQXdCLEVBQUUsYUFBb0IsRUFBRSxrQkFBbUMsSUFBSTtRQUMvRyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxJQUFJLFNBQVMsQ0FBQyxhQUFhLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUMvRSxDQUFD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QztRQUVoRSxNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVsRSxJQUFJLE1BQU0sR0FBRyxlQUFlLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNGLGVBQWUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUvQyxNQUFNLEdBQUcsZUFBZSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLE1BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkcsZUFBZSxDQUFDLE1BQU0sRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWhELE1BQU0sR0FBRyxlQUFlLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZGLGVBQWUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVoRCxNQUFNLEdBQUcsZUFBZSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLE1BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkcsZUFBZSxDQUFDLE1BQU0sRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRS9DLE1BQU0sR0FB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WUFDN0MsSUFBSSxTQUFTLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMxQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdDLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUMsSUFBSSxTQUFTLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUM5QyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEVBQThFLEVBQUUsR0FBRyxFQUFFO1FBQ3pGLGtFQUFrRTtRQUNsRSxpQkFBaUIsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQzFEO1lBQ0MsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7U0FFWixDQUNELENBQUM7UUFDRiw0RkFBNEY7UUFDNUYsb0VBQW9FO1FBQ3BFLGlCQUFpQixDQUFDLGtDQUFrQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFDNUU7WUFDQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNaLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDWixDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=