/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { TokenizationRegistry, EncodedTokenizationResult } from '../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { NullState } from '../../../common/languages/nullTokenize.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { TestLineToken } from '../core/testLineToken.js';
import { createModelServices, createTextModel, instantiateTextModel } from '../testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
function createTextModelWithBrackets(disposables, text, brackets) {
    const languageId = 'bracketMode2';
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, { brackets }));
    return disposables.add(instantiateTextModel(instantiationService, text, languageId));
}
suite('TextModelWithTokens', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testBrackets(contents, brackets) {
        const languageId = 'testMode';
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const languageService = instantiationService.get(ILanguageService);
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            brackets: brackets
        }));
        function toRelaxedFoundBracket(a) {
            if (!a) {
                return null;
            }
            return {
                range: a.range.toString(),
                info: a.bracketInfo,
            };
        }
        const charIsBracket = {};
        const charIsOpenBracket = {};
        const openForChar = {};
        const closeForChar = {};
        brackets.forEach((b) => {
            charIsBracket[b[0]] = true;
            charIsBracket[b[1]] = true;
            charIsOpenBracket[b[0]] = true;
            charIsOpenBracket[b[1]] = false;
            openForChar[b[0]] = b[0];
            closeForChar[b[0]] = b[1];
            openForChar[b[1]] = b[0];
            closeForChar[b[1]] = b[1];
        });
        const expectedBrackets = [];
        for (let lineIndex = 0; lineIndex < contents.length; lineIndex++) {
            const lineText = contents[lineIndex];
            for (let charIndex = 0; charIndex < lineText.length; charIndex++) {
                const ch = lineText.charAt(charIndex);
                if (charIsBracket[ch]) {
                    expectedBrackets.push({
                        bracketInfo: languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew.getBracketInfo(ch),
                        range: new Range(lineIndex + 1, charIndex + 1, lineIndex + 1, charIndex + 2)
                    });
                }
            }
        }
        const model = disposables.add(instantiateTextModel(instantiationService, contents.join('\n'), languageId));
        // findPrevBracket
        {
            let expectedBracketIndex = expectedBrackets.length - 1;
            let currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
            for (let lineNumber = contents.length; lineNumber >= 1; lineNumber--) {
                const lineText = contents[lineNumber - 1];
                for (let column = lineText.length + 1; column >= 1; column--) {
                    if (currentExpectedBracket) {
                        if (lineNumber === currentExpectedBracket.range.startLineNumber && column < currentExpectedBracket.range.endColumn) {
                            expectedBracketIndex--;
                            currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
                        }
                    }
                    const actual = model.bracketPairs.findPrevBracket({
                        lineNumber: lineNumber,
                        column: column
                    });
                    assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), 'findPrevBracket of ' + lineNumber + ', ' + column);
                }
            }
        }
        // findNextBracket
        {
            let expectedBracketIndex = 0;
            let currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
            for (let lineNumber = 1; lineNumber <= contents.length; lineNumber++) {
                const lineText = contents[lineNumber - 1];
                for (let column = 1; column <= lineText.length + 1; column++) {
                    if (currentExpectedBracket) {
                        if (lineNumber === currentExpectedBracket.range.startLineNumber && column > currentExpectedBracket.range.startColumn) {
                            expectedBracketIndex++;
                            currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
                        }
                    }
                    const actual = model.bracketPairs.findNextBracket({
                        lineNumber: lineNumber,
                        column: column
                    });
                    assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), 'findNextBracket of ' + lineNumber + ', ' + column);
                }
            }
        }
        disposables.dispose();
    }
    test('brackets1', () => {
        testBrackets([
            'if (a == 3) { return (7 * (a + 5)); }'
        ], [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ]);
    });
});
function assertIsNotBracket(model, lineNumber, column) {
    const match = model.bracketPairs.matchBracket(new Position(lineNumber, column));
    assert.strictEqual(match, null, 'is not matching brackets at ' + lineNumber + ', ' + column);
}
function assertIsBracket(model, testPosition, expected) {
    expected.sort(Range.compareRangesUsingStarts);
    const actual = model.bracketPairs.matchBracket(testPosition);
    actual?.sort(Range.compareRangesUsingStarts);
    assert.deepStrictEqual(actual, expected, 'matches brackets at ' + testPosition);
}
suite('TextModelWithTokens - bracket matching', () => {
    const languageId = 'bracketMode1';
    let disposables;
    let instantiationService;
    let languageConfigurationService;
    let languageService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createModelServices(disposables);
        languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        languageService = instantiationService.get(ILanguageService);
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('bracket matching 1', () => {
        const text = ')]}{[(' + '\n' +
            ')]}{[(';
        const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
        assertIsNotBracket(model, 1, 1);
        assertIsNotBracket(model, 1, 2);
        assertIsNotBracket(model, 1, 3);
        assertIsBracket(model, new Position(1, 4), [new Range(1, 4, 1, 5), new Range(2, 3, 2, 4)]);
        assertIsBracket(model, new Position(1, 5), [new Range(1, 5, 1, 6), new Range(2, 2, 2, 3)]);
        assertIsBracket(model, new Position(1, 6), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
        assertIsBracket(model, new Position(1, 7), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
        assertIsBracket(model, new Position(2, 1), [new Range(2, 1, 2, 2), new Range(1, 6, 1, 7)]);
        assertIsBracket(model, new Position(2, 2), [new Range(2, 2, 2, 3), new Range(1, 5, 1, 6)]);
        assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
        assertIsBracket(model, new Position(2, 4), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
        assertIsNotBracket(model, 2, 5);
        assertIsNotBracket(model, 2, 6);
        assertIsNotBracket(model, 2, 7);
    });
    test('bracket matching 2', () => {
        const text = 'var bar = {' + '\n' +
            'foo: {' + '\n' +
            '}, bar: {hallo: [{' + '\n' +
            '}, {' + '\n' +
            '}]}}';
        const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
        const brackets = [
            [new Position(1, 11), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
            [new Position(1, 12), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
            [new Position(2, 6), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
            [new Position(2, 7), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
            [new Position(3, 1), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
            [new Position(3, 2), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
            [new Position(3, 9), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
            [new Position(3, 10), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
            [new Position(3, 17), new Range(3, 17, 3, 18), new Range(5, 2, 5, 3)],
            [new Position(3, 18), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
            [new Position(3, 19), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
            [new Position(4, 1), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
            [new Position(4, 2), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
            [new Position(4, 4), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
            [new Position(4, 5), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
            [new Position(5, 1), new Range(5, 1, 5, 2), new Range(4, 4, 4, 5)],
            [new Position(5, 2), new Range(5, 2, 5, 3), new Range(3, 17, 3, 18)],
            [new Position(5, 3), new Range(5, 3, 5, 4), new Range(3, 9, 3, 10)],
            [new Position(5, 4), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)],
            [new Position(5, 5), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)],
        ];
        const isABracket = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
        for (let i = 0, len = brackets.length; i < len; i++) {
            const [testPos, b1, b2] = brackets[i];
            assertIsBracket(model, testPos, [b1, b2]);
            isABracket[testPos.lineNumber][testPos.column] = true;
        }
        for (let i = 1, len = model.getLineCount(); i <= len; i++) {
            const line = model.getLineContent(i);
            for (let j = 1, lenJ = line.length + 1; j <= lenJ; j++) {
                // eslint-disable-next-line local/code-no-any-casts
                if (!isABracket[i].hasOwnProperty(j)) {
                    assertIsNotBracket(model, i, j);
                }
            }
        }
    });
});
suite('TextModelWithTokens 2', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('bracket matching 3', () => {
        const text = [
            'begin',
            '    loop',
            '        if then',
            '        end if;',
            '    end loop;',
            'end;',
            '',
            'begin',
            '    loop',
            '        if then',
            '        end ifa;',
            '    end loop;',
            'end;',
        ].join('\n');
        const disposables = new DisposableStore();
        const model = createTextModelWithBrackets(disposables, text, [
            ['if', 'end if'],
            ['loop', 'end loop'],
            ['begin', 'end']
        ]);
        // <if> ... <end ifa> is not matched
        assertIsNotBracket(model, 10, 9);
        // <if> ... <end if> is matched
        assertIsBracket(model, new Position(3, 9), [new Range(3, 9, 3, 11), new Range(4, 9, 4, 15)]);
        assertIsBracket(model, new Position(4, 9), [new Range(4, 9, 4, 15), new Range(3, 9, 3, 11)]);
        // <loop> ... <end loop> is matched
        assertIsBracket(model, new Position(2, 5), [new Range(2, 5, 2, 9), new Range(5, 5, 5, 13)]);
        assertIsBracket(model, new Position(5, 5), [new Range(5, 5, 5, 13), new Range(2, 5, 2, 9)]);
        // <begin> ... <end> is matched
        assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 6), new Range(6, 1, 6, 4)]);
        assertIsBracket(model, new Position(6, 1), [new Range(6, 1, 6, 4), new Range(1, 1, 1, 6)]);
        disposables.dispose();
    });
    test('bracket matching 4', () => {
        const text = [
            'recordbegin',
            '  simplerecordbegin',
            '  endrecord',
            'endrecord',
        ].join('\n');
        const disposables = new DisposableStore();
        const model = createTextModelWithBrackets(disposables, text, [
            ['recordbegin', 'endrecord'],
            ['simplerecordbegin', 'endrecord'],
        ]);
        // <recordbegin> ... <endrecord> is matched
        assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 12), new Range(4, 1, 4, 10)]);
        assertIsBracket(model, new Position(4, 1), [new Range(4, 1, 4, 10), new Range(1, 1, 1, 12)]);
        // <simplerecordbegin> ... <endrecord> is matched
        assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 20), new Range(3, 3, 3, 12)]);
        assertIsBracket(model, new Position(3, 3), [new Range(3, 3, 3, 12), new Range(2, 3, 2, 20)]);
        disposables.dispose();
    });
    test('issue #95843: Highlighting of closing braces is indicating wrong brace when cursor is behind opening brace', () => {
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const languageService = instantiationService.get(ILanguageService);
        const mode1 = 'testMode1';
        const mode2 = 'testMode2';
        const languageIdCodec = languageService.languageIdCodec;
        disposables.add(languageService.registerLanguage({ id: mode1 }));
        disposables.add(languageService.registerLanguage({ id: mode2 }));
        const encodedMode1 = languageIdCodec.encodeLanguageId(mode1);
        const encodedMode2 = languageIdCodec.encodeLanguageId(mode2);
        const otherMetadata1 = ((encodedMode1 << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (0 /* StandardTokenType.Other */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)
            | (1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */)) >>> 0;
        const otherMetadata2 = ((encodedMode2 << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (0 /* StandardTokenType.Other */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)
            | (1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */)) >>> 0;
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                switch (line) {
                    case 'function f() {': {
                        const tokens = new Uint32Array([
                            0, otherMetadata1,
                            8, otherMetadata1,
                            9, otherMetadata1,
                            10, otherMetadata1,
                            11, otherMetadata1,
                            12, otherMetadata1,
                            13, otherMetadata1,
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '  return <p>{true}</p>;': {
                        const tokens = new Uint32Array([
                            0, otherMetadata1,
                            2, otherMetadata1,
                            8, otherMetadata1,
                            9, otherMetadata2,
                            10, otherMetadata2,
                            11, otherMetadata2,
                            12, otherMetadata2,
                            13, otherMetadata1,
                            17, otherMetadata2,
                            18, otherMetadata2,
                            20, otherMetadata2,
                            21, otherMetadata2,
                            22, otherMetadata2,
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '}': {
                        const tokens = new Uint32Array([
                            0, otherMetadata1
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                }
                throw new Error(`Unexpected`);
            }
        };
        disposables.add(TokenizationRegistry.register(mode1, tokenizationSupport));
        disposables.add(languageConfigurationService.register(mode1, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],
        }));
        disposables.add(languageConfigurationService.register(mode2, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],
        }));
        const model = disposables.add(instantiateTextModel(instantiationService, [
            'function f() {',
            '  return <p>{true}</p>;',
            '}',
        ].join('\n'), mode1));
        model.tokenization.forceTokenization(1);
        model.tokenization.forceTokenization(2);
        model.tokenization.forceTokenization(3);
        assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 14)), [new Range(2, 13, 2, 14), new Range(2, 18, 2, 19)]);
        disposables.dispose();
    });
    test('issue #88075: TypeScript brace matching is incorrect in `${}` strings', () => {
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const mode = 'testMode';
        const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
        const encodedMode = languageIdCodec.encodeLanguageId(mode);
        const otherMetadata = ((encodedMode << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (0 /* StandardTokenType.Other */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)) >>> 0;
        const stringMetadata = ((encodedMode << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (2 /* StandardTokenType.String */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)) >>> 0;
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                switch (line) {
                    case 'function hello() {': {
                        const tokens = new Uint32Array([
                            0, otherMetadata
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '    console.log(`${100}`);': {
                        const tokens = new Uint32Array([
                            0, otherMetadata,
                            16, stringMetadata,
                            19, otherMetadata,
                            22, stringMetadata,
                            24, otherMetadata,
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '}': {
                        const tokens = new Uint32Array([
                            0, otherMetadata
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                }
                throw new Error(`Unexpected`);
            }
        };
        disposables.add(TokenizationRegistry.register(mode, tokenizationSupport));
        disposables.add(languageConfigurationService.register(mode, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],
        }));
        const model = disposables.add(instantiateTextModel(instantiationService, [
            'function hello() {',
            '    console.log(`${100}`);',
            '}'
        ].join('\n'), mode));
        model.tokenization.forceTokenization(1);
        model.tokenization.forceTokenization(2);
        model.tokenization.forceTokenization(3);
        assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 23)), null);
        assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 20)), null);
        disposables.dispose();
    });
});
suite('TextModelWithTokens regression tests', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property \'replace\' of undefined or null reference', () => {
        function assertViewLineTokens(model, lineNumber, forceTokenization, expected) {
            if (forceTokenization) {
                model.tokenization.forceTokenization(lineNumber);
            }
            const _actual = model.tokenization.getLineTokens(lineNumber).inflate();
            const actual = [];
            for (let i = 0, len = _actual.getCount(); i < len; i++) {
                actual[i] = {
                    endIndex: _actual.getEndOffset(i),
                    foreground: _actual.getForeground(i)
                };
            }
            const decode = (token) => {
                return {
                    endIndex: token.endIndex,
                    foreground: token.getForeground()
                };
            };
            assert.deepStrictEqual(actual, expected.map(decode));
        }
        let _tokenId = 10;
        const LANG_ID1 = 'indicisiveMode1';
        const LANG_ID2 = 'indicisiveMode2';
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                const myId = ++_tokenId;
                const tokens = new Uint32Array(2);
                tokens[0] = 0;
                tokens[1] = (myId << 15 /* MetadataConsts.FOREGROUND_OFFSET */) >>> 0;
                return new EncodedTokenizationResult(tokens, [], state);
            }
        };
        const registration1 = TokenizationRegistry.register(LANG_ID1, tokenizationSupport);
        const registration2 = TokenizationRegistry.register(LANG_ID2, tokenizationSupport);
        const model = createTextModel('A model with\ntwo lines');
        assertViewLineTokens(model, 1, true, [createViewLineToken(12, 1)]);
        assertViewLineTokens(model, 2, true, [createViewLineToken(9, 1)]);
        model.setLanguage(LANG_ID1);
        assertViewLineTokens(model, 1, true, [createViewLineToken(12, 11)]);
        assertViewLineTokens(model, 2, true, [createViewLineToken(9, 12)]);
        model.setLanguage(LANG_ID2);
        assertViewLineTokens(model, 1, false, [createViewLineToken(12, 1)]);
        assertViewLineTokens(model, 2, false, [createViewLineToken(9, 1)]);
        model.dispose();
        registration1.dispose();
        registration2.dispose();
        function createViewLineToken(endIndex, foreground) {
            const metadata = ((foreground << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0;
            return new TestLineToken(endIndex, metadata);
        }
    });
    test('microsoft/monaco-editor#133: Error: Cannot read property \'modeId\' of undefined', () => {
        const disposables = new DisposableStore();
        const model = createTextModelWithBrackets(disposables, [
            'Imports System',
            'Imports System.Collections.Generic',
            '',
            'Module m1',
            '',
            '\tSub Main()',
            '\tEnd Sub',
            '',
            'End Module',
        ].join('\n'), [
            ['module', 'end module'],
            ['sub', 'end sub']
        ]);
        const actual = model.bracketPairs.matchBracket(new Position(4, 1));
        assert.deepStrictEqual(actual, [new Range(4, 1, 4, 7), new Range(9, 1, 9, 11)]);
        disposables.dispose();
    });
    test('issue #11856: Bracket matching does not work as expected if the opening brace symbol is contained in the closing brace symbol', () => {
        const disposables = new DisposableStore();
        const model = createTextModelWithBrackets(disposables, [
            'sequence "outer"',
            '     sequence "inner"',
            '     endsequence',
            'endsequence',
        ].join('\n'), [
            ['sequence', 'endsequence'],
            ['feature', 'endfeature']
        ]);
        const actual = model.bracketPairs.matchBracket(new Position(3, 9));
        assert.deepStrictEqual(actual, [new Range(2, 6, 2, 14), new Range(3, 6, 3, 17)]);
        disposables.dispose();
    });
    test('issue #63822: Wrong embedded language detected for empty lines', () => {
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const languageService = instantiationService.get(ILanguageService);
        const outerMode = 'outerMode';
        const innerMode = 'innerMode';
        disposables.add(languageService.registerLanguage({ id: outerMode }));
        disposables.add(languageService.registerLanguage({ id: innerMode }));
        const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
        const encodedInnerMode = languageIdCodec.encodeLanguageId(innerMode);
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                const tokens = new Uint32Array(2);
                tokens[0] = 0;
                tokens[1] = (encodedInnerMode << 0 /* MetadataConsts.LANGUAGEID_OFFSET */) >>> 0;
                return new EncodedTokenizationResult(tokens, [], state);
            }
        };
        disposables.add(TokenizationRegistry.register(outerMode, tokenizationSupport));
        const model = disposables.add(instantiateTextModel(instantiationService, 'A model with one line', outerMode));
        model.tokenization.forceTokenization(1);
        assert.strictEqual(model.getLanguageIdAtPosition(1, 1), innerMode);
        disposables.dispose();
    });
});
suite('TextModel.getLineIndentGuide', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertIndentGuides(lines, indentSize) {
        const languageId = 'testLang';
        const disposables = new DisposableStore();
        const instantiationService = createModelServices(disposables);
        const languageService = instantiationService.get(ILanguageService);
        disposables.add(languageService.registerLanguage({ id: languageId }));
        const text = lines.map(l => l[4]).join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
        model.updateOptions({ indentSize: indentSize });
        const actualIndents = model.guides.getLinesIndentGuides(1, model.getLineCount());
        const actual = [];
        for (let line = 1; line <= model.getLineCount(); line++) {
            const activeIndentGuide = model.guides.getActiveIndentGuide(line, 1, model.getLineCount());
            actual[line - 1] = [actualIndents[line - 1], activeIndentGuide.startLineNumber, activeIndentGuide.endLineNumber, activeIndentGuide.indent, model.getLineContent(line)];
        }
        assert.deepStrictEqual(actual, lines);
        disposables.dispose();
    }
    test('getLineIndentGuide one level 2', () => {
        assertIndentGuides([
            [0, 2, 4, 1, 'A'],
            [1, 2, 4, 1, '  A'],
            [1, 2, 4, 1, '  A'],
            [1, 2, 4, 1, '  A'],
        ], 2);
    });
    test('getLineIndentGuide two levels', () => {
        assertIndentGuides([
            [0, 2, 5, 1, 'A'],
            [1, 2, 5, 1, '  A'],
            [1, 4, 5, 2, '  A'],
            [2, 4, 5, 2, '    A'],
            [2, 4, 5, 2, '    A'],
        ], 2);
    });
    test('getLineIndentGuide three levels', () => {
        assertIndentGuides([
            [0, 2, 4, 1, 'A'],
            [1, 3, 4, 2, '  A'],
            [2, 4, 4, 3, '    A'],
            [3, 4, 4, 3, '      A'],
            [0, 5, 5, 0, 'A'],
        ], 2);
    });
    test('getLineIndentGuide decreasing indent', () => {
        assertIndentGuides([
            [2, 1, 1, 2, '    A'],
            [1, 1, 1, 2, '  A'],
            [0, 1, 2, 1, 'A'],
        ], 2);
    });
    test('getLineIndentGuide Java', () => {
        assertIndentGuides([
            /* 1*/ [0, 2, 9, 1, 'class A {'],
            /* 2*/ [1, 3, 4, 2, '  void foo() {'],
            /* 3*/ [2, 3, 4, 2, '    console.log(1);'],
            /* 4*/ [2, 3, 4, 2, '    console.log(2);'],
            /* 5*/ [1, 3, 4, 2, '  }'],
            /* 6*/ [1, 2, 9, 1, ''],
            /* 7*/ [1, 8, 8, 2, '  void bar() {'],
            /* 8*/ [2, 8, 8, 2, '    console.log(3);'],
            /* 9*/ [1, 8, 8, 2, '  }'],
            /*10*/ [0, 2, 9, 1, '}'],
            /*11*/ [0, 12, 12, 1, 'interface B {'],
            /*12*/ [1, 12, 12, 1, '  void bar();'],
            /*13*/ [0, 12, 12, 1, '}'],
        ], 2);
    });
    test('getLineIndentGuide Javadoc', () => {
        assertIndentGuides([
            [0, 2, 3, 1, '/**'],
            [1, 2, 3, 1, ' * Comment'],
            [1, 2, 3, 1, ' */'],
            [0, 5, 6, 1, 'class A {'],
            [1, 5, 6, 1, '  void foo() {'],
            [1, 5, 6, 1, '  }'],
            [0, 5, 6, 1, '}'],
        ], 2);
    });
    test('getLineIndentGuide Whitespace', () => {
        assertIndentGuides([
            [0, 2, 7, 1, 'class A {'],
            [1, 2, 7, 1, ''],
            [1, 4, 5, 2, '  void foo() {'],
            [2, 4, 5, 2, '    '],
            [2, 4, 5, 2, '    return 1;'],
            [1, 4, 5, 2, '  }'],
            [1, 2, 7, 1, '      '],
            [0, 2, 7, 1, '}']
        ], 2);
    });
    test('getLineIndentGuide Tabs', () => {
        assertIndentGuides([
            [0, 2, 7, 1, 'class A {'],
            [1, 2, 7, 1, '\t\t'],
            [1, 4, 5, 2, '\tvoid foo() {'],
            [2, 4, 5, 2, '\t \t//hello'],
            [2, 4, 5, 2, '\t    return 2;'],
            [1, 4, 5, 2, '  \t}'],
            [1, 2, 7, 1, '      '],
            [0, 2, 7, 1, '}']
        ], 4);
    });
    test('getLineIndentGuide checker.ts', () => {
        assertIndentGuides([
            /* 1*/ [0, 1, 1, 0, '/// <reference path="binder.ts"/>'],
            /* 2*/ [0, 2, 2, 0, ''],
            /* 3*/ [0, 3, 3, 0, '/* @internal */'],
            /* 4*/ [0, 5, 16, 1, 'namespace ts {'],
            /* 5*/ [1, 5, 16, 1, '    let nextSymbolId = 1;'],
            /* 6*/ [1, 5, 16, 1, '    let nextNodeId = 1;'],
            /* 7*/ [1, 5, 16, 1, '    let nextMergeId = 1;'],
            /* 8*/ [1, 5, 16, 1, '    let nextFlowId = 1;'],
            /* 9*/ [1, 5, 16, 1, ''],
            /*10*/ [1, 11, 15, 2, '    export function getNodeId(node: Node): number {'],
            /*11*/ [2, 12, 13, 3, '        if (!node.id) {'],
            /*12*/ [3, 12, 13, 3, '            node.id = nextNodeId;'],
            /*13*/ [3, 12, 13, 3, '            nextNodeId++;'],
            /*14*/ [2, 12, 13, 3, '        }'],
            /*15*/ [2, 11, 15, 2, '        return node.id;'],
            /*16*/ [1, 11, 15, 2, '    }'],
            /*17*/ [0, 5, 16, 1, '}']
        ], 4);
    });
    test('issue #8425 - Missing indentation lines for first level indentation', () => {
        assertIndentGuides([
            [1, 2, 3, 2, '\tindent1'],
            [2, 2, 3, 2, '\t\tindent2'],
            [2, 2, 3, 2, '\t\tindent2'],
            [1, 2, 3, 2, '\tindent1']
        ], 4);
    });
    test('issue #8952 - Indentation guide lines going through text on .yml file', () => {
        assertIndentGuides([
            [0, 2, 5, 1, 'properties:'],
            [1, 3, 5, 2, '    emailAddress:'],
            [2, 3, 5, 2, '        - bla'],
            [2, 5, 5, 3, '        - length:'],
            [3, 5, 5, 3, '            max: 255'],
            [0, 6, 6, 0, 'getters:']
        ], 4);
    });
    test('issue #11892 - Indent guides look funny', () => {
        assertIndentGuides([
            [0, 2, 7, 1, 'function test(base) {'],
            [1, 3, 6, 2, '\tswitch (base) {'],
            [2, 4, 4, 3, '\t\tcase 1:'],
            [3, 4, 4, 3, '\t\t\treturn 1;'],
            [2, 6, 6, 3, '\t\tcase 2:'],
            [3, 6, 6, 3, '\t\t\treturn 2;'],
            [1, 2, 7, 1, '\t}'],
            [0, 2, 7, 1, '}']
        ], 4);
    });
    test('issue #12398 - Problem in indent guidelines', () => {
        assertIndentGuides([
            [2, 2, 2, 3, '\t\t.bla'],
            [3, 2, 2, 3, '\t\t\tlabel(for)'],
            [0, 3, 3, 0, 'include script']
        ], 4);
    });
    test('issue #49173', () => {
        const model = createTextModel([
            'class A {',
            '	public m1(): void {',
            '	}',
            '	public m2(): void {',
            '	}',
            '	public m3(): void {',
            '	}',
            '	public m4(): void {',
            '	}',
            '	public m5(): void {',
            '	}',
            '}',
        ].join('\n'));
        const actual = model.guides.getActiveIndentGuide(2, 4, 9);
        assert.deepStrictEqual(actual, { startLineNumber: 2, endLineNumber: 9, indent: 1 });
        model.dispose();
    });
    test('tweaks - no active', () => {
        assertIndentGuides([
            [0, 1, 1, 0, 'A'],
            [0, 2, 2, 0, 'A']
        ], 2);
    });
    test('tweaks - inside scope', () => {
        assertIndentGuides([
            [0, 2, 2, 1, 'A'],
            [1, 2, 2, 1, '  A']
        ], 2);
    });
    test('tweaks - scope start', () => {
        assertIndentGuides([
            [0, 2, 2, 1, 'A'],
            [1, 2, 2, 1, '  A'],
            [0, 2, 2, 1, 'A']
        ], 2);
    });
    test('tweaks - empty line', () => {
        assertIndentGuides([
            [0, 2, 4, 1, 'A'],
            [1, 2, 4, 1, '  A'],
            [1, 2, 4, 1, ''],
            [1, 2, 4, 1, '  A'],
            [0, 2, 4, 1, 'A']
        ], 2);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsV2l0aFRva2Vucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVsL3RleHRNb2RlbFdpdGhUb2tlbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEQsT0FBTyxFQUF3QixvQkFBb0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBR3JILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDekQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRWpHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLFNBQVMsMkJBQTJCLENBQUMsV0FBNEIsRUFBRSxJQUFZLEVBQUUsUUFBeUI7SUFDekcsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDO0lBQ2xDLE1BQU0sb0JBQW9CLEdBQUcsbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDOUQsTUFBTSw0QkFBNEIsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsNkJBQTZC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a0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEMsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0Ysa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQy9CLE1BQU0sSUFBSSxHQUNULGFBQWEsR0FBRyxJQUFJO1lBQ3BCLFFBQVEsR0FBRyxJQUFJO1lBQ2Ysb0JBQW9CLEdBQUcsSUFBSTtZQUMzQixNQUFNLEdBQUcsSUFBSTtZQUNiLE1BQU0sQ0FBQztRQUNSLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFFNUYsTUFBTSxRQUFRLEdBQStCO1lBQzVDLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXJFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWxFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25FLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXJFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWxFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFD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S0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RixlQUFlLENBQUMsS0FBSyxFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3RixtQ0FBbUM7UUFDbkMsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUYsZUFBZSxDQUFDLEtBQUssRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUYsK0JBQStCO1FBQy9CLGVBQWUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMs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