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
var NotebookTextDiffEditor_1;
import * as nls from '../../../../../nls.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService, registerThemingParticipant } from '../../../../../platform/theme/common/themeService.js';
import { getDefaultNotebookCreationOptions } from '../notebookEditorWidget.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { SideBySideDiffElementViewModel } from './diffElementViewModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CellDiffPlaceholderRenderer, CellDiffSideBySideRenderer, CellDiffSingleSideRenderer, NotebookCellTextDiffListDelegate, NotebookDocumentMetadataDiffRenderer, NotebookTextDiffList } from './notebookDiffList.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { diffDiagonalFill, editorBackground, focusBorder, foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { INotebookEditorWorkerService } from '../../common/services/notebookWorkerService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createBareFontInfoFromRawSettings } from '../../../../../editor/common/config/fontInfoFromSettings.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { DiffSide, DIFF_CELL_MARGIN } from './notebookDiffEditorBrowser.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { CellUri, NOTEBOOK_DIFF_EDITOR_ID, NotebookSetting } from '../../common/notebookCommon.js';
import { SequencerByKey } from '../../../../../base/common/async.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { BackLayerWebView } from '../view/renderers/backLayerWebView.js';
import { NotebookDiffEditorEventDispatcher, NotebookDiffLayoutChangedEvent } from './eventDispatcher.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { NotebookOptions } from '../notebookOptions.js';
import { cellIndexesToRanges, cellRangesToIndexes } from '../../common/notebookRange.js';
import { NotebookDiffOverviewRuler } from './notebookDiffOverviewRuler.js';
import { registerZIndex, ZIndex } from '../../../../../platform/layout/browser/zIndexRegistry.js';
import { NotebookDiffViewModel } from './notebookDiffViewModel.js';
import { INotebookService } from '../../common/notebookService.js';
import { DiffEditorHeightCalculatorService } from './editorHeightCalculator.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { NotebookInlineDiffWidget } from './inlineDiff/notebookInlineDiffWidget.js';
import { observableValue } from '../../../../../base/common/observable.js';
const $ = DOM.$;
class NotebookDiffEditorSelection {
    constructor(selections) {
        this.selections = selections;
    }
    compare(other) {
        if (!(other instanceof NotebookDiffEditorSelection)) {
            return 3 /* EditorPaneSelectionCompareResult.DIFFERENT */;
        }
        if (this.selections.length !== other.selections.length) {
            return 3 /* EditorPaneSelectionCompareResult.DIFFERENT */;
        }
        for (let i = 0; i < this.selections.length; i++) {
            if (this.selections[i] !== other.selections[i]) {
                return 3 /* EditorPaneSelectionCompareResult.DIFFERENT */;
            }
        }
        return 1 /* EditorPaneSelectionCompareResult.IDENTICAL */;
    }
    restore(options) {
        const notebookOptions = {
            cellSelections: cellIndexesToRanges(this.selections)
        };
        Object.assign(notebookOptions, options);
        return notebookOptions;
    }
}
let NotebookTextDiffEditor = class NotebookTextDiffEditor extends EditorPane {
    static { NotebookTextDiffEditor_1 = this; }
    static { this.ENTIRE_DIFF_OVERVIEW_WIDTH = 30; }
    static { this.ID = NOTEBOOK_DIFF_EDITOR_ID; }
    get textModel() {
        return this._model?.modified.notebook;
    }
    get inlineNotebookEditor() {
        if (this._inlineView) {
            return this.inlineDiffWidget?.editorWidget;
        }
        return undefined;
    }
    get notebookOptions() {
        return this._notebookOptions;
    }
    get isDisposed() {
        return this._isDisposed;
    }
    constructor(group, instantiationService, themeService, contextKeyService, notebookEditorWorkerService, configurationService, telemetryService, storageService, notebookService, editorService) {
        super(NotebookTextDiffEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.notebookEditorWorkerService = notebookEditorWorkerService;
        this.configurationService = configurationService;
        this.notebookService = notebookService;
        this.editorService = editorService;
        this.creationOptions = getDefaultNotebookCreationOptions();
        this._dimension = undefined;
        this._modifiedWebview = null;
        this._originalWebview = null;
        this._webviewTransparentCover = null;
        this._inlineView = false;
        this._onMouseUp = this._register(new Emitter());
        this.onMouseUp = this._onMouseUp.event;
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this.onDidChangeScroll = this._onDidScroll.event;
        this._model = null;
        this._modifiedResourceDisposableStore = this._register(new DisposableStore());
        this._insetModifyQueueByOutputId = new SequencerByKey();
        this._onDidDynamicOutputRendered = this._register(new Emitter());
        this.onDidDynamicOutputRendered = this._onDidDynamicOutputRendered.event;
        this._localStore = this._register(new DisposableStore());
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._isDisposed = false;
        this._currentChangedIndex = observableValue(this, -1);
        this.currentChangedIndex = this._currentChangedIndex;
        this.pendingLayouts = new WeakMap();
        this.diffEditorCalcuator = this.instantiationService.createInstance(DiffEditorHeightCalculatorService, this.fontInfo.lineHeight);
        this._notebookOptions = instantiationService.createInstance(NotebookOptions, this.window, false, undefined);
        this._register(this._notebookOptions);
        this._revealFirst = true;
    }
    get fontInfo() {
        if (!this._fontInfo) {
            this._fontInfo = this.createFontInfo();
        }
        return this._fontInfo;
    }
    createFontInfo() {
        const editorOptions = this.configurationService.getValue('editor');
        return FontMeasurements.readFontInfo(this.window, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.window).value));
    }
    isOverviewRulerEnabled() {
        return this.configurationService.getValue(NotebookSetting.diffOverviewRuler) ?? false;
    }
    getSelection() {
        const selections = this._list.getFocus();
        return new NotebookDiffEditorSelection(selections);
    }
    toggleNotebookCellSelection(cell) {
        // throw new Error('Method not implemented.');
    }
    updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
        // throw new Error('Method not implemented.');
    }
    async focusNotebookCell(cell, focus) {
        // throw new Error('Method not implemented.');
    }
    async focusNextNotebookCell(cell, focus) {
        // throw new Error('Method not implemented.');
    }
    didFocusOutputInputChange(inputFocused) {
        // noop
    }
    getScrollTop() {
        return this._list?.scrollTop ?? 0;
    }
    getScrollHeight() {
        return this._list?.scrollHeight ?? 0;
    }
    getScrollPosition() {
        return {
            scrollTop: this.getScrollTop(),
            scrollLeft: this._list?.scrollLeft ?? 0
        };
    }
    setScrollPosition(scrollPosition) {
        if (!this._list) {
            return;
        }
        this._list.scrollTop = scrollPosition.scrollTop;
        if (scrollPosition.scrollLeft !== undefined) {
            this._list.scrollLeft = scrollPosition.scrollLeft;
        }
    }
    delegateVerticalScrollbarPointerDown(browserEvent) {
        this._list?.delegateVerticalScrollbarPointerDown(browserEvent);
    }
    updateOutputHeight(cellInfo, output, outputHeight, isInit) {
        const diffElement = cellInfo.diffElement;
        const cell = this.getCellByInfo(cellInfo);
        const outputIndex = cell.outputsViewModels.indexOf(output);
        if (diffElement instanceof SideBySideDiffElementViewModel) {
            const info = CellUri.parse(cellInfo.cellUri);
            if (!info) {
                return;
            }
            diffElement.updateOutputHeight(info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified, outputIndex, outputHeight);
        }
        else {
            diffElement.updateOutputHeight(diffElement.type === 'insert' ? DiffSide.Modified : DiffSide.Original, outputIndex, outputHeight);
        }
        if (isInit) {
            this._onDidDynamicOutputRendered.fire({ cell, output });
        }
    }
    setMarkupCellEditState(cellId, editState) {
        // throw new Error('Method not implemented.');
    }
    didStartDragMarkupCell(cellId, event) {
        // throw new Error('Method not implemented.');
    }
    didDragMarkupCell(cellId, event) {
        // throw new Error('Method not implemented.');
    }
    didEndDragMarkupCell(cellId) {
        // throw new Error('Method not implemented.');
    }
    didDropMarkupCell(cellId) {
        // throw new Error('Method not implemented.');
    }
    didResizeOutput(cellId) {
        // throw new Error('Method not implemented.');
    }
    async toggleInlineView() {
        this._layoutCancellationTokenSource?.dispose();
        this._inlineView = !this._inlineView;
        if (!this._lastLayoutProperties) {
            return;
        }
        if (this._inlineView) {
            this.layout(this._lastLayoutProperties?.dimension, this._lastLayoutProperties?.position);
            this.inlineDiffWidget?.show(this.input, this._model?.modified.notebook, this._model?.original.notebook, this._options);
        }
        else {
            this.layout(this._lastLayoutProperties?.dimension, this._lastLayoutProperties?.position);
            this.inlineDiffWidget?.hide();
        }
        this._layoutCancellationTokenSource = new CancellationTokenSource();
        this.updateLayout(this._layoutCancellationTokenSource.token);
    }
    createEditor(parent) {
        this._rootElement = DOM.append(parent, DOM.$('.notebook-text-diff-editor'));
        this._overflowContainer = document.createElement('div');
        this._overflowContainer.classList.add('notebook-overflow-widget-container', 'monaco-editor');
        DOM.append(parent, this._overflowContainer);
        const renderers = [
            this.instantiationService.createInstance(CellDiffSingleSideRenderer, this),
            this.instantiationService.createInstance(CellDiffSideBySideRenderer, this),
            this.instantiationService.createInstance(CellDiffPlaceholderRenderer, this),
            this.instantiationService.createInstance(NotebookDocumentMetadataDiffRenderer, this),
        ];
        this._listViewContainer = DOM.append(this._rootElement, DOM.$('.notebook-diff-list-view'));
        this._list = this.instantiationService.createInstance(NotebookTextDiffList, 'NotebookTextDiff', this._listViewContainer, this.instantiationService.createInstance(NotebookCellTextDiffListDelegate, this.window), renderers, this.contextKeyService, {
            setRowLineHeight: false,
            setRowHeight: false,
            supportDynamicHeights: true,
            horizontalScrolling: false,
            keyboardSupport: false,
            mouseSupport: true,
            multipleSelectionSupport: false,
            typeNavigationEnabled: true,
            paddingBottom: 0,
            // transformOptimization: (isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
            styleController: (_suffix) => { return this._list; },
            overrideStyles: {
                listBackground: editorBackground,
                listActiveSelectionBackground: editorBackground,
                listActiveSelectionForeground: foreground,
                listFocusAndSelectionBackground: editorBackground,
                listFocusAndSelectionForeground: foreground,
                listFocusBackground: editorBackground,
                listFocusForeground: foreground,
                listHoverForeground: foreground,
                listHoverBackground: editorBackground,
                listHoverOutline: focusBorder,
                listFocusOutline: focusBorder,
                listInactiveSelectionBackground: editorBackground,
                listInactiveSelectionForeground: foreground,
                listInactiveFocusBackground: editorBackground,
                listInactiveFocusOutline: editorBackground,
            },
            accessibilityProvider: {
                getAriaLabel() { return null; },
                getWidgetAriaLabel() {
                    return nls.localize('notebookTreeAriaLabel', "Notebook Text Diff");
                }
            },
            // focusNextPreviousDelegate: {
            // 	onFocusNext: (applyFocusNext: () => void) => this._updateForCursorNavigationMode(applyFocusNext),
            // 	onFocusPrevious: (applyFocusPrevious: () => void) => this._updateForCursorNavigationMode(applyFocusPrevious),
            // }
        });
        this.inlineDiffWidget = this._register(this.instantiationService.createInstance(NotebookInlineDiffWidget, this._rootElement, this.group.id, this.window, this.notebookOptions, this._dimension));
        this._register(this._list);
        this._register(this._list.onMouseUp(e => {
            if (e.element) {
                if (typeof e.index === 'number') {
                    this._list.setFocus([e.index]);
                }
                this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
            }
        }));
        this._register(this._list.onDidScroll(() => {
            this._onDidScroll.fire();
        }));
        this._register(this._list.onDidChangeFocus(() => this._onDidChangeSelection.fire({ reason: 2 /* EditorPaneSelectionChangeReason.USER */ })));
        this._overviewRulerContainer = document.createElement('div');
        this._overviewRulerContainer.classList.add('notebook-overview-ruler-container');
        this._rootElement.appendChild(this._overviewRulerContainer);
        this._registerOverviewRuler();
        // transparent cover
        this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $('.webview-cover'));
        this._webviewTransparentCover.style.display = 'none';
        this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overflowContainer, (e) => {
            if (e.target.classList.contains('slider') && this._webviewTransparentCover) {
                this._webviewTransparentCover.style.display = 'block';
            }
        }));
        this._register(DOM.addStandardDisposableGenericMouseUpListener(this._overflowContainer, () => {
            if (this._webviewTransparentCover) {
                // no matter when
                this._webviewTransparentCover.style.display = 'none';
            }
        }));
        this._register(this._list.onDidScroll(e => {
            this._webviewTransparentCover.style.top = `${e.scrollTop}px`;
        }));
    }
    _registerOverviewRuler() {
        this._overviewRuler = this._register(this.instantiationService.createInstance(NotebookDiffOverviewRuler, this, NotebookTextDiffEditor_1.ENTIRE_DIFF_OVERVIEW_WIDTH, this._overviewRulerContainer));
    }
    _updateOutputsOffsetsInWebview(scrollTop, scrollHeight, activeWebview, getActiveNestedCell, diffSide) {
        activeWebview.element.style.height = `${scrollHeight}px`;
        if (activeWebview.insetMapping) {
            const updateItems = [];
            const removedItems = [];
            activeWebview.insetMapping.forEach((value, key) => {
                const cell = getActiveNestedCell(value.cellInfo.diffElement);
                if (!cell) {
                    return;
                }
                const viewIndex = this._list.indexOf(value.cellInfo.diffElement);
                if (viewIndex === undefined) {
                    return;
                }
                if (cell.outputsViewModels.indexOf(key) < 0) {
                    // output is already gone
                    removedItems.push(key);
                }
                else {
                    const cellTop = this._list.getCellViewScrollTop(value.cellInfo.diffElement);
                    const outputIndex = cell.outputsViewModels.indexOf(key);
                    const outputOffset = value.cellInfo.diffElement.getOutputOffsetInCell(diffSide, outputIndex);
                    updateItems.push({
                        cell,
                        output: key,
                        cellTop: cellTop,
                        outputOffset: outputOffset,
                        forceDisplay: false
                    });
                }
            });
            activeWebview.removeInsets(removedItems);
            if (updateItems.length) {
                activeWebview.updateScrollTops(updateItems, []);
            }
        }
    }
    async setInput(input, options, context, token) {
        this.inlineDiffWidget?.hide();
        await super.setInput(input, options, context, token);
        const model = await input.resolve();
        if (this._model !== model) {
            this._detachModel();
            this._attachModel(model);
        }
        this._model = model;
        if (this._model === null) {
            return;
        }
        if (this._inlineView) {
            this._listViewContainer.style.display = 'none';
            this.inlineDiffWidget?.show(input, model.modified.notebook, model.original.notebook, options);
        }
        else {
            this._listViewContainer.style.display = 'block';
            this.inlineDiffWidget?.hide();
        }
        this._revealFirst = true;
        this._modifiedResourceDisposableStore.clear();
        this._layoutCancellationTokenSource = new CancellationTokenSource();
        this._modifiedResourceDisposableStore.add(Event.any(this._model.original.notebook.onDidChangeContent, this._model.modified.notebook.onDidChangeContent)(e => {
            // If the user has made changes to the notebook whilst in the diff editor,
            // then do not re-compute the diff of the notebook,
            // As change will result in re-computing diff and re-building entire diff view.
            if (this._model !== null && this.editorService.activeEditor !== input) {
                this._layoutCancellationTokenSource?.dispose();
                this._layoutCancellationTokenSource = new CancellationTokenSource();
                this.updateLayout(this._layoutCancellationTokenSource.token);
            }
        }));
        await this._createOriginalWebview(generateUuid(), this._model.original.viewType, this._model.original.resource);
        if (this._originalWebview) {
            this._modifiedResourceDisposableStore.add(this._originalWebview);
        }
        await this._createModifiedWebview(generateUuid(), this._model.modified.viewType, this._model.modified.resource);
        if (this._modifiedWebview) {
            this._modifiedResourceDisposableStore.add(this._modifiedWebview);
        }
        await this.updateLayout(this._layoutCancellationTokenSource.token, options?.cellSelections ? cellRangesToIndexes(options.cellSelections) : undefined);
    }
    setVisible(visible) {
        super.setVisible(visible);
        if (!visible) {
            this.inlineDiffWidget?.hide();
        }
    }
    _detachModel() {
        this._localStore.clear();
        this._originalWebview?.dispose();
        this._originalWebview?.element.remove();
        this._originalWebview = null;
        this._modifiedWebview?.dispose();
        this._modifiedWebview?.element.remove();
        this._modifiedWebview = null;
        this.notebookDiffViewModel?.dispose();
        this.notebookDiffViewModel = undefined;
        this._modifiedResourceDisposableStore.clear();
        this._list.clear();
    }
    _attachModel(model) {
        this._model = model;
        this._eventDispatcher = new NotebookDiffEditorEventDispatcher();
        const updateInsets = () => {
            DOM.scheduleAtNextAnimationFrame(this.window, () => {
                if (this._isDisposed) {
                    return;
                }
                if (this._modifiedWebview) {
                    this._updateOutputsOffsetsInWebview(this._list.scrollTop, this._list.scrollHeight, this._modifiedWebview, (diffElement) => {
                        return diffElement.modified;
                    }, DiffSide.Modified);
                }
                if (this._originalWebview) {
                    this._updateOutputsOffsetsInWebview(this._list.scrollTop, this._list.scrollHeight, this._originalWebview, (diffElement) => {
                        return diffElement.original;
                    }, DiffSide.Original);
                }
            });
        };
        this._localStore.add(this._list.onDidChangeContentHeight(() => {
            updateInsets();
        }));
        this._localStore.add(this._list.onDidChangeFocus((e) => {
            if (e.indexes.length && this.notebookDiffViewModel && e.indexes[0] < this.notebookDiffViewModel.items.length) {
                const selectedItem = this.notebookDiffViewModel.items[e.indexes[0]];
                const changedItems = this.notebookDiffViewModel.items.filter(item => item.type !== 'unchanged' && item.type !== 'unchangedMetadata' && item.type !== 'placeholder');
                if (selectedItem && selectedItem?.type !== 'placeholder' && selectedItem?.type !== 'unchanged' && selectedItem?.type !== 'unchangedMetadata') {
                    return this._currentChangedIndex.set(changedItems.indexOf(selectedItem), undefined);
                }
            }
            return this._currentChangedIndex.set(-1, undefined);
        }));
        this._localStore.add(this._eventDispatcher.onDidChangeCellLayout(() => {
            updateInsets();
        }));
        const vm = this.notebookDiffViewModel = this._register(new NotebookDiffViewModel(this._model, this.notebookEditorWorkerService, this.configurationService, this._eventDispatcher, this.notebookService, this.diffEditorCalcuator, this.fontInfo, undefined));
        this._localStore.add(this.notebookDiffViewModel.onDidChangeItems(e => {
            this._originalWebview?.removeInsets([...this._originalWebview?.insetMapping.keys()]);
            this._modifiedWebview?.removeInsets([...this._modifiedWebview?.insetMapping.keys()]);
            if (this._revealFirst && typeof e.firstChangeIndex === 'number' && e.firstChangeIndex > -1 && e.firstChangeIndex < this._list.length) {
                this._revealFirst = false;
                this._list.setFocus([e.firstChangeIndex]);
                this._list.reveal(e.firstChangeIndex, 0.3);
            }
            this._list.splice(e.start, e.deleteCount, e.elements);
            if (this.isOverviewRulerEnabled()) {
                this._overviewRuler.updateViewModels(vm.items, this._eventDispatcher);
            }
        }));
    }
    async _createModifiedWebview(id, viewType, resource) {
        this._modifiedWebview?.dispose();
        this._modifiedWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
            ...this._notebookOptions.computeDiffWebviewOptions(),
            fontFamily: this._generateFontFamily()
        }, undefined);
        // attach the webview container to the DOM tree first
        this._list.rowsContainer.insertAdjacentElement('afterbegin', this._modifiedWebview.element);
        this._modifiedWebview.createWebview(this.window);
        this._modifiedWebview.element.style.width = `calc(50% - 16px)`;
        this._modifiedWebview.element.style.left = `calc(50%)`;
    }
    _generateFontFamily() {
        return this.fontInfo.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
    }
    async _createOriginalWebview(id, viewType, resource) {
        this._originalWebview?.dispose();
        this._originalWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
            ...this._notebookOptions.computeDiffWebviewOptions(),
            fontFamily: this._generateFontFamily()
        }, undefined);
        // attach the webview container to the DOM tree first
        this._list.rowsContainer.insertAdjacentElement('afterbegin', this._originalWebview.element);
        this._originalWebview.createWebview(this.window);
        this._originalWebview.element.style.width = `calc(50% - 16px)`;
        this._originalWebview.element.style.left = `16px`;
    }
    setOptions(options) {
        const selections = options?.cellSelections ? cellRangesToIndexes(options.cellSelections) : undefined;
        if (selections) {
            this._list.setFocus(selections);
        }
    }
    async updateLayout(token, selections) {
        if (!this._model || !this.notebookDiffViewModel) {
            return;
        }
        await this.notebookDiffViewModel.computeDiff(token);
        if (token.isCancellationRequested) {
            // after await the editor might be disposed.
            return;
        }
        if (selections) {
            this._list.setFocus(selections);
        }
    }
    scheduleOutputHeightAck(cellInfo, outputId, height) {
        const diffElement = cellInfo.diffElement;
        // const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
        let diffSide = DiffSide.Original;
        if (diffElement instanceof SideBySideDiffElementViewModel) {
            const info = CellUri.parse(cellInfo.cellUri);
            if (!info) {
                return;
            }
            diffSide = info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified;
        }
        else {
            diffSide = diffElement.type === 'insert' ? DiffSide.Modified : DiffSide.Original;
        }
        const webview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
        DOM.scheduleAtNextAnimationFrame(this.window, () => {
            webview?.ackHeight([{ cellId: cellInfo.cellId, outputId, height }]);
        }, 10);
    }
    layoutNotebookCell(cell, height) {
        const relayout = (cell, height) => {
            this._list.updateElementHeight2(cell, height);
        };
        let disposable = this.pendingLayouts.get(cell);
        if (disposable) {
            this._localStore.delete(disposable);
        }
        let r;
        const layoutDisposable = DOM.scheduleAtNextAnimationFrame(this.window, () => {
            this.pendingLayouts.delete(cell);
            relayout(cell, height);
            r();
        });
        disposable = toDisposable(() => {
            layoutDisposable.dispose();
            r();
        });
        this._localStore.add(disposable);
        this.pendingLayouts.set(cell, disposable);
        return new Promise(resolve => { r = resolve; });
    }
    setScrollTop(scrollTop) {
        this._list.scrollTop = scrollTop;
    }
    triggerScroll(event) {
        this._list.triggerScrollFromMouseWheelEvent(event);
    }
    firstChange() {
        if (!this.notebookDiffViewModel) {
            return;
        }
        // go to the first one
        const currentViewModels = this.notebookDiffViewModel.items;
        const index = currentViewModels.findIndex(vm => vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder');
        if (index >= 0) {
            this._list.setFocus([index]);
            this._list.reveal(index);
        }
    }
    lastChange() {
        if (!this.notebookDiffViewModel) {
            return;
        }
        // go to the first one
        const currentViewModels = this.notebookDiffViewModel.items;
        const item = currentViewModels.slice().reverse().find(vm => vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder');
        const index = item ? currentViewModels.indexOf(item) : -1;
        if (index >= 0) {
            this._list.setFocus([index]);
            this._list.reveal(index);
        }
    }
    previousChange() {
        if (!this.notebookDiffViewModel) {
            return;
        }
        let currFocus = this._list.getFocus()[0];
        if (isNaN(currFocus) || currFocus < 0) {
            currFocus = 0;
        }
        // find the index of previous change
        let prevChangeIndex = currFocus - 1;
        const currentViewModels = this.notebookDiffViewModel.items;
        while (prevChangeIndex >= 0) {
            const vm = currentViewModels[prevChangeIndex];
            if (vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder') {
                break;
            }
            prevChangeIndex--;
        }
        if (prevChangeIndex >= 0) {
            this._list.setFocus([prevChangeIndex]);
            this._list.reveal(prevChangeIndex);
        }
        else {
            // go to the last one
            const index = currentViewModels.findLastIndex(vm => vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder');
            if (index >= 0) {
                this._list.setFocus([index]);
                this._list.reveal(index);
            }
        }
    }
    nextChange() {
        if (!this.notebookDiffViewModel) {
            return;
        }
        let currFocus = this._list.getFocus()[0];
        if (isNaN(currFocus) || currFocus < 0) {
            currFocus = 0;
        }
        // find the index of next change
        let nextChangeIndex = currFocus + 1;
        const currentViewModels = this.notebookDiffViewModel.items;
        while (nextChangeIndex < currentViewModels.length) {
            const vm = currentViewModels[nextChangeIndex];
            if (vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder') {
                break;
            }
            nextChangeIndex++;
        }
        if (nextChangeIndex < currentViewModels.length) {
            this._list.setFocus([nextChangeIndex]);
            this._list.reveal(nextChangeIndex);
        }
        else {
            // go to the first one
            const index = currentViewModels.findIndex(vm => vm.type !== 'unchanged' && vm.type !== 'unchangedMetadata' && vm.type !== 'placeholder');
            if (index >= 0) {
                this._list.setFocus([index]);
                this._list.reveal(index);
            }
        }
    }
    createOutput(cellDiffViewModel, cellViewModel, output, getOffset, diffSide) {
        this._insetModifyQueueByOutputId.queue(output.source.model.outputId + (diffSide === DiffSide.Modified ? '-right' : 'left'), async () => {
            const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
            if (!activeWebview) {
                return;
            }
            if (!activeWebview.insetMapping.has(output.source)) {
                const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
                await activeWebview.createOutput({ diffElement: cellDiffViewModel, cellHandle: cellViewModel.handle, cellId: cellViewModel.id, cellUri: cellViewModel.uri }, output, cellTop, getOffset());
            }
            else {
                const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
                const outputIndex = cellViewModel.outputsViewModels.indexOf(output.source);
                const outputOffset = cellDiffViewModel.getOutputOffsetInCell(diffSide, outputIndex);
                activeWebview.updateScrollTops([{
                        cell: cellViewModel,
                        output: output.source,
                        cellTop,
                        outputOffset,
                        forceDisplay: true
                    }], []);
            }
        });
    }
    updateMarkupCellHeight() {
        // TODO
    }
    getCellByInfo(cellInfo) {
        return cellInfo.diffElement.getCellByUri(cellInfo.cellUri);
    }
    getCellById(cellId) {
        throw new Error('Not implemented');
    }
    removeInset(cellDiffViewModel, cellViewModel, displayOutput, diffSide) {
        this._insetModifyQueueByOutputId.queue(displayOutput.model.outputId + (diffSide === DiffSide.Modified ? '-right' : 'left'), async () => {
            const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
            if (!activeWebview) {
                return;
            }
            if (!activeWebview.insetMapping.has(displayOutput)) {
                return;
            }
            activeWebview.removeInsets([displayOutput]);
        });
    }
    showInset(cellDiffViewModel, cellViewModel, displayOutput, diffSide) {
        this._insetModifyQueueByOutputId.queue(displayOutput.model.outputId + (diffSide === DiffSide.Modified ? '-right' : 'left'), async () => {
            const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
            if (!activeWebview) {
                return;
            }
            if (!activeWebview.insetMapping.has(displayOutput)) {
                return;
            }
            const cellTop = this._list.getCellViewScrollTop(cellDiffViewModel);
            const outputIndex = cellViewModel.outputsViewModels.indexOf(displayOutput);
            const outputOffset = cellDiffViewModel.getOutputOffsetInCell(diffSide, outputIndex);
            activeWebview.updateScrollTops([{
                    cell: cellViewModel,
                    output: displayOutput,
                    cellTop,
                    outputOffset,
                    forceDisplay: true,
                }], []);
        });
    }
    hideInset(cellDiffViewModel, cellViewModel, output) {
        this._modifiedWebview?.hideInset(output);
        this._originalWebview?.hideInset(output);
    }
    // private async _resolveWebview(rightEditor: boolean): Promise<BackLayerWebView | null> {
    // 	if (rightEditor) {
    // 	}
    // }
    getDomNode() {
        return this._rootElement;
    }
    getOverflowContainerDomNode() {
        return this._overflowContainer;
    }
    getControl() {
        return this;
    }
    clearInput() {
        this.inlineDiffWidget?.hide();
        super.clearInput();
        this._modifiedResourceDisposableStore.clear();
        this._list?.splice(0, this._list?.length || 0);
        this._model = null;
        this.notebookDiffViewModel?.dispose();
        this.notebookDiffViewModel = undefined;
    }
    deltaCellOutputContainerClassNames(diffSide, cellId, added, removed) {
        if (diffSide === DiffSide.Original) {
            this._originalWebview?.deltaCellOutputContainerClassNames(cellId, added, removed);
        }
        else {
            this._modifiedWebview?.deltaCellOutputContainerClassNames(cellId, added, removed);
        }
    }
    getLayoutInfo() {
        if (!this._list) {
            throw new Error('Editor is not initalized successfully');
        }
        return {
            width: this._dimension.width,
            height: this._dimension.height,
            fontInfo: this.fontInfo,
            scrollHeight: this._list?.getScrollHeight() ?? 0,
            stickyHeight: 0,
            listViewOffsetTop: 0,
        };
    }
    layout(dimension, position) {
        this._rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
        this._rootElement.classList.toggle('narrow-width', dimension.width < 600);
        const overviewRulerEnabled = this.isOverviewRulerEnabled();
        this._dimension = dimension.with(dimension.width - (overviewRulerEnabled ? NotebookTextDiffEditor_1.ENTIRE_DIFF_OVERVIEW_WIDTH : 0));
        this._listViewContainer.style.height = `${dimension.height}px`;
        this._listViewContainer.style.width = `${this._dimension.width}px`;
        if (this._inlineView) {
            this._listViewContainer.style.display = 'none';
            this.inlineDiffWidget?.setLayout(dimension, position);
        }
        else {
            this.inlineDiffWidget?.hide();
            this._listViewContainer.style.display = 'block';
            this._list?.layout(this._dimension.height, this._dimension.width);
            if (this._modifiedWebview) {
                this._modifiedWebview.element.style.width = `calc(50% - 16px)`;
                this._modifiedWebview.element.style.left = `calc(50%)`;
            }
            if (this._originalWebview) {
                this._originalWebview.element.style.width = `calc(50% - 16px)`;
                this._originalWebview.element.style.left = `16px`;
            }
            if (this._webviewTransparentCover) {
                this._webviewTransparentCover.style.height = `${this._dimension.height}px`;
                this._webviewTransparentCover.style.width = `${this._dimension.width}px`;
            }
            if (overviewRulerEnabled) {
                this._overviewRuler.layout();
            }
        }
        this._lastLayoutProperties = { dimension, position };
        this._eventDispatcher?.emit([new NotebookDiffLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
    }
    dispose() {
        this._isDisposed = true;
        this._layoutCancellationTokenSource?.dispose();
        this._detachModel();
        super.dispose();
    }
};
NotebookTextDiffEditor = NotebookTextDiffEditor_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IThemeService),
    __param(3, IContextKeyService),
    __param(4, INotebookEditorWorkerService),
    __param(5, IConfigurationService),
    __param(6, ITelemetryService),
    __param(7, IStorageService),
    __param(8, INotebookService),
    __param(9, IEditorService)
], NotebookTextDiffEditor);
export { NotebookTextDiffEditor };
registerZIndex(ZIndex.Base, 10, 'notebook-diff-view-viewport-slider');
registerThemingParticipant((theme, collector) => {
    const diffDiagonalFillColor = theme.getColor(diffDiagonalFill);
    collector.addRule(`
	.notebook-text-diff-editor .diagonal-fill {
		background-image: linear-gradient(
			-45deg,
			${diffDiagonalFillColor} 12.5%,
			#0000 12.5%, #0000 50%,
			${diffDiagonalFillColor} 50%, ${diffDiagonalFillColor} 62.5%,
			#0000 62.5%, #0000 100%
		);
		background-size: 8px 8px;
	}
	`);
    collector.addRule(`.notebook-text-diff-editor .cell-body { margin: ${DIFF_CELL_MARGIN}px; }`);
    // We do not want a left margin, as we add an overlay for expanind the collapsed/hidden cells.
    collector.addRule(`.notebook-text-diff-editor .cell-placeholder-body { margin: ${DIFF_CELL_MARGIN}px 0; }`);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZkVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsYUFBYSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFakgsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFHL0UsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hHLE9BQU8sRUFBMkQsOEJBQThCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNwSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQUUsZ0NBQWdDLEVBQUUsb0NBQW9DLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUMxTixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3BJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FB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