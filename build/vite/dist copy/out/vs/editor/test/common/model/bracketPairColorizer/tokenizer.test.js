/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { LanguageAgnosticBracketTokens } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/brackets.js';
import { lengthAdd, lengthsToRange, lengthZero } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/length.js';
import { DenseKeyProvider } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet.js';
import { TextBufferTokenizer } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/tokenizer.js';
import { createModelServices, instantiateTextModel } from '../../testTextModel.js';
suite('Bracket Pair Colorizer - Tokenizer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Basic', () => {
        const mode1 = 'testMode1';
        const disposableStore = new DisposableStore();
        const instantiationService = createModelServices(disposableStore);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const languageService = instantiationService.get(ILanguageService);
        disposableStore.add(languageService.registerLanguage({ id: mode1 }));
        const encodedMode1 = languageService.languageIdCodec.encodeLanguageId(mode1);
        const denseKeyProvider = new DenseKeyProvider();
        const tStandard = (text) => new TokenInfo(text, encodedMode1, 0 /* StandardTokenType.Other */, true);
        const tComment = (text) => new TokenInfo(text, encodedMode1, 1 /* StandardTokenType.Comment */, true);
        const document = new TokenizedDocument([
            tStandard(' { } '), tStandard('be'), tStandard('gin end'), tStandard('\n'),
            tStandard('hello'), tComment('{'), tStandard('}'),
        ]);
        disposableStore.add(TokenizationRegistry.register(mode1, document.getTokenizationSupport()));
        disposableStore.add(languageConfigurationService.register(mode1, {
            brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['begin', 'end']],
        }));
        const model = disposableStore.add(instantiateTextModel(instantiationService, document.getText(), mode1));
        model.tokenization.forceTokenization(model.getLineCount());
        const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, l => languageConfigurationService.getLanguageConfiguration(l));
        const tokens = readAllTokens(new TextBufferTokenizer(model, brackets));
        assert.deepStrictEqual(toArr(tokens, model, denseKeyProvider), [
            { text: ' ', bracketId: null, bracketIds: [], kind: 'Text' },
            {
                text: '{',
                bracketId: 'testMode1:::{',
                bracketIds: ['testMode1:::{'],
                kind: 'OpeningBracket',
            },
            { text: ' ', bracketId: null, bracketIds: [], kind: 'Text' },
            {
                text: '}',
                bracketId: 'testMode1:::{',
                bracketIds: ['testMode1:::{'],
                kind: 'ClosingBracket',
            },
            { text: ' ', bracketId: null, bracketIds: [], kind: 'Text' },
            {
                text: 'begin',
                bracketId: 'testMode1:::begin',
                bracketIds: ['testMode1:::begin'],
                kind: 'OpeningBracket',
            },
            { text: ' ', bracketId: null, bracketIds: [], kind: 'Text' },
            {
                text: 'end',
                bracketId: 'testMode1:::begin',
                bracketIds: ['testMode1:::begin'],
                kind: 'ClosingBracket',
            },
            { text: '\nhello{', bracketId: null, bracketIds: [], kind: 'Text' },
            {
                text: '}',
                bracketId: 'testMode1:::{',
                bracketIds: ['testMode1:::{'],
                kind: 'ClosingBracket',
            },
        ]);
        disposableStore.dispose();
    });
});
function readAllTokens(tokenizer) {
    const tokens = new Array();
    while (true) {
        const token = tokenizer.read();
        if (!token) {
            break;
        }
        tokens.push(token);
    }
    return tokens;
}
function toArr(tokens, model, keyProvider) {
    const result = new Array();
    let offset = lengthZero;
    for (const token of tokens) {
        result.push(tokenToObj(token, offset, model, keyProvider));
        offset = lengthAdd(offset, token.length);
    }
    return result;
}
function tokenToObj(token, offset, model, keyProvider) {
    return {
        text: model.getValueInRange(lengthsToRange(offset, lengthAdd(offset, token.length))),
        bracketId: keyProvider.reverseLookup(token.bracketId) || null,
        bracketIds: keyProvider.reverseLookupSet(token.bracketIds),
        kind: {
            [2 /* TokenKind.ClosingBracket */]: 'ClosingBracket',
            [1 /* TokenKind.OpeningBracket */]: 'OpeningBracket',
            [0 /* TokenKind.Text */]: 'Text',
        }[token.kind]
    };
}
export class TokenizedDocument {
    constructor(tokens) {
        const tokensByLine = new Array();
        let curLine = new Array();
        for (const token of tokens) {
            const lines = token.text.split('\n');
            let first = true;
            while (lines.length > 0) {
                if (!first) {
                    tokensByLine.push(curLine);
                    curLine = new Array();
                }
                else {
                    first = false;
                }
                if (lines[0].length > 0) {
                    curLine.push(token.withText(lines[0]));
                }
                lines.pop();
            }
        }
        tokensByLine.push(curLine);
        this.tokensByLine = tokensByLine;
    }
    getText() {
        return this.tokensByLine.map(t => t.map(t => t.text).join('')).join('\n');
    }
    getTokenizationSupport() {
        class State {
            constructor(lineNumber) {
                this.lineNumber = lineNumber;
            }
            clone() {
                return new State(this.lineNumber);
            }
            equals(other) {
                return this.lineNumber === other.lineNumber;
            }
        }
        return {
            getInitialState: () => new State(0),
            tokenize: () => { throw new Error('Method not implemented.'); },
            tokenizeEncoded: (line, hasEOL, state) => {
                const state2 = state;
                const tokens = this.tokensByLine[state2.lineNumber];
                const arr = new Array();
                let offset = 0;
                for (const t of tokens) {
                    arr.push(offset, t.getMetadata());
                    offset += t.text.length;
                }
                return new EncodedTokenizationResult(new Uint32Array(arr), [], new State(state2.lineNumber + 1));
            }
        };
    }
}
export class TokenInfo {
    constructor(text, languageId, tokenType, hasBalancedBrackets) {
        this.text = text;
        this.languageId = languageId;
        this.tokenType = tokenType;
        this.hasBalancedBrackets = hasBalancedBrackets;
    }
    getMetadata() {
        return ((((this.languageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */) |
            (this.tokenType << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)) >>>
            0) |
            (this.hasBalancedBrackets ? 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */ : 0));
    }
    withText(text) {
        return new TokenInfo(text, this.languageId, this.tokenType, this.hasBalancedBrackets);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJDb2xvcml6ZXIvdG9rZW5pemVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUseUJBQXlCLEVBQWdDLG9CQUFvQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDOUcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0saUZBQWlGLENBQUM7QUFDaEksT0FBTyxFQUFVLFNBQVMsRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDOUksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEZBQTBGLENBQUM7QUFDNUgsT0FBTyxFQUFFLG1CQUFtQixFQUErQixNQUFNLGtGQUFrRixDQUFDO0FBRXBKLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRW5GLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7SUFFaEQsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtRQUNsQixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUM7UUFDMUIsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUs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