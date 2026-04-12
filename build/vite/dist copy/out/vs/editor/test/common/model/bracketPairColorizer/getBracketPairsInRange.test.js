/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { disposeOnReturn } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TokenizationRegistry } from '../../../../common/languages.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { TokenInfo, TokenizedDocument } from './tokenizer.test.js';
import { createModelServices, instantiateTextModel } from '../../testTextModel.js';
suite('Bracket Pair Colorizer - getBracketPairsInRange', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createTextModelWithColorizedBracketPairs(store, text) {
        const languageId = 'testLanguage';
        const instantiationService = createModelServices(store);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const languageService = instantiationService.get(ILanguageService);
        store.add(languageService.registerLanguage({
            id: languageId,
        }));
        const encodedMode1 = languageService.languageIdCodec.encodeLanguageId(languageId);
        const document = new TokenizedDocument([
            new TokenInfo(text, encodedMode1, 0 /* StandardTokenType.Other */, true)
        ]);
        store.add(TokenizationRegistry.register(languageId, document.getTokenizationSupport()));
        store.add(languageConfigurationService.register(languageId, {
            brackets: [
                ['<', '>']
            ],
            colorizedBracketPairs: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
        const textModel = store.add(instantiateTextModel(instantiationService, text, languageId));
        return textModel;
    }
    test('Basic 1', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`{ ( [] ¹ ) [ ² { } ] () } []`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            model.tokenization.getLineTokens(1).getLanguageId(0);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketPairsInRange(doc.range(1, 2))
                .map(bracketPairToJSON)
                .toArray(), [
                {
                    level: 0,
                    range: '[1,1 -> 1,2]',
                    openRange: '[1,1 -> 1,2]',
                    closeRange: '[1,23 -> 1,24]',
                },
                {
                    level: 1,
                    range: '[1,3 -> 1,4]',
                    openRange: '[1,3 -> 1,4]',
                    closeRange: '[1,9 -> 1,10]',
                },
                {
                    level: 1,
                    range: '[1,11 -> 1,12]',
                    openRange: '[1,11 -> 1,12]',
                    closeRange: '[1,18 -> 1,19]',
                },
            ]);
        });
    });
    test('Basic 2', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`{ ( [] ¹ ²) [  { } ] () } []`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketPairsInRange(doc.range(1, 2))
                .map(bracketPairToJSON)
                .toArray(), [
                {
                    level: 0,
                    range: '[1,1 -> 1,2]',
                    openRange: '[1,1 -> 1,2]',
                    closeRange: '[1,23 -> 1,24]',
                },
                {
                    level: 1,
                    range: '[1,3 -> 1,4]',
                    openRange: '[1,3 -> 1,4]',
                    closeRange: '[1,9 -> 1,10]',
                },
            ]);
        });
    });
    test('Basic Empty', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`¹ ² { ( [] ) [  { } ] () } []`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketPairsInRange(doc.range(1, 2))
                .map(bracketPairToJSON)
                .toArray(), []);
        });
    });
    test('Basic All', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`¹ { ( [] ) [  { } ] () } [] ²`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketPairsInRange(doc.range(1, 2))
                .map(bracketPairToJSON)
                .toArray(), [
                {
                    level: 0,
                    range: '[1,2 -> 1,3]',
                    openRange: '[1,2 -> 1,3]',
                    closeRange: '[1,23 -> 1,24]',
                },
                {
                    level: 1,
                    range: '[1,4 -> 1,5]',
                    openRange: '[1,4 -> 1,5]',
                    closeRange: '[1,9 -> 1,10]',
                },
                {
                    level: 2,
                    range: '[1,6 -> 1,7]',
                    openRange: '[1,6 -> 1,7]',
                    closeRange: '[1,7 -> 1,8]',
                },
                {
                    level: 1,
                    range: '[1,11 -> 1,12]',
                    openRange: '[1,11 -> 1,12]',
                    closeRange: '[1,18 -> 1,19]',
                },
                {
                    level: 2,
                    range: '[1,14 -> 1,15]',
                    openRange: '[1,14 -> 1,15]',
                    closeRange: '[1,16 -> 1,17]',
                },
                {
                    level: 1,
                    range: '[1,20 -> 1,21]',
                    openRange: '[1,20 -> 1,21]',
                    closeRange: '[1,21 -> 1,22]',
                },
                {
                    level: 0,
                    range: '[1,25 -> 1,26]',
                    openRange: '[1,25 -> 1,26]',
                    closeRange: '[1,26 -> 1,27]',
                },
            ]);
        });
    });
    test('getBracketsInRange', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`¹ { [ ( [ [ (  ) ] ] ) ] } { } ²`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketsInRange(doc.range(1, 2))
                .map(b => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() }))
                .toArray(), [
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,2 -> 1,3]'
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,4 -> 1,5]'
                },
                {
                    level: 2,
                    levelEqualBracketType: 0,
                    range: '[1,6 -> 1,7]'
                },
                {
                    level: 3,
                    levelEqualBracketType: 1,
                    range: '[1,8 -> 1,9]'
                },
                {
                    level: 4,
                    levelEqualBracketType: 2,
                    range: '[1,10 -> 1,11]'
                },
                {
                    level: 5,
                    levelEqualBracketType: 1,
                    range: '[1,12 -> 1,13]'
                },
                {
                    level: 5,
                    levelEqualBracketType: 1,
                    range: '[1,15 -> 1,16]'
                },
                {
                    level: 4,
                    levelEqualBracketType: 2,
                    range: '[1,17 -> 1,18]'
                },
                {
                    level: 3,
                    levelEqualBracketType: 1,
                    range: '[1,19 -> 1,20]'
                },
                {
                    level: 2,
                    levelEqualBracketType: 0,
                    range: '[1,21 -> 1,22]'
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,23 -> 1,24]'
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,25 -> 1,26]'
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,27 -> 1,28]'
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,29 -> 1,30]'
                },
            ]);
        });
    });
    test('Test Error Brackets', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`¹ { () ] ² `);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketsInRange(doc.range(1, 2))
                .map(b => ({ level: b.nestingLevel, range: b.range.toString(), isInvalid: b.isInvalid }))
                .toArray(), [
                {
                    level: 0,
                    isInvalid: true,
                    range: '[1,2 -> 1,3]',
                },
                {
                    level: 1,
                    isInvalid: false,
                    range: '[1,4 -> 1,5]',
                },
                {
                    level: 1,
                    isInvalid: false,
                    range: '[1,5 -> 1,6]',
                },
                {
                    level: 0,
                    isInvalid: true,
                    range: '[1,7 -> 1,8]'
                }
            ]);
        });
    });
    test('colorizedBracketsVSBrackets', () => {
        disposeOnReturn(store => {
            const doc = new AnnotatedDocument(`¹ {} [<()>] <{>} ²`);
            const model = createTextModelWithColorizedBracketPairs(store, doc.text);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketsInRange(doc.range(1, 2), true)
                .map(b => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() }))
                .toArray(), [
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,2 -> 1,3]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,3 -> 1,4]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,5 -> 1,6]',
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,7 -> 1,8]',
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,8 -> 1,9]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,10 -> 1,11]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,13 -> 1,14]',
                },
                {
                    level: -1,
                    levelEqualBracketType: 0,
                    range: '[1,15 -> 1,16]',
                },
            ]);
            assert.deepStrictEqual(model.bracketPairs
                .getBracketsInRange(doc.range(1, 2), false)
                .map(b => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() }))
                .toArray(), [
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,2 -> 1,3]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,3 -> 1,4]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,5 -> 1,6]',
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,6 -> 1,7]',
                },
                {
                    level: 2,
                    levelEqualBracketType: 0,
                    range: '[1,7 -> 1,8]',
                },
                {
                    level: 2,
                    levelEqualBracketType: 0,
                    range: '[1,8 -> 1,9]',
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,9 -> 1,10]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,10 -> 1,11]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,12 -> 1,13]',
                },
                {
                    level: 1,
                    levelEqualBracketType: 0,
                    range: '[1,13 -> 1,14]',
                },
                {
                    level: 0,
                    levelEqualBracketType: 0,
                    range: '[1,14 -> 1,15]',
                },
                {
                    level: -1,
                    levelEqualBracketType: 0,
                    range: '[1,15 -> 1,16]',
                },
            ]);
        });
    });
});
function bracketPairToJSON(pair) {
    return {
        level: pair.nestingLevel,
        range: pair.openingBracketRange.toString(),
        openRange: pair.openingBracketRange.toString(),
        closeRange: pair.closingBracketRange?.toString() || null,
    };
}
class PositionOffsetTransformer {
    constructor(text) {
        this.lineStartOffsetByLineIdx = [];
        this.lineStartOffsetByLineIdx.push(0);
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '\n') {
                this.lineStartOffsetByLineIdx.push(i + 1);
            }
        }
    }
    getOffset(position) {
        return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
    }
    getPosition(offset) {
        const lineNumber = this.lineStartOffsetByLineIdx.findIndex(lineStartOffset => lineStartOffset <= offset);
        return new Position(lineNumber + 1, offset - this.lineStartOffsetByLineIdx[lineNumber] + 1);
    }
}
class AnnotatedDocument {
    constructor(src) {
        const numbers = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
        let text = '';
        const offsetPositions = new Map();
        let offset = 0;
        for (let i = 0; i < src.length; i++) {
            const idx = numbers.indexOf(src[i]);
            if (idx >= 0) {
                offsetPositions.set(idx, offset);
            }
            else {
                text += src[i];
                offset++;
            }
        }
        this.text = text;
        const mapper = new PositionOffsetTransformer(this.text);
        const positions = new Map();
        for (const [idx, offset] of offsetPositions.entries()) {
            positions.set(idx, mapper.getPosition(offset));
        }
        this.positions = positions;
    }
    range(start, end) {
        return Range.fromPositions(this.positions.get(start), this.positions.get(end));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0QnJhY2tldFBhaXJzSW5SYW5nZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyQ29sb3JpemVyL2dldEJyYWNrZXRQYWlyc0luUmFuZ2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFtQixlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRzlHLE9BQU8sRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVuRixLQUFLLENBQUMsaURBQWlELEVBQUUsR0FBRyxFQUFFO0lBRTdELHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyx3Q0FBd0MsQ0FBQyxLQUFzQixFQUFFLElBQVk7UUFDckYsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDO1FBQ2xDLE1BQU0sb0JBQW9CLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEQsTUFBTSw0QkFBNEIsR0FBRyxvQkFB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