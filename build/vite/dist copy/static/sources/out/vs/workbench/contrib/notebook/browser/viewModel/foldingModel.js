/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { marked } from '../../../../../base/common/marked/marked.js';
import { FoldingRegions } from '../../../../../editor/contrib/folding/browser/foldingRanges.js';
import { sanitizeRanges } from '../../../../../editor/contrib/folding/browser/syntaxRangeProvider.js';
import { CellKind } from '../../common/notebookCommon.js';
import { cellRangesToIndexes } from '../../common/notebookRange.js';
const foldingRangeLimit = {
    limit: 5000,
    update: () => { }
};
export class FoldingModel {
    get regions() {
        return this._regions;
    }
    constructor() {
        this._viewModel = null;
        this._viewModelStore = new DisposableStore();
        this._onDidFoldingRegionChanges = new Emitter();
        this.onDidFoldingRegionChanged = this._onDidFoldingRegionChanges.event;
        this._foldingRangeDecorationIds = [];
        this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
    }
    dispose() {
        this._onDidFoldingRegionChanges.dispose();
        this._viewModelStore.dispose();
    }
    detachViewModel() {
        this._viewModelStore.clear();
        this._viewModel = null;
    }
    attachViewModel(model) {
        this._viewModel = model;
        this._viewModelStore.add(this._viewModel.onDidChangeViewCells(() => {
            this.recompute();
        }));
        this._viewModelStore.add(this._viewModel.onDidChangeSelection(() => {
            if (!this._viewModel) {
                return;
            }
            const indexes = cellRangesToIndexes(this._viewModel.getSelections());
            let changed = false;
            indexes.forEach(index => {
                let regionIndex = this.regions.findRange(index + 1);
                while (regionIndex !== -1) {
                    if (this._regions.isCollapsed(regionIndex) && index > this._regions.getStartLineNumber(regionIndex) - 1) {
                        this._regions.setCollapsed(regionIndex, false);
                        changed = true;
                    }
                    regionIndex = this._regions.getParentIndex(regionIndex);
                }
            });
            if (changed) {
                this._onDidFoldingRegionChanges.fire();
            }
        }));
        this.recompute();
    }
    getRegionAtLine(lineNumber) {
        if (this._regions) {
            const index = this._regions.findRange(lineNumber);
            if (index >= 0) {
                return this._regions.toRegion(index);
            }
        }
        return null;
    }
    getRegionsInside(region, filter) {
        const result = [];
        const index = region ? region.regionIndex + 1 : 0;
        const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;
        if (filter && filter.length === 2) {
            const levelStack = [];
            for (let i = index, len = this._regions.length; i < len; i++) {
                const current = this._regions.toRegion(i);
                if (this._regions.getStartLineNumber(i) < endLineNumber) {
                    while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
                        levelStack.pop();
                    }
                    levelStack.push(current);
                    if (filter(current, levelStack.length)) {
                        result.push(current);
                    }
                }
                else {
                    break;
                }
            }
        }
        else {
            for (let i = index, len = this._regions.length; i < len; i++) {
                const current = this._regions.toRegion(i);
                if (this._regions.getStartLineNumber(i) < endLineNumber) {
                    if (!filter || filter(current)) {
                        result.push(current);
                    }
                }
                else {
                    break;
                }
            }
        }
        return result;
    }
    getAllRegionsAtLine(lineNumber, filter) {
        const result = [];
        if (this._regions) {
            let index = this._regions.findRange(lineNumber);
            let level = 1;
            while (index >= 0) {
                const current = this._regions.toRegion(index);
                if (!filter || filter(current, level)) {
                    result.push(current);
                }
                level++;
                index = current.parentIndex;
            }
        }
        return result;
    }
    setCollapsed(index, newState) {
        this._regions.setCollapsed(index, newState);
    }
    recompute() {
        if (!this._viewModel) {
            return;
        }
        const viewModel = this._viewModel;
        const cells = viewModel.viewCells;
        const stack = [];
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (cell.cellKind !== CellKind.Markup || cell.language !== 'markdown') {
                continue;
            }
            const minDepth = Math.min(7, ...Array.from(getMarkdownHeadersInCell(cell.getText()), header => header.depth));
            if (minDepth < 7) {
                // header 1 to 6
                stack.push({ index: i, level: minDepth, endIndex: 0 });
            }
        }
        // calculate folding ranges
        const rawFoldingRanges = stack.map((entry, startIndex) => {
            let end = undefined;
            for (let i = startIndex + 1; i < stack.length; ++i) {
                if (stack[i].level <= entry.level) {
                    end = stack[i].index - 1;
                    break;
                }
            }
            const endIndex = end !== undefined ? end : cells.length - 1;
            // one based
            return {
                start: entry.index + 1,
                end: endIndex + 1,
                rank: 1
            };
        }).filter(range => range.start !== range.end);
        const newRegions = sanitizeRanges(rawFoldingRanges, foldingRangeLimit);
        // restore collased state
        let i = 0;
        const nextCollapsed = () => {
            while (i < this._regions.length) {
                const isCollapsed = this._regions.isCollapsed(i);
                i++;
                if (isCollapsed) {
                    return i - 1;
                }
            }
            return -1;
        };
        let k = 0;
        let collapsedIndex = nextCollapsed();
        while (collapsedIndex !== -1 && k < newRegions.length) {
            // get the latest range
            const decRange = viewModel.getTrackedRange(this._foldingRangeDecorationIds[collapsedIndex]);
            if (decRange) {
                const collasedStartIndex = decRange.start;
                while (k < newRegions.length) {
                    const startIndex = newRegions.getStartLineNumber(k) - 1;
                    if (collasedStartIndex >= startIndex) {
                        newRegions.setCollapsed(k, collasedStartIndex === startIndex);
                        k++;
                    }
                    else {
                        break;
                    }
                }
            }
            collapsedIndex = nextCollapsed();
        }
        while (k < newRegions.length) {
            newRegions.setCollapsed(k, false);
            k++;
        }
        const cellRanges = [];
        for (let i = 0; i < newRegions.length; i++) {
            const region = newRegions.toRegion(i);
            cellRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
        }
        // remove old tracked ranges and add new ones
        // TODO@rebornix, implement delta
        this._foldingRangeDecorationIds.forEach(id => viewModel.setTrackedRange(id, null, 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */));
        this._foldingRangeDecorationIds = cellRanges.map(region => viewModel.setTrackedRange(null, region, 3 /* TrackedRangeStickiness.GrowsOnlyWhenTypingAfter */)).filter(str => str !== null);
        this._regions = newRegions;
        this._onDidFoldingRegionChanges.fire();
    }
    getMemento() {
        const collapsedRanges = [];
        let i = 0;
        while (i < this._regions.length) {
            const isCollapsed = this._regions.isCollapsed(i);
            if (isCollapsed) {
                const region = this._regions.toRegion(i);
                collapsedRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
            }
            i++;
        }
        return collapsedRanges;
    }
    applyMemento(state) {
        if (!this._viewModel) {
            return false;
        }
        let i = 0;
        let k = 0;
        while (k < state.length && i < this._regions.length) {
            // get the latest range
            const decRange = this._viewModel.getTrackedRange(this._foldingRangeDecorationIds[i]);
            if (decRange) {
                const collasedStartIndex = state[k].start;
                while (i < this._regions.length) {
                    const startIndex = this._regions.getStartLineNumber(i) - 1;
                    if (collasedStartIndex >= startIndex) {
                        this._regions.setCollapsed(i, collasedStartIndex === startIndex);
                        i++;
                    }
                    else {
                        break;
                    }
                }
            }
            k++;
        }
        while (i < this._regions.length) {
            this._regions.setCollapsed(i, false);
            i++;
        }
        return true;
    }
}
export function updateFoldingStateAtIndex(foldingModel, index, collapsed) {
    const range = foldingModel.regions.findRange(index + 1);
    foldingModel.setCollapsed(range, collapsed);
}
export function* getMarkdownHeadersInCell(cellContent) {
    for (const token of marked.lexer(cellContent, { gfm: true })) {
        if (token.type === 'heading') {
            yield {
                depth: token.depth,
                text: renderAsPlaintext({ value: token.raw }).trim()
            };
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3TW9kZWwvZm9sZGluZ01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBR3JFLE9BQU8sRUFBaUIsY0FBYyxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDL0csT0FBTyxFQUFxQixjQUFjLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUV6SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLG1CQUFtQixFQUFjLE1BQU0sK0JBQStCLENBQUM7QUFLaEYsTUFBTSxpQkFBaUIsR0FBeUI7SUFDL0MsS0FBSyxFQUFFLElBQUk7SUFDWCxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztDQUNqQixDQUFDO0FBRUYsTUFBTSxPQUFPLFlBQVk7SUFJeEIsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUM7SUFPRDtRQVpRLGVBQVUsR0FBOEIsSUFBSSxDQUFDO1FBQ3BDLG9CQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQU14QywrQkFBMEIsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO1FBQ3pELDhCQUF5QixHQUFnQixJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDO1FBRWhGLCtCQUEwQixHQUFh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