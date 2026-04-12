/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { FoldingRegions } from './foldingRanges.js';
import { hash } from '../../../../base/common/hash.js';
export class FoldingModel {
    get regions() { return this._regions; }
    get textModel() { return this._textModel; }
    get decorationProvider() { return this._decorationProvider; }
    constructor(textModel, decorationProvider) {
        this._updateEventEmitter = new Emitter();
        this.onDidChange = this._updateEventEmitter.event;
        this._textModel = textModel;
        this._decorationProvider = decorationProvider;
        this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
        this._editorDecorationIds = [];
    }
    toggleCollapseState(toggledRegions) {
        if (!toggledRegions.length) {
            return;
        }
        toggledRegions = toggledRegions.sort((r1, r2) => r1.regionIndex - r2.regionIndex);
        const processed = {};
        this._decorationProvider.changeDecorations(accessor => {
            let k = 0; // index from [0 ... this.regions.length]
            let dirtyRegionEndLine = -1; // end of the range where decorations need to be updated
            let lastHiddenLine = -1; // the end of the last hidden lines
            const updateDecorationsUntil = (index) => {
                while (k < index) {
                    const endLineNumber = this._regions.getEndLineNumber(k);
                    const isCollapsed = this._regions.isCollapsed(k);
                    if (endLineNumber <= dirtyRegionEndLine) {
                        const isManual = this.regions.getSource(k) !== 0 /* FoldSource.provider */;
                        accessor.changeDecorationOptions(this._editorDecorationIds[k], this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual));
                    }
                    if (isCollapsed && endLineNumber > lastHiddenLine) {
                        lastHiddenLine = endLineNumber;
                    }
                    k++;
                }
            };
            for (const region of toggledRegions) {
                const index = region.regionIndex;
                const editorDecorationId = this._editorDecorationIds[index];
                if (editorDecorationId && !processed[editorDecorationId]) {
                    processed[editorDecorationId] = true;
                    updateDecorationsUntil(index); // update all decorations up to current index using the old dirtyRegionEndLine
                    const newCollapseState = !this._regions.isCollapsed(index);
                    this._regions.setCollapsed(index, newCollapseState);
                    dirtyRegionEndLine = Math.max(dirtyRegionEndLine, this._regions.getEndLineNumber(index));
                }
            }
            updateDecorationsUntil(this._regions.length);
        });
        this._updateEventEmitter.fire({ model: this, collapseStateChanged: toggledRegions });
    }
    removeManualRanges(ranges) {
        const newFoldingRanges = new Array();
        const intersects = (foldRange) => {
            for (const range of ranges) {
                if (!(range.startLineNumber > foldRange.endLineNumber || foldRange.startLineNumber > range.endLineNumber)) {
                    return true;
                }
            }
            return false;
        };
        for (let i = 0; i < this._regions.length; i++) {
            const foldRange = this._regions.toFoldRange(i);
            if (foldRange.source === 0 /* FoldSource.provider */ || !intersects(foldRange)) {
                newFoldingRanges.push(foldRange);
            }
        }
        this.updatePost(FoldingRegions.fromFoldRanges(newFoldingRanges));
    }
    update(newRegions, selection) {
        const foldedOrManualRanges = this._currentFoldedOrManualRanges(selection);
        const newRanges = FoldingRegions.sanitizeAndMerge(newRegions, foldedOrManualRanges, this._textModel.getLineCount(), selection);
        this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
    }
    updatePost(newRegions) {
        const newEditorDecorations = [];
        let lastHiddenLine = -1;
        for (let index = 0, limit = newRegions.length; index < limit; index++) {
            const startLineNumber = newRegions.getStartLineNumber(index);
            const endLineNumber = newRegions.getEndLineNumber(index);
            const isCollapsed = newRegions.isCollapsed(index);
            const isManual = newRegions.getSource(index) !== 0 /* FoldSource.provider */;
            const decorationRange = {
                startLineNumber: startLineNumber,
                startColumn: this._textModel.getLineMaxColumn(startLineNumber),
                endLineNumber: endLineNumber,
                endColumn: this._textModel.getLineMaxColumn(endLineNumber) + 1
            };
            newEditorDecorations.push({ range: decorationRange, options: this._decorationProvider.getDecorationOption(isCollapsed, endLineNumber <= lastHiddenLine, isManual) });
            if (isCollapsed && endLineNumber > lastHiddenLine) {
                lastHiddenLine = endLineNumber;
            }
        }
        this._decorationProvider.changeDecorations(accessor => this._editorDecorationIds = accessor.deltaDecorations(this._editorDecorationIds, newEditorDecorations));
        this._regions = newRegions;
        this._updateEventEmitter.fire({ model: this });
    }
    _currentFoldedOrManualRanges(selection) {
        const foldedRanges = [];
        for (let i = 0, limit = this._regions.length; i < limit; i++) {
            let isCollapsed = this.regions.isCollapsed(i);
            const source = this.regions.getSource(i);
            if (isCollapsed || source !== 0 /* FoldSource.provider */) {
                const foldRange = this._regions.toFoldRange(i);
                const decRange = this._textModel.getDecorationRange(this._editorDecorationIds[i]);
                if (decRange) {
                    if (isCollapsed && selection?.startsInside(decRange.startLineNumber + 1, decRange.endLineNumber)) {
                        isCollapsed = false; // uncollapse is the range is blocked
                    }
                    foldedRanges.push({
                        startLineNumber: decRange.startLineNumber,
                        endLineNumber: decRange.endLineNumber,
                        type: foldRange.type,
                        isCollapsed,
                        source
                    });
                }
            }
        }
        return foldedRanges;
    }
    /**
     * Collapse state memento, for persistence only
     */
    getMemento() {
        const foldedOrManualRanges = this._currentFoldedOrManualRanges();
        const result = [];
        const maxLineNumber = this._textModel.getLineCount();
        for (let i = 0, limit = foldedOrManualRanges.length; i < limit; i++) {
            const range = foldedOrManualRanges[i];
            if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
                continue;
            }
            const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
            result.push({
                startLineNumber: range.startLineNumber,
                endLineNumber: range.endLineNumber,
                isCollapsed: range.isCollapsed,
                source: range.source,
                checksum: checksum
            });
        }
        return (result.length > 0) ? result : undefined;
    }
    /**
     * Apply persisted state, for persistence only
     */
    applyMemento(state) {
        if (!Array.isArray(state)) {
            return;
        }
        const rangesToRestore = [];
        const maxLineNumber = this._textModel.getLineCount();
        for (const range of state) {
            if (range.startLineNumber >= range.endLineNumber || range.startLineNumber < 1 || range.endLineNumber > maxLineNumber) {
                continue;
            }
            const checksum = this._getLinesChecksum(range.startLineNumber + 1, range.endLineNumber);
            if (!range.checksum || checksum === range.checksum) {
                rangesToRestore.push({
                    startLineNumber: range.startLineNumber,
                    endLineNumber: range.endLineNumber,
                    type: undefined,
                    isCollapsed: range.isCollapsed ?? true,
                    source: range.source ?? 0 /* FoldSource.provider */
                });
            }
        }
        const newRanges = FoldingRegions.sanitizeAndMerge(this._regions, rangesToRestore, maxLineNumber);
        this.updatePost(FoldingRegions.fromFoldRanges(newRanges));
    }
    _getLinesChecksum(lineNumber1, lineNumber2) {
        const h = hash(this._textModel.getLineContent(lineNumber1)
            + this._textModel.getLineContent(lineNumber2));
        return h % 1000000; // 6 digits is plenty
    }
    dispose() {
        this._decorationProvider.removeDecorations(this._editorDecorationIds);
        this._updateEventEmitter.dispose();
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
}
/**
 * Collapse or expand the regions at the given locations
 * @param levels The number of levels. Use 1 to only impact the regions at the location, use Number.MAX_VALUE for all levels.
 * @param lineNumbers the location of the regions to collapse or expand, or if not set, all regions in the model.
 */
export function toggleCollapseState(foldingModel, levels, lineNumbers) {
    const toToggle = [];
    for (const lineNumber of lineNumbers) {
        const region = foldingModel.getRegionAtLine(lineNumber);
        if (region) {
            const doCollapse = !region.isCollapsed;
            toToggle.push(region);
            if (levels > 1) {
                const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
                toToggle.push(...regionsInside);
            }
        }
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Collapse or expand the regions at the given locations including all children.
 * @param doCollapse Whether to collapse or expand
 * @param levels The number of levels. Use 1 to only impact the regions at the location, use Number.MAX_VALUE for all levels.
 * @param lineNumbers the location of the regions to collapse or expand, or if not set, all regions in the model.
 */
export function setCollapseStateLevelsDown(foldingModel, doCollapse, levels = Number.MAX_VALUE, lineNumbers) {
    const toToggle = [];
    if (lineNumbers && lineNumbers.length > 0) {
        for (const lineNumber of lineNumbers) {
            const region = foldingModel.getRegionAtLine(lineNumber);
            if (region) {
                if (region.isCollapsed !== doCollapse) {
                    toToggle.push(region);
                }
                if (levels > 1) {
                    const regionsInside = foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
                    toToggle.push(...regionsInside);
                }
            }
        }
    }
    else {
        const regionsInside = foldingModel.getRegionsInside(null, (r, level) => r.isCollapsed !== doCollapse && level < levels);
        toToggle.push(...regionsInside);
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Collapse or expand the regions at the given locations including all parents.
 * @param doCollapse Whether to collapse or expand
 * @param levels The number of levels. Use 1 to only impact the regions at the location, use Number.MAX_VALUE for all levels.
 * @param lineNumbers the location of the regions to collapse or expand.
 */
export function setCollapseStateLevelsUp(foldingModel, doCollapse, levels, lineNumbers) {
    const toToggle = [];
    for (const lineNumber of lineNumbers) {
        const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region, level) => region.isCollapsed !== doCollapse && level <= levels);
        toToggle.push(...regions);
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Collapse or expand a region at the given locations. If the inner most region is already collapsed/expanded, uses the first parent instead.
 * @param doCollapse Whether to collapse or expand
 * @param lineNumbers the location of the regions to collapse or expand.
 */
export function setCollapseStateUp(foldingModel, doCollapse, lineNumbers) {
    const toToggle = [];
    for (const lineNumber of lineNumbers) {
        const regions = foldingModel.getAllRegionsAtLine(lineNumber, (region) => region.isCollapsed !== doCollapse);
        if (regions.length > 0) {
            toToggle.push(regions[0]);
        }
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Folds or unfolds all regions that have a given level, except if they contain one of the blocked lines.
 * @param foldLevel level. Level == 1 is the top level
 * @param doCollapse Whether to collapse or expand
*/
export function setCollapseStateAtLevel(foldingModel, foldLevel, doCollapse, blockedLineNumbers) {
    const filter = (region, level) => level === foldLevel && region.isCollapsed !== doCollapse && !blockedLineNumbers.some(line => region.containsLine(line));
    const toToggle = foldingModel.getRegionsInside(null, filter);
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Folds or unfolds all regions, except if they contain or are contained by a region of one of the blocked lines.
 * @param doCollapse Whether to collapse or expand
 * @param blockedLineNumbers the location of regions to not collapse or expand
 */
export function setCollapseStateForRest(foldingModel, doCollapse, blockedLineNumbers) {
    const filteredRegions = [];
    for (const lineNumber of blockedLineNumbers) {
        const regions = foldingModel.getAllRegionsAtLine(lineNumber, undefined);
        if (regions.length > 0) {
            filteredRegions.push(regions[0]);
        }
    }
    const filter = (region) => filteredRegions.every((filteredRegion) => !filteredRegion.containedBy(region) && !region.containedBy(filteredRegion)) && region.isCollapsed !== doCollapse;
    const toToggle = foldingModel.getRegionsInside(null, filter);
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Folds all regions for which the lines start with a given regex
 * @param foldingModel the folding model
 */
export function setCollapseStateForMatchingLines(foldingModel, regExp, doCollapse) {
    const editorModel = foldingModel.textModel;
    const regions = foldingModel.regions;
    const toToggle = [];
    for (let i = regions.length - 1; i >= 0; i--) {
        if (doCollapse !== regions.isCollapsed(i)) {
            const startLineNumber = regions.getStartLineNumber(i);
            if (regExp.test(editorModel.getLineContent(startLineNumber))) {
                toToggle.push(regions.toRegion(i));
            }
        }
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Folds all regions of the given type
 * @param foldingModel the folding model
 */
export function setCollapseStateForType(foldingModel, type, doCollapse) {
    const regions = foldingModel.regions;
    const toToggle = [];
    for (let i = regions.length - 1; i >= 0; i--) {
        if (doCollapse !== regions.isCollapsed(i) && type === regions.getType(i)) {
            toToggle.push(regions.toRegion(i));
        }
    }
    foldingModel.toggleCollapseState(toToggle);
}
/**
 * Get line to go to for parent fold of current line
 * @param lineNumber the current line number
 * @param foldingModel the folding model
 *
 * @return Parent fold start line
 */
export function getParentFoldLine(lineNumber, foldingModel) {
    let startLineNumber = null;
    const foldingRegion = foldingModel.getRegionAtLine(lineNumber);
    if (foldingRegion !== null) {
        startLineNumber = foldingRegion.startLineNumber;
        // If current line is not the start of the current fold, go to top line of current fold. If not, go to parent fold
        if (lineNumber === startLineNumber) {
            const parentFoldingIdx = foldingRegion.parentIndex;
            if (parentFoldingIdx !== -1) {
                startLineNumber = foldingModel.regions.getStartLineNumber(parentFoldingIdx);
            }
            else {
                startLineNumber = null;
            }
        }
    }
    return startLineNumber;
}
/**
 * Get line to go to for previous fold at the same level of current line
 * @param lineNumber the current line number
 * @param foldingModel the folding model
 *
 * @return Previous fold start line
 */
export function getPreviousFoldLine(lineNumber, foldingModel) {
    let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
    // If on the folding range start line, go to previous sibling.
    if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
        // If current line is not the start of the current fold, go to top line of current fold. If not, go to previous fold.
        if (lineNumber !== foldingRegion.startLineNumber) {
            return foldingRegion.startLineNumber;
        }
        else {
            // Find min line number to stay within parent.
            const expectedParentIndex = foldingRegion.parentIndex;
            let minLineNumber = 0;
            if (expectedParentIndex !== -1) {
                minLineNumber = foldingModel.regions.getStartLineNumber(foldingRegion.parentIndex);
            }
            // Find fold at same level.
            while (foldingRegion !== null) {
                if (foldingRegion.regionIndex > 0) {
                    foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
                    // Keep at same level.
                    if (foldingRegion.startLineNumber <= minLineNumber) {
                        return null;
                    }
                    else if (foldingRegion.parentIndex === expectedParentIndex) {
                        return foldingRegion.startLineNumber;
                    }
                }
                else {
                    return null;
                }
            }
        }
    }
    else {
        // Go to last fold that's before the current line.
        if (foldingModel.regions.length > 0) {
            foldingRegion = foldingModel.regions.toRegion(foldingModel.regions.length - 1);
            while (foldingRegion !== null) {
                // Found fold before current line.
                if (foldingRegion.startLineNumber < lineNumber) {
                    return foldingRegion.startLineNumber;
                }
                if (foldingRegion.regionIndex > 0) {
                    foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex - 1);
                }
                else {
                    foldingRegion = null;
                }
            }
        }
    }
    return null;
}
/**
 * Get line to go to next fold at the same level of current line
 * @param lineNumber the current line number
 * @param foldingModel the folding model
 *
 * @return Next fold start line
 */
export function getNextFoldLine(lineNumber, foldingModel) {
    let foldingRegion = foldingModel.getRegionAtLine(lineNumber);
    // If on the folding range start line, go to next sibling.
    if (foldingRegion !== null && foldingRegion.startLineNumber === lineNumber) {
        // Find max line number to stay within parent.
        const expectedParentIndex = foldingRegion.parentIndex;
        let maxLineNumber = 0;
        if (expectedParentIndex !== -1) {
            maxLineNumber = foldingModel.regions.getEndLineNumber(foldingRegion.parentIndex);
        }
        else if (foldingModel.regions.length === 0) {
            return null;
        }
        else {
            maxLineNumber = foldingModel.regions.getEndLineNumber(foldingModel.regions.length - 1);
        }
        // Find fold at same level.
        while (foldingRegion !== null) {
            if (foldingRegion.regionIndex < foldingModel.regions.length) {
                foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
                // Keep at same level.
                if (foldingRegion.startLineNumber >= maxLineNumber) {
                    return null;
                }
                else if (foldingRegion.parentIndex === expectedParentIndex) {
                    return foldingRegion.startLineNumber;
                }
            }
            else {
                return null;
            }
        }
    }
    else {
        // Go to first fold that's after the current line.
        if (foldingModel.regions.length > 0) {
            foldingRegion = foldingModel.regions.toRegion(0);
            while (foldingRegion !== null) {
                // Found fold after current line.
                if (foldingRegion.startLineNumber > lineNumber) {
                    return foldingRegion.startLineNumber;
                }
                if (foldingRegion.regionIndex < foldingModel.regions.length) {
                    foldingRegion = foldingModel.regions.toRegion(foldingRegion.regionIndex + 1);
                }
                else {
                    foldingRegion = null;
                }
            }
        }
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ01vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmdNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFpQixjQUFjLEVBQXFDLE1BQU0sb0JBQW9CLENBQUM7QUFDdEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBdUJ2RCxNQUFNLE9BQU8sWUFBWTtJQVV4QixJQUFXLE9BQU8sS0FBcUIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUM5RCxJQUFXLFNBQVMsS0FBSyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ2xELElBQVcsa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0lBRXBFLFlBQVksU0FBcUIsRUFBRSxrQkFBdUM7UUFQekQsd0JBQW1CLEdBQUcsSUFBSSxPQUFPLEVBQTJCLENBQUM7UUFDOUQsZ0JBQVcsR0FBbUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQU81RixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUM1QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7UUFDOUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLGNBQWMsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVNLG1CQUFtQixDQUFDLGNBQStCO1FBQ3pELElB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