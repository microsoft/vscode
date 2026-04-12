/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getNonWhitespacePrefix } from '../../browser/snippetsService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('getNonWhitespacePrefix', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertGetNonWhitespacePrefix(line, column, expected) {
        const model = {
            getLineContent: (lineNumber) => line
        };
        const actual = getNonWhitespacePrefix(model, new Position(1, column));
        assert.strictEqual(actual, expected);
    }
    test('empty line', () => {
        assertGetNonWhitespacePrefix('', 1, '');
    });
    test('singleWordLine', () => {
        assertGetNonWhitespacePrefix('something', 1, '');
        assertGetNonWhitespacePrefix('something', 2, 's');
        assertGetNonWhitespacePrefix('something', 3, 'so');
        assertGetNonWhitespacePrefix('something', 4, 'som');
        assertGetNonWhitespacePrefix('something', 5, 'some');
        assertGetNonWhitespacePrefix('something', 6, 'somet');
        assertGetNonWhitespacePrefix('something', 7, 'someth');
        assertGetNonWhitespacePrefix('something', 8, 'somethi');
        assertGetNonWhitespacePrefix('something', 9, 'somethin');
        assertGetNonWhitespacePrefix('something', 10, 'something');
    });
    test('two word line', () => {
        assertGetNonWhitespacePrefix('something interesting', 1, '');
        assertGetNonWhitespacePrefix('something interesting', 2, 's');
        assertGetNonWhitespacePrefix('something interesting', 3, 'so');
        assertGetNonWhitespacePrefix('something interesting', 4, 'som');
        assertGetNonWhitespacePrefix('something interesting', 5, 'some');
        assertGetNonWhitespacePrefix('something interesting', 6, 'somet');
        assertGetNonWhitespacePrefix('something interesting', 7, 'someth');
        assertGetNonWhitespacePrefix('something interesting', 8, 'somethi');
        assertGetNonWhitespacePrefix('something interesting', 9, 'somethin');
        assertGetNonWhitespacePrefix('something interesting', 10, 'something');
        assertGetNonWhitespacePrefix('something interesting', 11, '');
        assertGetNonWhitespacePrefix('something interesting', 12, 'i');
        assertGetNonWhitespacePrefix('something interesting', 13, 'in');
        assertGetNonWhitespacePrefix('something interesting', 14, 'int');
        assertGetNonWhitespacePrefix('something interesting', 15, 'inte');
        assertGetNonWhitespacePrefix('something interesting', 16, 'inter');
        assertGetNonWhitespacePrefix('something interesting', 17, 'intere');
        assertGetNonWhitespacePrefix('something interesting', 18, 'interes');
        assertGetNonWhitespacePrefix('something interesting', 19, 'interest');
        assertGetNonWhitespacePrefix('something interesting', 20, 'interesti');
        assertGetNonWhitespacePrefix('something interesting', 21, 'interestin');
        assertGetNonWhitespacePrefix('something interesting', 22, 'interesting');
    });
    test('many separators', () => {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions?redirectlocale=en-US&redirectslug=JavaScript%2FGuide%2FRegular_Expressions#special-white-space
        // \s matches a single white space character, including space, tab, form feed, line feed.
        // Equivalent to [ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff].
        assertGetNonWhitespacePrefix('something interesting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\tinteresting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\finteresting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\vinteresting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\u00a0interesting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\u2000interesting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\u2028interesting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\u3000interesting', 22, 'interesting');
        assertGetNonWhitespacePrefix('something\ufeffinteresting', 22, 'interesting');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNSZWdpc3RyeS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc25pcHBldHMvdGVzdC9icm93c2VyL3NuaXBwZXRzUmVnaXN0cnkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7SUFFcEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLDRCQUE0QixDQUFDLElBQVksRUFBRSxNQUFjLEVBQUUsUUFBZ0I7UUFDbkYsTUFBTSxLQUFLLEdBQUc7WUFDYixjQUFjLEVBQUUsQ0FBQyxVQUFrQixFQUFFLEVBQUUsQ0FBQyxJQUFJO1NBQzVDLENBQUM7UUFDRixNQUFNLE1BQU0sR0FBRyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELElBQUksQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLDRCQUE0QixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO1FBQzNCLDRCQUE0QixDQUFDLFdBQVcsRUFBRSxDQUFD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