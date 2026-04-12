/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Snippet } from '../../browser/snippetsFile.js';
suite('SnippetRewrite', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertRewrite(input, expected) {
        const actual = new Snippet(false, ['foo'], 'foo', 'foo', 'foo', input, 'foo', 1 /* SnippetSource.User */, generateUuid());
        if (typeof expected === 'boolean') {
            assert.strictEqual(actual.codeSnippet, input);
        }
        else {
            assert.strictEqual(actual.codeSnippet, expected);
        }
    }
    test('bogous variable rewrite', function () {
        assertRewrite('foo', false);
        assertRewrite('hello $1 world$0', false);
        assertRewrite('$foo and $foo', '${1:foo} and ${1:foo}');
        assertRewrite('$1 and $SELECTION and $foo', '$1 and ${SELECTION} and ${2:foo}');
        assertRewrite([
            'for (var ${index} = 0; ${index} < ${array}.length; ${index}++) {',
            '\tvar ${element} = ${array}[${index}];',
            '\t$0',
            '}'
        ].join('\n'), [
            'for (var ${1:index} = 0; ${1:index} < ${2:array}.length; ${1:index}++) {',
            '\tvar ${3:element} = ${2:array}[${1:index}];',
            '\t$0',
            '\\}'
        ].join('\n'));
    });
    test('Snippet choices: unable to escape comma and pipe, #31521', function () {
        assertRewrite('console.log(${1|not\\, not, five, 5, 1   23|});', false);
    });
    test('lazy bogous variable rewrite', function () {
        const snippet = new Snippet(false, ['fooLang'], 'foo', 'prefix', 'desc', 'This is ${bogous} because it is a ${var}', 'source', 3 /* SnippetSource.Extension */, generateUuid());
        assert.strictEqual(snippet.body, 'This is ${bogous} because it is a ${var}');
        assert.strictEqual(snippet.codeSnippet, 'This is ${1:bogous} because it is a ${2:var}');
        assert.strictEqual(snippet.isBogous, true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNSZXdyaXRlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zbmlwcGV0cy90ZXN0L2Jyb3dzZXIvc25pcHBldHNSZXdyaXRlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFpQixNQUFNLCtCQUErQixDQUFDO0FBRXZFLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRTtJQUV2Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsYUFBYSxDQUFDLEtBQWEsRUFBRSxRQUEwQjtRQUMvRCxNQUFNLE1BQU0sR0FBRyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyw4QkFBc0IsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUNsSCxJQUFJLE9BQU8sUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNsRCxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksQ0FBQyx5QkFBeUIsRUFBRTtRQUUvQixhQUFhLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVCLGFBQWEsQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV6QyxhQUFhLENBQUMsZUFBZSxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDeEQsYUFBYSxDQUFDLDRCQUE0QixFQUFFLGtDQUFrQyxDQUFDLENBQUM7UUFHaEYsYUFBYSxDQUNaO1lBQ0Msa0VBQWtFO1lBQ2xFLHdDQUF3QztZQUN4QyxNQUFNO1lBQ04sR0FBRztTQUNILENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUNaO1lBQ0MsMEVBQTBFO1lBQzFFLDhDQUE4QztZQUM5QyxNQUFNO1lBQ04sS0FBSztTQUNMLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUNaLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwREFBMEQsRUFBRTtRQUNoRSxhQUFhLENBQUMsaURBQWlELEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUU7UUFDcEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsMENBQTBDLEVBQUUsUUFBUSxtQ0FBMkIsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUN4SyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsMENBQTBDLENBQUMsQ0FBQztRQUM3RSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUN4RixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9