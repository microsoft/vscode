/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StandardAutoClosingPairConditional } from '../../../../common/languages/languageConfiguration.js';
import { CharacterPairSupport } from '../../../../common/languages/supports/characterPair.js';
import { createFakeScopedLineTokens } from '../../modesTestUtils.js';
suite('CharacterPairSupport', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('only autoClosingPairs', () => {
        const characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [{ open: 'a', close: 'b' }] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
    });
    test('only empty autoClosingPairs', () => {
        const characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
    });
    test('only brackets', () => {
        const characaterPairSupport = new CharacterPairSupport({ brackets: [['a', 'b']] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [new StandardAutoClosingPairConditional({ open: 'a', close: 'b' })]);
    });
    test('only empty brackets', () => {
        const characaterPairSupport = new CharacterPairSupport({ brackets: [] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
    });
    test('only surroundingPairs', () => {
        const characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [{ open: 'a', close: 'b' }] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
    });
    test('only empty surroundingPairs', () => {
        const characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
    });
    test('brackets is ignored when having autoClosingPairs', () => {
        const characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [], brackets: [['a', 'b']] });
        assert.deepStrictEqual(characaterPairSupport.getAutoClosingPairs(), []);
        assert.deepStrictEqual(characaterPairSupport.getSurroundingPairs(), []);
    });
    function testShouldAutoClose(characterPairSupport, line, column) {
        const autoClosingPair = characterPairSupport.getAutoClosingPairs()[0];
        return autoClosingPair.shouldAutoClose(createFakeScopedLineTokens(line), column);
    }
    test('shouldAutoClosePair in empty line', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
        const tokenText = [];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 1), true);
    });
    test('shouldAutoClosePair in not interesting line 1', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
        const tokenText = [
            { text: 'do', type: 0 /* StandardTokenType.Other */ }
        ];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 3), true);
    });
    test('shouldAutoClosePair in not interesting line 2', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}' }] });
        const tokenText = [
            { text: 'do', type: 2 /* StandardTokenType.String */ }
        ];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 3), true);
    });
    test('shouldAutoClosePair in interesting line 1', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
        const tokenText = [
            { text: '"a"', type: 2 /* StandardTokenType.String */ }
        ];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 1), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 2), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 3), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 4), false);
    });
    test('shouldAutoClosePair in interesting line 2', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
        const tokenText = [
            { text: 'x=', type: 0 /* StandardTokenType.Other */ },
            { text: '"a"', type: 2 /* StandardTokenType.String */ },
            { text: ';', type: 0 /* StandardTokenType.Other */ }
        ];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 1), true);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 2), true);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 3), true);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 4), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 5), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 6), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 7), true);
    });
    test('shouldAutoClosePair in interesting line 3', () => {
        const sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
        const tokenText = [
            { text: ' ', type: 0 /* StandardTokenType.Other */ },
            { text: '//a', type: 1 /* StandardTokenType.Comment */ }
        ];
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 1), true);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 2), true);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 3), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 4), false);
        assert.strictEqual(testShouldAutoClose(sup, tokenText, 5), false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhcmFjdGVyUGFpci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL2NoYXJhY3RlclBhaXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDM0csT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDOUYsT0FBTyxFQUFhLDBCQUEwQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFaEYsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUVsQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbEMsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLG9CQUFvQixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFHLE1BQU0sQ0FBQyxlQUFlLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLElBQUksa0NBQWtDLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6SSxNQUFNLENBQUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxJQUFJLGtDQUFrQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUs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