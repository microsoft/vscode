/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableSignal, observableSignalFromEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { IDiffProviderFactoryService } from './diffProviderFactoryService.js';
import { filterWithPrevious } from './utils.js';
import { readHotReloadableExport } from '../../../../base/common/hotReloadHelpers.js';
import { LineRange, LineRangeSet } from '../../../common/core/ranges/lineRange.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { TextEditInfo } from '../../../common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper.js';
import { combineTextEditInfos } from '../../../common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos.js';
import { optimizeSequenceDiffs } from '../../../common/diff/defaultLinesDiffComputer/heuristicSequenceOptimizations.js';
import { isDefined } from '../../../../base/common/types.js';
import { groupAdjacentBy } from '../../../../base/common/arrays.js';
import { softAssert } from '../../../../base/common/assert.js';
let DiffEditorViewModel = class DiffEditorViewModel extends Disposable {
    setActiveMovedText(movedText) {
        this._activeMovedText.set(movedText, undefined);
    }
    setHoveredMovedText(movedText) {
        this._hoveredMovedText.set(movedText, undefined);
    }
    constructor(model, _options, _diffProviderFactoryService) {
        super();
        this.model = model;
        this._options = _options;
        this._diffProviderFactoryService = _diffProviderFactoryService;
        this._isDiffUpToDate = observableValue(this, false);
        this.isDiffUpToDate = this._isDiffUpToDate;
        this._diff = observableValue(this, undefined);
        this.diff = this._diff;
        this._unchangedRegions = observableValue(this, undefined);
        this.unchangedRegions = derived(this, r => {
            if (this._options.hideUnchangedRegions.read(r)) {
                return this._unchangedRegions.read(r)?.regions ?? [];
            }
            else {
                // Reset state
                transaction(tx => {
                    for (const r of this._unchangedRegions.read(undefined)?.regions || []) {
                        r.collapseAll(tx);
                    }
                });
                return [];
            }
        });
        this.movedTextToCompare = observableValue(this, undefined);
        this._activeMovedText = observableValue(this, undefined);
        this._hoveredMovedText = observableValue(this, undefined);
        this.activeMovedText = derived(this, r => this.movedTextToCompare.read(r) ?? this._hoveredMovedText.read(r) ?? this._activeMovedText.read(r));
        this._cancellationTokenSource = new CancellationTokenSource();
        this._diffProvider = derived(this, reader => {
            const diffProvider = this._diffProviderFactoryService.createDiffProvider({
                diffAlgorithm: this._options.diffAlgorithm.read(reader)
            });
            const onChangeSignal = observableSignalFromEvent('onDidChange', diffProvider.onDidChange);
            return {
                diffProvider,
                onChangeSignal,
            };
        });
        this._register(toDisposable(() => this._cancellationTokenSource.cancel()));
        const contentChangedSignal = observableSignal('contentChangedSignal');
        const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(undefined), 200));
        this._register(autorun(reader => {
            /** @description collapse touching unchanged ranges */
            const lastUnchangedRegions = this._unchangedRegions.read(reader);
            if (!lastUnchangedRegions || lastUnchangedRegions.regions.some(r => r.isDragged.read(reader))) {
                return;
            }
            const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds
                .map(id => model.original.getDecorationRange(id))
                .map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
            const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds
                .map(id => model.modified.getDecorationRange(id))
                .map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
            const updatedLastUnchangedRegions = lastUnchangedRegions.regions.map((r, idx) => (!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) ? undefined :
                new UnchangedRegion(lastUnchangedRegionsOrigRanges[idx].startLineNumber, lastUnchangedRegionsModRanges[idx].startLineNumber, lastUnchangedRegionsOrigRanges[idx].length, r.visibleLineCountTop.read(reader), r.visibleLineCountBottom.read(reader))).filter(isDefined);
            const newRanges = [];
            let didChange = false;
            for (const touching of groupAdjacentBy(updatedLastUnchangedRegions, (a, b) => a.getHiddenModifiedRange(reader).endLineNumberExclusive === b.getHiddenModifiedRange(reader).startLineNumber)) {
                if (touching.length > 1) {
                    didChange = true;
                    const sumLineCount = touching.reduce((sum, r) => sum + r.lineCount, 0);
                    const r = new UnchangedRegion(touching[0].originalLineNumber, touching[0].modifiedLineNumber, sumLineCount, touching[0].visibleLineCountTop.read(undefined), touching[touching.length - 1].visibleLineCountBottom.read(undefined));
                    newRanges.push(r);
                }
                else {
                    newRanges.push(touching[0]);
                }
            }
            if (didChange) {
                const originalDecorationIds = model.original.deltaDecorations(lastUnchangedRegions.originalDecorationIds, newRanges.map(r => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: 'unchanged' } })));
                const modifiedDecorationIds = model.modified.deltaDecorations(lastUnchangedRegions.modifiedDecorationIds, newRanges.map(r => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: 'unchanged' } })));
                transaction(tx => {
                    this._unchangedRegions.set({
                        regions: newRanges,
                        originalDecorationIds,
                        modifiedDecorationIds
                    }, tx);
                });
            }
        }));
        const updateUnchangedRegions = (result, tx, reader) => {
            const newUnchangedRegions = UnchangedRegion.fromDiffs(result.changes, model.original.getLineCount(), model.modified.getLineCount(), this._options.hideUnchangedRegionsMinimumLineCount.read(reader), this._options.hideUnchangedRegionsContextLineCount.read(reader));
            // Transfer state from cur state
            let visibleRegions = undefined;
            const lastUnchangedRegions = this._unchangedRegions.get();
            if (lastUnchangedRegions) {
                const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds
                    .map(id => model.original.getDecorationRange(id))
                    .map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
                const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds
                    .map(id => model.modified.getDecorationRange(id))
                    .map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
                const updatedLastUnchangedRegions = filterWithPrevious(lastUnchangedRegions.regions
                    .map((r, idx) => {
                    if (!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) {
                        return undefined;
                    }
                    const length = lastUnchangedRegionsOrigRanges[idx].length;
                    return new UnchangedRegion(lastUnchangedRegionsOrigRanges[idx].startLineNumber, lastUnchangedRegionsModRanges[idx].startLineNumber, length, 
                    // The visible area can shrink by edits -> we have to account for this
                    Math.min(r.visibleLineCountTop.get(), length), Math.min(r.visibleLineCountBottom.get(), length - r.visibleLineCountTop.get()));
                }).filter(isDefined), (cur, prev) => !prev || (cur.modifiedLineNumber >= prev.modifiedLineNumber + prev.lineCount && cur.originalLineNumber >= prev.originalLineNumber + prev.lineCount));
                let hiddenRegions = updatedLastUnchangedRegions.map(r => new LineRangeMapping(r.getHiddenOriginalRange(reader), r.getHiddenModifiedRange(reader)));
                hiddenRegions = LineRangeMapping.clip(hiddenRegions, LineRange.ofLength(1, model.original.getLineCount()), LineRange.ofLength(1, model.modified.getLineCount()));
                visibleRegions = LineRangeMapping.inverse(hiddenRegions, model.original.getLineCount(), model.modified.getLineCount());
            }
            const newUnchangedRegions2 = [];
            if (visibleRegions) {
                for (const r of newUnchangedRegions) {
                    const intersecting = visibleRegions.filter(f => f.original.intersectsStrict(r.originalUnchangedRange) && f.modified.intersectsStrict(r.modifiedUnchangedRange));
                    newUnchangedRegions2.push(...r.setVisibleRanges(intersecting, tx));
                }
            }
            else {
                newUnchangedRegions2.push(...newUnchangedRegions);
            }
            const originalDecorationIds = model.original.deltaDecorations(lastUnchangedRegions?.originalDecorationIds || [], newUnchangedRegions2.map(r => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: 'unchanged' } })));
            const modifiedDecorationIds = model.modified.deltaDecorations(lastUnchangedRegions?.modifiedDecorationIds || [], newUnchangedRegions2.map(r => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: 'unchanged' } })));
            this._unchangedRegions.set({
                regions: newUnchangedRegions2,
                originalDecorationIds,
                modifiedDecorationIds
            }, tx);
        };
        this._register(model.modified.onDidChangeContent((e) => {
            const diff = this._diff.get();
            if (diff) {
                const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
                const result = applyModifiedEdits(this._lastDiff, textEdits, model.original, model.modified);
                if (result) {
                    this._lastDiff = result;
                    transaction(tx => {
                        this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
                        updateUnchangedRegions(result, tx);
                        const currentSyncedMovedText = this.movedTextToCompare.get();
                        this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
                    });
                }
            }
            this._isDiffUpToDate.set(false, undefined);
            debouncer.schedule();
        }));
        this._register(model.original.onDidChangeContent((e) => {
            const diff = this._diff.get();
            if (diff) {
                const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
                const result = applyOriginalEdits(this._lastDiff, textEdits, model.original, model.modified);
                if (result) {
                    this._lastDiff = result;
                    transaction(tx => {
                        this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
                        updateUnchangedRegions(result, tx);
                        const currentSyncedMovedText = this.movedTextToCompare.get();
                        this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
                    });
                }
            }
            this._isDiffUpToDate.set(false, undefined);
            debouncer.schedule();
        }));
        this._register(autorunWithStore(async (reader, store) => {
            /** @description compute diff */
            // So that they get recomputed when these settings change
            this._options.hideUnchangedRegionsMinimumLineCount.read(reader);
            this._options.hideUnchangedRegionsContextLineCount.read(reader);
            debouncer.cancel();
            contentChangedSignal.read(reader);
            const documentDiffProvider = this._diffProvider.read(reader);
            documentDiffProvider.onChangeSignal.read(reader);
            readHotReloadableExport(DefaultLinesDiffComputer, reader);
            readHotReloadableExport(optimizeSequenceDiffs, reader);
            this._isDiffUpToDate.set(false, undefined);
            let originalTextEditInfos = [];
            store.add(model.original.onDidChangeContent((e) => {
                const edits = TextEditInfo.fromModelContentChanges(e.changes);
                originalTextEditInfos = combineTextEditInfos(originalTextEditInfos, edits);
            }));
            let modifiedTextEditInfos = [];
            store.add(model.modified.onDidChangeContent((e) => {
                const edits = TextEditInfo.fromModelContentChanges(e.changes);
                modifiedTextEditInfos = combineTextEditInfos(modifiedTextEditInfos, edits);
            }));
            let result = await documentDiffProvider.diffProvider.computeDiff(model.original, model.modified, {
                ignoreTrimWhitespace: this._options.ignoreTrimWhitespace.read(reader),
                maxComputationTimeMs: this._options.maxComputationTimeMs.read(reader),
                computeMoves: this._options.showMoves.read(reader),
            }, this._cancellationTokenSource.token);
            if (this._cancellationTokenSource.token.isCancellationRequested) {
                return;
            }
            if (model.original.isDisposed() || model.modified.isDisposed()) {
                // TODO@hediet fishy?
                return;
            }
            result = normalizeDocumentDiff(result, model.original, model.modified);
            result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified) ?? result;
            result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified) ?? result;
            transaction(tx => {
                /** @description write diff result */
                updateUnchangedRegions(result, tx);
                this._lastDiff = result;
                const state = DiffState.fromDiffResult(result);
                this._diff.set(state, tx);
                this._isDiffUpToDate.set(true, tx);
                const currentSyncedMovedText = this.movedTextToCompare.read(undefined);
                this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
            });
        }));
    }
    ensureModifiedLineIsVisible(lineNumber, preference, tx) {
        if (this.diff.get()?.mappings.length === 0) {
            return;
        }
        const unchangedRegions = this._unchangedRegions.get()?.regions || [];
        for (const r of unchangedRegions) {
            if (r.getHiddenModifiedRange(undefined).contains(lineNumber)) {
                r.showModifiedLine(lineNumber, preference, tx);
                return;
            }
        }
    }
    ensureOriginalLineIsVisible(lineNumber, preference, tx) {
        if (this.diff.get()?.mappings.length === 0) {
            return;
        }
        const unchangedRegions = this._unchangedRegions.get()?.regions || [];
        for (const r of unchangedRegions) {
            if (r.getHiddenOriginalRange(undefined).contains(lineNumber)) {
                r.showOriginalLine(lineNumber, preference, tx);
                return;
            }
        }
    }
    async waitForDiff() {
        await waitForState(this.isDiffUpToDate, s => s);
    }
    serializeState() {
        const regions = this._unchangedRegions.get();
        return {
            collapsedRegions: regions?.regions.map(r => ({ range: r.getHiddenModifiedRange(undefined).serialize() }))
        };
    }
    restoreSerializedState(state) {
        const ranges = state.collapsedRegions?.map(r => LineRange.deserialize(r.range));
        const regions = this._unchangedRegions.get();
        if (!regions || !ranges) {
            return;
        }
        transaction(tx => {
            for (const r of regions.regions) {
                for (const range of ranges) {
                    if (r.modifiedUnchangedRange.intersect(range)) {
                        r.setHiddenModifiedRange(range, tx);
                        break;
                    }
                }
            }
        });
    }
};
DiffEditorViewModel = __decorate([
    __param(2, IDiffProviderFactoryService)
], DiffEditorViewModel);
export { DiffEditorViewModel };
function normalizeDocumentDiff(diff, original, modified) {
    return {
        changes: diff.changes.map(c => new DetailedLineRangeMapping(c.original, c.modified, c.innerChanges ? c.innerChanges.map(i => normalizeRangeMapping(i, original, modified)) : undefined)),
        moves: diff.moves,
        identical: diff.identical,
        quitEarly: diff.quitEarly,
    };
}
function normalizeRangeMapping(rangeMapping, original, modified) {
    let originalRange = rangeMapping.originalRange;
    let modifiedRange = rangeMapping.modifiedRange;
    if (originalRange.startColumn === 1 && modifiedRange.startColumn === 1 &&
        (originalRange.endColumn !== 1 || modifiedRange.endColumn !== 1) &&
        originalRange.endColumn === original.getLineMaxColumn(originalRange.endLineNumber)
        && modifiedRange.endColumn === modified.getLineMaxColumn(modifiedRange.endLineNumber)
        && originalRange.endLineNumber < original.getLineCount()
        && modifiedRange.endLineNumber < modified.getLineCount()) {
        originalRange = originalRange.setEndPosition(originalRange.endLineNumber + 1, 1);
        modifiedRange = modifiedRange.setEndPosition(modifiedRange.endLineNumber + 1, 1);
    }
    return new RangeMapping(originalRange, modifiedRange);
}
export class DiffState {
    static fromDiffResult(result) {
        return new DiffState(result.changes.map(c => new DiffMapping(c)), result.moves || [], result.identical, result.quitEarly);
    }
    constructor(mappings, movedTexts, identical, quitEarly) {
        this.mappings = mappings;
        this.movedTexts = movedTexts;
        this.identical = identical;
        this.quitEarly = quitEarly;
    }
}
export class DiffMapping {
    constructor(lineRangeMapping) {
        this.lineRangeMapping = lineRangeMapping;
        /*
        readonly movedTo: MovedText | undefined,
        readonly movedFrom: MovedText | undefined,

        if (movedTo) {
            assertFn(() =>
                movedTo.lineRangeMapping.modifiedRange.equals(lineRangeMapping.modifiedRange)
                && lineRangeMapping.originalRange.isEmpty
                && !movedFrom
            );
        } else if (movedFrom) {
            assertFn(() =>
                movedFrom.lineRangeMapping.originalRange.equals(lineRangeMapping.originalRange)
                && lineRangeMapping.modifiedRange.isEmpty
                && !movedTo
            );
        }
        */
    }
}
export class UnchangedRegion {
    static fromDiffs(changes, originalLineCount, modifiedLineCount, minHiddenLineCount, minContext) {
        const inversedMappings = DetailedLineRangeMapping.inverse(changes, originalLineCount, modifiedLineCount);
        const result = [];
        for (const mapping of inversedMappings) {
            let origStart = mapping.original.startLineNumber;
            let modStart = mapping.modified.startLineNumber;
            let length = mapping.original.length;
            const atStart = origStart === 1 && modStart === 1;
            const atEnd = origStart + length === originalLineCount + 1 && modStart + length === modifiedLineCount + 1;
            if ((atStart || atEnd) && length >= minContext + minHiddenLineCount) {
                if (atStart && !atEnd) {
                    length -= minContext;
                }
                if (atEnd && !atStart) {
                    origStart += minContext;
                    modStart += minContext;
                    length -= minContext;
                }
                result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
            }
            else if (length >= minContext * 2 + minHiddenLineCount) {
                origStart += minContext;
                modStart += minContext;
                length -= minContext * 2;
                result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
            }
        }
        return result;
    }
    get originalUnchangedRange() {
        return LineRange.ofLength(this.originalLineNumber, this.lineCount);
    }
    get modifiedUnchangedRange() {
        return LineRange.ofLength(this.modifiedLineNumber, this.lineCount);
    }
    constructor(originalLineNumber, modifiedLineNumber, lineCount, visibleLineCountTop, visibleLineCountBottom) {
        this.originalLineNumber = originalLineNumber;
        this.modifiedLineNumber = modifiedLineNumber;
        this.lineCount = lineCount;
        this._visibleLineCountTop = observableValue(this, 0);
        this.visibleLineCountTop = this._visibleLineCountTop;
        this._visibleLineCountBottom = observableValue(this, 0);
        this.visibleLineCountBottom = this._visibleLineCountBottom;
        this._shouldHideControls = derived(this, reader => /** @description isVisible */ this.visibleLineCountTop.read(reader) + this.visibleLineCountBottom.read(reader) === this.lineCount && !this.isDragged.read(reader));
        this.isDragged = observableValue(this, undefined);
        const visibleLineCountTop2 = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
        const visibleLineCountBottom2 = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
        softAssert(visibleLineCountTop === visibleLineCountTop2);
        softAssert(visibleLineCountBottom === visibleLineCountBottom2);
        this._visibleLineCountTop.set(visibleLineCountTop2, undefined);
        this._visibleLineCountBottom.set(visibleLineCountBottom2, undefined);
    }
    setVisibleRanges(visibleRanges, tx) {
        const result = [];
        const hiddenModified = new LineRangeSet(visibleRanges.map(r => r.modified)).subtractFrom(this.modifiedUnchangedRange);
        let originalStartLineNumber = this.originalLineNumber;
        let modifiedStartLineNumber = this.modifiedLineNumber;
        const modifiedEndLineNumberEx = this.modifiedLineNumber + this.lineCount;
        if (hiddenModified.ranges.length === 0) {
            this.showAll(tx);
            result.push(this);
        }
        else {
            let i = 0;
            for (const r of hiddenModified.ranges) {
                const isLast = i === hiddenModified.ranges.length - 1;
                i++;
                const length = (isLast ? modifiedEndLineNumberEx : r.endLineNumberExclusive) - modifiedStartLineNumber;
                const newR = new UnchangedRegion(originalStartLineNumber, modifiedStartLineNumber, length, 0, 0);
                newR.setHiddenModifiedRange(r, tx);
                result.push(newR);
                originalStartLineNumber = newR.originalUnchangedRange.endLineNumberExclusive;
                modifiedStartLineNumber = newR.modifiedUnchangedRange.endLineNumberExclusive;
            }
        }
        return result;
    }
    shouldHideControls(reader) {
        return this._shouldHideControls.read(reader);
    }
    getHiddenOriginalRange(reader) {
        return LineRange.ofLength(this.originalLineNumber + this._visibleLineCountTop.read(reader), this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader));
    }
    getHiddenModifiedRange(reader) {
        return LineRange.ofLength(this.modifiedLineNumber + this._visibleLineCountTop.read(reader), this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader));
    }
    setHiddenModifiedRange(range, tx) {
        const visibleLineCountTop = range.startLineNumber - this.modifiedLineNumber;
        const visibleLineCountBottom = (this.modifiedLineNumber + this.lineCount) - range.endLineNumberExclusive;
        this.setState(visibleLineCountTop, visibleLineCountBottom, tx);
    }
    getMaxVisibleLineCountTop() {
        return this.lineCount - this._visibleLineCountBottom.get();
    }
    getMaxVisibleLineCountBottom() {
        return this.lineCount - this._visibleLineCountTop.get();
    }
    showMoreAbove(count = 10, tx) {
        const maxVisibleLineCountTop = this.getMaxVisibleLineCountTop();
        this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + count, maxVisibleLineCountTop), tx);
    }
    showMoreBelow(count = 10, tx) {
        const maxVisibleLineCountBottom = this.lineCount - this._visibleLineCountTop.get();
        this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + count, maxVisibleLineCountBottom), tx);
    }
    showAll(tx) {
        this._visibleLineCountBottom.set(this.lineCount - this._visibleLineCountTop.get(), tx);
    }
    showModifiedLine(lineNumber, preference, tx) {
        const top = lineNumber + 1 - (this.modifiedLineNumber + this._visibleLineCountTop.get());
        const bottom = (this.modifiedLineNumber - this._visibleLineCountBottom.get() + this.lineCount) - lineNumber;
        if (preference === 0 /* RevealPreference.FromCloserSide */ && top < bottom || preference === 1 /* RevealPreference.FromTop */) {
            this._visibleLineCountTop.set(this._visibleLineCountTop.get() + top, tx);
        }
        else {
            this._visibleLineCountBottom.set(this._visibleLineCountBottom.get() + bottom, tx);
        }
    }
    showOriginalLine(lineNumber, preference, tx) {
        const top = lineNumber - this.originalLineNumber;
        const bottom = (this.originalLineNumber + this.lineCount) - lineNumber;
        if (preference === 0 /* RevealPreference.FromCloserSide */ && top < bottom || preference === 1 /* RevealPreference.FromTop */) {
            this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + bottom - top, this.getMaxVisibleLineCountTop()), tx);
        }
        else {
            this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + top - bottom, this.getMaxVisibleLineCountBottom()), tx);
        }
    }
    collapseAll(tx) {
        this._visibleLineCountTop.set(0, tx);
        this._visibleLineCountBottom.set(0, tx);
    }
    setState(visibleLineCountTop, visibleLineCountBottom, tx) {
        visibleLineCountTop = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
        visibleLineCountBottom = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
        this._visibleLineCountTop.set(visibleLineCountTop, tx);
        this._visibleLineCountBottom.set(visibleLineCountBottom, tx);
    }
}
export var RevealPreference;
(function (RevealPreference) {
    RevealPreference[RevealPreference["FromCloserSide"] = 0] = "FromCloserSide";
    RevealPreference[RevealPreference["FromTop"] = 1] = "FromTop";
    RevealPreference[RevealPreference["FromBottom"] = 2] = "FromBottom";
})(RevealPreference || (RevealPreference = {}));
function applyOriginalEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
    return undefined;
    /*
    TODO@hediet
    if (textEdits.length === 0) {
        return diff;
    }

    const diff2 = flip(diff);
    const diff3 = applyModifiedEdits(diff2, textEdits, modifiedTextModel, originalTextModel);
    if (!diff3) {
        return undefined;
    }
    return flip(diff3);*/
}
/*
function flip(diff: IDocumentDiff): IDocumentDiff {
    return {
        changes: diff.changes.map(c => c.flip()),
        moves: diff.moves.map(m => m.flip()),
        identical: diff.identical,
        quitEarly: diff.quitEarly,
    };
}
*/
function applyModifiedEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
    return undefined;
    /*
    TODO@hediet
    if (textEdits.length === 0) {
        return diff;
    }
    if (diff.changes.some(c => !c.innerChanges) || diff.moves.length > 0) {
        // TODO support these cases
        return undefined;
    }

    const changes = applyModifiedEditsToLineRangeMappings(diff.changes, textEdits, originalTextModel, modifiedTextModel);

    const moves = diff.moves.map(m => {
        const newModifiedRange = applyEditToLineRange(m.lineRangeMapping.modified, textEdits);
        return newModifiedRange ? new MovedText(
            new SimpleLineRangeMapping(m.lineRangeMapping.original, newModifiedRange),
            applyModifiedEditsToLineRangeMappings(m.changes, textEdits, originalTextModel, modifiedTextModel),
        ) : undefined;
    }).filter(isDefined);

    return {
        identical: false,
        quitEarly: false,
        changes,
        moves,
    };*/
}
/*
function applyEditToLineRange(range: LineRange, textEdits: TextEditInfo[]): LineRange | undefined {
    let rangeStartLineNumber = range.startLineNumber;
    let rangeEndLineNumberEx = range.endLineNumberExclusive;

    for (let i = textEdits.length - 1; i >= 0; i--) {
        const textEdit = textEdits[i];
        const textEditStartLineNumber = lengthGetLineCount(textEdit.startOffset) + 1;
        const textEditEndLineNumber = lengthGetLineCount(textEdit.endOffset) + 1;
        const newLengthLineCount = lengthGetLineCount(textEdit.newLength);
        const delta = newLengthLineCount - (textEditEndLineNumber - textEditStartLineNumber);

        if (textEditEndLineNumber < rangeStartLineNumber) {
            // the text edit is before us
            rangeStartLineNumber += delta;
            rangeEndLineNumberEx += delta;
        } else if (textEditStartLineNumber > rangeEndLineNumberEx) {
            // the text edit is after us
            // NOOP
        } else if (textEditStartLineNumber < rangeStartLineNumber && rangeEndLineNumberEx < textEditEndLineNumber) {
            // the range is fully contained in the text edit
            return undefined;
        } else if (textEditStartLineNumber < rangeStartLineNumber && textEditEndLineNumber <= rangeEndLineNumberEx) {
            // the text edit ends inside our range
            rangeStartLineNumber = textEditEndLineNumber + 1;
            rangeStartLineNumber += delta;
            rangeEndLineNumberEx += delta;
        } else if (rangeStartLineNumber <= textEditStartLineNumber && textEditEndLineNumber < rangeStartLineNumber) {
            // the text edit starts inside our range
            rangeEndLineNumberEx = textEditStartLineNumber;
        } else {
            rangeEndLineNumberEx += delta;
        }
    }

    return new LineRange(rangeStartLineNumber, rangeEndLineNumberEx);
}

function applyModifiedEditsToLineRangeMappings(changes: readonly LineRangeMapping[], textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): LineRangeMapping[] {
    const diffTextEdits = changes.flatMap(c => c.innerChanges!.map(c => new TextEditInfo(
        positionToLength(c.originalRange.getStartPosition()),
        positionToLength(c.originalRange.getEndPosition()),
        lengthOfRange(c.modifiedRange).toLength(),
    )));

    const combined = combineTextEditInfos(diffTextEdits, textEdits);

    let lastOriginalEndOffset = lengthZero;
    let lastModifiedEndOffset = lengthZero;
    const rangeMappings = combined.map(c => {
        const modifiedStartOffset = lengthAdd(lastModifiedEndOffset, lengthDiffNonNegative(lastOriginalEndOffset, c.startOffset));
        lastOriginalEndOffset = c.endOffset;
        lastModifiedEndOffset = lengthAdd(modifiedStartOffset, c.newLength);

        return new RangeMapping(
            Range.fromPositions(lengthToPosition(c.startOffset), lengthToPosition(c.endOffset)),
            Range.fromPositions(lengthToPosition(modifiedStartOffset), lengthToPosition(lastModifiedEndOffset)),
        );
    });

    const newChanges = lineRangeMappingFromRangeMappings(
        rangeMappings,
        originalTextModel.getLinesContent(),
        modifiedTextModel.getLinesContent(),
    );
    return newChanges;
}
*/
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvclZpZXdNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JWaWV3TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLEVBQTJELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3TyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEYsT0FBTyxFQUF3QixTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFHckgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2hILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4RkFBOEYsQ0FBQztBQUM1SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwRkFBMEYsQ0FBQztBQUVoSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpRkFBaUYsQ0FBQztBQUN4SCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFnQzNDLGtCQUFrQixDQUFDLFNBQWdDO1FBQ3pELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxTQUFnQztRQUMxRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBZUQsWUFDaUIsS0FBdUIsRUFDdEIsUUFBMkIsRUFDZiwyQkFBeUU7UUFFdEcsS0FBSyxFQUFFLENBQUM7UUFKUSxVQUFLLEdBQUwsS0FBSyxDQUFrQjtRQUN0QixhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQUNFLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBNkI7UUF2RHRGLG9CQUFlLEdBQUcsZUFBZSxDQUFVLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxtQkFBYyxHQUF5QixJQUFJLENBQUMsZUFBZSxDQUFDO1FBRzNELFVBQUssR0FBRyxlQUFlLENBQXdCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNqRSxTQUFJLEdBQXVDLElBQUksQ0FBQyxLQUFLLENBQUM7UUFFckQsc0JBQWlCLEdBQUcsZUFBZSxDQUErRyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEsscUJBQWdCLEdBQW1DLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDcEYsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNoRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQztZQUN0RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsY0FBYztnQkFDZCxXQUFXLENBQUMsRUFBRSxDQUFDLEVBQUU7b0JBQ2hCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLElBQUksRUFBRSxFQUFFLENBQUM7d0JBQ3ZFLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ25CLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1FBQ0YsQ0FBQyxDQUNBLENBQUM7UUFFYyx1QkFBa0IsR0FBRyxlQUFlLENBQXdCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU1RSxxQkFBZ0IsR0FBRyxlQUFlLENBQXdCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMzRSxzQkFBaUIsR0FBRyxlQUFlLENBQXdCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUc3RSxvQkFBZSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBVXhJLDZCQUF3QixHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUV6RCxrQkFBYSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDdkQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGtCQUFrQixDQUFDO2dCQUN4RSxhQUFhLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzthQUN2RCxDQUFDLENBQUM7WUFDSCxNQUFNLGNBQWMsR0FBRyx5QkFBeUIsQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzFGLE9BQU87Z0JBQ04sWUFBWTtnQkFDWixjQUFjO2FBQ2QsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBU0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzRSxNQUFNLG9CQUFvQixHQUFHLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDdEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTNHLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLHNEQUFzRDtZQUV0RCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakUsSUFBSSxDQUFDLG9CQUFvQixJQUFJLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQy9GLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSw4QkFBOEIsR0FBRyxvQkFBb0IsQ0FBQyxxQkFBcUI7aUJBQy9FLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ2hELEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM1RCxNQUFNLDZCQUE2QixHQUFHLG9CQUFvQixDQUFDLHFCQUFxQjtpQkFDOUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztpQkFDaEQsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sMkJBQTJCLEdBQUcsb0JBQW9CLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUMvRSxDQUFDLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDMUYsSUFBSSxlQUFlLENBQ2xCLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxDQUFDLGVBQWUsRUFDbkQsNkJBQTZCLENBQUMsR0FBRyxDQUFDLENBQUMsZUFBZSxFQUNsRCw4QkFBOEIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQzFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQ2xDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQ3JDLENBQUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFdkIsTUFBTSxTQUFTLEdBQXNCLEVBQUUsQ0FBQztZQUV4QyxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDdEIsS0FBSyxNQUFNLFFBQVEsSUFBSSxlQUFlLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUMsc0JBQXNCLEtBQUssQ0FBQyxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7Z0JBQzdMLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDekIsU0FBUyxHQUFHLElBQUksQ0FBQztvQkFDakIsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUN2RSxNQUFNLENBQUMsR0FBRyxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUNuTyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLE1BQU0scUJBQXFCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDNUQsb0JBQW9CLENBQUMscUJBQXFCLEVBQzFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsRUFBRyxFQUFFLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDcEgsQ0FBQztnQkFDRixNQUFNLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQzVELG9CQUFvQixDQUFDLHFCQUFxQixFQUMxQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsc0JBQXNCLENBQUMsZ0JBQWdCLEVBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQ3BILENBQUM7Z0JBRUYsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUNoQixJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUN6Qjt3QkFDQyxPQUFPLEVBQUUsU0FBUzt3QkFDbEIscUJBQXFCO3dCQUNyQixxQkFBcUI7cUJBQ3JCLEVBQ0QsRUFBRSxDQUNGLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxNQUFxQixFQUFFLEVBQWdCLEVBQUUsTUFBZ0IsRUFBRSxFQUFFO1lBQzVGLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFDLFNBQVMsQ0FDcEQsTUFBTSxDQUFDLE9BQU8sRUFDZCxLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxFQUM3QixLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxFQUM3QixJQUFJLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFDL0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQy9ELENBQUM7WUFFRixnQ0FBZ0M7WUFDaEMsSUFBSSxjQUFjLEdBQW1DLFNBQVMsQ0FBQztZQUUvRCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUMxRCxJQUFJLG9CQUFvQixFQUFFLENBQUM7Z0JBQzFCLE1BQU0sOEJBQThCLEdBQUcsb0JBQW9CLENBQUMscUJBQXFCO3FCQUMvRSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNoRCxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzVELE1BQU0sNkJBQTZCLEdBQUcsb0JBQW9CLENBQUMscUJBQXFCO3FCQUM5RSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUNoRCxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzVELE1BQU0sMkJBQTJCLEdBQUcsa0JBQWtCLENBQ3JELG9CQUFvQixDQUFDLE9BQU87cUJBQzFCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRTtvQkFDZixJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUFDLE9BQU8sU0FBUyxDQUFDO29CQUFDLENBQUM7b0JBQ3RHLE1BQU0sTUFBTSxHQUFHLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztvQkFDMUQsT0FBTyxJQUFJLGVBQWUsQ0FDekIsOEJBQThCLENBQUMsR0FBRyxDQUFDLENBQUMsZUFBZSxFQUNuRCw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLEVBQ2xELE1BQU07b0JBQ04sc0VBQXNFO29CQUN0RSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFDN0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUM5RSxDQUFDO2dCQUNILENBQUMsQ0FDQSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFDcEIsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FDbEssQ0FBQztnQkFFRixJQUFJLGFBQWEsR0FBRywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuSixhQUFhLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pLLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lBQ3hILENBQUM7WUFFRCxNQUFNLG9CQUFvQixHQUFHLEVBQUUsQ0FBQztZQUNoQyxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixLQUFLLE1BQU0sQ0FBQyxJQUFJLG1CQUFtQixFQUFFLENBQUM7b0JBQ3JDLE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztvQkFDaEssb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLG1CQUFtQixDQUFDLENBQUM7WUFDbkQsQ0FBQztZQUVELE1BQU0scUJBQXFCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDNUQsb0JBQW9CLEVBQUUscUJBQXFCLElBQUksRUFBRSxFQUNqRCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsRUFBRyxFQUFFLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDL0gsQ0FBQztZQUNGLE1BQU0scUJBQXFCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FDNUQsb0JBQW9CLEVBQUUscUJBQXFCLElBQUksRUFBRSxFQUNqRCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsRUFBRyxFQUFFLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDL0gsQ0FBQztZQUVGLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQ3pCO2dCQUNDLE9BQU8sRUFBRSxvQkFBb0I7Z0JBQzdCLHFCQUFxQjtnQkFDckIscUJBQXFCO2FBQ3JCLEVBQ0QsRUFBRSxDQUNGLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUN0RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzlCLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVUsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzlGLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1osSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7b0JBQ3hCLFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRTt3QkFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBVSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQzlELHNCQUFzQixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQzt3QkFDbkMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQzdELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLHNCQUFzQixDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDaE0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0MsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUN0RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzlCLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ1YsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVUsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzlGLElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1osSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7b0JBQ3hCLFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRTt3QkFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBVSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQzlELHNCQUFzQixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQzt3QkFDbkMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQzdELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLHNCQUFzQixDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDaE0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0MsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDdkQsZ0NBQWdDO1lBRWhDLHlEQUF5RDtZQUN6RCxJQUFJLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRSxJQUFJLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVoRSxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDN0Qsb0JBQW9CLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVqRCx1QkFBdUIsQ0FBQyx3QkFBd0IsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMxRCx1QkFBdUIsQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUV2RCxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFM0MsSUFBSSxxQkFBcUIsR0FBbUIsRUFBRSxDQUFDO1lBQy9DLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUNqRCxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM5RCxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1RSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxxQkFBcUIsR0FBbUIsRUFBRSxDQUFDO1lBQy9DLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUNqRCxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM5RCxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1RSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxNQUFNLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRTtnQkFDaEcsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO2dCQUNyRSxvQkFBb0IsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQ3JFLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO2FBQ2xELEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXhDLElBQUksSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNqRSxPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7Z0JBQ2hFLHFCQUFxQjtnQkFDckIsT0FBTztZQUNSLENBQUM7WUFDRCxNQUFNLEdBQUcscUJBQXFCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFDO1lBQ3JHLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksTUFBTSxDQUFDO1lBRXJHLFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDaEIscUNBQXFDO2dCQUNyQyxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBRW5DLElBQUksQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO2dCQUN4QixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMvQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDbkMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN2RSxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDL0wsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVNLDJCQUEyQixDQUFDLFVBQWtCLEVBQUUsVUFBNEIsRUFBRSxFQUE0QjtRQUNoSCxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM1QyxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFDckUsS0FBSyxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUM5RCxDQUFDLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDL0MsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVNLDJCQUEyQixDQUFDLFVBQWtCLEVBQUUsVUFBNEIsRUFBRSxFQUE0QjtRQUNoSCxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM1QyxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFDckUsS0FBSyxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUM5RCxDQUFDLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDL0MsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVNLEtBQUssQ0FBQyxXQUFXO1FBQ3ZCLE1BQU0sWUFBWSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU0sY0FBYztRQUNwQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDN0MsT0FBTztZQUNOLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ3pHLENBQUM7SUFDSCxDQUFDO0lBRU0sc0JBQXNCLENBQUMsS0FBc0I7UUFDbkQsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN6QixPQUFPO1FBQ1IsQ0FBQztRQUNELFdBQVcsQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNoQixLQUFLLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDNUIsSUFBSSxDQUFDLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7d0JBQy9DLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7d0JBQ3BDLE1BQU07b0JBQ1AsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUE5VlksbUJBQW1CO0lBd0Q3QixXQUFBLDJCQUEyQixDQUFBO0dBeERqQixtQkFBbUIsQ0E4Vi9COztBQUVELFNBQVMscUJBQXFCLENBQUMsSUFBbUIsRUFBRSxRQUFvQixFQUFFLFFBQW9CO0lBQzdGLE9BQU87UUFDTixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLHdCQUF3QixDQUMxRCxDQUFDLENBQUMsUUFBUSxFQUNWLENBQUMsQ0FBQyxRQUFRLEVBQ1YsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FDbEcsQ0FBQztRQUNGLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7UUFDekIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO0tBQ3pCLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxZQUEwQixFQUFFLFFBQW9CLEVBQUUsUUFBb0I7SUFDcEcsSUFBSSxhQUFhLEdBQUcsWUFBWSxDQUFDLGFBQWEsQ0FBQztJQUMvQyxJQUFJLGFBQWEsR0FBRyxZQUFZLENBQUMsYUFBYSxDQUFDO0lBQy9DLElBQ0MsYUFBYSxDQUFDLFdBQVcsS0FBSyxDQUFDLElBQUksYUFBYSxDQUFDLFdBQVcsS0FBSyxDQUFDO1FBQ2xFLENBQUMsYUFBYSxDQUFDLFNBQVMsS0FBSyxDQUFDLElBQUksYUFBYSxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUM7UUFDaEUsYUFBYSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQztXQUMvRSxhQUFhLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDO1dBQ2xGLGFBQWEsQ0FBQyxhQUFhLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBRTtXQUNyRCxhQUFhLENBQUMsYUFBYSxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsRUFDdkQsQ0FBQztRQUNGLGFBQWEsR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLGFBQWEsR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFDRCxPQUFPLElBQUksWUFBWSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUN2RCxDQUFDO0FBTUQsTUFBTSxPQUFPLFNBQVM7SUFDZCxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQXFCO1FBQ2pELE9BQU8sSUFBSSxTQUFTLENBQ25CLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDM0MsTUFBTSxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQ2xCLE1BQU0sQ0FBQyxTQUFTLEVBQ2hCLE1BQU0sQ0FBQyxTQUFTLENBQ2hCLENBQUM7SUFDSCxDQUFDO0lBRUQsWUFDaUIsUUFBZ0MsRUFDaEMsVUFBZ0MsRUFDaEMsU0FBa0IsRUFDbEIsU0FBa0I7UUFIbEIsYUFBUSxHQUFSLFFBQVEsQ0FBd0I7UUFDaEMsZUFBVSxHQUFWLFVBQVUsQ0FBc0I7UUFDaEMsY0FBUyxHQUFULFNBQVMsQ0FBUztRQUNsQixjQUFTLEdBQVQsU0FBUyxDQUFTO0lBQy9CLENBQUM7Q0FDTDtBQUVELE1BQU0sT0FBTyxXQUFXO0lBQ3ZCLFlBQ1UsZ0JBQTBDO1FBQTFDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBMEI7UUFFbkQ7Ozs7Ozs7Ozs7Ozs7Ozs7O1VBaUJFO0lBQ0gsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGVBQWU7SUFDcEIsTUFBTSxDQUFDLFNBQVMsQ0FDdEIsT0FBNEMsRUFDNUMsaUJBQXlCLEVBQ3pCLGlCQUF5QixFQUN6QixrQkFBMEIsRUFDMUIsVUFBa0I7UUFFbEIsTUFBTSxnQkFBZ0IsR0FBRyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDekcsTUFBTSxNQUFNLEdBQXNCLEVBQUUsQ0FBQztRQUVyQyxLQUFLLE1BQU0sT0FBTyxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDeEMsSUFBSSxTQUFTLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7WUFDakQsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7WUFDaEQsSUFBSSxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFFckMsTUFBTSxPQUFPLEdBQUcsU0FBUyxLQUFLLENBQUMsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO1lBQ2xELE1BQU0sS0FBSyxHQUFHLFNBQVMsR0FBRyxNQUFNLEtBQUssaUJBQWlCLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxNQUFNLEtBQUssaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO1lBRTFHLElBQUksQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksTUFBTSxJQUFJLFVBQVUsR0FBRyxrQkFBa0IsRUFBRSxDQUFDO2dCQUNyRSxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN2QixNQUFNLElBQUksVUFBVSxDQUFDO2dCQUN0QixDQUFDO2dCQUNELElBQUksS0FBSyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3ZCLFNBQVMsSUFBSSxVQUFVLENBQUM7b0JBQ3hCLFFBQVEsSUFBSSxVQUFVLENBQUM7b0JBQ3ZCLE1BQU0sSUFBSSxVQUFVLENBQUM7Z0JBQ3RCLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLGVBQWUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyRSxDQUFDO2lCQUFNLElBQUksTUFBTSxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsa0JBQWtCLEVBQUUsQ0FBQztnQkFDMUQsU0FBUyxJQUFJLFVBQVUsQ0FBQztnQkFDeEIsUUFBUSxJQUFJLFVBQVUsQ0FBQztnQkFDdkIsTUFBTSxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxlQUFlLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckUsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxJQUFXLHNCQUFzQjtRQUNoQyxPQUFPLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsSUFBVyxzQkFBc0I7UUFDaEMsT0FBTyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQWFELFlBQ2lCLGtCQUEwQixFQUMxQixrQkFBMEIsRUFDMUIsU0FBaUIsRUFDakMsbUJBQTJCLEVBQzNCLHNCQUE4QjtRQUpkLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBUTtRQUMxQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQVE7UUFDMUIsY0FBUyxHQUFULFNBQVMsQ0FBUTtRQWRqQix5QkFBb0IsR0FBRyxlQUFlLENBQVMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pELHdCQUFtQixHQUFnQyxJQUFJLENBQUMsb0JBQW9CLENBQUM7UUFFNUUsNEJBQXVCLEdBQUcsZUFBZSxDQUFTLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RCwyQkFBc0IsR0FBZ0MsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBRWxGLHdCQUFtQixHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyw2QkFBNkIsQ0FDM0YsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBRXRILGNBQVMsR0FBRyxlQUFlLENBQStCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQVMxRixNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEYsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXBILFVBQVUsQ0FBQyxtQkFBbUIsS0FBSyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3pELFVBQVUsQ0FBQyxzQkFBc0IsS0FBSyx1QkFBdUIsQ0FBQyxDQUFDO1FBRS9ELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRU0sZ0JBQWdCLENBQUMsYUFBaUMsRUFBRSxFQUFnQjtRQUMxRSxNQUFNLE1BQU0sR0FBc0IsRUFBRSxDQUFDO1FBRXJDLE1BQU0sY0FBYyxHQUFHLElBQUksWUFBWSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFFdEgsSUFBSSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUM7UUFDdEQsSUFBSSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUM7UUFDdEQsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUN6RSxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNWLEtBQUssTUFBTSxDQUFDLElBQUksY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUN2QyxNQUFNLE1BQU0sR0FBRyxDQUFDLEtBQUssY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDLEVBQUUsQ0FBQztnQkFFSixNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLHVCQUF1QixDQUFDO2dCQUV2RyxNQUFNLElBQUksR0FBRyxJQUFJLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNqRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUVsQix1QkFBdUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsc0JBQXNCLENBQUM7Z0JBQzdFLHVCQUF1QixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUM5RSxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVNLGtCQUFrQixDQUFDLE1BQTJCO1FBQ3BELE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sc0JBQXNCLENBQUMsTUFBMkI7UUFDeEQsT0FBTyxTQUFTLENBQUMsUUFBUSxDQUN4QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFDaEUsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQ25HLENBQUM7SUFDSCxDQUFDO0lBRU0sc0JBQXNCLENBQUMsTUFBMkI7UUFDeEQsT0FBTyxTQUFTLENBQUMsUUFBUSxDQUN4QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFDaEUsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQ25HLENBQUM7SUFDSCxDQUFDO0lBRU0sc0JBQXNCLENBQUMsS0FBZ0IsRUFBRSxFQUFnQjtRQUMvRCxNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBQzVFLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQztRQUN6RyxJQUFJLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFTSx5QkFBeUI7UUFDL0IsT0FBTyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUM1RCxDQUFDO0lBRU0sNEJBQTRCO1FBQ2xDLE9BQU8sSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDekQsQ0FBQztJQUVNLGFBQWEsQ0FBQyxLQUFLLEdBQUcsRUFBRSxFQUFFLEVBQTRCO1FBQzVELE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDaEUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsR0FBRyxLQUFLLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM5RyxDQUFDO0lBRU0sYUFBYSxDQUFDLEtBQUssR0FBRyxFQUFFLEVBQUUsRUFBNEI7UUFDNUQsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNuRixJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZILENBQUM7SUFFTSxPQUFPLENBQUMsRUFBNEI7UUFDMUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4RixDQUFDO0lBRU0sZ0JBQWdCLENBQUMsVUFBa0IsRUFBRSxVQUE0QixFQUFFLEVBQTRCO1FBQ3JHLE1BQU0sR0FBRyxHQUFHLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDNUcsSUFBSSxVQUFVLDRDQUFvQyxJQUFJLEdBQUcsR0FBRyxNQUFNLElBQUksVUFBVSxxQ0FBNkIsRUFBRSxDQUFDO1lBQy9HLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRSxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxHQUFHLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRixDQUFDO0lBQ0YsQ0FBQztJQUVNLGdCQUFnQixDQUFDLFVBQWtCLEVBQUUsVUFBNEIsRUFBRSxFQUE0QjtRQUNyRyxNQUFNLEdBQUcsR0FBRyxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDO1FBQ2pELE1BQU0sTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxVQUFVLENBQUM7UUFDdkUsSUFBSSxVQUFVLDRDQUFvQyxJQUFJLEdBQUcsR0FBRyxNQUFNLElBQUksVUFBVSxxQ0FBNkIsRUFBRSxDQUFDO1lBQy9HLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFLEdBQUcsTUFBTSxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9ILENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLEdBQUcsTUFBTSxFQUFFLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEksQ0FBQztJQUNGLENBQUM7SUFFTSxXQUFXLENBQUMsRUFBNEI7UUFDOUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVNLFFBQVEsQ0FBQyxtQkFBMkIsRUFBRSxzQkFBOEIsRUFBRSxFQUE0QjtRQUN4RyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLHNCQUFzQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsU0FBUyxHQUFHLG1CQUFtQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFN0csSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzlELENBQUM7Q0FDRDtBQUVELE1BQU0sQ0FBTixJQUFrQixnQkFJakI7QUFKRCxXQUFrQixnQkFBZ0I7SUFDakMsMkVBQWMsQ0FBQTtJQUNkLDZEQUFPLENBQUE7SUFDUCxtRUFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUppQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBSWpDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxJQUFtQixFQUFFLFNBQXlCLEVBQUUsaUJBQTZCLEVBQUUsaUJBQTZCO0lBQ3ZJLE9BQU8sU0FBUyxDQUFDO0lBQ2pCOzs7Ozs7Ozs7Ozt5QkFXcUI7QUFDdEIsQ0FBQztBQUNEOzs7Ozs7Ozs7RUFTRTtBQUNGLFNBQVMsa0JBQWtCLENBQUMsSUFBbUIsRUFBRSxTQUF5QixFQUFFLGlCQUE2QixFQUFFLGlCQUE2QjtJQUN2SSxPQUFPLFNBQVMsQ0FBQztJQUNqQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztRQXlCSTtBQUNMLENBQUM7QUFDRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQW1FRSJ9