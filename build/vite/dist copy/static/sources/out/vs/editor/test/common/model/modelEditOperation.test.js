/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { createTextModel } from '../testTextModel.js';
suite('Editor Model - Model Edit Operation', () => {
    const LINE1 = 'My First Line';
    const LINE2 = '\t\tMy Second Line';
    const LINE3 = '    Third Line';
    const LINE4 = '';
    const LINE5 = '1';
    let model;
    setup(() => {
        const text = LINE1 + '\r\n' +
            LINE2 + '\n' +
            LINE3 + '\n' +
            LINE4 + '\r\n' +
            LINE5;
        model = createTextModel(text);
    });
    teardown(() => {
        model.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
        const range = new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn);
        return {
            range: range,
            text: text,
            forceMoveMarkers: false
        };
    }
    function assertSingleEditOp(singleEditOp, editedLines) {
        const editOp = [singleEditOp];
        const inverseEditOp = model.applyEdits(editOp, true);
        assert.strictEqual(model.getLineCount(), editedLines.length);
        for (let i = 0; i < editedLines.length; i++) {
            assert.strictEqual(model.getLineContent(i + 1), editedLines[i]);
        }
        const originalOp = model.applyEdits(inverseEditOp, true);
        assert.strictEqual(model.getLineCount(), 5);
        assert.strictEqual(model.getLineContent(1), LINE1);
        assert.strictEqual(model.getLineContent(2), LINE2);
        assert.strictEqual(model.getLineContent(3), LINE3);
        assert.strictEqual(model.getLineContent(4), LINE4);
        assert.strictEqual(model.getLineContent(5), LINE5);
        const simplifyEdit = (edit) => {
            return {
                range: edit.range,
                text: edit.text,
                forceMoveMarkers: edit.forceMoveMarkers || false
            };
        };
        assert.deepStrictEqual(originalOp.map(simplifyEdit), editOp.map(simplifyEdit));
    }
    test('Insert inline', () => {
        assertSingleEditOp(createSingleEditOp('a', 1, 1), [
            'aMy First Line',
            LINE2,
            LINE3,
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/inline 1', () => {
        assertSingleEditOp(createSingleEditOp(' incredibly awesome', 1, 3), [
            'My incredibly awesome First Line',
            LINE2,
            LINE3,
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/inline 2', () => {
        assertSingleEditOp(createSingleEditOp(' with text at the end.', 1, 14), [
            'My First Line with text at the end.',
            LINE2,
            LINE3,
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/inline 3', () => {
        assertSingleEditOp(createSingleEditOp('My new First Line.', 1, 1, 1, 14), [
            'My new First Line.',
            LINE2,
            LINE3,
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/multi line 1', () => {
        assertSingleEditOp(createSingleEditOp('My new First Line.', 1, 1, 3, 15), [
            'My new First Line.',
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/multi line 2', () => {
        assertSingleEditOp(createSingleEditOp('My new First Line.', 1, 2, 3, 15), [
            'MMy new First Line.',
            LINE4,
            LINE5
        ]);
    });
    test('Replace inline/multi line 3', () => {
        assertSingleEditOp(createSingleEditOp('My new First Line.', 1, 2, 3, 2), [
            'MMy new First Line.   Third Line',
            LINE4,
            LINE5
        ]);
    });
    test('Replace muli line/multi line', () => {
        assertSingleEditOp(createSingleEditOp('1\n2\n3\n4\n', 1, 1), [
            '1',
            '2',
            '3',
            '4',
            LINE1,
            LINE2,
            LINE3,
            LINE4,
            LINE5
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxFZGl0T3BlcmF0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZWwvbW9kZWxFZGl0T3BlcmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFdEQsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtJQUNqRCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUM7SUFDOUIsTUFBTSxLQUFLLEdBQUcsb0JBQW9CLENBQUM7SUFDbkMsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUM7SUFDL0IsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDO0lBQ2pCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQztJQUVsQixJQUFJLEtBQWdCLENBQUM7SUFFckIsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE1BQU0sSUFBSSxHQUNULEtBQUssR0FBRyxNQUFNO1lBQ2QsS0FBSyxHQUFHLElBQUk7WUFDWixLQUFLLEdBQUcsSUFBSTtZQUNaLEtBQUssR0FBRyxNQUFNO1lBQ2QsS0FBSyxDQUFDO1FBQ1AsS0FBSyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsa0JBQWtCLENBQUMsSUFBWSxFQUFFLGtCQUEwQixFQUFFLGNBQXNCLEVBQUUsc0JBQThCLGtCQUFrQixFQUFFLGtCQUEwQixjQUFjO1FBQ3ZMLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUN0QixtQkFBbUIsRUFDbkIsZUFBZSxFQUNmLGtCQUFrQixFQUNsQixjQUFjLENBQ2QsQ0FBQztRQUVGLE9BQU87WUFDTixLQUFLLEVBQUUsS0FBSztZQUNaLElBQUksRUFBRSxJQUFJO1lBQ1YsZ0JBQWdCLEVBQUUsS0FBSztTQUN2QixDQUFDO0lBQ0gsQ0FBQztJQUVELFNBQVMsa0JBQWtCLENBQUMsWUFBa0MsRUFBRSxXQUFxQjtRQUNwRixNQUFNLE1BQU0sR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRTlCLE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXJELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3RCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXpELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbkQsTUFBTSxZQUFZLEdBQUcsQ0FBQyxJQUEwQixFQUFFLEVBQUU7WUFDbkQsT0FBTztnQkFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7Z0JBQ2pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtnQkFDZixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLElBQUksS0FBSzthQUNoRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsa0JBQWtCLENBQ2pCLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQzdCO1lBQ0MsZ0JBQWdCO1lBQ2hCLEtBQUs7WUFDTCxLQUFLO1lBQ0wsS0FBSztZQUNMLEtBQUs7U0FDTCxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDcEMsa0JBQWtCLENBQ2pCLGtCQUFrQixDQUFDLHFCQUFxQixFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDL0M7WUFDQyxrQ0FBa0M7WUFDbEMsS0FBSztZQUNMLEtBQUs7WUFDTCxLQUFLO1lBQ0wsS0FBSztTQUNMLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNwQyxrQkFBa0IsQ0FDakIsa0JBQWtCLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNuRDtZQUNDLHFDQUFxQztZQUNyQyxLQUFLO1lBQ0wsS0FBSztZQUNMLEtBQUs7WUFDTCxLQUFLO1NBQ0wsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ3BDLGtCQUFrQixDQUNqQixrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDckQ7WUFDQyxvQkFBb0I7WUFDcEIsS0FBSztZQUNMLEtBQUs7WUFDTCxLQUFLO1lBQ0wsS0FBSztTQUNMLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtRQUN4QyxrQkFBa0IsQ0FDakIsa0JBQWtCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQ3JEO1lBQ0Msb0JBQW9CO1lBQ3BCLEtBQUs7WUFDTCxLQUFLO1NBQ0wsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3hDLGtCQUFrQixDQUNqQixrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDckQ7WUFDQyxxQkFBcUI7WUFDckIsS0FBSztZQUNMLEtBQUs7U0FDTCxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsa0JBQWtCLENBQ2pCLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUNwRDtZQUNDLGtDQUFrQztZQUNsQyxLQUFLO1lBQ0wsS0FBSztTQUNMLENBQ0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtRQUN6QyxrQkFBa0IsQ0FDakIsa0JBQWtCLENBQUMsY0FBYyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFDeEM7WUFDQyxHQUFHO1lBQ0gsR0FBRztZQUNILEdBQUc7WUFDSCxHQUFHO1lBQ0gsS0FBSztZQUNMLEtBQUs7WUFDTCxLQUFLO1lBQ0wsS0FBSztZQUNMLEtBQUs7U0FDTCxDQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=