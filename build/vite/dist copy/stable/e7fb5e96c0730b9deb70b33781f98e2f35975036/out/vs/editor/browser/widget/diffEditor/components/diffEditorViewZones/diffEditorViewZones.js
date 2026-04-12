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
import { $, addDisposableListener } from '../../../../../../base/browser/dom.js';
import { ArrayQueue } from '../../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { assertReturnsDefined } from '../../../../../../base/common/types.js';
import { applyFontInfo } from '../../../../config/domFontInfo.js';
import { diffDeleteDecoration, diffRemoveIcon } from '../../registrations.contribution.js';
import { DiffMapping } from '../../diffEditorViewModel.js';
import { InlineDiffDeletedCodeMargin } from './inlineDiffDeletedCodeMargin.js';
import { LineSource, RenderOptions, renderLines } from './renderLines.js';
import { animatedObservable, joinCombine } from '../../utils.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { Range } from '../../../../../common/core/range.js';
import { InlineDecoration } from '../../../../../common/viewModel/inlineDecorations.js';
/**
 * Ensures both editors have the same height by aligning unchanged lines.
 * In inline view mode, inserts viewzones to show deleted code from the original text model in the modified code editor.
 * Synchronizes scrolling.
 *
 * Make sure to add the view zones!
 */
let DiffEditorViewZones = class DiffEditorViewZones extends Disposable {
    constructor(_targetWindow, _editors, _diffModel, _options, _diffEditorWidget, _canIgnoreViewZoneUpdateEvent, _origViewZonesToIgnore, _modViewZonesToIgnore, _clipboardService, _contextMenuService) {
        super();
        this._targetWindow = _targetWindow;
        this._editors = _editors;
        this._diffModel = _diffModel;
        this._options = _options;
        this._diffEditorWidget = _diffEditorWidget;
        this._canIgnoreViewZoneUpdateEvent = _canIgnoreViewZoneUpdateEvent;
        this._origViewZonesToIgnore = _origViewZonesToIgnore;
        this._modViewZonesToIgnore = _modViewZonesToIgnore;
        this._clipboardService = _clipboardService;
        this._contextMenuService = _contextMenuService;
        this._originalTopPadding = observableValue(this, 0);
        this._originalScrollOffset = observableValue(this, 0);
        this._originalScrollOffsetAnimated = animatedObservable(this._targetWindow, this._originalScrollOffset, this._store);
        this._modifiedTopPadding = observableValue(this, 0);
        this._modifiedScrollOffset = observableValue(this, 0);
        this._modifiedScrollOffsetAnimated = animatedObservable(this._targetWindow, this._modifiedScrollOffset, this._store);
        const state = observableValue('invalidateAlignmentsState', 0);
        const updateImmediately = this._register(new RunOnceScheduler(() => {
            state.set(state.get() + 1, undefined);
        }, 0));
        this._register(this._editors.original.onDidChangeViewZones((_args) => { if (!this._canIgnoreViewZoneUpdateEvent()) {
            updateImmediately.schedule();
        } }));
        this._register(this._editors.modified.onDidChangeViewZones((_args) => { if (!this._canIgnoreViewZoneUpdateEvent()) {
            updateImmediately.schedule();
        } }));
        this._register(this._editors.original.onDidChangeConfiguration((args) => {
            if (args.hasChanged(166 /* EditorOption.wrappingInfo */) || args.hasChanged(75 /* EditorOption.lineHeight */)) {
                updateImmediately.schedule();
            }
        }));
        this._register(this._editors.modified.onDidChangeConfiguration((args) => {
            if (args.hasChanged(166 /* EditorOption.wrappingInfo */) || args.hasChanged(75 /* EditorOption.lineHeight */)) {
                updateImmediately.schedule();
            }
        }));
        const originalModelTokenizationCompleted = this._diffModel.map(m => m ? observableFromEvent(this, m.model.original.onDidChangeTokens, () => m.model.original.tokenization.backgroundTokenizationState === 2 /* BackgroundTokenizationState.Completed */) : undefined).map((m, reader) => m?.read(reader));
        const alignments = derived((reader) => {
            /** @description alignments */
            const diffModel = this._diffModel.read(reader);
            const diff = diffModel?.diff.read(reader);
            if (!diffModel || !diff) {
                return null;
            }
            state.read(reader);
            const renderSideBySide = this._options.renderSideBySide.read(reader);
            const innerHunkAlignment = renderSideBySide;
            return computeRangeAlignment(this._editors.original, this._editors.modified, diff.mappings, this._origViewZonesToIgnore, this._modViewZonesToIgnore, innerHunkAlignment);
        });
        const alignmentsSyncedMovedText = derived((reader) => {
            /** @description alignmentsSyncedMovedText */
            const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
            if (!syncedMovedText) {
                return null;
            }
            state.read(reader);
            const mappings = syncedMovedText.changes.map(c => new DiffMapping(c));
            // TODO dont include alignments outside syncedMovedText
            return computeRangeAlignment(this._editors.original, this._editors.modified, mappings, this._origViewZonesToIgnore, this._modViewZonesToIgnore, true);
        });
        function createFakeLinesDiv() {
            const r = document.createElement('div');
            r.className = 'diagonal-fill';
            return r;
        }
        const alignmentViewZonesDisposables = this._register(new DisposableStore());
        this.viewZones = derived(this, (reader) => {
            alignmentViewZonesDisposables.clear();
            const alignmentsVal = alignments.read(reader) || [];
            const origViewZones = [];
            const modViewZones = [];
            const modifiedTopPaddingVal = this._modifiedTopPadding.read(reader);
            if (modifiedTopPaddingVal > 0) {
                modViewZones.push({
                    afterLineNumber: 0,
                    domNode: document.createElement('div'),
                    heightInPx: modifiedTopPaddingVal,
                    showInHiddenAreas: true,
                    suppressMouseDown: true,
                });
            }
            const originalTopPaddingVal = this._originalTopPadding.read(reader);
            if (originalTopPaddingVal > 0) {
                origViewZones.push({
                    afterLineNumber: 0,
                    domNode: document.createElement('div'),
                    heightInPx: originalTopPaddingVal,
                    showInHiddenAreas: true,
                    suppressMouseDown: true,
                });
            }
            const renderSideBySide = this._options.renderSideBySide.read(reader);
            const context = {
                getLineContent: (lineNumber) => {
                    return this._editors.original.getModel().getLineContent(lineNumber);
                },
                getLineInjectedText: (lineNumber) => {
                    return null;
                }
            };
            const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer(context) : undefined;
            if (deletedCodeLineBreaksComputer) {
                const originalModel = this._editors.original.getModel();
                for (const a of alignmentsVal) {
                    if (a.diff) {
                        for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
                            // `i` can be out of bound when the diff has not been updated yet.
                            // In this case, we do an early return.
                            // TODO@hediet: Fix this by applying the edit directly to the diff model, so that the diff is always valid.
                            if (i > originalModel.getLineCount()) {
                                return { orig: origViewZones, mod: modViewZones };
                            }
                            deletedCodeLineBreaksComputer?.addRequest(i, null);
                        }
                    }
                }
            }
            const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
            let lineBreakDataIdx = 0;
            const modLineHeight = this._editors.modified.getOption(75 /* EditorOption.lineHeight */);
            const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
            const mightContainNonBasicASCII = this._editors.original.getModel()?.mightContainNonBasicASCII() ?? false;
            const mightContainRTL = this._editors.original.getModel()?.mightContainRTL() ?? false;
            const renderOptions = RenderOptions.fromEditor(this._editors.modified);
            for (const a of alignmentsVal) {
                if (a.diff && !renderSideBySide && (!this._options.useTrueInlineDiffRendering.read(reader) || !allowsTrueInlineDiffRendering(a.diff))) {
                    if (!a.originalRange.isEmpty) {
                        originalModelTokenizationCompleted.read(reader); // Update view-zones once tokenization completes
                        const deletedCodeDomNode = document.createElement('div');
                        deletedCodeDomNode.classList.add('view-lines', 'line-delete', 'line-delete-selectable', 'monaco-mouse-cursor-text');
                        const originalModel = this._editors.original.getModel();
                        // `a.originalRange` can be out of bound when the diff has not been updated yet.
                        // In this case, we do an early return.
                        // TODO@hediet: Fix this by applying the edit directly to the diff model, so that the diff is always valid.
                        if (a.originalRange.endLineNumberExclusive - 1 > originalModel.getLineCount()) {
                            return { orig: origViewZones, mod: modViewZones };
                        }
                        const source = new LineSource(a.originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)), a.originalRange.mapToLineArray(_ => lineBreakData[lineBreakDataIdx++]), mightContainNonBasicASCII, mightContainRTL);
                        const decorations = [];
                        for (const i of a.diff.innerChanges || []) {
                            decorations.push(new InlineDecoration(i.originalRange.delta(-(a.diff.original.startLineNumber - 1)), diffDeleteDecoration.className, 0 /* InlineDecorationType.Regular */));
                        }
                        const result = renderLines(source, renderOptions, decorations, deletedCodeDomNode);
                        const marginDomNode = document.createElement('div');
                        marginDomNode.className = 'inline-deleted-margin-view-zone';
                        applyFontInfo(marginDomNode, renderOptions.fontInfo);
                        if (this._options.renderIndicators.read(reader)) {
                            for (let i = 0; i < result.heightInLines; i++) {
                                const marginElement = document.createElement('div');
                                marginElement.className = `delete-sign ${ThemeIcon.asClassName(diffRemoveIcon)}`;
                                marginElement.setAttribute('style', `position:absolute;top:${i * modLineHeight}px;width:${renderOptions.lineDecorationsWidth}px;height:${modLineHeight}px;right:0;`);
                                marginDomNode.appendChild(marginElement);
                            }
                        }
                        let zoneId = undefined;
                        alignmentViewZonesDisposables.add(new InlineDiffDeletedCodeMargin(() => assertReturnsDefined(zoneId), marginDomNode, deletedCodeDomNode, this._editors.modified, a.diff, this._diffEditorWidget, result, this._editors.original.getModel(), this._contextMenuService, this._clipboardService));
                        for (let i = 0; i < result.viewLineCounts.length; i++) {
                            const count = result.viewLineCounts[i];
                            // Account for wrapped lines in the (collapsed) original editor (which doesn't wrap lines).
                            if (count > 1) {
                                origViewZones.push({
                                    afterLineNumber: a.originalRange.startLineNumber + i,
                                    domNode: createFakeLinesDiv(),
                                    heightInPx: (count - 1) * modLineHeight,
                                    showInHiddenAreas: true,
                                    suppressMouseDown: true,
                                });
                            }
                        }
                        modViewZones.push({
                            afterLineNumber: a.modifiedRange.startLineNumber - 1,
                            domNode: deletedCodeDomNode,
                            heightInPx: result.heightInLines * modLineHeight,
                            minWidthInPx: result.minWidthInPx,
                            marginDomNode,
                            setZoneId(id) { zoneId = id; },
                            showInHiddenAreas: true,
                            suppressMouseDown: false,
                        });
                    }
                    const marginDomNode = document.createElement('div');
                    marginDomNode.className = 'gutter-delete';
                    origViewZones.push({
                        afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
                        domNode: createFakeLinesDiv(),
                        heightInPx: a.modifiedHeightInPx,
                        marginDomNode,
                        showInHiddenAreas: true,
                        suppressMouseDown: true,
                    });
                }
                else {
                    const delta = a.modifiedHeightInPx - a.originalHeightInPx;
                    if (delta > 0) {
                        if (syncedMovedText?.lineRangeMapping.original.delta(-1).deltaLength(2).contains(a.originalRange.endLineNumberExclusive - 1)) {
                            continue;
                        }
                        origViewZones.push({
                            afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
                            domNode: createFakeLinesDiv(),
                            heightInPx: delta,
                            showInHiddenAreas: true,
                            suppressMouseDown: true,
                        });
                    }
                    else {
                        if (syncedMovedText?.lineRangeMapping.modified.delta(-1).deltaLength(2).contains(a.modifiedRange.endLineNumberExclusive - 1)) {
                            continue;
                        }
                        function createViewZoneMarginArrow() {
                            const arrow = document.createElement('div');
                            arrow.className = 'arrow-revert-change ' + ThemeIcon.asClassName(Codicon.arrowRight);
                            reader.store.add(addDisposableListener(arrow, 'mousedown', e => e.stopPropagation()));
                            reader.store.add(addDisposableListener(arrow, 'click', e => {
                                e.stopPropagation();
                                _diffEditorWidget.revert(a.diff);
                            }));
                            return $('div', {}, arrow);
                        }
                        let marginDomNode = undefined;
                        if (a.diff && a.diff.modified.isEmpty && this._options.shouldRenderOldRevertArrows.read(reader)) {
                            marginDomNode = createViewZoneMarginArrow();
                        }
                        modViewZones.push({
                            afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
                            domNode: createFakeLinesDiv(),
                            heightInPx: -delta,
                            marginDomNode,
                            showInHiddenAreas: true,
                            suppressMouseDown: true,
                        });
                    }
                }
            }
            for (const a of alignmentsSyncedMovedText.read(reader) ?? []) {
                if (!syncedMovedText?.lineRangeMapping.original.intersect(a.originalRange)
                    || !syncedMovedText?.lineRangeMapping.modified.intersect(a.modifiedRange)) {
                    // ignore unrelated alignments outside the synced moved text
                    continue;
                }
                const delta = a.modifiedHeightInPx - a.originalHeightInPx;
                if (delta > 0) {
                    origViewZones.push({
                        afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
                        domNode: createFakeLinesDiv(),
                        heightInPx: delta,
                        showInHiddenAreas: true,
                        suppressMouseDown: true,
                    });
                }
                else {
                    modViewZones.push({
                        afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
                        domNode: createFakeLinesDiv(),
                        heightInPx: -delta,
                        showInHiddenAreas: true,
                        suppressMouseDown: true,
                    });
                }
            }
            return { orig: origViewZones, mod: modViewZones };
        });
        let ignoreChange = false;
        this._register(this._editors.original.onDidScrollChange(e => {
            if (e.scrollLeftChanged && !ignoreChange) {
                ignoreChange = true;
                this._editors.modified.setScrollLeft(e.scrollLeft);
                ignoreChange = false;
            }
        }));
        this._register(this._editors.modified.onDidScrollChange(e => {
            if (e.scrollLeftChanged && !ignoreChange) {
                ignoreChange = true;
                this._editors.original.setScrollLeft(e.scrollLeft);
                ignoreChange = false;
            }
        }));
        this._originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => /** @description original.getScrollTop */ this._editors.original.getScrollTop());
        this._modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => /** @description modified.getScrollTop */ this._editors.modified.getScrollTop());
        // origExtraHeight + origOffset - origScrollTop = modExtraHeight + modOffset - modScrollTop
        // origScrollTop = origExtraHeight + origOffset - modExtraHeight - modOffset + modScrollTop
        // modScrollTop = modExtraHeight + modOffset - origExtraHeight - origOffset + origScrollTop
        // origOffset - modOffset = heightOfLines(1..Y) - heightOfLines(1..X)
        // origScrollTop >= 0, modScrollTop >= 0
        this._register(autorun(reader => {
            /** @description update scroll modified */
            const newScrollTopModified = this._originalScrollTop.read(reader)
                - (this._originalScrollOffsetAnimated.read(undefined) - this._modifiedScrollOffsetAnimated.read(reader))
                - (this._originalTopPadding.read(undefined) - this._modifiedTopPadding.read(reader));
            if (newScrollTopModified !== this._editors.modified.getScrollTop()) {
                this._editors.modified.setScrollTop(newScrollTopModified, 1 /* ScrollType.Immediate */);
            }
        }));
        this._register(autorun(reader => {
            /** @description update scroll original */
            const newScrollTopOriginal = this._modifiedScrollTop.read(reader)
                - (this._modifiedScrollOffsetAnimated.read(undefined) - this._originalScrollOffsetAnimated.read(reader))
                - (this._modifiedTopPadding.read(undefined) - this._originalTopPadding.read(reader));
            if (newScrollTopOriginal !== this._editors.original.getScrollTop()) {
                this._editors.original.setScrollTop(newScrollTopOriginal, 1 /* ScrollType.Immediate */);
            }
        }));
        this._register(autorun(reader => {
            /** @description update editor top offsets */
            const m = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
            let deltaOrigToMod = 0;
            if (m) {
                const trueTopOriginal = this._editors.original.getTopForLineNumber(m.lineRangeMapping.original.startLineNumber, true) - this._originalTopPadding.read(undefined);
                const trueTopModified = this._editors.modified.getTopForLineNumber(m.lineRangeMapping.modified.startLineNumber, true) - this._modifiedTopPadding.read(undefined);
                deltaOrigToMod = trueTopModified - trueTopOriginal;
            }
            if (deltaOrigToMod > 0) {
                this._modifiedTopPadding.set(0, undefined);
                this._originalTopPadding.set(deltaOrigToMod, undefined);
            }
            else if (deltaOrigToMod < 0) {
                this._modifiedTopPadding.set(-deltaOrigToMod, undefined);
                this._originalTopPadding.set(0, undefined);
            }
            else {
                setTimeout(() => {
                    this._modifiedTopPadding.set(0, undefined);
                    this._originalTopPadding.set(0, undefined);
                }, 400);
            }
            if (this._editors.modified.hasTextFocus()) {
                this._originalScrollOffset.set(this._modifiedScrollOffset.read(undefined) - deltaOrigToMod, undefined, true);
            }
            else {
                this._modifiedScrollOffset.set(this._originalScrollOffset.read(undefined) + deltaOrigToMod, undefined, true);
            }
        }));
    }
};
DiffEditorViewZones = __decorate([
    __param(8, IClipboardService),
    __param(9, IContextMenuService)
], DiffEditorViewZones);
export { DiffEditorViewZones };
function computeRangeAlignment(originalEditor, modifiedEditor, diffs, originalEditorAlignmentViewZones, modifiedEditorAlignmentViewZones, innerHunkAlignment) {
    const originalLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(originalEditor, originalEditorAlignmentViewZones));
    const modifiedLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(modifiedEditor, modifiedEditorAlignmentViewZones));
    const origLineHeight = originalEditor.getOption(75 /* EditorOption.lineHeight */);
    const modLineHeight = modifiedEditor.getOption(75 /* EditorOption.lineHeight */);
    const result = [];
    let lastOriginalLineNumber = 0;
    let lastModifiedLineNumber = 0;
    function handleAlignmentsOutsideOfDiffs(untilOriginalLineNumberExclusive, untilModifiedLineNumberExclusive) {
        while (true) {
            let origNext = originalLineHeightOverrides.peek();
            let modNext = modifiedLineHeightOverrides.peek();
            if (origNext && origNext.lineNumber >= untilOriginalLineNumberExclusive) {
                origNext = undefined;
            }
            if (modNext && modNext.lineNumber >= untilModifiedLineNumberExclusive) {
                modNext = undefined;
            }
            if (!origNext && !modNext) {
                break;
            }
            const distOrig = origNext ? origNext.lineNumber - lastOriginalLineNumber : Number.MAX_VALUE;
            const distNext = modNext ? modNext.lineNumber - lastModifiedLineNumber : Number.MAX_VALUE;
            if (distOrig < distNext) {
                originalLineHeightOverrides.dequeue();
                modNext = {
                    lineNumber: origNext.lineNumber - lastOriginalLineNumber + lastModifiedLineNumber,
                    heightInPx: 0,
                };
            }
            else if (distOrig > distNext) {
                modifiedLineHeightOverrides.dequeue();
                origNext = {
                    lineNumber: modNext.lineNumber - lastModifiedLineNumber + lastOriginalLineNumber,
                    heightInPx: 0,
                };
            }
            else {
                originalLineHeightOverrides.dequeue();
                modifiedLineHeightOverrides.dequeue();
            }
            result.push({
                originalRange: LineRange.ofLength(origNext.lineNumber, 1),
                modifiedRange: LineRange.ofLength(modNext.lineNumber, 1),
                originalHeightInPx: origLineHeight + origNext.heightInPx,
                modifiedHeightInPx: modLineHeight + modNext.heightInPx,
                diff: undefined,
            });
        }
    }
    for (const m of diffs) {
        const c = m.lineRangeMapping;
        handleAlignmentsOutsideOfDiffs(c.original.startLineNumber, c.modified.startLineNumber);
        let first = true;
        let lastModLineNumber = c.modified.startLineNumber;
        let lastOrigLineNumber = c.original.startLineNumber;
        function emitAlignment(origLineNumberExclusive, modLineNumberExclusive, forceAlignment = false) {
            if (origLineNumberExclusive < lastOrigLineNumber || modLineNumberExclusive < lastModLineNumber) {
                return;
            }
            if (first) {
                first = false;
            }
            else if (!forceAlignment && (origLineNumberExclusive === lastOrigLineNumber || modLineNumberExclusive === lastModLineNumber)) {
                // This causes a re-alignment of an already aligned line.
                // However, we don't care for the final alignment.
                return;
            }
            const originalRange = new LineRange(lastOrigLineNumber, origLineNumberExclusive);
            const modifiedRange = new LineRange(lastModLineNumber, modLineNumberExclusive);
            if (originalRange.isEmpty && modifiedRange.isEmpty) {
                return;
            }
            const originalAdditionalHeight = originalLineHeightOverrides
                .takeWhile(v => v.lineNumber < origLineNumberExclusive)
                ?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;
            const modifiedAdditionalHeight = modifiedLineHeightOverrides
                .takeWhile(v => v.lineNumber < modLineNumberExclusive)
                ?.reduce((p, c) => p + c.heightInPx, 0) ?? 0;
            result.push({
                originalRange,
                modifiedRange,
                originalHeightInPx: originalRange.length * origLineHeight + originalAdditionalHeight,
                modifiedHeightInPx: modifiedRange.length * modLineHeight + modifiedAdditionalHeight,
                diff: m.lineRangeMapping,
            });
            lastOrigLineNumber = origLineNumberExclusive;
            lastModLineNumber = modLineNumberExclusive;
        }
        if (innerHunkAlignment) {
            for (const i of c.innerChanges || []) {
                if (i.originalRange.startColumn > 1 && i.modifiedRange.startColumn > 1) {
                    // There is some unmodified text on this line before the diff
                    emitAlignment(i.originalRange.startLineNumber, i.modifiedRange.startLineNumber);
                }
                const originalModel = originalEditor.getModel();
                // When the diff is invalid, the ranges might be out of bounds (this should be fixed in the diff model by applying edits directly).
                const maxColumn = i.originalRange.endLineNumber <= originalModel.getLineCount() ? originalModel.getLineMaxColumn(i.originalRange.endLineNumber) : Number.MAX_SAFE_INTEGER;
                if (i.originalRange.endColumn < maxColumn) {
                    // // There is some unmodified text on this line after the diff
                    emitAlignment(i.originalRange.endLineNumber, i.modifiedRange.endLineNumber);
                }
            }
        }
        emitAlignment(c.original.endLineNumberExclusive, c.modified.endLineNumberExclusive, true);
        lastOriginalLineNumber = c.original.endLineNumberExclusive;
        lastModifiedLineNumber = c.modified.endLineNumberExclusive;
    }
    handleAlignmentsOutsideOfDiffs(Number.MAX_VALUE, Number.MAX_VALUE);
    return result;
}
function getAdditionalLineHeights(editor, viewZonesToIgnore) {
    const viewZoneHeights = [];
    const wrappingZoneHeights = [];
    const hasWrapping = editor.getOption(166 /* EditorOption.wrappingInfo */).wrappingColumn !== -1;
    const coordinatesConverter = editor._getViewModel().coordinatesConverter;
    const editorLineHeight = editor.getOption(75 /* EditorOption.lineHeight */);
    if (hasWrapping) {
        for (let i = 1; i <= editor.getModel().getLineCount(); i++) {
            const lineCount = coordinatesConverter.getModelLineViewLineCount(i);
            if (lineCount > 1) {
                wrappingZoneHeights.push({ lineNumber: i, heightInPx: editorLineHeight * (lineCount - 1) });
            }
        }
    }
    for (const w of editor.getWhitespaces()) {
        if (viewZonesToIgnore.has(w.id)) {
            continue;
        }
        const modelLineNumber = w.afterLineNumber === 0 ? 0 : coordinatesConverter.convertViewPositionToModelPosition(new Position(w.afterLineNumber, 1)).lineNumber;
        viewZoneHeights.push({ lineNumber: modelLineNumber, heightInPx: w.height });
    }
    const result = joinCombine(viewZoneHeights, wrappingZoneHeights, v => v.lineNumber, (v1, v2) => ({ lineNumber: v1.lineNumber, heightInPx: v1.heightInPx + v2.heightInPx }));
    return result;
}
export function allowsTrueInlineDiffRendering(mapping) {
    if (!mapping.innerChanges) {
        return false;
    }
    return mapping.innerChanges.every(c => (rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange))
        || c.originalRange.equalsRange(new Range(1, 1, 1, 1)));
}
export function rangeIsSingleLine(range) {
    return range.startLineNumber === range.endLineNumber;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvclZpZXdab25lcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9kaWZmRWRpdG9yVmlld1pvbmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFlLE9BQU8sRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbEksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0YsT0FBTyxFQUF1QixXQUFXLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVoRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FB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