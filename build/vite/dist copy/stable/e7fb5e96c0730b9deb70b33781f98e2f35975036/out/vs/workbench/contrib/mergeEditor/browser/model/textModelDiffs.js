/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, numberComparator } from '../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { DetailedLineRangeMapping } from './mapping.js';
import { LineRangeEdit } from './editing.js';
import { MergeEditorLineRange } from './lineRange.js';
import { ReentrancyBarrier } from '../../../../../base/common/controlFlow.js';
import { autorun, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
export class TextModelDiffs extends Disposable {
    get isApplyingChange() {
        return this._barrier.isOccupied;
    }
    constructor(baseTextModel, textModel, diffComputer) {
        super();
        this.baseTextModel = baseTextModel;
        this.textModel = textModel;
        this.diffComputer = diffComputer;
        this._recomputeCount = 0;
        this._state = observableValue(this, 1 /* TextModelDiffState.initializing */);
        this._diffs = observableValue(this, []);
        this._barrier = new ReentrancyBarrier();
        this._isDisposed = false;
        this._isInitializing = true;
        const recomputeSignal = observableSignal('recompute');
        this._register(autorun(reader => {
            /** @description Update diff state */
            recomputeSignal.read(reader);
            this._recompute(reader);
        }));
        this._register(baseTextModel.onDidChangeContent(this._barrier.makeExclusiveOrSkip(() => {
            recomputeSignal.trigger(undefined);
        })));
        this._register(textModel.onDidChangeContent(this._barrier.makeExclusiveOrSkip(() => {
            recomputeSignal.trigger(undefined);
        })));
        this._register(toDisposable(() => {
            this._isDisposed = true;
        }));
    }
    get state() {
        return this._state;
    }
    /**
     * Diffs from base to input.
    */
    get diffs() {
        return this._diffs;
    }
    _recompute(reader) {
        this._recomputeCount++;
        const currentRecomputeIdx = this._recomputeCount;
        if (this._state.get() === 1 /* TextModelDiffState.initializing */) {
            this._isInitializing = true;
        }
        transaction(tx => {
            /** @description Starting Diff Computation. */
            this._state.set(this._isInitializing ? 1 /* TextModelDiffState.initializing */ : 3 /* TextModelDiffState.updating */, tx, 0 /* TextModelDiffChangeReason.other */);
        });
        const result = this.diffComputer.computeDiff(this.baseTextModel, this.textModel, reader);
        result.then((result) => {
            if (this._isDisposed) {
                return;
            }
            if (currentRecomputeIdx !== this._recomputeCount) {
                // There is a newer recompute call
                return;
            }
            transaction(tx => {
                /** @description Completed Diff Computation */
                if (result.diffs) {
                    this._state.set(2 /* TextModelDiffState.upToDate */, tx, 1 /* TextModelDiffChangeReason.textChange */);
                    this._diffs.set(result.diffs, tx, 1 /* TextModelDiffChangeReason.textChange */);
                }
                else {
                    this._state.set(4 /* TextModelDiffState.error */, tx, 1 /* TextModelDiffChangeReason.textChange */);
                }
                this._isInitializing = false;
            });
        });
    }
    ensureUpToDate() {
        if (this.state.get() !== 2 /* TextModelDiffState.upToDate */) {
            throw new BugIndicatingError('Cannot remove diffs when the model is not up to date');
        }
    }
    removeDiffs(diffToRemoves, transaction, group) {
        this.ensureUpToDate();
        diffToRemoves.sort(compareBy((d) => d.inputRange.startLineNumber, numberComparator));
        diffToRemoves.reverse(); // process from bottom of document upward
        const diffs = this._diffs.get();
        // Validate all diffs-to-remove exist using Set for O(1) lookup
        const toRemoveSet = new Set(diffToRemoves);
        if (toRemoveSet.size !== diffToRemoves.length) {
            throw new BugIndicatingError(); // duplicate entries
        }
        const diffsSet = new Set(diffs);
        for (const d of diffToRemoves) {
            if (!diffsSet.has(d)) {
                throw new BugIndicatingError();
            }
        }
        // Apply text model edits in reverse document order (bottom-up, safe for line shifting)
        for (const diffToRemove of diffToRemoves) {
            this._barrier.runExclusivelyOrThrow(() => {
                const edits = diffToRemove.getReverseLineEdit().toEdits(this.textModel.getLineCount());
                this.textModel.pushEditOperations(null, edits, () => null, group);
            });
        }
        // Single forward pass: accumulate delta from removed diffs above, apply to remaining diffs below
        let cumulativeDelta = 0;
        const newDiffs = [];
        for (const d of diffs) {
            if (toRemoveSet.has(d)) {
                cumulativeDelta += d.inputRange.length - d.outputRange.length;
            }
            else {
                newDiffs.push(cumulativeDelta !== 0 ? d.addOutputLineDelta(cumulativeDelta) : d);
            }
        }
        this._diffs.set(newDiffs, transaction, 0 /* TextModelDiffChangeReason.other */);
    }
    /**
     * Edit must be conflict free.
     */
    applyEditRelativeToOriginal(edit, transaction, group) {
        this.ensureUpToDate();
        const editMapping = new DetailedLineRangeMapping(edit.range, this.baseTextModel, MergeEditorLineRange.fromLength(edit.range.startLineNumber, edit.newLines.length), this.textModel);
        let firstAfter = false;
        let delta = 0;
        const newDiffs = new Array();
        for (const diff of this.diffs.get()) {
            if (diff.inputRange.intersectsOrTouches(edit.range)) {
                throw new BugIndicatingError('Edit must be conflict free.');
            }
            else if (diff.inputRange.isAfter(edit.range)) {
                if (!firstAfter) {
                    firstAfter = true;
                    newDiffs.push(editMapping.addOutputLineDelta(delta));
                }
                newDiffs.push(diff.addOutputLineDelta(edit.newLines.length - edit.range.length));
            }
            else {
                newDiffs.push(diff);
            }
            if (!firstAfter) {
                delta += diff.outputRange.length - diff.inputRange.length;
            }
        }
        if (!firstAfter) {
            firstAfter = true;
            newDiffs.push(editMapping.addOutputLineDelta(delta));
        }
        this._barrier.runExclusivelyOrThrow(() => {
            const edits = new LineRangeEdit(edit.range.delta(delta), edit.newLines).toEdits(this.textModel.getLineCount());
            this.textModel.pushEditOperations(null, edits, () => null, group);
        });
        this._diffs.set(newDiffs, transaction, 0 /* TextModelDiffChangeReason.other */);
    }
    findTouchingDiffs(baseRange) {
        return this.diffs.get().filter(d => d.inputRange.intersectsOrTouches(baseRange));
    }
    getResultLine(lineNumber, reader) {
        let offset = 0;
        const diffs = reader ? this.diffs.read(reader) : this.diffs.get();
        for (const diff of diffs) {
            if (diff.inputRange.contains(lineNumber) || diff.inputRange.endLineNumberExclusive === lineNumber) {
                return diff;
            }
            else if (diff.inputRange.endLineNumberExclusive < lineNumber) {
                offset = diff.resultingDeltaFromOriginalToModified;
            }
            else {
                break;
            }
        }
        return lineNumber + offset;
    }
    getResultLineRange(baseRange, reader) {
        let start = this.getResultLine(baseRange.startLineNumber, reader);
        if (typeof start !== 'number') {
            start = start.outputRange.startLineNumber;
        }
        let endExclusive = this.getResultLine(baseRange.endLineNumberExclusive, reader);
        if (typeof endExclusive !== 'number') {
            endExclusive = endExclusive.outputRange.endLineNumberExclusive;
        }
        return MergeEditorLineRange.fromLineNumbers(start, endExclusive);
    }
}
export var TextModelDiffChangeReason;
(function (TextModelDiffChangeReason) {
    TextModelDiffChangeReason[TextModelDiffChangeReason["other"] = 0] = "other";
    TextModelDiffChangeReason[TextModelDiffChangeReason["textChange"] = 1] = "textChange";
})(TextModelDiffChangeReason || (TextModelDiffChangeReason = {}));
export var TextModelDiffState;
(function (TextModelDiffState) {
    TextModelDiffState[TextModelDiffState["initializing"] = 1] = "initializing";
    TextModelDiffState[TextModelDiffState["upToDate"] = 2] = "upToDate";
    TextModelDiffState[TextModelDiffState["updating"] = 3] = "updating";
    TextModelDiffState[TextModelDiffState["error"] = 4] = "error";
})(TextModelDiffState || (TextModelDiffState = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsRGlmZnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL21vZGVsL3RleHRNb2RlbERpZmZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRW5GLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQzdDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxPQUFPLEVBQWdELGdCQUFnQixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUdqSyxNQUFNLE9BQU8sY0FBZSxTQUFRLFVBQVU7SUFRN0MsSUFBVyxnQkFBZ0I7UUFDMUIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsWUFDa0IsYUFBeUIsRUFDekIsU0FBcUIsRUFDckIsWUFBZ0M7UUFFakQsS0FBSyxFQUFFLENBQUM7UUFKUyxrQkFBYSxHQUFiLGFBQWEsQ0FBWTtRQUN6QixjQUFTLEdBQVQsU0FBUyxDQUFZO1FBQ3JCLGlCQUFZLEdBQVosWUFBWSxDQUFvQjtRQWQxQyxvQkFBZSxHQUFHLENBQUMsQ0FBQztRQUNYLFdBQU0sR0FBRyxl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