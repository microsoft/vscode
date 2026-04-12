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
var ChatEditingCodeEditorIntegration_1, DiffHunkWidget_1;
import './media/chatEditorController.css';
import { getTotalWidth } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { AccessibleDiffViewer } from '../../../../../editor/browser/widget/diffEditor/components/accessibleDiffViewer.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffDeleteDecoration, diffWholeLineAddDecoration } from '../../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { OverviewRulerLane } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { InlineDecoration } from '../../../../../editor/common/viewModel/inlineDecorations.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { isDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../../scm/common/quickDiff.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';
import { isTextDiffEditorForEntry } from './chatEditing.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ctxCursorInChangeRange } from './chatEditingEditorContextKeys.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';
import { ChatEditingExplanationWidgetManager } from './chatEditingExplanationWidget.js';
import { IChatEditingExplanationModelManager } from './chatEditingExplanationModelManager.js';
import { IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
class ObjectPool {
    constructor() {
        this._free = new LinkedList();
    }
    dispose() {
        dispose(this._free);
    }
    get() {
        return this._free.shift();
    }
    putBack(obj) {
        this._free.push(obj);
    }
    get free() {
        return this._free;
    }
}
let ChatEditingCodeEditorIntegration = class ChatEditingCodeEditorIntegration {
    static { ChatEditingCodeEditorIntegration_1 = this; }
    static { this._diffLineDecorationData = ModelDecorationOptions.register({ description: 'diff-line-decoration' }); }
    constructor(_entry, _editor, documentDiffInfo, renderDiffImmediately, _editorService, _accessibilitySignalsService, contextKeyService, instantiationService, _chatEditingService, _explanationModelManager, _chatWidgetService, _viewsService) {
        this._entry = _entry;
        this._editor = _editor;
        this._editorService = _editorService;
        this._accessibilitySignalsService = _accessibilitySignalsService;
        this._explanationModelManager = _explanationModelManager;
        this._chatWidgetService = _chatWidgetService;
        this._viewsService = _viewsService;
        this._currentIndex = observableValue(this, -1);
        this.currentIndex = this._currentIndex;
        this._store = new DisposableStore();
        this._diffHunksRenderStore = this._store.add(new DisposableStore());
        this._diffHunkWidgetPool = this._store.add(new ObjectPool());
        this._diffHunkWidgets = [];
        this._viewZones = [];
        this._accessibleDiffViewVisible = observableValue(this, false);
        this._diffLineDecorations = _editor.createDecorationsCollection();
        const codeEditorObs = observableCodeEditor(_editor);
        this._diffLineDecorations = this._editor.createDecorationsCollection(); // tracks the line range w/o visuals (used for navigate)
        this._diffVisualDecorations = this._editor.createDecorationsCollection(); // tracks the real diff with character level inserts
        // Create explanation widget manager and connect it to the model manager
        this._store.add(new ChatEditingExplanationWidgetManager(this._editor, this._chatWidgetService, this._viewsService, this._explanationModelManager, this._entry.modifiedURI));
        const enabledObs = derived(r => {
            if (!isEqual(codeEditorObs.model.read(r)?.uri, documentDiffInfo.read(r).modifiedModel.uri)) {
                return false;
            }
            if (this._editor.getOption(70 /* EditorOption.inDiffEditor */) && !instantiationService.invokeFunction(isTextDiffEditorForEntry, _entry, this._editor)) {
                return false;
            }
            return true;
        });
        // update decorations
        this._store.add(autorun(r => {
            if (!enabledObs.read(r)) {
                this._diffLineDecorations.clear();
                return;
            }
            const data = [];
            const diff = documentDiffInfo.read(r);
            for (const diffEntry of diff.changes) {
                data.push({
                    range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
                    options: ChatEditingCodeEditorIntegration_1._diffLineDecorationData
                });
            }
            this._diffLineDecorations.set(data);
        }));
        // INIT current index when: enabled, not streaming anymore, once per request, and when having changes
        let lastModifyingRequestId;
        this._store.add(autorun(r => {
            if (enabledObs.read(r)
                && !_entry.isCurrentlyBeingModifiedBy.read(r)
                && lastModifyingRequestId !== _entry.lastModifyingRequestId
                && !documentDiffInfo.read(r).identical) {
                lastModifyingRequestId = _entry.lastModifyingRequestId;
                const position = _editor.getPosition() ?? new Position(1, 1);
                const ranges = this._diffLineDecorations.getRanges();
                let initialIndex = ranges.findIndex(r => r.containsPosition(position));
                if (initialIndex < 0) {
                    initialIndex = 0;
                    for (; initialIndex < ranges.length - 1; initialIndex++) {
                        const range = ranges[initialIndex];
                        if (range.endLineNumber >= position.lineNumber) {
                            break;
                        }
                    }
                }
                this._currentIndex.set(initialIndex, undefined);
                _editor.revealRange(ranges[initialIndex]);
            }
        }));
        // render diff decorations
        this._store.add(autorun(r => {
            if (!enabledObs.read(r)) {
                this._clearDiffRendering();
                return;
            }
            // done: render diff
            if (!_entry.isCurrentlyBeingModifiedBy.read(r) || renderDiffImmediately) {
                const isDiffEditor = this._editor.getOption(70 /* EditorOption.inDiffEditor */);
                codeEditorObs.getOption(59 /* EditorOption.fontInfo */).read(r);
                codeEditorObs.getOption(75 /* EditorOption.lineHeight */).read(r);
                const reviewMode = _entry.reviewMode.read(r);
                const diff = documentDiffInfo.read(r);
                this._updateDiffRendering(diff, reviewMode, isDiffEditor);
            }
        }));
        const _ctxCursorInChangeRange = ctxCursorInChangeRange.bindTo(contextKeyService);
        // accessibility: signals while cursor changes
        // ctx: cursor in change range
        this._store.add(autorun(r => {
            const position = codeEditorObs.positions.read(r)?.at(0);
            if (!position || !enabledObs.read(r)) {
                _ctxCursorInChangeRange.reset();
                return;
            }
            const diff = documentDiffInfo.read(r);
            const changeAtCursor = diff.changes.find(m => m.modified.contains(position.lineNumber) || m.modified.isEmpty && m.modified.startLineNumber === position.lineNumber);
            _ctxCursorInChangeRange.set(!!changeAtCursor);
            if (changeAtCursor) {
                let signal;
                if (changeAtCursor.modified.isEmpty) {
                    signal = AccessibilitySignal.diffLineDeleted;
                }
                else if (changeAtCursor.original.isEmpty) {
                    signal = AccessibilitySignal.diffLineInserted;
                }
                else {
                    signal = AccessibilitySignal.diffLineModified;
                }
                this._accessibilitySignalsService.playSignal(signal, { source: 'chatEditingEditor.cursorPositionChanged' });
            }
        }));
        // accessibility: diff view
        this._store.add(autorun(r => {
            const visible = this._accessibleDiffViewVisible.read(r);
            if (!visible || !enabledObs.read(r)) {
                return;
            }
            const accessibleDiffWidget = new AccessibleDiffViewContainer();
            _editor.addOverlayWidget(accessibleDiffWidget);
            r.store.add(toDisposable(() => _editor.removeOverlayWidget(accessibleDiffWidget)));
            r.store.add(instantiationService.createInstance(AccessibleDiffViewer, accessibleDiffWidget.getDomNode(), enabledObs, (visible, tx) => this._accessibleDiffViewVisible.set(visible, tx), constObservable(true), codeEditorObs.layoutInfo.map((v, r) => v.width), codeEditorObs.layoutInfo.map((v, r) => v.height), documentDiffInfo.map(diff => diff.changes.slice()), instantiationService.createInstance(AccessibleDiffViewerModel, documentDiffInfo, _editor)));
        }));
        // ---- readonly while streaming
        let actualOptions;
        const restoreActualOptions = () => {
            if (actualOptions !== undefined) {
                this._editor.updateOptions(actualOptions);
                actualOptions = undefined;
            }
        };
        this._store.add(toDisposable(restoreActualOptions));
        const renderAsBeingModified = derived(this, r => {
            return enabledObs.read(r) && Boolean(_entry.isCurrentlyBeingModifiedBy.read(r));
        });
        this._store.add(autorun(r => {
            const value = renderAsBeingModified.read(r);
            if (value) {
                actualOptions ??= {
                    readOnly: this._editor.getOption(104 /* EditorOption.readOnly */),
                    stickyScroll: this._editor.getOption(131 /* EditorOption.stickyScroll */),
                    codeLens: this._editor.getOption(23 /* EditorOption.codeLens */),
                    guides: this._editor.getOption(22 /* EditorOption.guides */)
                };
                this._editor.updateOptions({
                    readOnly: true,
                    stickyScroll: { enabled: false },
                    codeLens: false,
                    guides: { indentation: false, bracketPairs: false }
                });
            }
            else {
                restoreActualOptions();
            }
        }));
    }
    dispose() {
        this._clear();
        this._store.dispose();
    }
    _clear() {
        this._diffLineDecorations.clear();
        this._clearDiffRendering();
        this._currentIndex.set(-1, undefined);
    }
    // ---- diff rendering logic
    _clearDiffRendering() {
        this._editor.changeViewZones((viewZoneChangeAccessor) => {
            for (const id of this._viewZones) {
                viewZoneChangeAccessor.removeZone(id);
            }
        });
        this._viewZones = [];
        this._diffHunksRenderStore.clear();
        for (const widget of this._diffHunkWidgetPool.free) {
            widget.remove();
        }
        this._diffVisualDecorations.clear();
    }
    _updateDiffRendering(diff, reviewMode, diffMode) {
        const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
            ...diffAddDecoration,
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
        });
        const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
            ...diffWholeLineAddDecoration,
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        });
        const createOverviewDecoration = (overviewRulerColor, minimapColor) => {
            return ModelDecorationOptions.createDynamic({
                description: 'chat-editing-decoration',
                overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
                minimap: { color: themeColorFromId(minimapColor), position: 2 /* MinimapPosition.Gutter */ },
            });
        };
        const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
        const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
        const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);
        this._diffHunksRenderStore.clear();
        this._diffHunkWidgets.length = 0;
        const diffHunkDecorations = [];
        this._editor.changeViewZones((viewZoneChangeAccessor) => {
            for (const id of this._viewZones) {
                viewZoneChangeAccessor.removeZone(id);
            }
            this._viewZones = [];
            const modifiedVisualDecorations = [];
            const mightContainNonBasicASCII = diff.originalModel.mightContainNonBasicASCII();
            const mightContainRTL = diff.originalModel.mightContainRTL();
            const renderOptions = RenderOptions.fromEditor(this._editor);
            const editorLineCount = this._editor.getModel()?.getLineCount();
            for (const diffEntry of diff.changes) {
                const originalRange = diffEntry.original;
                diff.originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
                const source = new LineSource(originalRange.mapToLineArray(l => diff.originalModel.tokenization.getLineTokens(l)), [], mightContainNonBasicASCII, mightContainRTL);
                const decorations = [];
                if (reviewMode) {
                    for (const i of diffEntry.innerChanges || []) {
                        decorations.push(new InlineDecoration(i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)), diffDeleteDecoration.className, 0 /* InlineDecorationType.Regular */));
                        // If the original range is empty, the start line number is 1 and the new range spans the entire file, don't draw an Added decoration
                        if (!(i.originalRange.isEmpty() && i.originalRange.startLineNumber === 1 && i.modifiedRange.endLineNumber === editorLineCount) && !i.modifiedRange.isEmpty()) {
                            modifiedVisualDecorations.push({
                                range: i.modifiedRange, options: chatDiffAddDecoration
                            });
                        }
                    }
                }
                // Render an added decoration but don't also render a deleted decoration for newly inserted content at the start of the file
                // Note, this is a workaround for the `LineRange.isEmpty()` in diffEntry.original being `false` for newly inserted content
                const isCreatedContent = decorations.length === 1 && decorations[0].range.isEmpty() && diffEntry.original.startLineNumber === 1;
                if (!diffEntry.modified.isEmpty) {
                    modifiedVisualDecorations.push({
                        range: diffEntry.modified.toInclusiveRange(),
                        options: chatDiffWholeLineAddDecoration
                    });
                }
                if (diffEntry.original.isEmpty) {
                    // insertion
                    modifiedVisualDecorations.push({
                        range: diffEntry.modified.toInclusiveRange(),
                        options: addedDecoration
                    });
                }
                else if (diffEntry.modified.isEmpty) {
                    // deletion
                    modifiedVisualDecorations.push({
                        range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
                        options: deletedDecoration
                    });
                }
                else {
                    // modification
                    modifiedVisualDecorations.push({
                        range: diffEntry.modified.toInclusiveRange(),
                        options: modifiedDecoration
                    });
                }
                let extraLines = 0;
                if (reviewMode && !diffMode) {
                    const domNode = document.createElement('div');
                    domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
                    const result = renderLines(source, renderOptions, decorations, domNode);
                    extraLines = result.heightInLines;
                    if (!isCreatedContent) {
                        const viewZoneData = {
                            afterLineNumber: diffEntry.modified.startLineNumber - 1,
                            heightInLines: result.heightInLines,
                            domNode,
                            ordinal: 50000 + 2 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
                        };
                        this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
                    }
                }
                if (reviewMode || diffMode) {
                    // Add content widget for each diff change
                    let widget = this._diffHunkWidgetPool.get();
                    if (!widget) {
                        // make a new one
                        widget = this._editor.invokeWithinContext(accessor => {
                            const instaService = accessor.get(IInstantiationService);
                            return instaService.createInstance(DiffHunkWidget, this._editor, diff, diffEntry, this._editor.getModel().getVersionId(), isCreatedContent ? 0 : extraLines);
                        });
                    }
                    else {
                        widget.update(diff, diffEntry, this._editor.getModel().getVersionId(), isCreatedContent ? 0 : extraLines);
                    }
                    this._diffHunksRenderStore.add(toDisposable(() => {
                        this._diffHunkWidgetPool.putBack(widget);
                    }));
                    widget.layout(diffEntry.modified.startLineNumber);
                    this._diffHunkWidgets.push(widget);
                    diffHunkDecorations.push({
                        range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
                        options: {
                            description: 'diff-hunk-widget',
                            stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */
                        }
                    });
                }
            }
            this._diffVisualDecorations.set(!diffMode ? modifiedVisualDecorations : []);
        });
        const diffHunkDecoCollection = this._editor.createDecorationsCollection(diffHunkDecorations);
        this._diffHunksRenderStore.add(toDisposable(() => {
            diffHunkDecoCollection.clear();
        }));
        // HIDE pooled widgets that are not used
        for (const extraWidget of this._diffHunkWidgetPool.free) {
            extraWidget.remove();
        }
        const positionObs = observableFromEvent(this._editor.onDidChangeCursorPosition, _ => this._editor.getPosition());
        const activeWidgetIdx = derived(r => {
            const position = positionObs.read(r);
            if (!position) {
                return -1;
            }
            const idx = diffHunkDecoCollection.getRanges().findIndex(r => r.containsPosition(position));
            return idx;
        });
        const toggleWidget = (activeWidget) => {
            const positionIdx = activeWidgetIdx.get();
            for (let i = 0; i < this._diffHunkWidgets.length; i++) {
                const widget = this._diffHunkWidgets[i];
                widget.toggle(widget === activeWidget || i === positionIdx);
            }
        };
        this._diffHunksRenderStore.add(autorun(r => {
            // reveal when cursor inside
            const idx = activeWidgetIdx.read(r);
            const widget = this._diffHunkWidgets[idx];
            toggleWidget(widget);
        }));
        this._diffHunksRenderStore.add(this._editor.onMouseUp(e => {
            // set approximate position when clicking on view zone
            if (e.target.type === 8 /* MouseTargetType.CONTENT_VIEW_ZONE */) {
                const zone = e.target.detail;
                const idx = this._viewZones.findIndex(id => id === zone.viewZoneId);
                if (idx >= 0) {
                    this._editor.setPosition(e.target.position);
                    this._editor.focus();
                }
            }
        }));
        this._diffHunksRenderStore.add(this._editor.onMouseMove(e => {
            // reveal when hovering over
            if (e.target.type === 12 /* MouseTargetType.OVERLAY_WIDGET */) {
                const id = e.target.detail;
                const widget = this._diffHunkWidgets.find(w => w.getId() === id);
                toggleWidget(widget);
            }
            else if (e.target.type === 8 /* MouseTargetType.CONTENT_VIEW_ZONE */) {
                const zone = e.target.detail;
                const idx = this._viewZones.findIndex(id => id === zone.viewZoneId);
                toggleWidget(this._diffHunkWidgets[idx]);
            }
            else if (e.target.position) {
                const { position } = e.target;
                const idx = diffHunkDecoCollection.getRanges().findIndex(r => r.containsPosition(position));
                toggleWidget(this._diffHunkWidgets[idx]);
            }
            else {
                toggleWidget(undefined);
            }
        }));
        this._diffHunksRenderStore.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
            for (let i = 0; i < this._diffHunkWidgets.length; i++) {
                const widget = this._diffHunkWidgets[i];
                const range = diffHunkDecoCollection.getRange(i);
                if (range) {
                    widget.layout(range?.startLineNumber);
                }
                else {
                    widget.dispose();
                }
            }
        }));
    }
    enableAccessibleDiffView() {
        this._accessibleDiffViewVisible.set(true, undefined);
    }
    // ---- navigation logic
    reveal(firstOrLast, preserveFocus) {
        const decorations = this._diffLineDecorations
            .getRanges()
            .sort((a, b) => Range.compareRangesUsingStarts(a, b));
        const index = firstOrLast ? 0 : decorations.length - 1;
        const range = decorations.at(index);
        if (range) {
            this._editor.setPosition(range.getStartPosition());
            this._editor.revealRange(range);
            if (!preserveFocus) {
                this._editor.focus();
            }
            this._currentIndex.set(index, undefined);
        }
    }
    next(wrap) {
        return this._reveal(true, !wrap);
    }
    previous(wrap) {
        return this._reveal(false, !wrap);
    }
    _reveal(next, strict) {
        const position = this._editor.getPosition();
        if (!position) {
            this._currentIndex.set(-1, undefined);
            return false;
        }
        const decorations = this._diffLineDecorations
            .getRanges()
            .sort((a, b) => Range.compareRangesUsingStarts(a, b));
        if (decorations.length === 0) {
            this._currentIndex.set(-1, undefined);
            return false;
        }
        let newIndex = -1;
        for (let i = 0; i < decorations.length; i++) {
            const range = decorations[i];
            if (range.containsPosition(position)) {
                newIndex = i + (next ? 1 : -1);
                break;
            }
            else if (Position.isBefore(position, range.getStartPosition())) {
                newIndex = next ? i : i - 1;
                break;
            }
        }
        if (strict && (newIndex < 0 || newIndex >= decorations.length)) {
            // NO change
            return false;
        }
        newIndex = (newIndex + decorations.length) % decorations.length;
        this._currentIndex.set(newIndex, undefined);
        const targetRange = decorations[newIndex];
        const targetPosition = next ? targetRange.getStartPosition() : targetRange.getEndPosition();
        this._editor.setPosition(targetPosition);
        this._editor.revealPositionInCenter(targetRange.getStartPosition().delta(-1));
        this._editor.focus();
        return true;
    }
    // --- hunks
    _findClosestWidget() {
        if (!this._editor.hasModel()) {
            return undefined;
        }
        const lineRelativeTop = this._editor.getTopForLineNumber(this._editor.getPosition().lineNumber) - this._editor.getScrollTop();
        let closestWidget;
        let closestDistance = Number.MAX_VALUE;
        for (const widget of this._diffHunkWidgets) {
            const widgetTop = widget.getPosition()?.preference?.top;
            if (widgetTop !== undefined) {
                const distance = Math.abs(widgetTop - lineRelativeTop);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestWidget = widget;
                }
            }
        }
        return closestWidget;
    }
    async rejectNearestChange(closestWidget) {
        closestWidget = closestWidget ?? this._findClosestWidget();
        if (closestWidget instanceof DiffHunkWidget) {
            await closestWidget.reject();
            this.next(true);
        }
    }
    async acceptNearestChange(closestWidget) {
        closestWidget = closestWidget ?? this._findClosestWidget();
        if (closestWidget instanceof DiffHunkWidget) {
            await closestWidget.accept();
            this.next(true);
        }
    }
    async toggleDiff(widget, show) {
        if (!this._editor.hasModel()) {
            return;
        }
        let selection = this._editor.getSelection();
        if (widget instanceof DiffHunkWidget) {
            const lineNumber = widget.getStartLineNumber();
            const position = lineNumber ? new Position(lineNumber, 1) : undefined;
            if (position && !selection.containsPosition(position)) {
                selection = Selection.fromPositions(position);
            }
        }
        const isDiffEditor = this._editor.getOption(70 /* EditorOption.inDiffEditor */);
        // Use the 'show' argument to control the diff state if provided
        if (show !== undefined ? show : !isDiffEditor) {
            // Open DIFF editor
            const diffEditor = await this._editorService.openEditor({
                original: { resource: this._entry.originalURI },
                modified: { resource: this._entry.modifiedURI },
                options: { selection },
                label: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
            });
            if (diffEditor && diffEditor.input) {
                diffEditor.getControl()?.setSelection(selection);
                const d = autorun(r => {
                    const state = this._entry.state.read(r);
                    if (state === 1 /* ModifiedFileEntryState.Accepted */ || state === 2 /* ModifiedFileEntryState.Rejected */) {
                        d.dispose();
                        const editorIdents = [];
                        for (const candidate of this._editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
                            if (isDiffEditorInput(candidate.editor)
                                && isEqual(candidate.editor.original.resource, this._entry.originalURI)
                                && isEqual(candidate.editor.modified.resource, this._entry.modifiedURI)) {
                                editorIdents.push(candidate);
                            }
                        }
                        this._editorService.closeEditors(editorIdents);
                    }
                });
            }
        }
        else {
            // Open normal editor
            await this._editorService.openEditor({
                resource: this._entry.modifiedURI,
                options: {
                    selection,
                    selectionRevealType: 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */
                }
            });
        }
    }
};
ChatEditingCodeEditorIntegration = ChatEditingCodeEditorIntegration_1 = __decorate([
    __param(4, IEditorService),
    __param(5, IAccessibilitySignalService),
    __param(6, IContextKeyService),
    __param(7, IInstantiationService),
    __param(8, IChatEditingService),
    __param(9, IChatEditingExplanationModelManager),
    __param(10, IChatWidgetService),
    __param(11, IViewsService)
], ChatEditingCodeEditorIntegration);
export { ChatEditingCodeEditorIntegration };
let DiffHunkWidget = class DiffHunkWidget {
    static { DiffHunkWidget_1 = this; }
    static { this._idPool = 0; }
    constructor(_editor, _diffInfo, _change, _versionId, _lineDelta, instaService) {
        this._editor = _editor;
        this._diffInfo = _diffInfo;
        this._change = _change;
        this._versionId = _versionId;
        this._lineDelta = _lineDelta;
        this._id = `diff-change-widget-${DiffHunkWidget_1._idPool++}`;
        this._store = new DisposableStore();
        this._removed = false;
        this._domNode = document.createElement('div');
        this._domNode.className = 'chat-diff-change-content-widget';
        const toolbar = instaService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.ChatEditingEditorHunk, {
            telemetrySource: 'chatEditingEditorHunk',
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: { primaryGroup: () => true, },
            menuOptions: {
                renderShortTitle: true,
                arg: this,
            },
            actionViewItemProvider: (action, options) => {
                const isPrimary = action.id === 'chatEditor.action.acceptHunk';
                if (!action.class) {
                    return new class extends ActionViewItem {
                        constructor() {
                            super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true /* hide keybinding for actions without icon */, icon: false, label: true });
                        }
                        render(container) {
                            super.render(container);
                            if (isPrimary) {
                                this.element?.classList.add('primary');
                            }
                        }
                    };
                }
                return undefined;
            }
        });
        this._store.add(toolbar);
        this._store.add(toolbar.actionRunner.onWillRun(_ => _editor.focus()));
        this._editor.addOverlayWidget(this);
    }
    update(diffInfo, change, versionId, lineDelta) {
        this._diffInfo = diffInfo;
        this._change = change;
        this._versionId = versionId;
        this._lineDelta = lineDelta;
    }
    dispose() {
        this._store.dispose();
        this._editor.removeOverlayWidget(this);
        this._removed = true;
    }
    getId() {
        return this._id;
    }
    layout(startLineNumber) {
        const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
        const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
        const scrollTop = this._editor.getScrollTop();
        this._position = {
            stackOrdinal: 1,
            preference: {
                top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - (lineHeight * this._lineDelta),
                left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + getTotalWidth(this._domNode))
            }
        };
        if (this._removed) {
            this._removed = false;
            this._editor.addOverlayWidget(this);
        }
        else {
            this._editor.layoutOverlayWidget(this);
        }
        this._lastStartLineNumber = startLineNumber;
    }
    remove() {
        this._editor.removeOverlayWidget(this);
        this._removed = true;
    }
    toggle(show) {
        this._domNode.classList.toggle('hover', show);
        if (this._lastStartLineNumber) {
            this.layout(this._lastStartLineNumber);
        }
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return this._position ?? null;
    }
    getStartLineNumber() {
        return this._lastStartLineNumber;
    }
    // ---
    async reject() {
        if (this._versionId !== this._editor.getModel()?.getVersionId()) {
            return false;
        }
        return await this._diffInfo.undo(this._change);
    }
    async accept() {
        if (this._versionId !== this._editor.getModel()?.getVersionId()) {
            return false;
        }
        return this._diffInfo.keep(this._change);
    }
};
DiffHunkWidget = DiffHunkWidget_1 = __decorate([
    __param(5, IInstantiationService)
], DiffHunkWidget);
class AccessibleDiffViewContainer {
    constructor() {
        this._domNode = document.createElement('div');
        this._domNode.className = 'accessible-diff-view';
        this._domNode.style.width = '100%';
        this._domNode.style.position = 'absolute';
    }
    getId() {
        return 'chatEdits.accessibleDiffView';
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return {
            preference: { top: 0, left: 0 },
            stackOrdinal: 1
        };
    }
}
class AccessibleDiffViewerModel {
    constructor(_documentDiffInfo, _editor) {
        this._documentDiffInfo = _documentDiffInfo;
        this._editor = _editor;
    }
    getOriginalModel() {
        return this._documentDiffInfo.get().originalModel;
    }
    getOriginalOptions() {
        return this._editor.getOptions();
    }
    originalReveal(range) {
        const changes = this._documentDiffInfo.get().changes;
        const idx = changes.findIndex(value => value.original.intersect(LineRange.fromRange(range)));
        if (idx >= 0) {
            range = changes[idx].modified.toInclusiveRange() ?? range;
        }
        this.modifiedReveal(range);
    }
    getModifiedModel() {
        return this._editor.getModel();
    }
    getModifiedOptions() {
        return this._editor.getOptions();
    }
    modifiedReveal(range) {
        if (range) {
            this._editor.revealRange(range);
            this._editor.setSelection(range);
        }
        this._editor.focus();
    }
    modifiedSetSelection(range) {
        this._editor.setSelection(range);
    }
    modifiedFocus() {
        this._editor.focus();
    }
    getModifiedPosition() {
        return this._editor.getPosition() ?? undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sa0NBQWtDLENBQUM7QUFFMUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEosT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsb0JBQW9CLEVBQThCLE1BQU0sb0ZBQW9GLENBQUM7QUFDdEosT0FBTyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0ZBQStGLENBQUM7QUFDdkosT0FBTyxFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFFcEssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVB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