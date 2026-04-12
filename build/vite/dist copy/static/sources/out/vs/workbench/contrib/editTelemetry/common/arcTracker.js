/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { sumBy } from '../../../../base/common/arrays.js';
import { LineEdit } from '../../../../editor/common/core/edits/lineEdit.js';
/**
 * The ARC (accepted and retained characters) counts how many characters inserted by the initial suggestion (trackedEdit)
 * stay unmodified after a certain amount of time after acceptance.
*/
export class ArcTracker {
    constructor(_valueBeforeTrackedEdit, trackedEdit) {
        this._valueBeforeTrackedEdit = _valueBeforeTrackedEdit;
        this._trackedEdit = trackedEdit.removeCommonSuffixPrefix(_valueBeforeTrackedEdit.getValue());
        this._updatedTrackedEdit = this._trackedEdit.mapData(() => new IsTrackedEditData(true));
    }
    getOriginalCharacterCount() {
        return sumBy(this._trackedEdit.replacements, e => e.getNewLength());
    }
    /**
     * edit must apply to _updatedTrackedEdit.apply(_valueBeforeTrackedEdit)
    */
    handleEdits(edit) {
        const e = edit.mapData(_d => new IsTrackedEditData(false));
        const composedEdit = this._updatedTrackedEdit.compose(e); // (still) applies to _valueBeforeTrackedEdit
        // TODO@hediet improve memory by using:
        // composedEdit = const onlyTrackedEdit = composedEdit.decomposeSplit(e => !e.data.isTrackedEdit).e2;
        this._updatedTrackedEdit = composedEdit;
    }
    getAcceptedRestrainedCharactersCount() {
        const s = sumBy(this._updatedTrackedEdit.replacements, e => e.data.isTrackedEdit ? e.getNewLength() : 0);
        return s;
    }
    getDebugState() {
        return {
            edits: this._updatedTrackedEdit.replacements.map(e => ({
                range: e.replaceRange.toString(),
                newText: e.newText,
                isTrackedEdit: e.data.isTrackedEdit,
            }))
        };
    }
    getLineCountInfo() {
        const e = this._updatedTrackedEdit.toStringEdit(r => r.data.isTrackedEdit);
        const le = LineEdit.fromStringEdit(e, this._valueBeforeTrackedEdit);
        const deletedLineCount = sumBy(le.replacements, r => r.lineRange.length);
        const insertedLineCount = sumBy(le.getNewLineRanges(), r => r.length);
        return {
            deletedLineCounts: deletedLineCount,
            insertedLineCounts: insertedLineCount,
        };
    }
    getValues() {
        return {
            arc: this.getAcceptedRestrainedCharactersCount(),
            ...this.getLineCountInfo(),
        };
    }
}
export class IsTrackedEditData {
    constructor(isTrackedEdit) {
        this.isTrackedEdit = isTrackedEdit;
    }
    join(data) {
        if (this.isTrackedEdit !== data.isTrackedEdit) {
            return undefined;
        }
        return this;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvY29tbW9uL2FyY1RyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUk1RTs7O0VBR0U7QUFDRixNQUFNLE9BQU8sVUFBVTtJQUl0QixZQUNrQix1QkFBcUMsRUFDdEQsV0FBMkI7UUFEViw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQWM7UUFHdEQsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUMsd0JBQXdCLENBQUMsdUJBQXVCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM3RixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFRCx5QkFBeUI7UUFDeEIsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRUQ7O01BRUU7SUFDRixXQUFXLENBQUMsSUFBb0I7UUFDL0IsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsNkNBQTZDO1FBRXZHLHVDQUF1QztRQUN2QyxxR0FBcUc7UUFFckcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFlBQVksQ0FBQztJQUN6QyxDQUFDO0lBRUQsb0NBQW9DO1FBQ25DLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekcsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBRUQsYUFBYTtRQUNaLE9BQU87WUFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RCxLQUFLLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2hDLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTztnQkFDbEIsYUFBYSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYTthQUNuQyxDQUFDLENBQUM7U0FDSCxDQUFDO0lBQ0gsQ0FBQztJQUVNLGdCQUFnQjtRQUN0QixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMzRSxNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNwRSxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6RSxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0RSxPQUFPO1lBQ04saUJBQWlCLEVBQUUsZ0JBQWdCO1lBQ25DLGtCQUFrQixFQUFFLGlCQUFpQjtTQUNyQyxDQUFDO0lBQ0gsQ0FBQztJQUVNLFNBQVM7UUFDZixPQUFPO1lBQ04sR0FBRyxFQUFFLElBQUksQ0FBQyxvQ0FBb0MsRUFBRTtZQUNoRCxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRTtTQUMxQixDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGlCQUFpQjtJQUM3QixZQUNpQixhQUFzQjtRQUF0QixrQkFBYSxHQUFiLGFBQWEsQ0FBUztJQUNuQyxDQUFDO0lBRUwsSUFBSSxDQUFDLElBQXVCO1FBQzNCLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDL0MsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEIn0=