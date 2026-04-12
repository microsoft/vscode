/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LineReplacement } from '../../../../../common/core/edits/lineEdit.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
export class InlineEditWithChanges {
    // TODO@hediet: Move the next 3 fields into the action
    get lineEdit() {
        if (this.action?.kind === 'jumpTo') {
            return new LineReplacement(LineRange.ofLength(this.action.position.lineNumber, 0), []);
        }
        else if (this.action?.kind === 'edit') {
            return LineReplacement.fromSingleTextEdit(this.edit.toReplacement(this.originalText), this.originalText);
        }
        return new LineReplacement(new LineRange(1, 1), []);
    }
    get originalLineRange() { return this.lineEdit.lineRange; }
    get modifiedLineRange() { return this.lineEdit.toLineEdit().getNewLineRanges()[0]; }
    get displayRange() {
        return this.originalText.lineRange.intersect(this.originalLineRange.join(LineRange.ofLength(this.originalLineRange.startLineNumber, this.lineEdit.newLines.length)));
    }
    constructor(originalText, action, edit, cursorPosition, multiCursorPositions, commands, inlineCompletion) {
        this.originalText = originalText;
        this.action = action;
        this.edit = edit;
        this.cursorPosition = cursorPosition;
        this.multiCursorPositions = multiCursorPositions;
        this.commands = commands;
        this.inlineCompletion = inlineCompletion;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdFdpdGhDaGFuZ2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRXaXRoQ2hhbmdlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHL0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBSzNFLE1BQU0sT0FBTyxxQkFBcUI7SUFDakMsc0RBQXNEO0lBQ3RELElBQVcsUUFBUTtRQUNsQixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3BDLE9BQU8sSUFBSSxlQUFlLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEYsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDekMsT0FBTyxlQUFlLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMzRyxDQUFDO1FBRUQsT0FBTyxJQUFJLGVBQWUsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVELElBQVcsaUJBQWlCLEtBQWdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzdFLElBQVcsaUJBQWlCLEtBQWdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUV0RyxJQUFXLFlBQVk7UUFDdEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQzNDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQzFCLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FDekYsQ0FDQSxDQUFDO0lBQ0osQ0FBQztJQUVELFlBQ2lCLFlBQXFDLEVBQ3JDLE1BQTBDLEVBQzFDLElBQTBCLEVBQzFCLGNBQXdCLEVBQ3hCLG9CQUF5QyxFQUN6QyxRQUE0QyxFQUM1QyxnQkFBc0M7UUFOdEMsaUJBQVksR0FBWixZQUFZLENBQXlCO1FBQ3JDLFdBQU0sR0FBTixNQUFNLENBQW9DO1FBQzFDLFNBQUksR0FBSixJQUFJLENBQXNCO1FBQzFCLG1CQUFjLEdBQWQsY0FBYyxDQUFVO1FBQ3hCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBcUI7UUFDekMsYUFBUSxHQUFSLFFBQVEsQ0FBb0M7UUFDNUMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFzQjtJQUV2RCxDQUFDO0NBQ0QifQ==