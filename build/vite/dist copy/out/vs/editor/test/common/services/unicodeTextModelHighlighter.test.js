/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { UnicodeTextModelHighlighter } from '../../../common/services/unicodeTextModelHighlighter.js';
import { createTextModel } from '../testTextModel.js';
suite('UnicodeTextModelHighlighter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function t(text, options) {
        const m = createTextModel(text);
        const r = UnicodeTextModelHighlighter.computeUnicodeHighlights(m, options);
        m.dispose();
        return {
            ...r,
            ranges: r.ranges.map(r => Range.lift(r).toString())
        };
    }
    test('computeUnicodeHighlights (#168068)', () => {
        assert.deepStrictEqual(t(`
	For å gi et eksempel
`, {
            allowedCodePoints: [],
            allowedLocales: [],
            ambiguousCharacters: true,
            invisibleCharacters: true,
            includeComments: false,
            includeStrings: false,
            nonBasicASCII: false
        }), {
            ambiguousCharacterCount: 0,
            hasMore: false,
            invisibleCharacterCount: 4,
            nonBasicAsciiCharacterCount: 0,
            ranges: [
                '[2,5 -> 2,6]',
                '[2,7 -> 2,8]',
                '[2,10 -> 2,11]',
                '[2,13 -> 2,14]'
            ]
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQTZCLDJCQUEyQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDakksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXRELEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDekMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLENBQUMsQ0FBQyxJQUFZLEVBQUUsT0FBa0M7UUFDMUQsTUFBTSxDQUFDLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxHQUFHLDJCQUEyQixDQUFDLHdCQUF3QixDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFWixPQUFPO1lBQ04sR0FBRyxDQUFDO1lBQ0osTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUNuRCxDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDL0MsTUFBTSxDQUFDLGVBQWUsQ0FDckIsQ0FBQyxDQUFDOztDQUVKLEVBQUU7WUFDQyxpQkFBaUIsRUFBRSxFQUFFO1lBQ3JCLGNBQWMsRUFBRSxFQUFFO1lBQ2xCLG1CQUFtQixFQUFFLElBQUk7WUFDekIsbUJBQW1CLEVBQUUsSUFBSTtZQUN6QixlQUFlLEVBQUUsS0FBSztZQUN0QixjQUFjLEVBQUUsS0FBSztZQUNyQixhQUFhLEVBQUUsS0FBSztTQUNwQixDQUFDLEVBQ0Y7WUFDQyx1QkFBdUIsRUFBRSxDQUFDO1lBQzFCLE9BQU8sRUFBRSxLQUFLO1lBQ2QsdUJBQXVCLEVBQUUsQ0FBQztZQUMxQiwyQkFBMkIsRUFBRSxDQUFDO1lBQzlCLE1BQU0sRUFBRTtnQkFDUCxjQUFjO2dCQUNkLGNBQWM7Z0JBQ2QsZ0JBQWdCO2dCQUNoQixnQkFBZ0I7YUFDaEI7U0FDRCxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=