/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BracketElectricCharacterSupport } from '../../../../common/languages/supports/electricCharacter.js';
import { RichEditBrackets } from '../../../../common/languages/supports/richEditBrackets.js';
import { createFakeScopedLineTokens } from '../../modesTestUtils.js';
const fakeLanguageId = 'test';
suite('Editor Modes - Auto Indentation', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function _testOnElectricCharacter(electricCharacterSupport, line, character, offset) {
        return electricCharacterSupport.onElectricCharacter(character, createFakeScopedLineTokens(line), offset);
    }
    function testDoesNothing(electricCharacterSupport, line, character, offset) {
        const actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
        assert.deepStrictEqual(actual, null);
    }
    function testMatchBracket(electricCharacterSupport, line, character, offset, matchOpenBracket) {
        const actual = _testOnElectricCharacter(electricCharacterSupport, line, character, offset);
        assert.deepStrictEqual(actual, { matchOpenBracket: matchOpenBracket });
    }
    test('getElectricCharacters uses all sources and dedups', () => {
        const sup = new BracketElectricCharacterSupport(new RichEditBrackets(fakeLanguageId, [
            ['{', '}'],
            ['(', ')']
        ]));
        assert.deepStrictEqual(sup.getElectricCharacters(), ['}', ')']);
    });
    test('matchOpenBracket', () => {
        const sup = new BracketElectricCharacterSupport(new RichEditBrackets(fakeLanguageId, [
            ['{', '}'],
            ['(', ')']
        ]));
        testDoesNothing(sup, [{ text: '\t{', type: 0 /* StandardTokenType.Other */ }], '\t', 1);
        testDoesNothing(sup, [{ text: '\t{', type: 0 /* StandardTokenType.Other */ }], '\t', 2);
        testDoesNothing(sup, [{ text: '\t\t', type: 0 /* StandardTokenType.Other */ }], '{', 3);
        testDoesNothing(sup, [{ text: '\t}', type: 0 /* StandardTokenType.Other */ }], '\t', 1);
        testDoesNothing(sup, [{ text: '\t}', type: 0 /* StandardTokenType.Other */ }], '\t', 2);
        testMatchBracket(sup, [{ text: '\t\t', type: 0 /* StandardTokenType.Other */ }], '}', 3, '}');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3RyaWNDaGFyYWN0ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy9zdXBwb3J0cy9lbGVjdHJpY0NoYXJhY3Rlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsK0JBQStCLEVBQW1CLE1BQU0sNERBQTRELENBQUM7QUFDOUgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDN0YsT0FBTyxFQUFhLDBCQUEwQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFaEYsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDO0FBRTlCLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7SUFFN0MsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLHdCQUF3QixDQUFDLHdCQUF5RCxFQUFFLElBQWlCLEVBQUUsU0FBaUIsRUFBRSxNQUFjO1FBQ2hKLE9BQU8sd0JBQXdCLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLDBCQUEwQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzFHLENBQUM7SUFFRCxTQUFTLGVBQWUsQ0FBQyx3QkFBeUQsRUFBRSxJQUFpQixFQUFFLFNBQWlCLEVBQUUsTUFBYztRQUN2SSxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxTQUFTLGdCQUFnQixDQUFDLHdCQUF5RCxFQUFFLElBQWlCLEVBQUUsU0FBaUIsRUFBRSxNQUFjLEVBQUUsZ0JBQXdCO1FBQ2xLLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLHdCQUF3QixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7UUFDOUQsTUFBTSxHQUFHLEdBQUcsSUFBSSwrQkFBK0IsQ0FDOUMsSUFBSSxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUU7WUFDcEMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ1YsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQ1YsQ0FBQyxDQUNGLENBQUM7UUFFRixNQUFNLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDakUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLE1BQU0sR0FBRyxHQUFHLElBQUksK0JBQStCLENBQzlDLElBQUksZ0JBQWdCLENBQUMsY0FBYyxFQUFFO1lBQ3BDLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztZQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNWLENBQUMsQ0FDRixDQUFDO1FBRUYsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLGlDQUF5QixFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEYsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLGlDQUF5QixFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEYsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLGlDQUF5QixFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFaEYsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLGlDQUF5QixFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEYsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLGlDQUF5QixFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEYsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksaUNBQXlCLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdkYsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9