/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { binarySearch2 } from '../../../base/common/arrays.js';
import { intersection } from '../../../base/common/collections.js';
var PendingChangeKind;
(function (PendingChangeKind) {
    PendingChangeKind[PendingChangeKind["InsertOrChange"] = 0] = "InsertOrChange";
    PendingChangeKind[PendingChangeKind["Remove"] = 1] = "Remove";
    PendingChangeKind[PendingChangeKind["LinesDeleted"] = 2] = "LinesDeleted";
    PendingChangeKind[PendingChangeKind["LinesInserted"] = 3] = "LinesInserted";
})(PendingChangeKind || (PendingChangeKind = {}));
export class CustomLine {
    constructor(decorationId, index, lineNumber, specialHeight, prefixSum) {
        this.decorationId = decorationId;
        this.index = index;
        this.lineNumber = lineNumber;
        this.specialHeight = specialHeight;
        this.prefixSum = prefixSum;
        this.maximumSpecialHeight = specialHeight;
        this.deleted = false;
    }
}
/**
 * Manages line heights in the editor with support for custom line heights from decorations.
 *
 * This class maintains an ordered collection of line heights, where each line can have either
 * the default height or a custom height specified by decorations. It supports efficient querying
 * of individual line heights as well as accumulated heights up to a specific line.
 *
 * Line heights are stored in a sorted array for efficient binary search operations. Each line
 * with custom height is represented by a {@link CustomLine} object which tracks its special height,
 * accumulated height prefix sum, and associated decoration ID.
 *
 * The class optimizes performance by:
 * - Using binary search to locate lines in the ordered array
 * - Batching updates through a pending changes mechanism
 * - Computing prefix sums for O(1) accumulated height lookup
 * - Tracking maximum height for lines with multiple decorations
 * - Efficiently handling document changes (line insertions and deletions)
 *
 * When lines are inserted or deleted, the manager updates line numbers and prefix sums
 * for all affected lines. It also handles special cases like decorations that span
 * the insertion/deletion points by re-applying those decorations appropriately.
 *
 * All query operations automatically commit pending changes to ensure consistent results.
 * Clients can modify line heights by adding or removing custom line height decorations,
 * which are tracked by their unique decoration IDs.
 */
export class LineHeightsManager {
    constructor(defaultLineHeight, customLineHeightData) {
        this._decorationIDToCustomLine = new ArrayMap();
        this._orderedCustomLines = [];
        this._pendingChanges = [];
        this._invalidIndex = Infinity;
        this._hasPending = false;
        this._defaultLineHeight = defaultLineHeight;
        for (const data of customLineHeightData) {
            this.insertOrChangeCustomLineHeight(data.decorationId, data.startLineNumber, data.endLineNumber, data.lineHeight);
        }
    }
    set defaultLineHeight(defaultLineHeight) {
        this._defaultLineHeight = defaultLineHeight;
    }
    get defaultLineHeight() {
        return this._defaultLineHeight;
    }
    removeCustomLineHeight(decorationID) {
        this._pendingChanges.push({ kind: 1 /* PendingChangeKind.Remove */, decorationId: decorationID });
        this._hasPending = true;
    }
    insertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight) {
        this._pendingChanges.push({ kind: 0 /* PendingChangeKind.InsertOrChange */, decorationId, startLineNumber, endLineNumber, lineHeight });
        this._hasPending = true;
    }
    heightForLineNumber(lineNumber) {
        this._commit();
        const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
        if (searchIndex >= 0) {
            return this._orderedCustomLines[searchIndex].maximumSpecialHeight;
        }
        return this._defaultLineHeight;
    }
    getAccumulatedLineHeightsIncludingLineNumber(lineNumber) {
        this._commit();
        const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
        if (searchIndex >= 0) {
            return this._orderedCustomLines[searchIndex].prefixSum + this._orderedCustomLines[searchIndex].maximumSpecialHeight;
        }
        if (searchIndex === -1) {
            return this._defaultLineHeight * lineNumber;
        }
        const modifiedIndex = -(searchIndex + 1);
        const previousSpecialLine = this._orderedCustomLines[modifiedIndex - 1];
        return previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
    }
    onLinesDeleted(fromLineNumber, toLineNumber) {
        this._pendingChanges.push({ kind: 2 /* PendingChangeKind.LinesDeleted */, fromLineNumber, toLineNumber });
        this._hasPending = true;
    }
    onLinesInserted(fromLineNumber, toLineNumber) {
        this._pendingChanges.push({ kind: 3 /* PendingChangeKind.LinesInserted */, fromLineNumber, toLineNumber });
        this._hasPending = true;
    }
    _commit() {
        if (!this._hasPending) {
            return;
        }
        const changes = this._pendingChanges;
        this._pendingChanges = [];
        this._hasPending = false;
        const stagedInserts = [];
        const stagedIdMap = new ArrayMap();
        for (const change of changes) {
            switch (change.kind) {
                case 1 /* PendingChangeKind.Remove */:
                    this._doRemoveCustomLineHeight(change.decorationId, stagedIdMap);
                    break;
                case 0 /* PendingChangeKind.InsertOrChange */:
                    this._doInsertOrChangeCustomLineHeight(change.decorationId, change.startLineNumber, change.endLineNumber, change.lineHeight, stagedInserts, stagedIdMap);
                    break;
                case 2 /* PendingChangeKind.LinesDeleted */:
                    this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
                    this._doLinesDeleted(change.fromLineNumber, change.toLineNumber);
                    break;
                case 3 /* PendingChangeKind.LinesInserted */:
                    this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
                    this._doLinesInserted(change.fromLineNumber, change.toLineNumber, stagedInserts, stagedIdMap);
                    break;
            }
        }
        this._flushStagedDecorationChanges(stagedInserts, stagedIdMap);
    }
    _doRemoveCustomLineHeight(decorationID, stagedIdMap) {
        const customLines = this._decorationIDToCustomLine.get(decorationID);
        if (customLines) {
            this._decorationIDToCustomLine.delete(decorationID);
            for (const customLine of customLines) {
                customLine.deleted = true;
                this._invalidIndex = Math.min(this._invalidIndex, customLine.index);
            }
        }
        const stagedLines = stagedIdMap.get(decorationID);
        if (stagedLines) {
            stagedIdMap.delete(decorationID);
            for (const line of stagedLines) {
                line.deleted = true;
            }
        }
    }
    _doInsertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight, stagedInserts, stagedIdMap) {
        this._doRemoveCustomLineHeight(decorationId, stagedIdMap);
        for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
            const customLine = new CustomLine(decorationId, -1, lineNumber, lineHeight, 0);
            stagedInserts.push(customLine);
            stagedIdMap.add(decorationId, customLine);
        }
    }
    _flushStagedDecorationChanges(stagedInserts, stagedIdMap) {
        if (stagedInserts.length === 0 && this._invalidIndex === Infinity) {
            return;
        }
        for (const pendingChange of stagedInserts) {
            if (pendingChange.deleted) {
                continue;
            }
            const candidateInsertionIndex = this._binarySearchOverOrderedCustomLinesArray(pendingChange.lineNumber);
            const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
            this._orderedCustomLines.splice(insertionIndex, 0, pendingChange);
            this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
        }
        stagedInserts.length = 0;
        stagedIdMap.clear();
        if (this._invalidIndex === Infinity) {
            return;
        }
        const newDecorationIDToSpecialLine = new ArrayMap();
        const newOrderedSpecialLines = [];
        for (let i = 0; i < this._invalidIndex; i++) {
            const customLine = this._orderedCustomLines[i];
            newOrderedSpecialLines.push(customLine);
            newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        }
        let numberOfDeletions = 0;
        let previousSpecialLine = (this._invalidIndex > 0) ? newOrderedSpecialLines[this._invalidIndex - 1] : undefined;
        for (let i = this._invalidIndex; i < this._orderedCustomLines.length; i++) {
            const customLine = this._orderedCustomLines[i];
            if (customLine.deleted) {
                numberOfDeletions++;
                continue;
            }
            customLine.index = i - numberOfDeletions;
            if (previousSpecialLine && previousSpecialLine.lineNumber === customLine.lineNumber) {
                customLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
                customLine.prefixSum = previousSpecialLine.prefixSum;
            }
            else {
                let maximumSpecialHeight = customLine.specialHeight;
                for (let j = i; j < this._orderedCustomLines.length; j++) {
                    const nextSpecialLine = this._orderedCustomLines[j];
                    if (nextSpecialLine.deleted) {
                        continue;
                    }
                    if (nextSpecialLine.lineNumber !== customLine.lineNumber) {
                        break;
                    }
                    maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
                }
                customLine.maximumSpecialHeight = maximumSpecialHeight;
                let prefixSum;
                if (previousSpecialLine) {
                    prefixSum = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (customLine.lineNumber - previousSpecialLine.lineNumber - 1);
                }
                else {
                    prefixSum = this._defaultLineHeight * (customLine.lineNumber - 1);
                }
                customLine.prefixSum = prefixSum;
            }
            previousSpecialLine = customLine;
            newOrderedSpecialLines.push(customLine);
            newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
        }
        this._orderedCustomLines = newOrderedSpecialLines;
        this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
        this._invalidIndex = Infinity;
    }
    _doLinesDeleted(fromLineNumber, toLineNumber) {
        const deleteCount = toLineNumber - fromLineNumber + 1;
        const numberOfCustomLines = this._orderedCustomLines.length;
        const candidateStartIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
        let startIndexOfDeletion;
        if (candidateStartIndexOfDeletion >= 0) {
            startIndexOfDeletion = candidateStartIndexOfDeletion;
            for (let i = candidateStartIndexOfDeletion - 1; i >= 0; i--) {
                if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
                    startIndexOfDeletion--;
                }
                else {
                    break;
                }
            }
        }
        else {
            startIndexOfDeletion = candidateStartIndexOfDeletion === -(numberOfCustomLines + 1) && candidateStartIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateStartIndexOfDeletion + 1);
        }
        const candidateEndIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(toLineNumber);
        let endIndexOfDeletion;
        if (candidateEndIndexOfDeletion >= 0) {
            endIndexOfDeletion = candidateEndIndexOfDeletion;
            for (let i = candidateEndIndexOfDeletion + 1; i < numberOfCustomLines; i++) {
                if (this._orderedCustomLines[i].lineNumber === toLineNumber) {
                    endIndexOfDeletion++;
                }
                else {
                    break;
                }
            }
        }
        else {
            endIndexOfDeletion = candidateEndIndexOfDeletion === -(numberOfCustomLines + 1) && candidateEndIndexOfDeletion !== -1 ? numberOfCustomLines - 1 : -(candidateEndIndexOfDeletion + 1);
        }
        const isEndIndexBiggerThanStartIndex = endIndexOfDeletion > startIndexOfDeletion;
        const isEndIndexEqualToStartIndexAndCoversCustomLine = endIndexOfDeletion === startIndexOfDeletion
            && this._orderedCustomLines[startIndexOfDeletion]
            && this._orderedCustomLines[startIndexOfDeletion].lineNumber >= fromLineNumber
            && this._orderedCustomLines[startIndexOfDeletion].lineNumber <= toLineNumber;
        if (isEndIndexBiggerThanStartIndex || isEndIndexEqualToStartIndexAndCoversCustomLine) {
            let maximumSpecialHeightOnDeletedInterval = 0;
            for (let i = startIndexOfDeletion; i <= endIndexOfDeletion; i++) {
                maximumSpecialHeightOnDeletedInterval = Math.max(maximumSpecialHeightOnDeletedInterval, this._orderedCustomLines[i].maximumSpecialHeight);
            }
            let prefixSumOnDeletedInterval = 0;
            if (startIndexOfDeletion > 0) {
                const previousSpecialLine = this._orderedCustomLines[startIndexOfDeletion - 1];
                prefixSumOnDeletedInterval = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (fromLineNumber - previousSpecialLine.lineNumber - 1);
            }
            else {
                prefixSumOnDeletedInterval = fromLineNumber > 0 ? (fromLineNumber - 1) * this._defaultLineHeight : 0;
            }
            const firstSpecialLineDeleted = this._orderedCustomLines[startIndexOfDeletion];
            const lastSpecialLineDeleted = this._orderedCustomLines[endIndexOfDeletion];
            const firstSpecialLineAfterDeletion = this._orderedCustomLines[endIndexOfDeletion + 1];
            const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
            const totalHeightDeleted = lastSpecialLineDeleted.prefixSum
                + lastSpecialLineDeleted.maximumSpecialHeight
                - firstSpecialLineDeleted.prefixSum
                + this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber)
                + this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber)
                + heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;
            const decorationIdsSeen = new Set();
            const newOrderedCustomLines = [];
            const newDecorationIDToSpecialLine = new ArrayMap();
            let numberOfDeletions = 0;
            for (let i = 0; i < this._orderedCustomLines.length; i++) {
                const customLine = this._orderedCustomLines[i];
                if (i < startIndexOfDeletion) {
                    newOrderedCustomLines.push(customLine);
                    newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
                }
                else if (i >= startIndexOfDeletion && i <= endIndexOfDeletion) {
                    const decorationId = customLine.decorationId;
                    if (!decorationIdsSeen.has(decorationId)) {
                        customLine.index -= numberOfDeletions;
                        customLine.lineNumber = fromLineNumber;
                        customLine.prefixSum = prefixSumOnDeletedInterval;
                        customLine.maximumSpecialHeight = maximumSpecialHeightOnDeletedInterval;
                        newOrderedCustomLines.push(customLine);
                        newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
                    }
                    else {
                        numberOfDeletions++;
                    }
                }
                else if (i > endIndexOfDeletion) {
                    customLine.index -= numberOfDeletions;
                    customLine.lineNumber -= deleteCount;
                    customLine.prefixSum -= totalHeightDeleted;
                    newOrderedCustomLines.push(customLine);
                    newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
                }
                decorationIdsSeen.add(customLine.decorationId);
            }
            this._orderedCustomLines = newOrderedCustomLines;
            this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
        }
        else {
            const totalHeightDeleted = deleteCount * this._defaultLineHeight;
            for (let i = endIndexOfDeletion; i < this._orderedCustomLines.length; i++) {
                const customLine = this._orderedCustomLines[i];
                if (customLine.lineNumber > toLineNumber) {
                    customLine.lineNumber -= deleteCount;
                    customLine.prefixSum -= totalHeightDeleted;
                }
            }
        }
    }
    _doLinesInserted(fromLineNumber, toLineNumber, stagedInserts, stagedIdMap) {
        const insertCount = toLineNumber - fromLineNumber + 1;
        const candidateStartIndexOfInsertion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
        let startIndexOfInsertion;
        if (candidateStartIndexOfInsertion >= 0) {
            startIndexOfInsertion = candidateStartIndexOfInsertion;
            for (let i = candidateStartIndexOfInsertion - 1; i >= 0; i--) {
                if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
                    startIndexOfInsertion--;
                }
                else {
                    break;
                }
            }
        }
        else {
            startIndexOfInsertion = -(candidateStartIndexOfInsertion + 1);
        }
        const toReAdd = [];
        const decorationsImmediatelyAfter = new Set();
        for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
            if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
                decorationsImmediatelyAfter.add(this._orderedCustomLines[i].decorationId);
            }
        }
        const decorationsImmediatelyBefore = new Set();
        for (let i = startIndexOfInsertion - 1; i >= 0; i--) {
            if (this._orderedCustomLines[i].lineNumber === fromLineNumber - 1) {
                decorationsImmediatelyBefore.add(this._orderedCustomLines[i].decorationId);
            }
        }
        const decorationsWithGaps = intersection(decorationsImmediatelyBefore, decorationsImmediatelyAfter);
        const prefixSumToAdd = insertCount * this._defaultLineHeight;
        for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
            this._orderedCustomLines[i].lineNumber += insertCount;
            this._orderedCustomLines[i].prefixSum += prefixSumToAdd;
        }
        if (decorationsWithGaps.size > 0) {
            for (const decorationId of decorationsWithGaps) {
                const decoration = this._decorationIDToCustomLine.get(decorationId);
                if (decoration) {
                    const startLineNumber = decoration.reduce((min, l) => Math.min(min, l.lineNumber), fromLineNumber); // min
                    const endLineNumber = decoration.reduce((max, l) => Math.max(max, l.lineNumber), fromLineNumber); // max
                    const lineHeight = decoration.reduce((max, l) => Math.max(max, l.specialHeight), 0);
                    toReAdd.push({
                        decorationId,
                        startLineNumber,
                        endLineNumber,
                        lineHeight
                    });
                }
            }
            for (const dec of toReAdd) {
                this._doInsertOrChangeCustomLineHeight(dec.decorationId, dec.startLineNumber, dec.endLineNumber, dec.lineHeight, stagedInserts, stagedIdMap);
            }
        }
    }
    _binarySearchOverOrderedCustomLinesArray(lineNumber) {
        return binarySearch2(this._orderedCustomLines.length, (index) => {
            const line = this._orderedCustomLines[index];
            if (line.lineNumber === lineNumber) {
                return 0;
            }
            else if (line.lineNumber < lineNumber) {
                return -1;
            }
            else {
                return 1;
            }
        });
    }
}
export class CustomLineHeightData {
    constructor(decorationId, startLineNumber, endLineNumber, lineHeight) {
        this.decorationId = decorationId;
        this.startLineNumber = startLineNumber;
        this.endLineNumber = endLineNumber;
        this.lineHeight = lineHeight;
    }
    static fromDecorations(decorations, coordinatesConverter, configuration) {
        const defaultLineHeight = configuration.options.get(75 /* EditorOption.lineHeight */);
        return decorations.map((d) => {
            const viewRange = coordinatesConverter.convertModelRangeToViewRange(d.range);
            return new CustomLineHeightData(d.id, viewRange.startLineNumber, viewRange.endLineNumber, d.options.lineHeight ? d.options.lineHeight * defaultLineHeight : 0);
        });
    }
}
class ArrayMap {
    constructor() {
        this._map = new Map();
    }
    add(key, value) {
        const array = this._map.get(key);
        if (!array) {
            this._map.set(key, [value]);
        }
        else {
            array.push(value);
        }
    }
    get(key) {
        return this._map.get(key);
    }
    delete(key) {
        this._map.delete(key);
    }
    clear() {
        this._map.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZUhlaWdodHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3ZpZXdMYXlvdXQvbGluZUhlaWdodHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQU1uRSxJQUFXLGlCQUtWO0FBTEQsV0FBVyxpQkFBaUI7SUFDM0IsNkVBQWMsQ0FBQTtJQUNkLDZEQUFNLENBQUE7SUFDTix5RUFBWSxDQUFBO0lBQ1osMkVBQWEsQ0FBQTtBQUNkLENBQUMsRUFMVSxpQkFBaUIsS0FBakIsaUJBQWlCLFFBSzNCO0FBUUQsTUFBTSxPQUFPLFVBQVU7SUFVdEIsWUFBWSxZQUFvQixFQUFFLEtBQWEsRUFBRSxVQUFrQixFQUFFLGFBQXFCLEVBQUUsU0FBaUI7UUFDNUcsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDakMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7UUFDbkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLGFBQWEsQ0FBQztRQUMxQyxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUN0QixDQUFDO0NBQ0Q7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUNILE1BQU0sT0FBTyxrQkFBa0I7SUFTOUIsWUFBWSxpQkFBeUIsRUFBRSxvQkFBNEM7UUFQM0UsOEJBQXlCLEdBQWlDLElBQUksUUFBUSxFQUFzQixDQUFDO1FBQzdGLHdCQUFt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