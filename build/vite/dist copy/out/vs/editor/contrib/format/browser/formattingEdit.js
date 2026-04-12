/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
export class FormattingEdit {
    static _handleEolEdits(editor, edits) {
        let newEol = undefined;
        const singleEdits = [];
        for (const edit of edits) {
            if (typeof edit.eol === 'number') {
                newEol = edit.eol;
            }
            if (edit.range && typeof edit.text === 'string') {
                singleEdits.push(edit);
            }
        }
        if (typeof newEol === 'number') {
            if (editor.hasModel()) {
                editor.getModel().pushEOL(newEol);
            }
        }
        return singleEdits;
    }
    static _isFullModelReplaceEdit(editor, edit) {
        if (!editor.hasModel()) {
            return false;
        }
        const model = editor.getModel();
        const editRange = model.validateRange(edit.range);
        const fullModelRange = model.getFullModelRange();
        return fullModelRange.equalsRange(editRange);
    }
    static execute(editor, _edits, addUndoStops) {
        if (addUndoStops) {
            editor.pushUndoStop();
        }
        const scrollState = StableEditorScrollState.capture(editor);
        const edits = FormattingEdit._handleEolEdits(editor, _edits);
        if (edits.length === 1 && FormattingEdit._isFullModelReplaceEdit(editor, edits[0])) {
            // We use replace semantics and hope that markers stay put...
            editor.executeEdits('formatEditsCommand', edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
        }
        else {
            editor.executeEdits('formatEditsCommand', edits.map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text)));
        }
        if (addUndoStops) {
            editor.pushUndoStop();
        }
        scrollState.restoreRelativeVerticalPositionOfCursor(editor);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0dGluZ0VkaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9mb3JtYXQvYnJvd3Nlci9mb3JtYXR0aW5nRWRpdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUF3QixNQUFNLHVDQUF1QyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUd0RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRixNQUFNLE9BQU8sY0FBYztJQUVsQixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQW1CLEVBQUUsS0FBaUI7UUFDcEUsSUFBSSxNQUFNLEdBQWtDLFNBQVMsQ0FBQztRQUN0RCxNQUFNLFdBQVcsR0FBMkIsRUFBRSxDQUFDO1FBRS9DLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDMUIsSUFBSSxPQUFPLElBQUksQ0FBQyxHQUFHLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ25CLENBQUM7WUFDRCxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNqRCxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO2dCQUN2QixNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVPLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxNQUFtQixFQUFFLElBQTBCO1FBQ3JGLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUN4QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEQsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDakQsT0FBTyxjQUFjLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQW1CLEVBQUUsTUFBa0IsRUFBRSxZQUFxQjtRQUM1RSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN2QixDQUFDO1FBQ0QsTUFBTSxXQUFXLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzdELElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksY0FBYyxDQUFDLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3BGLDZEQUE2RDtZQUM3RCxNQUFNLENBQUMsWUFBWSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEgsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsWUFBWSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUgsQ0FBQztRQUNELElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxXQUFXLENBQUMsdUNBQXVDLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNEIn0=