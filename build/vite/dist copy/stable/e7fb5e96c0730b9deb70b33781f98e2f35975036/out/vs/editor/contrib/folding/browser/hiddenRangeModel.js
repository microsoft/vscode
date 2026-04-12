/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';
import { Emitter } from '../../../../base/common/event.js';
import { Range } from '../../../common/core/range.js';
import { countEOL } from '../../../common/core/misc/eolCounter.js';
export class HiddenRangeModel {
    get onDidChange() { return this._updateEventEmitter.event; }
    get hiddenRanges() { return this._hiddenRanges; }
    constructor(model) {
        this._updateEventEmitter = new Emitter();
        this._hasLineChanges = false;
        this._foldingModel = model;
        this._foldingModelListener = model.onDidChange(_ => this.updateHiddenRanges());
        this._hiddenRanges = [];
        if (model.regions.length) {
            this.updateHiddenRanges();
        }
    }
    notifyChangeModelContent(e) {
        if (this._hiddenRanges.length && !this._hasLineChanges) {
            this._hasLineChanges = e.changes.some(change => {
                return change.range.endLineNumber !== change.range.startLineNumber || countEOL(change.text)[0] !== 0;
            });
        }
    }
    updateHiddenRanges() {
        let updateHiddenAreas = false;
        const newHiddenAreas = [];
        let i = 0; // index into hidden
        let k = 0;
        let lastCollapsedStart = Number.MAX_VALUE;
        let lastCollapsedEnd = -1;
        const ranges = this._foldingModel.regions;
        for (; i < ranges.length; i++) {
            if (!ranges.isCollapsed(i)) {
                continue;
            }
            const startLineNumber = ranges.getStartLineNumber(i) + 1; // the first line is not hidden
            const endLineNumber = ranges.getEndLineNumber(i);
            if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
                // ignore ranges contained in collapsed regions
                continue;
            }
            if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].startLineNumber === startLineNumber && this._hiddenRanges[k].endLineNumber === endLineNumber) {
                // reuse the old ranges
                newHiddenAreas.push(this._hiddenRanges[k]);
                k++;
            }
            else {
                updateHiddenAreas = true;
                newHiddenAreas.push(new Range(startLineNumber, 1, endLineNumber, 1));
            }
            lastCollapsedStart = startLineNumber;
            lastCollapsedEnd = endLineNumber;
        }
        if (this._hasLineChanges || updateHiddenAreas || k < this._hiddenRanges.length) {
            this.applyHiddenRanges(newHiddenAreas);
        }
    }
    applyHiddenRanges(newHiddenAreas) {
        this._hiddenRanges = newHiddenAreas;
        this._hasLineChanges = false;
        this._updateEventEmitter.fire(newHiddenAreas);
    }
    hasRanges() {
        return this._hiddenRanges.length > 0;
    }
    isHidden(line) {
        return findRange(this._hiddenRanges, line) !== null;
    }
    adjustSelections(selections) {
        let hasChanges = false;
        const editorModel = this._foldingModel.textModel;
        let lastRange = null;
        const adjustLine = (line) => {
            if (!lastRange || !isInside(line, lastRange)) {
                lastRange = findRange(this._hiddenRanges, line);
            }
            if (lastRange) {
                return lastRange.startLineNumber - 1;
            }
            return null;
        };
        for (let i = 0, len = selections.length; i < len; i++) {
            let selection = selections[i];
            const adjustedStartLine = adjustLine(selection.startLineNumber);
            if (adjustedStartLine) {
                selection = selection.setStartPosition(adjustedStartLine, editorModel.getLineMaxColumn(adjustedStartLine));
                hasChanges = true;
            }
            const adjustedEndLine = adjustLine(selection.endLineNumber);
            if (adjustedEndLine) {
                selection = selection.setEndPosition(adjustedEndLine, editorModel.getLineMaxColumn(adjustedEndLine));
                hasChanges = true;
            }
            selections[i] = selection;
        }
        return hasChanges;
    }
    dispose() {
        if (this.hiddenRanges.length > 0) {
            this._hiddenRanges = [];
            this._updateEventEmitter.fire(this._hiddenRanges);
        }
        if (this._foldingModelListener) {
            this._foldingModelListener.dispose();
            this._foldingModelListener = null;
        }
        this._updateEventEmitter.dispose();
    }
}
function isInside(line, range) {
    return line >= range.startLineNumber && line <= range.endLineNumber;
}
function findRange(ranges, line) {
    const i = findFirstIdxMonotonousOrArrLen(ranges, r => line < r.startLineNumber) - 1;
    if (i >= 0 && ranges[i].endLineNumber >= line) {
        return ranges[i];
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlkZGVuUmFuZ2VNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9oaWRkZW5SYW5nZU1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXZGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR25FLE1BQU0sT0FBTyxnQkFBZ0I7SUFRNUIsSUFBVyxXQUFXLEtBQXNCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDcEYsSUFBVyxZQUFZLEtBQUssT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUV4RCxZQUFtQixLQUFtQjtRQU5yQix3QkFBbUIsR0FBRyxJQUFJLE9BQU8sRUFBWSxDQUFDO1FBQ3ZELG9CQUFlLEdBQVksS0FBSyxDQUFDO1FBTXhDLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQzNCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUMvRSxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUN4QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFTSx3QkFBd0IsQ0FBQyxDQUE0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