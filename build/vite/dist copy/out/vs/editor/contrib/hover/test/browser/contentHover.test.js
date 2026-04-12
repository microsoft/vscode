/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { RenderedContentHover } from '../../browser/contentHoverRendered.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
suite('Content Hover', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #151235: Gitlens hover shows up in the wrong place', () => {
        const text = 'just some text';
        withTestCodeEditor(text, {}, (editor) => {
            const actual = RenderedContentHover.computeHoverPositions(editor, new Range(5, 5, 5, 5), [{ range: new Range(4, 1, 5, 6) }]);
            assert.deepStrictEqual(actual, {
                showAtPosition: new Position(5, 5),
                showAtSecondaryPosition: new Position(5, 5)
            });
        });
    });
    test('issue #95328: Hover placement with word-wrap', () => {
        const text = 'just some text';
        const opts = { wordWrap: 'wordWrapColumn', wordWrapColumn: 6 };
        withTestCodeEditor(text, opts, (editor) => {
            const actual = RenderedContentHover.computeHoverPositions(editor, new Range(1, 8, 1, 8), [{ range: new Range(1, 1, 1, 15) }]);
            assert.deepStrictEqual(actual, {
                showAtPosition: new Position(1, 8),
                showAtSecondaryPosition: new Position(1, 6)
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudEhvdmVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci90ZXN0L2Jyb3dzZXIvY29udGVudEhvdmVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFN0UsT0FBTyxFQUFzQyxrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXBILEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO0lBRTNCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEdBQUcsRUFBRTtRQUNyRSxNQUFNLElBQUksR0FBRyxnQkFBZ0IsQ0FBQztRQUM5QixrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDdkMsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMscUJBQXFCLENBQ3hELE1BQU0sRUFDTixJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDckIsQ0FBYSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQzlDLENBQUM7WUFDRixNQUFNLENBQUMsZUFBZSxDQUNyQixNQUFNLEVBQ047Z0JBQ0MsY0FBYyxFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xDLHVCQUF1QixFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDM0MsQ0FDRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7UUFDekQsTUFBTSxJQUFJLEdBQUcsZ0JBQWdCLENBQUM7UUFDOUIsTUFBTSxJQUFJLEdBQXVDLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNuRyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDekMsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMscUJBQXFCLENBQ3hELE1BQU0sRUFDTixJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDckIsQ0FBYSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQy9DLENBQUM7WUFDRixNQUFNLENBQUMsZUFBZSxDQUNyQixNQUFNLEVBQ047Z0JBQ0MsY0FBYyxFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xDLHVCQUF1QixFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDM0MsQ0FDRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=