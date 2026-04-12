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
import './media/notebook.css';
import './media/notebookCellChat.css';
import './media/notebookCellEditorHint.css';
import './media/notebookCellInsertToolbar.css';
import './media/notebookCellStatusBar.css';
import './media/notebookCellTitleToolbar.css';
import './media/notebookFocusIndicator.css';
import './media/notebookToolbar.css';
import './media/notebookDnd.css';
import './media/notebookFolding.css';
import './media/notebookCellOutput.css';
import './media/notebookEditorStickyScroll.css';
import './media/notebookKernelActionViewItem.css';
import './media/notebookOutline.css';
import './media/notebookChatEditController.css';
import './media/notebookChatEditorOverlay.css';
import * as DOM from '../../../../base/browser/dom.js';
import * as domStylesheets from '../../../../base/browser/domStylesheets.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { SequencerByKey } from '../../../../base/common/async.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableStore, dispose, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { setTimeout0 } from '../../../../base/common/platform.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements.js';
import { createBareFontInfoFromRawSettings } from '../../../../editor/common/config/fontInfoFromSettings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { registerZIndex, ZIndex } from '../../../../platform/layout/browser/zIndexRegistry.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { contrastBorder, errorForeground, focusBorder, foreground, listInactiveSelectionBackground, registerColor, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_PANE_BACKGROUND, PANEL_BORDER, SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { debugIconStartForeground } from '../../debug/browser/debugColors.js';
import { CellEditState, CellFocusMode, CellRevealRangeType, ScrollToRevealBehavior } from './notebookBrowser.js';
import { NotebookEditorExtensionsRegistry } from './notebookEditorExtensions.js';
import { INotebookEditorService } from './services/notebookEditorService.js';
import { notebookDebug } from './notebookLogger.js';
import { NotebookLayoutChangedEvent } from './notebookViewEvents.js';
import { CellContextKeyManager } from './view/cellParts/cellContextKeys.js';
import { CellDragAndDropController } from './view/cellParts/cellDnd.js';
import { ListViewInfoAccessor, NotebookCellList, NOTEBOOK_WEBVIEW_BOUNDARY } from './view/notebookCellList.js';
import { BackLayerWebView } from './view/renderers/backLayerWebView.js';
import { CodeCellRenderer, MarkupCellRenderer, NotebookCellListDelegate } from './view/renderers/cellRenderer.js';
import { CodeCellViewModel, outputDisplayLimit } from './viewModel/codeCellViewModel.js';
import { NotebookEventDispatcher } from './viewModel/eventDispatcher.js';
import { MarkupCellViewModel } from './viewModel/markupCellViewModel.js';
import { NotebookViewModel } from './viewModel/notebookViewModelImpl.js';
import { ViewContext } from './viewModel/viewContext.js';
import { NotebookEditorWorkbenchToolbar } from './viewParts/notebookEditorToolbar.js';
import { NotebookEditorContextKeys } from './viewParts/notebookEditorWidgetContextKeys.js';
import { NotebookOverviewRuler } from './viewParts/notebookOverviewRuler.js';
import { ListTopCellToolbar } from './viewParts/notebookTopCellToolbar.js';
import { CellKind, NotebookFindScopeType, RENDERER_NOT_AVAILABLE, SelectionStateType } from '../common/notebookCommon.js';
import { NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED } from '../common/notebookContextKeys.js';
import { INotebookExecutionService } from '../common/notebookExecutionService.js';
import { INotebookKernelService } from '../common/notebookKernelService.js';
import { NotebookOptions, OutputInnerContainerTopPadding } from './notebookOptions.js';
import { cellRangesToIndexes } from '../common/notebookRange.js';
import { INotebookRendererMessagingService } from '../common/notebookRendererMessagingService.js';
import { INotebookService } from '../common/notebookService.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { BaseCellEditorOptions } from './viewModel/cellEditorOptions.js';
import { FloatingEditorClickMenu } from '../../../browser/codeeditor.js';
import { CellFindMatchModel } from './contrib/find/findModel.js';
import { INotebookLoggingService } from '../common/notebookLoggingService.js';
import { Schemas } from '../../../../base/common/network.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { NotebookStickyScroll } from './viewParts/notebookEditorStickyScroll.js';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { PreventDefaultContextMenuItemsContextKeyName } from '../../webview/browser/webview.contribution.js';
import { NotebookAccessibilityProvider } from './notebookAccessibilityProvider.js';
import { NotebookHorizontalTracker } from './viewParts/notebookHorizontalTracker.js';
import { NotebookCellEditorPool } from './view/notebookCellEditorPool.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { NotebookCellLayoutManager } from './notebookCellLayoutManager.js';
import { FloatingEditorToolbar } from '../../../../editor/contrib/floatingMenu/browser/floatingMenu.js';
const $ = DOM.$;
export function getDefaultNotebookCreationOptions() {
    // We inlined the id to avoid loading comment contrib in tests
    const skipContributions = [
        'editor.contrib.review',
        FloatingEditorClickMenu.ID,
        FloatingEditorToolbar.ID,
        'editor.contrib.dirtydiff',
        'editor.contrib.testingOutputPeek',
        'editor.contrib.testingDecorations',
        'store.contrib.stickyScrollController',
        'editor.contrib.findController',
        'editor.contrib.emptyTextEditorHint'
    ];
    const contributions = EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);
    return {
        menuIds: {
            notebookToolbar: MenuId.NotebookToolbar,
            cellTitleToolbar: MenuId.NotebookCellTitle,
            cellDeleteToolbar: MenuId.NotebookCellDelete,
            cellInsertToolbar: MenuId.NotebookCellBetween,
            cellTopInsertToolbar: MenuId.NotebookCellListTop,
            cellExecuteToolbar: MenuId.NotebookCellExecute,
            cellExecutePrimary: MenuId.NotebookCellExecutePrimary,
        },
        cellEditorContributions: contributions
    };
}
let NotebookEditorWidget = class NotebookEditorWidget extends Disposable {
    get isVisible() {
        return this._isVisible;
    }
    get isDisposed() {
        return this._isDisposed;
    }
    set viewModel(newModel) {
        this._onWillChangeModel.fire(this._notebookViewModel?.notebookDocument);
        this._notebookViewModel = newModel;
        this._onDidChangeModel.fire(newModel?.notebookDocument);
    }
    get viewModel() {
        return this._notebookViewModel;
    }
    get textModel() {
        return this._notebookViewModel?.notebookDocument;
    }
    get isReadOnly() {
        return this._notebookViewModel?.options.isReadOnly ?? false;
    }
    get activeCodeEditor() {
        if (this._isDisposed) {
            return;
        }
        const [focused] = this._list.getFocusedElements();
        return this._renderedEditors.get(focused);
    }
    get activeCellAndCodeEditor() {
        if (this._isDisposed) {
            return;
        }
        const [focused] = this._list.getFocusedElements();
        const editor = this._renderedEditors.get(focused);
        if (!editor) {
            return;
        }
        return [focused, editor];
    }
    get codeEditors() {
        return [...this._renderedEditors];
    }
    get visibleRanges() {
        return this._list ? (this._list.visibleRanges || []) : [];
    }
    get notebookOptions() {
        return this._notebookOptions;
    }
    constructor(creationOptions, dimension, instantiationService, editorGroupsService, notebookRendererMessaging, notebookEditorService, notebookKernelService, _notebookService, configurationService, contextKeyService, layoutService, contextMenuService, telemetryService, notebookExecutionService, editorProgressService, logService) {
        super();
        this.creationOptions = creationOptions;
        this.notebookRendererMessaging = notebookRendererMessaging;
        this.notebookEditorService = notebookEditorService;
        this.notebookKernelService = notebookKernelService;
        this._notebookService = _notebookService;
        this.configurationService = configurationService;
        this.layoutService = layoutService;
        this.contextMenuService = contextMenuService;
        this.telemetryService = telemetryService;
        this.notebookExecutionService = notebookExecutionService;
        this.editorProgressService = editorProgressService;
        this.logService = logService;
        //#region Eventing
        this._onDidChangeCellState = this._register(new Emitter());
        this.onDidChangeCellState = this._onDidChangeCellState.event;
        this._onDidChangeViewCells = this._register(new Emitter());
        this.onDidChangeViewCells = this._onDidChangeViewCells.event;
        this._onWillChangeModel = this._register(new Emitter());
        this.onWillChangeModel = this._onWillChangeModel.event;
        this._onDidChangeModel = this._register(new Emitter());
        this.onDidChangeModel = this._onDidChangeModel.event;
        this._onDidAttachViewModel = this._register(new Emitter());
        this.onDidAttachViewModel = this._onDidAttachViewModel.event;
        this._onDidChangeOptions = this._register(new Emitter());
        this.onDidChangeOptions = this._onDidChangeOptions.event;
        this._onDidChangeDecorations = this._register(new Emitter());
        this.onDidChangeDecorations = this._onDidChangeDecorations.event;
        this._onDidScroll = this._register(new Emitter());
        this.onDidScroll = this._onDidScroll.event;
        this._onDidChangeLayout = this._register(new Emitter());
        this.onDidChangeLayout = this._onDidChangeLayout.event;
        this._onDidChangeActiveCell = this._register(new Emitter());
        this.onDidChangeActiveCell = this._onDidChangeActiveCell.event;
        this._onDidChangeFocus = this._register(new Emitter());
        this.onDidChangeFocus = this._onDidChangeFocus.event;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._onDidChangeVisibleRanges = this._register(new Emitter());
        this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
        this._onDidFocusEmitter = this._register(new Emitter());
        this.onDidFocusWidget = this._onDidFocusEmitter.event;
        this._onDidBlurEmitter = this._register(new Emitter());
        this.onDidBlurWidget = this._onDidBlurEmitter.event;
        this._onDidChangeActiveEditor = this._register(new Emitter());
        this.onDidChangeActiveEditor = this._onDidChangeActiveEditor.event;
        this._onDidChangeActiveKernel = this._register(new Emitter());
        this.onDidChangeActiveKernel = this._onDidChangeActiveKernel.event;
        this._onMouseUp = this._register(new Emitter());
        this.onMouseUp = this._onMouseUp.event;
        this._onMouseDown = this._register(new Emitter());
        this.onMouseDown = this._onMouseDown.event;
        this._onDidReceiveMessage = this._register(new Emitter());
        this.onDidReceiveMessage = this._onDidReceiveMessage.event;
        this._onDidRenderOutput = this._register(new Emitter());
        this.onDidRenderOutput = this._onDidRenderOutput.event;
        this._onDidRemoveOutput = this._register(new Emitter());
        this.onDidRemoveOutput = this._onDidRemoveOutput.event;
        this._onDidResizeOutputEmitter = this._register(new Emitter());
        this.onDidResizeOutput = this._onDidResizeOutputEmitter.event;
        this._webview = null;
        this._webviewResolvePromise = null;
        this._webviewTransparentCover = null;
        this._listDelegate = null;
        this._dndController = null;
        this._listTopCellToolbar = null;
        this._renderedEditors = new Map();
        this._localStore = this._register(new DisposableStore());
        this._localCellStateListeners = [];
        this._shadowElementViewInfo = null;
        this._contributions = new Map();
        this._insetModifyQueueByOutputId = new SequencerByKey();
        this._cellContextKeyManager = null;
        this._uuid = generateUuid();
        this._webviewFocused = false;
        this._isVisible = false;
        this._isDisposed = false;
        this._baseCellEditorOptions = new Map();
        this._debugFlag = false;
        this._backgroundMarkdownRenderRunning = false;
        this._lastCellWithEditorFocus = null;
        this._pendingOutputHeightAcks = new Map();
        this._dimension = dimension;
        this.isReplHistory = creationOptions.isReplHistory ?? false;
        this._readOnly = creationOptions.isReadOnly ?? false;
        this._overlayContainer = document.createElement('div');
        this.scopedContextKeyService = this._register(contextKeyService.createScoped(this._overlayContainer));
        this.instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
        this._notebookOptions = creationOptions.options ??
            this.instantiationService.createInstance(NotebookOptions, this.creationOptions?.codeWindow ?? mainWindow, this._readOnly, undefined);
        this._register(this._notebookOptions);
        const eventDispatcher = this._register(new NotebookEventDispatcher());
        this._viewContext = new ViewContext(this._notebookOptions, eventDispatcher, language => this.getBaseCellEditorOptions(language));
        this._register(this._viewContext.eventDispatcher.onDidChangeLayout(() => {
            this._onDidChangeLayout.fire();
        }));
        this._register(this._viewContext.eventDispatcher.onDidChangeCellState(e => {
            this._onDidChangeCellState.fire(e);
        }));
        this._register(_notebookService.onDidChangeOutputRenderers(() => {
            this._updateOutputRenderers();
        }));
        this._register(this.instantiationService.createInstance(NotebookEditorContextKeys, this));
        this._register(notebookKernelService.onDidChangeSelectedNotebooks(e => {
            if (isEqual(e.notebook, this.viewModel?.uri)) {
                this._loadKernelPreloads();
                this._onDidChangeActiveKernel.fire();
            }
        }));
        this._scrollBeyondLastLine = this.configurationService.getValue('editor.scrollBeyondLastLine');
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.scrollBeyondLastLine')) {
                this._scrollBeyondLastLine = this.configurationService.getValue('editor.scrollBeyondLastLine');
                if (this._dimension && this._isVisible) {
                    this.layout(this._dimension);
                }
            }
        }));
        this._register(this._notebookOptions.onDidChangeOptions(e => {
            if (e.cellStatusBarVisibility || e.cellToolbarLocation || e.cellToolbarInteraction) {
                this._updateForNotebookConfiguration();
            }
            if (e.fontFamily) {
                this._generateFontInfo();
            }
            if (e.compactView
                || e.focusIndicator
                || e.insertToolbarPosition
                || e.cellToolbarLocation
                || e.dragAndDropEnabled
                || e.fontSize
                || e.markupFontSize
                || e.markdownLineHeight
                || e.fontFamily
                || e.insertToolbarAlignment
                || e.outputFontSize
                || e.outputLineHeight
                || e.outputFontFamily
                || e.outputWordWrap
                || e.outputScrolling
                || e.outputLinkifyFilePaths
                || e.minimalError) {
                this._styleElement?.remove();
                this._createLayoutStyles();
                this._webview?.updateOptions({
                    ...this.notebookOptions.computeWebviewOptions(),
                    fontFamily: this._generateFontFamily()
                });
            }
            if (this._dimension && this._isVisible) {
                this.layout(this._dimension);
            }
        }));
        const container = creationOptions.codeWindow ? this.layoutService.getContainer(creationOptions.codeWindow) : this.layoutService.mainContainer;
        this._register(editorGroupsService.getPart(container).onDidScroll(e => {
            if (!this._shadowElement || !this._isVisible) {
                return;
            }
            this.updateShadowElement(this._shadowElement, this._dimension);
            this.layoutContainerOverShadowElement(this._dimension, this._position);
        }));
        this.notebookEditorService.addNotebookEditor(this);
        const id = generateUuid();
        this._overlayContainer.id = `notebook-${id}`;
        this._overlayContainer.className = 'notebookOverlay';
        this._overlayContainer.classList.add('notebook-editor');
        this._overlayContainer.inert = true;
        this._overlayContainer.style.visibility = 'hidden';
        container.appendChild(this._overlayContainer);
        this._createBody(this._overlayContainer);
        this._generateFontInfo();
        this._isVisible = true;
        this._editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.scopedContextKeyService);
        this._outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.scopedContextKeyService);
        this._outputInputFocus = NOTEBOOK_OUTPUT_INPUT_FOCUSED.bindTo(this.scopedContextKeyService);
        this._editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.scopedContextKeyService);
        this._cursorNavMode = NOTEBOOK_CURSOR_NAVIGATION_MODE.bindTo(this.scopedContextKeyService);
        // Never display the native cut/copy context menu items in notebooks
        new RawContextKey(PreventDefaultContextMenuItemsContextKeyName, false).bindTo(this.scopedContextKeyService).set(true);
        this._editorEditable.set(!creationOptions.isReadOnly);
        let contributions;
        if (Array.isArray(this.creationOptions.contributions)) {
            contributions = this.creationOptions.contributions;
        }
        else {
            contributions = NotebookEditorExtensionsRegistry.getEditorContributions();
        }
        for (const desc of contributions) {
            let contribution;
            try {
                contribution = this.instantiationService.createInstance(desc.ctor, this);
            }
            catch (err) {
                onUnexpectedError(err);
            }
            if (contribution) {
                if (!this._contributions.has(desc.id)) {
                    this._contributions.set(desc.id, contribution);
                }
                else {
                    contribution.dispose();
                    throw new Error(`DUPLICATE notebook editor contribution: '${desc.id}'`);
                }
            }
        }
        this._updateForNotebookConfiguration();
    }
    _debug(...args) {
        if (!this._debugFlag) {
            return;
        }
        notebookDebug(...args);
    }
    /**
     * EditorId
     */
    getId() {
        return this._uuid;
    }
    getViewModel() {
        return this.viewModel;
    }
    getLength() {
        return this.viewModel?.length ?? 0;
    }
    getSelections() {
        return this.viewModel?.getSelections() ?? [{ start: 0, end: 0 }];
    }
    setSelections(selections) {
        if (!this.viewModel) {
            return;
        }
        const focus = this.viewModel.getFocus();
        this.viewModel.updateSelectionsState({
            kind: SelectionStateType.Index,
            focus: focus,
            selections: selections
        });
    }
    getFocus() {
        return this.viewModel?.getFocus() ?? { start: 0, end: 0 };
    }
    setFocus(focus) {
        if (!this.viewModel) {
            return;
        }
        const selections = this.viewModel.getSelections();
        this.viewModel.updateSelectionsState({
            kind: SelectionStateType.Index,
            focus: focus,
            selections: selections
        });
    }
    getSelectionViewModels() {
        if (!this.viewModel) {
            return [];
        }
        const cellsSet = new Set();
        return this.viewModel.getSelections().map(range => this.viewModel.viewCells.slice(range.start, range.end)).reduce((a, b) => {
            b.forEach(cell => {
                if (!cellsSet.has(cell.handle)) {
                    cellsSet.add(cell.handle);
                    a.push(cell);
                }
            });
            return a;
        }, []);
    }
    hasModel() {
        return !!this._notebookViewModel;
    }
    showProgress() {
        this._currentProgress = this.editorProgressService.show(true);
    }
    hideProgress() {
        if (this._currentProgress) {
            this._currentProgress.done();
            this._currentProgress = undefined;
        }
    }
    //#region Editor Core
    getBaseCellEditorOptions(language) {
        const existingOptions = this._baseCellEditorOptions.get(language);
        if (existingOptions) {
            return existingOptions;
        }
        else {
            const options = new BaseCellEditorOptions(this, this.notebookOptions, this.configurationService, language);
            this._baseCellEditorOptions.set(language, options);
            return options;
        }
    }
    _updateForNotebookConfiguration() {
        if (!this._overlayContainer) {
            return;
        }
        this._overlayContainer.classList.remove('cell-title-toolbar-left');
        this._overlayContainer.classList.remove('cell-title-toolbar-right');
        this._overlayContainer.classList.remove('cell-title-toolbar-hidden');
        const cellToolbarLocation = this._notebookOptions.computeCellToolbarLocation(this.viewModel?.viewType);
        this._overlayContainer.classList.add(`cell-title-toolbar-${cellToolbarLocation}`);
        const cellToolbarInteraction = this._notebookOptions.getDisplayOptions().cellToolbarInteraction;
        let cellToolbarInteractionState = 'hover';
        this._overlayContainer.classList.remove('cell-toolbar-hover');
        this._overlayContainer.classList.remove('cell-toolbar-click');
        if (cellToolbarInteraction === 'hover' || cellToolbarInteraction === 'click') {
            cellToolbarInteractionState = cellToolbarInteraction;
        }
        this._overlayContainer.classList.add(`cell-toolbar-${cellToolbarInteractionState}`);
    }
    _generateFontInfo() {
        const editorOptions = this.configurationService.getValue('editor');
        const targetWindow = DOM.getWindow(this.getDomNode());
        this._fontInfo = FontMeasurements.readFontInfo(targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value));
    }
    _createBody(parent) {
        this._notebookTopToolbarContainer = document.createElement('div');
        this._notebookTopToolbarContainer.classList.add('notebook-toolbar-container');
        this._notebookTopToolbarContainer.style.display = 'none';
        DOM.append(parent, this._notebookTopToolbarContainer);
        this._notebookStickyScrollContainer = document.createElement('div');
        this._notebookStickyScrollContainer.classList.add('notebook-sticky-scroll-container');
        DOM.append(parent, this._notebookStickyScrollContainer);
        this._body = document.createElement('div');
        DOM.append(parent, this._body);
        this._body.classList.add('cell-list-container');
        this._createLayoutStyles();
        this._createCellList();
        this._notebookOverviewRulerContainer = document.createElement('div');
        this._notebookOverviewRulerContainer.classList.add('notebook-overview-ruler-container');
        this._list.scrollableElement.appendChild(this._notebookOverviewRulerContainer);
        this._registerNotebookOverviewRuler();
        this._register(this.instantiationService.createInstance(NotebookHorizontalTracker, this, this._list.scrollableElement));
        this._overflowContainer = document.createElement('div');
        this._overflowContainer.classList.add('notebook-overflow-widget-container', 'monaco-editor');
        DOM.append(parent, this._overflowContainer);
    }
    _generateFontFamily() {
        return this._fontInfo?.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
    }
    _createLayoutStyles() {
        this._styleElement = domStylesheets.createStyleSheet(this._body);
        const { cellRightMargin, cellTopMargin, cellRunGutter, cellBottomMargin, codeCellLeftMargin, markdownCellGutter, markdownCellLeftMargin, markdownCellBottomMargin, markdownCellTopMargin, collapsedIndicatorHeight, focusIndicator, insertToolbarPosition, outputFontSize, focusIndicatorLeftMargin, focusIndicatorGap } = this._notebookOptions.getLayoutConfiguration();
        const { insertToolbarAlignment, compactView, fontSize } = this._notebookOptions.getDisplayOptions();
        const getCellEditorContainerLeftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
        const { bottomToolbarGap, bottomToolbarHeight } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
        const styleSheets = [];
        if (!this._fontInfo) {
            this._generateFontInfo();
        }
        const fontFamily = this._generateFontFamily();
        styleSheets.push(`
		.notebook-editor {
			--notebook-cell-output-font-size: ${outputFontSize}px;
			--notebook-cell-input-preview-font-size: ${fontSize}px;
			--notebook-cell-input-preview-font-family: ${fontFamily};
		}
		`);
        if (compactView) {
            styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
        }
        else {
            styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${codeCellLeftMargin}px; }`);
        }
        // focus indicator
        if (focusIndicator === 'border') {
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:after {
				content: "";
				position: absolute;
				width: 100%;
				height: 1px;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				content: "";
				position: absolute;
				width: 1px;
				height: 100%;
				z-index: 10;
			}

			/* top border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before {
				border-top: 1px solid transparent;
			}

			/* left border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before {
				border-left: 1px solid transparent;
			}

			/* bottom border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before {
				border-bottom: 1px solid transparent;
			}

			/* right border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				border-right: 1px solid transparent;
			}
			`);
            // left and right border margins
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-right:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-right:before {
				top: -${cellTopMargin}px; height: calc(100% + ${cellTopMargin + cellBottomMargin}px)
			}`);
        }
        else {
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-left: 3px solid transparent;
				border-radius: 4px;
				width: 0px;
				margin-left: ${focusIndicatorLeftMargin}px;
				border-color: var(--vscode-notebook-inactiveFocusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-output-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .markdown-cell-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row:hover .cell-focus-indicator-left .codeOutput-focus-indicator-container {
				display: block;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator-container:hover .codeOutput-focus-indicator {
				border-left: 5px solid transparent;
				margin-left: ${focusIndicatorLeftMargin - 1}px;
			}
			`);
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-inner-container.cell-output-focus .cell-focus-indicator-left .codeOutput-focus-indicator,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-color: var(--vscode-notebook-focusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-inner-container .cell-focus-indicator-left .output-focus-indicator {
				margin-top: ${focusIndicatorGap}px;
			}
			`);
        }
        // between cell insert toolbar
        if (insertToolbarPosition === 'betweenCells' || insertToolbarPosition === 'both') {
            styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: flex; }`);
            styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: flex; }`);
        }
        else {
            styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: none; }`);
            styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: none; }`);
        }
        if (insertToolbarAlignment === 'left') {
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .action-item:first-child {
				margin-right: 0px !important;
			}`);
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar .action-label {
				padding: 0px !important;
				justify-content: center;
				border-radius: 4px;
			}`);
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container {
				align-items: flex-start;
				justify-content: left;
				margin: 0 16px 0 ${8 + codeCellLeftMargin}px;
			}`);
            styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.notebookOverlay .cell-bottom-toolbar-container .action-item {
				border: 0px;
			}`);
        }
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
        // Chat Edit, deleted Cell Overlay
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
        // Chat Edit, deleted Cell Overlay
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell { margin-right: ${cellRightMargin}px; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell { margin-right: ${cellRightMargin}px; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .cell-inner-container { padding-top: ${cellTopMargin}px; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container.webview-backed-markdown-cell { padding: 0; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .webview-backed-markdown-cell.markdown-cell-edit-mode .cell.code { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
        styleSheets.push(`.notebookOverlay .output { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay .output { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
        // comment
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { left: ${getCellEditorContainerLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
        // output collapse button
        styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton { left: -${cellRunGutter}px; }`);
        styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton {
			position: absolute;
			width: ${cellRunGutter}px;
			padding: 6px 0px;
		}`);
        // show more container
        styleSheets.push(`.notebookOverlay .output-show-more-container { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay .output-show-more-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
        styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.markdown { padding-left: ${cellRunGutter}px; }`);
        styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container .notebook-folding-indicator { left: ${(markdownCellGutter - 20) / 2 + markdownCellLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay > .cell-list-container .notebook-folded-hint { left: ${markdownCellGutter + markdownCellLeftMargin + 8}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row :not(.webview-backed-markdown-cell) .cell-focus-indicator-top { height: ${cellTopMargin}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-side { bottom: ${bottomToolbarGap}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-focus-indicator-left { width: ${getCellEditorContainerLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row .cell-focus-indicator-left { width: ${codeCellLeftMargin}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator.cell-focus-indicator-right { width: ${cellRightMargin}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom { height: ${cellBottomMargin}px; }`);
        styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-shadow-container-bottom { top: ${cellBottomMargin}px; }`);
        styleSheets.push(`
			.notebookOverlay .monaco-list.selection-multiple .monaco-list-row:has(+ .monaco-list-row.selected) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
			}
		`);
        styleSheets.push(`
			.notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}

			.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin - 6}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}
		`);
        styleSheets.push(`
			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview {
				line-height: ${collapsedIndicatorHeight}px;
			}

			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview .monaco-tokenized-source {
				max-height: ${collapsedIndicatorHeight}px;
			}
		`);
        styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
        styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
        // cell toolbar
        styleSheets.push(`.monaco-workbench .notebookOverlay.cell-title-toolbar-right > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			right: ${cellRightMargin + 26}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-left > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			left: ${getCellEditorContainerLeftMargin + 16}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-hidden > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			display: none;
		}`);
        // cell output innert container
        styleSheets.push(`
		.monaco-workbench .notebookOverlay .output > div.foreground.output-inner-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .output-collapse-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		`);
        // chat
        styleSheets.push(`
		.monaco-workbench .notebookOverlay .cell-chat-part {
			margin: 0 ${cellRightMargin}px 6px 4px;
		}
		`);
        this._styleElement.textContent = styleSheets.join('\n');
    }
    _createCellList() {
        this._body.classList.add('cell-list-container');
        this._dndController = this._register(new CellDragAndDropController(this, this._body));
        const getScopedContextKeyService = (container) => this._list.contextKeyService.createScoped(container);
        this._editorPool = this._register(this.instantiationService.createInstance(NotebookCellEditorPool, this, getScopedContextKeyService));
        const renderers = [
            this.instantiationService.createInstance(CodeCellRenderer, this, this._renderedEditors, this._editorPool, this._dndController, getScopedContextKeyService),
            this.instantiationService.createInstance(MarkupCellRenderer, this, this._dndController, this._renderedEditors, getScopedContextKeyService),
        ];
        renderers.forEach(renderer => {
            this._register(renderer);
        });
        this._listDelegate = this.instantiationService.createInstance(NotebookCellListDelegate, DOM.getWindow(this.getDomNode()));
        this._register(this._listDelegate);
        const accessibilityProvider = this.instantiationService.createInstance(NotebookAccessibilityProvider, () => this.viewModel, this.isReplHistory);
        this._register(accessibilityProvider);
        this._list = this.instantiationService.createInstance(NotebookCellList, 'NotebookCellList', this._body, this._viewContext.notebookOptions, this._listDelegate, renderers, this.scopedContextKeyService, {
            setRowLineHeight: false,
            setRowHeight: false,
            supportDynamicHeights: true,
            horizontalScrolling: false,
            keyboardSupport: false,
            mouseSupport: true,
            multipleSelectionSupport: true,
            selectionNavigation: true,
            typeNavigationEnabled: true,
            paddingTop: 0,
            paddingBottom: 0,
            transformOptimization: false, //(isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
            initialSize: this._dimension,
            styleController: (_suffix) => { return this._list; },
            overrideStyles: {
                listBackground: notebookEditorBackground,
                listActiveSelectionBackground: notebookEditorBackground,
                listActiveSelectionForeground: foreground,
                listFocusAndSelectionBackground: notebookEditorBackground,
                listFocusAndSelectionForeground: foreground,
                listFocusBackground: notebookEditorBackground,
                listFocusForeground: foreground,
                listHoverForeground: foreground,
                listHoverBackground: notebookEditorBackground,
                listHoverOutline: focusBorder,
                listFocusOutline: focusBorder,
                listInactiveSelectionBackground: notebookEditorBackground,
                listInactiveSelectionForeground: foreground,
                listInactiveFocusBackground: notebookEditorBackground,
                listInactiveFocusOutline: notebookEditorBackground,
            },
            accessibilityProvider
        });
        this._cellLayoutManager = new NotebookCellLayoutManager(this, this._list, this.logService);
        this._dndController.setList(this._list);
        // create Webview
        this._register(this._list);
        this._listViewInfoAccessor = new ListViewInfoAccessor(this._list);
        this._register(this._listViewInfoAccessor);
        this._register(combinedDisposable(...renderers));
        // top cell toolbar
        this._listTopCellToolbar = this._register(this.instantiationService.createInstance(ListTopCellToolbar, this, this.notebookOptions));
        // transparent cover
        this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $('.webview-cover'));
        this._webviewTransparentCover.style.display = 'none';
        this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overlayContainer, (e) => {
            if (e.target.classList.contains('slider') && this._webviewTransparentCover) {
                this._webviewTransparentCover.style.display = 'block';
            }
        }));
        this._register(DOM.addStandardDisposableGenericMouseUpListener(this._overlayContainer, () => {
            if (this._webviewTransparentCover) {
                // no matter when
                this._webviewTransparentCover.style.display = 'none';
            }
        }));
        this._register(this._list.onMouseDown(e => {
            if (e.element) {
                this._onMouseDown.fire({ event: e.browserEvent, target: e.element });
            }
        }));
        this._register(this._list.onMouseUp(e => {
            if (e.element) {
                this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
            }
        }));
        this._register(this._list.onDidChangeFocus(_e => {
            this._onDidChangeActiveEditor.fire(this);
            this._onDidChangeActiveCell.fire();
            this._onDidChangeFocus.fire();
            this._cursorNavMode.set(false);
        }));
        this._register(this._list.onContextMenu(e => {
            this.showListContextMenu(e);
        }));
        this._register(this._list.onDidChangeVisibleRanges(() => {
            this._onDidChangeVisibleRanges.fire();
        }));
        this._register(this._list.onDidScroll((e) => {
            if (e.scrollTop !== e.oldScrollTop) {
                this._onDidScroll.fire();
                this.clearActiveCellWidgets();
            }
            if (e.scrollTop === e.oldScrollTop && e.scrollHeightChanged) {
                this._onDidChangeLayout.fire();
            }
        }));
        this._focusTracker = this._register(DOM.trackFocus(this.getDomNode()));
        this._register(this._focusTracker.onDidBlur(() => {
            this._editorFocus.set(false);
            this.viewModel?.setEditorFocus(false);
            this._onDidBlurEmitter.fire();
        }));
        this._register(this._focusTracker.onDidFocus(() => {
            this._editorFocus.set(true);
            this.viewModel?.setEditorFocus(true);
            this._onDidFocusEmitter.fire();
        }));
        this._registerNotebookActionsToolbar();
        this._registerNotebookStickyScroll();
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(accessibilityProvider.verbositySettingId)) {
                this._list.ariaLabel = accessibilityProvider?.getWidgetAriaLabel();
            }
        }));
    }
    showListContextMenu(e) {
        this.contextMenuService.showContextMenu({
            menuId: MenuId.NotebookCellTitle,
            menuActionOptions: {
                shouldForwardArgs: true
            },
            contextKeyService: this.scopedContextKeyService,
            getAnchor: () => e.anchor,
            getActionsContext: () => {
                return {
                    from: 'cellContainer'
                };
            }
        });
    }
    _registerNotebookOverviewRuler() {
        this._notebookOverviewRuler = this._register(this.instantiationService.createInstance(NotebookOverviewRuler, this, this._notebookOverviewRulerContainer));
    }
    _registerNotebookActionsToolbar() {
        this._notebookTopToolbar = this._register(this.instantiationService.createInstance(NotebookEditorWorkbenchToolbar, this, this.scopedContextKeyService, this._notebookOptions, this._notebookTopToolbarContainer));
        this._register(this._notebookTopToolbar.onDidChangeVisibility(() => {
            if (this._dimension && this._isVisible) {
                this.layout(this._dimension);
            }
        }));
    }
    _registerNotebookStickyScroll() {
        this._notebookStickyScroll = this._register(this.instantiationService.createInstance(NotebookStickyScroll, this._notebookStickyScrollContainer, this, this._list, (sizeDelta) => {
            if (this.isDisposed) {
                return;
            }
            if (this._dimension && this._isVisible) {
                if (sizeDelta > 0) { // delta > 0 ==> sticky is growing, cell list shrinking
                    this.layout(this._dimension);
                    this.setScrollTop(this.scrollTop + sizeDelta);
                }
                else if (sizeDelta < 0) { // delta < 0 ==> sticky is shrinking, cell list growing
                    this.setScrollTop(this.scrollTop + sizeDelta);
                    this.layout(this._dimension);
                }
            }
            this._onDidScroll.fire();
        }));
    }
    _updateOutputRenderers() {
        if (!this.viewModel || !this._webview) {
            return;
        }
        this._webview.updateOutputRenderers();
        this.viewModel.viewCells.forEach(cell => {
            cell.outputsViewModels.forEach(output => {
                if (output.pickedMimeType?.rendererId === RENDERER_NOT_AVAILABLE) {
                    output.resetRenderer();
                }
            });
        });
    }
    getDomNode() {
        return this._overlayContainer;
    }
    getOverflowContainerDomNode() {
        return this._overflowContainer;
    }
    getInnerWebview() {
        return this._webview?.webview;
    }
    setEditorProgressService(editorProgressService) {
        this.editorProgressService = editorProgressService;
    }
    setParentContextKeyService(parentContextKeyService) {
        this.scopedContextKeyService.updateParent(parentContextKeyService);
    }
    async setModel(textModel, viewState, perf, viewType) {
        if (this.viewModel === undefined || !this.viewModel.equal(textModel)) {
            const oldBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
            this._detachModel();
            await this._attachModel(textModel, viewType ?? textModel.viewType, viewState, perf);
            const newBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
            if (oldBottomToolbarDimensions.bottomToolbarGap !== newBottomToolbarDimensions.bottomToolbarGap
                || oldBottomToolbarDimensions.bottomToolbarHeight !== newBottomToolbarDimensions.bottomToolbarHeight) {
                this._styleElement?.remove();
                this._createLayoutStyles();
                this._webview?.updateOptions({
                    ...this.notebookOptions.computeWebviewOptions(),
                    fontFamily: this._generateFontFamily()
                });
            }
            this.telemetryService.publicLog2('notebook/editorOpened', {
                scheme: textModel.uri.scheme,
                ext: extname(textModel.uri),
                viewType: textModel.viewType,
                isRepl: this.isReplHistory
            });
        }
        else {
            this.restoreListViewState(viewState);
        }
        this._restoreSelectedKernel(viewState);
        // load preloads for matching kernel
        this._loadKernelPreloads();
        // clear state
        this._dndController?.clearGlobalDragState();
        this._localStore.add(this._list.onDidChangeFocus(() => {
            this.updateContextKeysOnFocusChange();
        }));
        this.updateContextKeysOnFocusChange();
        // render markdown top down on idle
        this._backgroundMarkdownRendering();
    }
    _backgroundMarkdownRendering() {
        if (this._backgroundMarkdownRenderRunning) {
            return;
        }
        this._backgroundMarkdownRenderRunning = true;
        DOM.runWhenWindowIdle(DOM.getWindow(this.getDomNode()), (deadline) => {
            this._backgroundMarkdownRenderingWithDeadline(deadline);
        });
    }
    _backgroundMarkdownRenderingWithDeadline(deadline) {
        const endTime = Date.now() + deadline.timeRemaining();
        const execute = () => {
            try {
                this._backgroundMarkdownRenderRunning = true;
                if (this._isDisposed) {
                    return;
                }
                if (!this.viewModel) {
                    return;
                }
                const firstMarkupCell = this.viewModel.viewCells.find(cell => cell.cellKind === CellKind.Markup && !this._webview?.markupPreviewMapping.has(cell.id) && !this.cellIsHidden(cell));
                if (!firstMarkupCell) {
                    return;
                }
                this.createMarkupPreview(firstMarkupCell);
            }
            finally {
                this._backgroundMarkdownRenderRunning = false;
            }
            if (Date.now() < endTime) {
                setTimeout0(execute);
            }
            else {
                this._backgroundMarkdownRendering();
            }
        };
        execute();
    }
    updateContextKeysOnFocusChange() {
        if (!this.viewModel) {
            return;
        }
        const focused = this._list.getFocusedElements()[0];
        if (focused) {
            if (!this._cellContextKeyManager) {
                this._cellContextKeyManager = this._localStore.add(this.instantiationService.createInstance(CellContextKeyManager, this, focused));
            }
            this._cellContextKeyManager.updateForElement(focused);
        }
    }
    async setOptions(options) {
        if (options?.isReadOnly !== undefined) {
            this._readOnly = options?.isReadOnly;
        }
        if (!this.viewModel) {
            return;
        }
        this.viewModel.updateOptions({ isReadOnly: this._readOnly });
        this.notebookOptions.updateOptions(this._readOnly);
        // reveal cell if editor options tell to do so
        const cellOptions = options?.cellOptions ?? this._parseIndexedCellOptions(options);
        if (cellOptions) {
            const cell = this.viewModel.viewCells.find(cell => cell.uri.toString() === cellOptions.resource.toString());
            if (cell) {
                this.focusElement(cell);
                const selection = cellOptions.options?.selection;
                if (selection) {
                    cell.updateEditState(CellEditState.Editing, 'setOptions');
                    cell.focusMode = CellFocusMode.Editor;
                    await this.revealRangeInCenterIfOutsideViewportAsync(cell, new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber || selection.startLineNumber, selection.endColumn || selection.startColumn));
                }
                else {
                    this._list.revealCell(cell, options?.cellRevealType ?? 4 /* CellRevealType.CenterIfOutsideViewport */);
                }
                const editor = this._renderedEditors.get(cell);
                if (editor) {
                    if (cellOptions.options?.selection) {
                        const { selection } = cellOptions.options;
                        const editorSelection = new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber || selection.startLineNumber, selection.endColumn || selection.startColumn);
                        editor.setSelection(editorSelection);
                        editor.revealPositionInCenterIfOutsideViewport({
                            lineNumber: selection.startLineNumber,
                            column: selection.startColumn
                        });
                        await this.revealRangeInCenterIfOutsideViewportAsync(cell, editorSelection);
                    }
                    if (!cellOptions.options?.preserveFocus) {
                        editor.focus();
                    }
                }
            }
        }
        // select cells if options tell to do so
        // todo@rebornix https://github.com/microsoft/vscode/issues/118108 support selections not just focus
        // todo@rebornix support multipe selections
        if (options?.cellSelections) {
            const focusCellIndex = options.cellSelections[0].start;
            const focusedCell = this.viewModel.cellAt(focusCellIndex);
            if (focusedCell) {
                this.viewModel.updateSelectionsState({
                    kind: SelectionStateType.Index,
                    focus: { start: focusCellIndex, end: focusCellIndex + 1 },
                    selections: options.cellSelections
                });
                this.revealInCenterIfOutsideViewport(focusedCell);
            }
        }
        this._updateForOptions();
        this._onDidChangeOptions.fire();
    }
    _parseIndexedCellOptions(options) {
        if (options?.indexedCellOptions) {
            // convert index based selections
            const cell = this.cellAt(options.indexedCellOptions.index);
            if (cell) {
                return {
                    resource: cell.uri,
                    options: {
                        selection: options.indexedCellOptions.selection,
                        preserveFocus: false
                    }
                };
            }
        }
        return undefined;
    }
    _detachModel() {
        this._localStore.clear();
        dispose(this._localCellStateListeners);
        this._list.detachViewModel();
        this.viewModel?.dispose();
        // avoid event
        this.viewModel = undefined;
        this._webview?.dispose();
        this._webview?.element.remove();
        this._webview = null;
        this._list.clear();
    }
    _updateForOptions() {
        if (!this.viewModel) {
            return;
        }
        this._editorEditable.set(!this.viewModel.options.isReadOnly);
        this._overflowContainer.classList.toggle('notebook-editor-editable', !this.viewModel.options.isReadOnly);
        this.getDomNode().classList.toggle('notebook-editor-editable', !this.viewModel.options.isReadOnly);
    }
    async _resolveWebview() {
        if (!this.textModel) {
            return null;
        }
        if (this._webviewResolvePromise) {
            return this._webviewResolvePromise;
        }
        if (!this._webview) {
            this._ensureWebview(this.getId(), this.textModel.viewType, this.textModel.uri);
        }
        this._webviewResolvePromise = (async () => {
            if (!this._webview) {
                throw new Error('Notebook output webview object is not created successfully.');
            }
            await this._webview.createWebview(this.creationOptions.codeWindow ?? mainWindow);
            if (!this._webview.webview) {
                throw new Error('Notebook output webview element was not created successfully.');
            }
            this._localStore.add(this._webview.webview.onDidBlur(() => {
                this._outputFocus.set(false);
                this._webviewFocused = false;
                this.updateEditorFocus();
                this.updateCellFocusMode();
            }));
            this._localStore.add(this._webview.webview.onDidFocus(() => {
                this._outputFocus.set(true);
                this.updateEditorFocus();
                this._webviewFocused = true;
            }));
            this._localStore.add(this._webview.onMessage(e => {
                this._onDidReceiveMessage.fire(e);
            }));
            return this._webview;
        })();
        return this._webviewResolvePromise;
    }
    _ensureWebview(id, viewType, resource) {
        if (this._webview) {
            return;
        }
        const that = this;
        this._webview = this.instantiationService.createInstance(BackLayerWebView, {
            get creationOptions() { return that.creationOptions; },
            setScrollTop(scrollTop) { that._list.scrollTop = scrollTop; },
            triggerScroll(event) { that._list.triggerScrollFromMouseWheelEvent(event); },
            getCellByInfo: that.getCellByInfo.bind(that),
            getCellById: that._getCellById.bind(that),
            toggleNotebookCellSelection: that._toggleNotebookCellSelection.bind(that),
            focusNotebookCell: that.focusNotebookCell.bind(that),
            focusNextNotebookCell: that.focusNextNotebookCell.bind(that),
            updateOutputHeight: that._updateOutputHeight.bind(that),
            scheduleOutputHeightAck: that._scheduleOutputHeightAck.bind(that),
            updateMarkupCellHeight: that._updateMarkupCellHeight.bind(that),
            setMarkupCellEditState: that._setMarkupCellEditState.bind(that),
            didStartDragMarkupCell: that._didStartDragMarkupCell.bind(that),
            didDragMarkupCell: that._didDragMarkupCell.bind(that),
            didDropMarkupCell: that._didDropMarkupCell.bind(that),
            didEndDragMarkupCell: that._didEndDragMarkupCell.bind(that),
            didResizeOutput: that._didResizeOutput.bind(that),
            updatePerformanceMetadata: that._updatePerformanceMetadata.bind(that),
            didFocusOutputInputChange: that._didFocusOutputInputChange.bind(that),
        }, id, viewType, resource, {
            ...this._notebookOptions.computeWebviewOptions(),
            fontFamily: this._generateFontFamily()
        }, this.notebookRendererMessaging.getScoped(this._uuid));
        this._webview.element.style.width = '100%';
        // attach the webview container to the DOM tree first
        this._list.attachWebview(this._webview.element);
    }
    async _attachModel(textModel, viewType, viewState, perf) {
        this._ensureWebview(this.getId(), textModel.viewType, textModel.uri);
        this.viewModel = this.instantiationService.createInstance(NotebookViewModel, viewType, textModel, this._viewContext, this.getLayoutInfo(), { isReadOnly: this._readOnly });
        this._viewContext.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
        this.notebookOptions.updateOptions(this._readOnly);
        this._updateForOptions();
        this._updateForNotebookConfiguration();
        // restore view states, including contributions
        {
            // restore view state
            this.viewModel.restoreEditorViewState(viewState);
            // contribution state restore
            const contributionsState = viewState?.contributionsState || {};
            for (const [id, contribution] of this._contributions) {
                if (typeof contribution.restoreViewState === 'function') {
                    contribution.restoreViewState(contributionsState[id]);
                }
            }
        }
        this._localStore.add(this.viewModel.onDidChangeViewCells(e => {
            this._onDidChangeViewCells.fire(e);
        }));
        this._localStore.add(this.viewModel.onDidChangeSelection(() => {
            this._onDidChangeSelection.fire();
            this.updateSelectedMarkdownPreviews();
        }));
        this._localStore.add(this._list.onWillScroll(e => {
            if (this._webview?.isResolved()) {
                this._webviewTransparentCover.style.transform = `translateY(${e.scrollTop})`;
            }
        }));
        let hasPendingChangeContentHeight = false;
        const renderScrollHeightDisposable = this._localStore.add(new MutableDisposable());
        this._localStore.add(this._list.onDidChangeContentHeight(() => {
            if (hasPendingChangeContentHeight) {
                return;
            }
            hasPendingChangeContentHeight = true;
            renderScrollHeightDisposable.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
                hasPendingChangeContentHeight = false;
                this._updateScrollHeight();
            }, 100);
        }));
        this._localStore.add(this._list.onDidRemoveOutputs(outputs => {
            outputs.forEach(output => this.removeInset(output));
        }));
        this._localStore.add(this._list.onDidHideOutputs(outputs => {
            outputs.forEach(output => this.hideInset(output));
        }));
        this._localStore.add(this._list.onDidRemoveCellsFromView(cells => {
            const hiddenCells = [];
            const deletedCells = [];
            for (const cell of cells) {
                if (cell.cellKind === CellKind.Markup) {
                    const mdCell = cell;
                    if (this.viewModel?.viewCells.find(cell => cell.handle === mdCell.handle)) {
                        // Cell has been folded but is still in model
                        hiddenCells.push(mdCell);
                    }
                    else {
                        // Cell was deleted
                        deletedCells.push(mdCell);
                    }
                }
            }
            this.hideMarkupPreviews(hiddenCells);
            this.deleteMarkupPreviews(deletedCells);
        }));
        // init rendering
        await this._warmupWithMarkdownRenderer(this.viewModel, viewState, perf);
        perf?.mark('customMarkdownLoaded');
        // model attached
        this._localCellStateListeners = this.viewModel.viewCells.map(cell => this._bindCellListener(cell));
        this._lastCellWithEditorFocus = this.viewModel.viewCells.find(viewCell => this.getActiveCell() === viewCell && viewCell.focusMode === CellFocusMode.Editor) ?? null;
        this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
            if (this._isDisposed) {
                return;
            }
            // update cell listener
            [...e.splices].reverse().forEach(splice => {
                const [start, deleted, newCells] = splice;
                const deletedCells = this._localCellStateListeners.splice(start, deleted, ...newCells.map(cell => this._bindCellListener(cell)));
                dispose(deletedCells);
            });
            if (e.splices.some(s => s[2].some(cell => cell.cellKind === CellKind.Markup))) {
                this._backgroundMarkdownRendering();
            }
        }));
        if (this._dimension) {
            this._list.layout(this.getBodyHeight(this._dimension.height), this._dimension.width);
        }
        else {
            this._list.layout();
        }
        this._dndController?.clearGlobalDragState();
        // restore list state at last, it must be after list layout
        this.restoreListViewState(viewState);
    }
    _bindCellListener(cell) {
        const store = new DisposableStore();
        store.add(cell.onDidChangeLayout(e => {
            // e.totalHeight will be false it's not changed
            if (e.totalHeight || e.outerWidth) {
                this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight, e.context);
            }
        }));
        if (cell.cellKind === CellKind.Code) {
            store.add(cell.onDidRemoveOutputs((outputs) => {
                outputs.forEach(output => this.removeInset(output));
            }));
        }
        store.add(cell.onDidChangeState(e => {
            if (e.inputCollapsedChanged && cell.isInputCollapsed && cell.cellKind === CellKind.Markup) {
                this.hideMarkupPreviews([cell]);
            }
            if (e.outputCollapsedChanged && cell.isOutputCollapsed && cell.cellKind === CellKind.Code) {
                cell.outputsViewModels.forEach(output => this.hideInset(output));
            }
            if (e.focusModeChanged) {
                this._validateCellFocusMode(cell);
            }
        }));
        store.add(cell.onCellDecorationsChanged(e => {
            e.added.forEach(options => {
                if (options.className) {
                    this.deltaCellContainerClassNames(cell.id, [options.className], [], cell.cellKind);
                }
                if (options.outputClassName) {
                    this.deltaCellContainerClassNames(cell.id, [options.outputClassName], [], cell.cellKind);
                }
            });
            e.removed.forEach(options => {
                if (options.className) {
                    this.deltaCellContainerClassNames(cell.id, [], [options.className], cell.cellKind);
                }
                if (options.outputClassName) {
                    this.deltaCellContainerClassNames(cell.id, [], [options.outputClassName], cell.cellKind);
                }
            });
        }));
        return store;
    }
    _validateCellFocusMode(cell) {
        if (cell.focusMode !== CellFocusMode.Editor) {
            return;
        }
        if (this._lastCellWithEditorFocus && this._lastCellWithEditorFocus !== cell) {
            this._lastCellWithEditorFocus.focusMode = CellFocusMode.Container;
        }
        this._lastCellWithEditorFocus = cell;
    }
    async _warmupWithMarkdownRenderer(viewModel, viewState, perf) {
        this.logService.debug('NotebookEditorWidget', 'warmup ' + this.viewModel?.uri.toString());
        await this._resolveWebview();
        perf?.mark('webviewCommLoaded');
        this.logService.debug('NotebookEditorWidget', 'warmup - webview resolved');
        // make sure that the webview is not visible otherwise users will see pre-rendered markdown cells in wrong position as the list view doesn't have a correct `top` offset yet
        this._webview.element.style.visibility = 'hidden';
        // warm up can take around 200ms to load markdown libraries, etc.
        await this._warmupViewportMarkdownCells(viewModel, viewState);
        this.logService.debug('NotebookEditorWidget', 'warmup - viewport warmed up');
        // todo@rebornix @mjbvz, is this too complicated?
        /* now the webview is ready, and requests to render markdown are fast enough
         * we can start rendering the list view
         * render
         *   - markdown cell -> request to webview to (10ms, basically just latency between UI and iframe)
         *   - code cell -> render in place
         */
        this._list.layout(0, 0);
        this._list.attachViewModel(viewModel);
        // now the list widget has a correct contentHeight/scrollHeight
        // setting scrollTop will work properly
        // after setting scroll top, the list view will update `top` of the scrollable element, e.g. `top: -584px`
        this._list.scrollTop = viewState?.scrollPosition?.top ?? 0;
        this._debug('finish initial viewport warmup and view state restore.');
        this._webview.element.style.visibility = 'visible';
        this.logService.debug('NotebookEditorWidget', 'warmup - list view model attached, set to visible');
        this._onDidAttachViewModel.fire();
    }
    async _warmupViewportMarkdownCells(viewModel, viewState) {
        if (viewState && viewState.cellTotalHeights) {
            const totalHeightCache = viewState.cellTotalHeights;
            const scrollTop = viewState.scrollPosition?.top ?? 0;
            const scrollBottom = scrollTop + Math.max(this._dimension?.height ?? 0, 1080);
            let offset = 0;
            const requests = [];
            for (let i = 0; i < viewModel.length; i++) {
                const cell = viewModel.cellAt(i);
                const cellHeight = totalHeightCache[i] ?? 0;
                if (offset + cellHeight < scrollTop) {
                    offset += cellHeight;
                    continue;
                }
                if (cell.cellKind === CellKind.Markup) {
                    requests.push([cell, offset]);
                }
                offset += cellHeight;
                if (offset > scrollBottom) {
                    break;
                }
            }
            await this._webview.initializeMarkup(requests.map(([model, offset]) => this.createMarkupCellInitialization(model, offset)));
        }
        else {
            const initRequests = viewModel.viewCells
                .filter(cell => cell.cellKind === CellKind.Markup)
                .slice(0, 5)
                .map(cell => this.createMarkupCellInitialization(cell, -10000));
            await this._webview.initializeMarkup(initRequests);
            // no cached view state so we are rendering the first viewport
            // after above async call, we already get init height for markdown cells, we can update their offset
            let offset = 0;
            const offsetUpdateRequests = [];
            const scrollBottom = Math.max(this._dimension?.height ?? 0, 1080);
            for (const cell of viewModel.viewCells) {
                if (cell.cellKind === CellKind.Markup) {
                    offsetUpdateRequests.push({ id: cell.id, top: offset });
                }
                offset += cell.getHeight(this.getLayoutInfo().fontInfo.lineHeight);
                if (offset > scrollBottom) {
                    break;
                }
            }
            this._webview?.updateScrollTops([], offsetUpdateRequests);
        }
    }
    createMarkupCellInitialization(model, offset) {
        return ({
            mime: model.mime,
            cellId: model.id,
            cellHandle: model.handle,
            content: model.getText(),
            offset: offset,
            visible: false,
            metadata: model.metadata,
        });
    }
    restoreListViewState(viewState) {
        if (!this.viewModel) {
            return;
        }
        if (viewState?.scrollPosition !== undefined) {
            this._list.scrollTop = viewState.scrollPosition.top;
            this._list.scrollLeft = viewState.scrollPosition.left;
        }
        else {
            this._list.scrollTop = 0;
            this._list.scrollLeft = 0;
        }
        const focusIdx = typeof viewState?.focus === 'number' ? viewState.focus : 0;
        if (focusIdx < this.viewModel.length) {
            const element = this.viewModel.cellAt(focusIdx);
            if (element) {
                this.viewModel?.updateSelectionsState({
                    kind: SelectionStateType.Handle,
                    primary: element.handle,
                    selections: [element.handle]
                });
            }
        }
        else if (this._list.length > 0) {
            this.viewModel.updateSelectionsState({
                kind: SelectionStateType.Index,
                focus: { start: 0, end: 1 },
                selections: [{ start: 0, end: 1 }]
            });
        }
        if (viewState?.editorFocused) {
            const cell = this.viewModel.cellAt(focusIdx);
            if (cell) {
                cell.focusMode = CellFocusMode.Editor;
            }
        }
    }
    _restoreSelectedKernel(viewState) {
        if (viewState?.selectedKernelId && this.textModel) {
            const matching = this.notebookKernelService.getMatchingKernel(this.textModel);
            const kernel = matching.all.find(k => k.id === viewState.selectedKernelId);
            // Selected kernel may have already been picked prior to the view state loading
            // If so, don't overwrite it with the saved kernel.
            if (kernel && !matching.selected) {
                this.notebookKernelService.selectKernelForNotebook(kernel, this.textModel);
            }
        }
    }
    getEditorViewState() {
        const state = this.viewModel?.getEditorViewState();
        if (!state) {
            return {
                editingCells: {},
                cellLineNumberStates: {},
                editorViewStates: {},
                collapsedInputCells: {},
                collapsedOutputCells: {},
            };
        }
        if (this._list) {
            state.scrollPosition = { left: this._list.scrollLeft, top: this._list.scrollTop };
            const cellHeights = {};
            for (let i = 0; i < this.viewModel.length; i++) {
                const elm = this.viewModel.cellAt(i);
                cellHeights[i] = elm.layoutInfo.totalHeight;
            }
            state.cellTotalHeights = cellHeights;
            if (this.viewModel) {
                const focusRange = this.viewModel.getFocus();
                const element = this.viewModel.cellAt(focusRange.start);
                if (element) {
                    const itemDOM = this._list.domElementOfElement(element);
                    const editorFocused = element.getEditState() === CellEditState.Editing && !!(itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement));
                    state.editorFocused = editorFocused;
                    state.focus = focusRange.start;
                }
            }
        }
        // Save contribution view states
        const contributionsState = {};
        for (const [id, contribution] of this._contributions) {
            if (typeof contribution.saveViewState === 'function') {
                contributionsState[id] = contribution.saveViewState();
            }
        }
        state.contributionsState = contributionsState;
        if (this.textModel?.uri.scheme === Schemas.untitled) {
            state.selectedKernelId = this.activeKernel?.id;
        }
        return state;
    }
    _allowScrollBeyondLastLine() {
        return this._scrollBeyondLastLine && !this.isReplHistory;
    }
    getBodyHeight(dimensionHeight) {
        return Math.max(dimensionHeight - (this._notebookTopToolbar?.useGlobalToolbar ? /** Toolbar height */ 26 : 0), 0);
    }
    layout(dimension, shadowElement, position) {
        if (!shadowElement && this._shadowElementViewInfo === null) {
            this._dimension = dimension;
            this._position = position;
            return;
        }
        if (dimension.width <= 0 || dimension.height <= 0) {
            this.onWillHide();
            return;
        }
        const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(DOM.getWindow(this.getDomNode()));
        if (whenContainerStylesLoaded) {
            // In floating windows, we need to ensure that the
            // container is ready for us to compute certain
            // layout related properties.
            whenContainerStylesLoaded.then(() => this.layoutNotebook(dimension, shadowElement, position));
        }
        else {
            this.layoutNotebook(dimension, shadowElement, position);
        }
    }
    layoutNotebook(dimension, shadowElement, position) {
        if (shadowElement) {
            this.updateShadowElement(shadowElement, dimension, position);
        }
        if (this._shadowElementViewInfo && this._shadowElementViewInfo.width <= 0 && this._shadowElementViewInfo.height <= 0) {
            this.onWillHide();
            return;
        }
        this._dimension = dimension;
        this._position = position;
        const newBodyHeight = this.getBodyHeight(dimension.height) - this.getLayoutInfo().stickyHeight;
        DOM.size(this._body, dimension.width, newBodyHeight);
        const newCellListHeight = newBodyHeight;
        if (this._list.getRenderHeight() < newCellListHeight) {
            // the new dimension is larger than the list viewport, update its additional height first, otherwise the list view will move down a bit (as the `scrollBottom` will move down)
            this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, (newCellListHeight - 50)) : 0, paddingTop: 0 });
            this._list.layout(newCellListHeight, dimension.width);
        }
        else {
            // the new dimension is smaller than the list viewport, if we update the additional height, the `scrollBottom` will move up, which moves the whole list view upwards a bit. So we run a layout first.
            this._list.layout(newCellListHeight, dimension.width);
            this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, (newCellListHeight - 50)) : 0, paddingTop: 0 });
        }
        this._overlayContainer.inert = false;
        this._overlayContainer.style.visibility = 'visible';
        this._overlayContainer.style.display = 'block';
        this._overlayContainer.style.position = 'absolute';
        this._overlayContainer.style.overflow = 'hidden';
        this.layoutContainerOverShadowElement(dimension, position);
        if (this._webviewTransparentCover) {
            this._webviewTransparentCover.style.height = `${dimension.height}px`;
            this._webviewTransparentCover.style.width = `${dimension.width}px`;
        }
        this._notebookTopToolbar.layout(this._dimension);
        this._notebookOverviewRuler.layout();
        this._viewContext?.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
    }
    updateShadowElement(shadowElement, dimension, position) {
        this._shadowElement = shadowElement;
        if (dimension && position) {
            this._shadowElementViewInfo = {
                height: dimension.height,
                width: dimension.width,
                top: position.top,
                left: position.left,
            };
        }
        else {
            // We have to recompute position and size ourselves (which is slow)
            const containerRect = shadowElement.getBoundingClientRect();
            this._shadowElementViewInfo = {
                height: containerRect.height,
                width: containerRect.width,
                top: containerRect.top,
                left: containerRect.left
            };
        }
    }
    layoutContainerOverShadowElement(dimension, position) {
        if (dimension && position) {
            this._overlayContainer.style.top = `${position.top}px`;
            this._overlayContainer.style.left = `${position.left}px`;
            this._overlayContainer.style.width = `${dimension.width}px`;
            this._overlayContainer.style.height = `${dimension.height}px`;
            return;
        }
        if (!this._shadowElementViewInfo) {
            return;
        }
        const elementContainerRect = this._overlayContainer.parentElement?.getBoundingClientRect();
        this._overlayContainer.style.top = `${this._shadowElementViewInfo.top - (elementContainerRect?.top || 0)}px`;
        this._overlayContainer.style.left = `${this._shadowElementViewInfo.left - (elementContainerRect?.left || 0)}px`;
        this._overlayContainer.style.width = `${dimension ? dimension.width : this._shadowElementViewInfo.width}px`;
        this._overlayContainer.style.height = `${dimension ? dimension.height : this._shadowElementViewInfo.height}px`;
    }
    //#endregion
    //#region Focus tracker
    focus() {
        this._isVisible = true;
        this._editorFocus.set(true);
        if (this._webviewFocused) {
            this._webview?.focusWebview();
        }
        else {
            if (this.viewModel) {
                const focusRange = this.viewModel.getFocus();
                const element = this.viewModel.cellAt(focusRange.start);
                // The notebook editor doesn't have focus yet
                if (!this.hasEditorFocus()) {
                    this.focusContainer();
                    // trigger editor to update as FocusTracker might not emit focus change event
                    this.updateEditorFocus();
                }
                if (element && element.focusMode === CellFocusMode.Editor) {
                    element.updateEditState(CellEditState.Editing, 'editorWidget.focus');
                    element.focusMode = CellFocusMode.Editor;
                    this.focusEditor(element);
                    return;
                }
            }
            this._list.domFocus();
        }
        if (this._currentProgress) {
            // The editor forces progress to hide when switching editors. So if progress should be visible, force it to show when the editor is focused.
            this.showProgress();
        }
    }
    onShow() {
        this._isVisible = true;
    }
    focusEditor(activeElement) {
        for (const [element, editor] of this._renderedEditors.entries()) {
            if (element === activeElement) {
                editor.focus();
                return;
            }
        }
    }
    focusContainer(clearSelection = false) {
        if (this._webviewFocused) {
            this._webview?.focusWebview();
        }
        else {
            this._list.focusContainer(clearSelection);
        }
    }
    selectOutputContent(cell) {
        this._webview?.selectOutputContents(cell);
    }
    selectInputContents(cell) {
        this._webview?.selectInputContents(cell);
    }
    onWillHide() {
        this._isVisible = false;
        this._editorFocus.set(false);
        this._overlayContainer.inert = true;
        this._overlayContainer.style.visibility = 'hidden';
        this._overlayContainer.style.left = '-50000px';
        this._notebookTopToolbarContainer.style.display = 'none';
        this.clearActiveCellWidgets();
    }
    clearActiveCellWidgets() {
        this._renderedEditors.forEach((editor, cell) => {
            if (this.getActiveCell() === cell && editor) {
                SuggestController.get(editor)?.cancelSuggestWidget();
                DropIntoEditorController.get(editor)?.clearWidgets();
                CopyPasteController.get(editor)?.clearWidgets();
            }
        });
        this._renderedEditors.forEach((editor, cell) => {
            const controller = InlineCompletionsController.get(editor);
            if (controller?.model.get()?.inlineEditState.get()) {
                editor.render(true);
            }
        });
    }
    editorHasDomFocus() {
        return DOM.isAncestorOfActiveElement(this.getDomNode());
    }
    updateEditorFocus() {
        // Note - focus going to the webview will fire 'blur', but the webview element will be
        // a descendent of the notebook editor root.
        this._focusTracker.refreshState();
        const focused = this.editorHasDomFocus();
        this._editorFocus.set(focused);
        this.viewModel?.setEditorFocus(focused);
    }
    updateCellFocusMode() {
        const activeCell = this.getActiveCell();
        if (activeCell?.focusMode === CellFocusMode.Output && !this._webviewFocused) {
            // output previously has focus, but now it's blurred.
            activeCell.focusMode = CellFocusMode.Container;
        }
    }
    hasEditorFocus() {
        // _editorFocus is driven by the FocusTracker, which is only guaranteed to _eventually_ fire blur.
        // If we need to know whether we have focus at this instant, we need to check the DOM manually.
        this.updateEditorFocus();
        return this.editorHasDomFocus();
    }
    hasWebviewFocus() {
        return this._webviewFocused;
    }
    hasOutputTextSelection() {
        if (!this.hasEditorFocus()) {
            return false;
        }
        const windowSelection = DOM.getWindow(this.getDomNode()).getSelection();
        if (windowSelection?.rangeCount !== 1) {
            return false;
        }
        const activeSelection = windowSelection.getRangeAt(0);
        if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
            return false;
        }
        let container = activeSelection.commonAncestorContainer;
        if (!this._body.contains(container)) {
            return false;
        }
        while (container
            &&
                container !== this._body) {
            if (container.classList && container.classList.contains('output')) {
                return true;
            }
            container = container.parentNode;
        }
        return false;
    }
    _didFocusOutputInputChange(hasFocus) {
        this._outputInputFocus.set(hasFocus);
    }
    //#endregion
    //#region Editor Features
    focusElement(cell) {
        this.viewModel?.updateSelectionsState({
            kind: SelectionStateType.Handle,
            primary: cell.handle,
            selections: [cell.handle]
        });
    }
    get scrollTop() {
        return this._list.scrollTop;
    }
    get scrollBottom() {
        return this._list.scrollTop + this._list.getRenderHeight();
    }
    getAbsoluteTopOfElement(cell) {
        return this._list.getCellViewScrollTop(cell);
    }
    getAbsoluteBottomOfElement(cell) {
        return this._list.getCellViewScrollBottom(cell);
    }
    getHeightOfElement(cell) {
        return this._list.elementHeight(cell);
    }
    scrollToBottom() {
        this._list.scrollToBottom();
    }
    setScrollTop(scrollTop) {
        this._list.scrollTop = scrollTop;
    }
    revealCellRangeInView(range) {
        return this._list.revealCells(range);
    }
    revealInView(cell) {
        return this._list.revealCell(cell, 1 /* CellRevealType.Default */);
    }
    revealInViewAtTop(cell) {
        this._list.revealCell(cell, 2 /* CellRevealType.Top */);
    }
    revealInCenter(cell) {
        this._list.revealCell(cell, 3 /* CellRevealType.Center */);
    }
    async revealInCenterIfOutsideViewport(cell) {
        await this._list.revealCell(cell, 4 /* CellRevealType.CenterIfOutsideViewport */);
    }
    async revealFirstLineIfOutsideViewport(cell) {
        await this._list.revealCell(cell, 6 /* CellRevealType.FirstLineIfOutsideViewport */);
    }
    async revealLineInViewAsync(cell, line) {
        return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Default);
    }
    async revealLineInCenterAsync(cell, line) {
        return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Center);
    }
    async revealLineInCenterIfOutsideViewportAsync(cell, line) {
        return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.CenterIfOutsideViewport);
    }
    async revealRangeInViewAsync(cell, range) {
        return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Default);
    }
    async revealRangeInCenterAsync(cell, range) {
        return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Center);
    }
    async revealRangeInCenterIfOutsideViewportAsync(cell, range) {
        return this._list.revealRangeInCell(cell, range, CellRevealRangeType.CenterIfOutsideViewport);
    }
    revealCellOffsetInCenter(cell, offset) {
        return this._list.revealCellOffsetInCenter(cell, offset);
    }
    revealOffsetInCenterIfOutsideViewport(offset) {
        return this._list.revealOffsetInCenterIfOutsideViewport(offset);
    }
    getViewIndexByModelIndex(index) {
        if (!this._listViewInfoAccessor) {
            return -1;
        }
        const cell = this.viewModel?.viewCells[index];
        if (!cell) {
            return -1;
        }
        return this._listViewInfoAccessor.getViewIndex(cell);
    }
    getViewHeight(cell) {
        if (!this._listViewInfoAccessor) {
            return -1;
        }
        return this._listViewInfoAccessor.getViewHeight(cell);
    }
    getCellRangeFromViewRange(startIndex, endIndex) {
        return this._listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex);
    }
    getCellsInRange(range) {
        return this._listViewInfoAccessor.getCellsInRange(range);
    }
    setCellEditorSelection(cell, range) {
        this._list.setCellEditorSelection(cell, range);
    }
    setHiddenAreas(_ranges) {
        return this._list.setHiddenAreas(_ranges, true);
    }
    getVisibleRangesPlusViewportAboveAndBelow() {
        return this._listViewInfoAccessor.getVisibleRangesPlusViewportAboveAndBelow();
    }
    //#endregion
    //#region Decorations
    deltaCellDecorations(oldDecorations, newDecorations) {
        const ret = this.viewModel?.deltaCellDecorations(oldDecorations, newDecorations) || [];
        this._onDidChangeDecorations.fire();
        return ret;
    }
    deltaCellContainerClassNames(cellId, added, removed, cellkind) {
        if (cellkind === CellKind.Markup) {
            this._webview?.deltaMarkupPreviewClassNames(cellId, added, removed);
        }
        else {
            this._webview?.deltaCellOutputContainerClassNames(cellId, added, removed);
        }
    }
    changeModelDecorations(callback) {
        return this.viewModel?.changeModelDecorations(callback) || null;
    }
    //#endregion
    //#region View Zones
    changeViewZones(callback) {
        this._list.changeViewZones(callback);
        this._onDidChangeLayout.fire();
    }
    getViewZoneLayoutInfo(id) {
        return this._list.getViewZoneLayoutInfo(id);
    }
    //#endregion
    //#region Overlay
    changeCellOverlays(callback) {
        this._list.changeCellOverlays(callback);
    }
    //#endregion
    //#region Kernel/Execution
    async _loadKernelPreloads() {
        if (!this.hasModel()) {
            return;
        }
        const { selected } = this.notebookKernelService.getMatchingKernel(this.textModel);
        if (!this._webview?.isResolved()) {
            await this._resolveWebview();
        }
        this._webview?.updateKernelPreloads(selected);
    }
    get activeKernel() {
        return this.textModel && this.notebookKernelService.getSelectedOrSuggestedKernel(this.textModel);
    }
    async cancelNotebookCells(cells) {
        if (!this.viewModel || !this.hasModel()) {
            return;
        }
        if (!cells) {
            cells = this.viewModel.viewCells;
        }
        return this.notebookExecutionService.cancelNotebookCellHandles(this.textModel, Array.from(cells).map(cell => cell.handle));
    }
    async executeNotebookCells(cells) {
        if (!this.viewModel || !this.hasModel()) {
            this.logService.info('notebookEditorWidget', 'No NotebookViewModel, cannot execute cells');
            return;
        }
        if (!cells) {
            cells = this.viewModel.viewCells;
        }
        return this.notebookExecutionService.executeNotebookCells(this.textModel, Array.from(cells).map(c => c.model), this.scopedContextKeyService);
    }
    //#endregion
    async layoutNotebookCell(cell, height, context) {
        return this._cellLayoutManager?.layoutNotebookCell(cell, height);
    }
    getActiveCell() {
        const elements = this._list.getFocusedElements();
        if (elements && elements.length) {
            return elements[0];
        }
        return undefined;
    }
    _toggleNotebookCellSelection(selectedCell, selectFromPrevious) {
        const currentSelections = this._list.getSelectedElements();
        const isSelected = currentSelections.includes(selectedCell);
        const previousSelection = selectFromPrevious ? currentSelections[currentSelections.length - 1] ?? selectedCell : selectedCell;
        const selectedIndex = this._list.getViewIndex(selectedCell);
        const previousIndex = this._list.getViewIndex(previousSelection);
        const cellsInSelectionRange = this.getCellsInViewRange(selectedIndex, previousIndex);
        if (isSelected) {
            // Deselect
            this._list.selectElements(currentSelections.filter(current => !cellsInSelectionRange.includes(current)));
        }
        else {
            // Add to selection
            this.focusElement(selectedCell);
            this._list.selectElements([...currentSelections.filter(current => !cellsInSelectionRange.includes(current)), ...cellsInSelectionRange]);
        }
    }
    getCellsInViewRange(fromInclusive, toInclusive) {
        const selectedCellsInRange = [];
        for (let index = 0; index < this._list.length; ++index) {
            const cell = this._list.element(index);
            if (cell) {
                if ((index >= fromInclusive && index <= toInclusive) || (index >= toInclusive && index <= fromInclusive)) {
                    selectedCellsInRange.push(cell);
                }
            }
        }
        return selectedCellsInRange;
    }
    async focusNotebookCell(cell, focusItem, options) {
        if (this._isDisposed) {
            return;
        }
        cell.focusedOutputId = undefined;
        if (focusItem === 'editor') {
            cell.isInputCollapsed = false;
            this.focusElement(cell);
            this._list.focusView();
            cell.updateEditState(CellEditState.Editing, 'focusNotebookCell');
            cell.focusMode = CellFocusMode.Editor;
            if (!options?.skipReveal) {
                if (typeof options?.focusEditorLine === 'number') {
                    this._cursorNavMode.set(true);
                    await this.revealLineInViewAsync(cell, options.focusEditorLine);
                    const editor = this._renderedEditors.get(cell);
                    const focusEditorLine = options.focusEditorLine;
                    editor?.setSelection({
                        startLineNumber: focusEditorLine,
                        startColumn: 1,
                        endLineNumber: focusEditorLine,
                        endColumn: 1
                    });
                }
                else {
                    const selectionsStartPosition = cell.getSelectionsStartPosition();
                    if (selectionsStartPosition?.length) {
                        const firstSelectionPosition = selectionsStartPosition[0];
                        await this.revealRangeInViewAsync(cell, Range.fromPositions(firstSelectionPosition, firstSelectionPosition));
                    }
                    else {
                        await this.revealInView(cell);
                    }
                }
            }
        }
        else if (focusItem === 'output') {
            this.focusElement(cell);
            if (!this.hasEditorFocus()) {
                this._list.focusView();
            }
            if (!this._webview) {
                return;
            }
            const firstOutputId = cell.outputsViewModels.find(o => o.model.alternativeOutputId)?.model.alternativeOutputId;
            const focusElementId = options?.outputId ?? firstOutputId ?? cell.id;
            this._webview.focusOutput(focusElementId, options?.altOutputId, options?.outputWebviewFocused || this._webviewFocused);
            cell.updateEditState(CellEditState.Preview, 'focusNotebookCell');
            cell.focusMode = CellFocusMode.Output;
            cell.focusedOutputId = options?.outputId;
            this._outputFocus.set(true);
            if (!options?.skipReveal) {
                this.revealInCenterIfOutsideViewport(cell);
            }
        }
        else {
            // focus container
            const itemDOM = this._list.domElementOfElement(cell);
            if (itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement)) {
                itemDOM.ownerDocument.activeElement.blur();
            }
            this._webview?.blurOutput();
            cell.updateEditState(CellEditState.Preview, 'focusNotebookCell');
            cell.focusMode = CellFocusMode.Container;
            this.focusElement(cell);
            if (!options?.skipReveal) {
                if (typeof options?.focusEditorLine === 'number') {
                    this._cursorNavMode.set(true);
                    await this.revealInView(cell);
                }
                else if (options?.revealBehavior === ScrollToRevealBehavior.firstLine) {
                    await this.revealFirstLineIfOutsideViewport(cell);
                }
                else if (options?.revealBehavior === ScrollToRevealBehavior.fullCell) {
                    await this.revealInView(cell);
                }
                else {
                    await this.revealInCenterIfOutsideViewport(cell);
                }
            }
            this._list.focusView();
            this.updateEditorFocus();
        }
    }
    async focusNextNotebookCell(cell, focusItem) {
        const idx = this.viewModel?.getCellIndex(cell);
        if (typeof idx !== 'number') {
            return;
        }
        const newCell = this.viewModel?.cellAt(idx + 1);
        if (!newCell) {
            return;
        }
        await this.focusNotebookCell(newCell, focusItem);
    }
    //#endregion
    //#region Find
    async _warmupCell(viewCell) {
        if (viewCell.isOutputCollapsed) {
            return;
        }
        const outputs = viewCell.outputsViewModels;
        for (const output of outputs.slice(0, outputDisplayLimit)) {
            const [mimeTypes, pick] = output.resolveMimeTypes(this.textModel, undefined);
            if (!mimeTypes.find(mimeType => mimeType.isTrusted) || mimeTypes.length === 0) {
                continue;
            }
            const pickedMimeTypeRenderer = mimeTypes[pick];
            if (!pickedMimeTypeRenderer) {
                return;
            }
            const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
            if (!renderer) {
                return;
            }
            const result = { type: 1 /* RenderOutputType.Extension */, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
            const inset = this._webview?.insetMapping.get(result.source);
            if (!inset || !inset.initialized) {
                const p = new Promise(resolve => {
                    this._register(Event.any(this.onDidRenderOutput, this.onDidRemoveOutput)(e => {
                        if (e.model === result.source.model) {
                            resolve();
                        }
                    }));
                });
                this.createOutput(viewCell, result, 0, false);
                await p;
            }
            else {
                // request to update its visibility
                this.createOutput(viewCell, result, 0, false);
            }
            return;
        }
    }
    async _warmupAll(includeOutput) {
        if (!this.hasModel() || !this.viewModel) {
            return;
        }
        const cells = this.viewModel.viewCells;
        const requests = [];
        for (let i = 0; i < cells.length; i++) {
            if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
                requests.push(this.createMarkupPreview(cells[i]));
            }
        }
        if (includeOutput && this._list) {
            for (let i = 0; i < this._list.length; i++) {
                const cell = this._list.element(i);
                if (cell?.cellKind === CellKind.Code) {
                    requests.push(this._warmupCell(cell));
                }
            }
        }
        return Promise.all(requests);
    }
    async _warmupSelection(includeOutput, selectedCellRanges) {
        if (!this.hasModel() || !this.viewModel) {
            return;
        }
        const cells = this.viewModel.viewCells;
        const requests = [];
        for (const range of selectedCellRanges) {
            for (let i = range.start; i < range.end; i++) {
                if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
                    requests.push(this.createMarkupPreview(cells[i]));
                }
            }
        }
        if (includeOutput && this._list) {
            for (const range of selectedCellRanges) {
                for (let i = range.start; i < range.end; i++) {
                    const cell = this._list.element(i);
                    if (cell?.cellKind === CellKind.Code) {
                        requests.push(this._warmupCell(cell));
                    }
                }
            }
        }
        return Promise.all(requests);
    }
    async find(query, options, token, skipWarmup = false, shouldGetSearchPreviewInfo = false, ownerID) {
        if (!this._notebookViewModel) {
            return [];
        }
        if (!ownerID) {
            ownerID = this.getId();
        }
        const findMatches = this._notebookViewModel.find(query, options).filter(match => match.length > 0);
        if ((!options.includeMarkupPreview && !options.includeOutput) || options.findScope?.findScopeType === NotebookFindScopeType.Text) {
            this._webview?.findStop(ownerID);
            return findMatches;
        }
        // search in webview enabled
        const matchMap = {};
        findMatches.forEach(match => {
            matchMap[match.cell.id] = match;
        });
        if (this._webview) {
            // request all or some outputs to be rendered
            // measure perf
            const start = Date.now();
            if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
                await this._warmupSelection(!!options.includeOutput, options.findScope.selectedCellRanges);
            }
            else {
                await this._warmupAll(!!options.includeOutput);
            }
            const end = Date.now();
            this.logService.debug('Find', `Warmup time: ${end - start}ms`);
            if (token.isCancellationRequested) {
                return [];
            }
            let findIds = [];
            if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
                const selectedIndexes = cellRangesToIndexes(options.findScope.selectedCellRanges);
                findIds = selectedIndexes.map(index => this._notebookViewModel?.viewCells[index].id ?? '');
            }
            const webviewMatches = await this._webview.find(query, { caseSensitive: options.caseSensitive, wholeWord: options.wholeWord, includeMarkup: !!options.includeMarkupPreview, includeOutput: !!options.includeOutput, shouldGetSearchPreviewInfo, ownerID, findIds: findIds });
            if (token.isCancellationRequested) {
                return [];
            }
            // attach webview matches to model find matches
            webviewMatches.forEach(match => {
                const cell = this._notebookViewModel.viewCells.find(cell => cell.id === match.cellId);
                if (!cell) {
                    return;
                }
                if (match.type === 'preview') {
                    // markup preview
                    if (cell.getEditState() === CellEditState.Preview && !options.includeMarkupPreview) {
                        return;
                    }
                    if (cell.getEditState() === CellEditState.Editing && options.includeMarkupInput) {
                        return;
                    }
                }
                else {
                    if (!options.includeOutput) {
                        // skip outputs if not included
                        return;
                    }
                }
                const exisitingMatch = matchMap[match.cellId];
                if (exisitingMatch) {
                    exisitingMatch.webviewMatches.push(match);
                }
                else {
                    matchMap[match.cellId] = new CellFindMatchModel(this._notebookViewModel.viewCells.find(cell => cell.id === match.cellId), this._notebookViewModel.viewCells.findIndex(cell => cell.id === match.cellId), [], [match]);
                }
            });
        }
        const ret = [];
        this._notebookViewModel.viewCells.forEach((cell, index) => {
            if (matchMap[cell.id]) {
                ret.push(new CellFindMatchModel(cell, index, matchMap[cell.id].contentMatches, matchMap[cell.id].webviewMatches));
            }
        });
        return ret;
    }
    async findHighlightCurrent(matchIndex, ownerID) {
        if (!this._webview) {
            return 0;
        }
        return this._webview?.findHighlightCurrent(matchIndex, ownerID ?? this.getId());
    }
    async findUnHighlightCurrent(matchIndex, ownerID) {
        if (!this._webview) {
            return;
        }
        return this._webview?.findUnHighlightCurrent(matchIndex, ownerID ?? this.getId());
    }
    findStop(ownerID) {
        this._webview?.findStop(ownerID ?? this.getId());
    }
    //#endregion
    //#region MISC
    getLayoutInfo() {
        if (!this._list) {
            throw new Error('Editor is not initalized successfully');
        }
        if (!this._fontInfo) {
            this._generateFontInfo();
        }
        let listViewOffset = 0;
        if (this._dimension) {
            listViewOffset = (this._notebookTopToolbar?.useGlobalToolbar ? /** Toolbar height */ 26 : 0) + (this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0);
        }
        return {
            width: this._dimension?.width ?? 0,
            height: this._dimension?.height ?? 0,
            scrollHeight: this._list?.getScrollHeight() ?? 0,
            fontInfo: this._fontInfo,
            stickyHeight: this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0,
            listViewOffsetTop: listViewOffset
        };
    }
    async createMarkupPreview(cell) {
        if (!this._webview) {
            return;
        }
        if (!this._webview.isResolved()) {
            await this._resolveWebview();
        }
        if (!this._webview || !this._list.webviewElement) {
            return;
        }
        if (!this.viewModel || !this._list.viewModel) {
            return;
        }
        if (this.viewModel.getCellIndex(cell) === -1) {
            return;
        }
        if (this.cellIsHidden(cell)) {
            return;
        }
        const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
        const top = !!webviewTop ? (0 - webviewTop) : 0;
        const cellTop = this._list.getCellViewScrollTop(cell);
        await this._webview.showMarkupPreview({
            mime: cell.mime,
            cellHandle: cell.handle,
            cellId: cell.id,
            content: cell.getText(),
            offset: cellTop + top,
            visible: true,
            metadata: cell.metadata,
        });
    }
    cellIsHidden(cell) {
        const modelIndex = this.viewModel.getCellIndex(cell);
        const foldedRanges = this.viewModel.getHiddenRanges();
        return foldedRanges.some(range => modelIndex >= range.start && modelIndex <= range.end);
    }
    async unhideMarkupPreviews(cells) {
        if (!this._webview) {
            return;
        }
        if (!this._webview.isResolved()) {
            await this._resolveWebview();
        }
        await this._webview?.unhideMarkupPreviews(cells.map(cell => cell.id));
    }
    async hideMarkupPreviews(cells) {
        if (!this._webview || !cells.length) {
            return;
        }
        if (!this._webview.isResolved()) {
            await this._resolveWebview();
        }
        await this._webview?.hideMarkupPreviews(cells.map(cell => cell.id));
    }
    async deleteMarkupPreviews(cells) {
        if (!this._webview) {
            return;
        }
        if (!this._webview.isResolved()) {
            await this._resolveWebview();
        }
        await this._webview?.deleteMarkupPreviews(cells.map(cell => cell.id));
    }
    async updateSelectedMarkdownPreviews() {
        if (!this._webview) {
            return;
        }
        if (!this._webview.isResolved()) {
            await this._resolveWebview();
        }
        const selectedCells = this.getSelectionViewModels().map(cell => cell.id);
        // Only show selection when there is more than 1 cell selected
        await this._webview?.updateMarkupPreviewSelections(selectedCells.length > 1 ? selectedCells : []);
    }
    async createOutput(cell, output, offset, createWhenIdle) {
        this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
            if (this._isDisposed || !this._webview) {
                return;
            }
            if (!this._webview.isResolved()) {
                await this._resolveWebview();
            }
            if (!this._webview) {
                return;
            }
            if (!this._list.webviewElement) {
                return;
            }
            if (output.type === 1 /* RenderOutputType.Extension */) {
                this.notebookRendererMessaging.prepare(output.renderer.id);
            }
            const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
            const top = !!webviewTop ? (0 - webviewTop) : 0;
            const cellTop = this._list.getCellViewScrollTop(cell) + top;
            const existingOutput = this._webview.insetMapping.get(output.source);
            if (!existingOutput
                || (!existingOutput.renderer && output.type === 1 /* RenderOutputType.Extension */)) {
                if (createWhenIdle) {
                    this._webview.requestCreateOutputWhenWebviewIdle({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
                }
                else {
                    this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
                }
            }
            else if (existingOutput.renderer
                && output.type === 1 /* RenderOutputType.Extension */
                && existingOutput.renderer.id !== output.renderer.id) {
                // switch mimetype
                this._webview.removeInsets([output.source]);
                this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
            }
            else if (existingOutput.versionId !== output.source.model.versionId) {
                this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
            }
            else {
                const outputIndex = cell.outputsViewModels.indexOf(output.source);
                const outputOffset = cell.getOutputOffset(outputIndex);
                this._webview.updateScrollTops([{
                        cell,
                        output: output.source,
                        cellTop,
                        outputOffset,
                        forceDisplay: !cell.isOutputCollapsed,
                    }], []);
            }
        });
    }
    async updateOutput(cell, output, offset) {
        this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
            if (this._isDisposed || !this._webview || cell.isOutputCollapsed) {
                return;
            }
            if (!this._webview.isResolved()) {
                await this._resolveWebview();
            }
            if (!this._webview || !this._list.webviewElement) {
                return;
            }
            if (!this._webview.insetMapping.has(output.source)) {
                return this.createOutput(cell, output, offset, false);
            }
            if (output.type === 1 /* RenderOutputType.Extension */) {
                this.notebookRendererMessaging.prepare(output.renderer.id);
            }
            const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
            const top = !!webviewTop ? (0 - webviewTop) : 0;
            const cellTop = this._list.getCellViewScrollTop(cell) + top;
            this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
        });
    }
    async copyOutputImage(cellOutput) {
        this._webview?.copyImage(cellOutput);
    }
    removeInset(output) {
        this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
            if (this._isDisposed || !this._webview) {
                return;
            }
            if (this._webview?.isResolved()) {
                this._webview.removeInsets([output]);
            }
            this._onDidRemoveOutput.fire(output);
        });
    }
    hideInset(output) {
        this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
            if (this._isDisposed || !this._webview) {
                return;
            }
            if (this._webview?.isResolved()) {
                this._webview.hideInset(output);
            }
        });
    }
    //#region --- webview IPC ----
    postMessage(message) {
        if (this._webview?.isResolved()) {
            this._webview.postKernelMessage(message);
        }
    }
    //#endregion
    addClassName(className) {
        this._overlayContainer.classList.add(className);
    }
    removeClassName(className) {
        this._overlayContainer.classList.remove(className);
    }
    cellAt(index) {
        return this.viewModel?.cellAt(index);
    }
    getCellByInfo(cellInfo) {
        const { cellHandle } = cellInfo;
        return this.viewModel?.viewCells.find(vc => vc.handle === cellHandle);
    }
    getCellByHandle(handle) {
        return this.viewModel?.getCellByHandle(handle);
    }
    getCellIndex(cell) {
        return this.viewModel?.getCellIndexByHandle(cell.handle);
    }
    getNextVisibleCellIndex(index) {
        return this.viewModel?.getNextVisibleCellIndex(index);
    }
    getPreviousVisibleCellIndex(index) {
        return this.viewModel?.getPreviousVisibleCellIndex(index);
    }
    _updateScrollHeight() {
        if (this._isDisposed || !this._webview?.isResolved()) {
            return;
        }
        if (!this._list.webviewElement) {
            return;
        }
        const scrollHeight = this._list.scrollHeight;
        this._webview.element.style.height = `${scrollHeight + NOTEBOOK_WEBVIEW_BOUNDARY * 2}px`;
        const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
        const top = !!webviewTop ? (0 - webviewTop) : 0;
        const updateItems = [];
        const removedItems = [];
        this._webview?.insetMapping.forEach((value, key) => {
            const cell = this.viewModel?.getCellByHandle(value.cellInfo.cellHandle);
            if (!cell || !(cell instanceof CodeCellViewModel)) {
                return;
            }
            const viewIndex = this._list.getViewIndex(cell);
            if (viewIndex === undefined) {
                return;
            }
            const outputIndex = cell.outputsViewModels.indexOf(key);
            if (outputIndex < 0) {
                // output is already gone
                removedItems.push(key);
                return;
            }
            const cellTop = this._list.getCellViewScrollTop(cell);
            const outputOffset = cell.getOutputOffset(outputIndex);
            updateItems.push({
                cell,
                output: key,
                cellTop: cellTop + top,
                outputOffset,
                forceDisplay: false,
            });
        });
        this._webview.removeInsets(removedItems);
        const markdownUpdateItems = [];
        for (const cellId of this._webview.markupPreviewMapping.keys()) {
            const cell = this.viewModel?.viewCells.find(cell => cell.id === cellId);
            if (cell) {
                const cellTop = this._list.getCellViewScrollTop(cell);
                // markdownUpdateItems.push({ id: cellId, top: cellTop });
                markdownUpdateItems.push({ id: cellId, top: cellTop + top });
            }
        }
        if (markdownUpdateItems.length || updateItems.length) {
            this._debug('_list.onDidChangeContentHeight/markdown', markdownUpdateItems);
            this._webview?.updateScrollTops(updateItems, markdownUpdateItems);
        }
    }
    //#endregion
    //#region BacklayerWebview delegate
    _updateOutputHeight(cellInfo, output, outputHeight, isInit, source) {
        const cell = this.viewModel?.viewCells.find(vc => vc.handle === cellInfo.cellHandle);
        if (cell && cell instanceof CodeCellViewModel) {
            const outputIndex = cell.outputsViewModels.indexOf(output);
            if (outputIndex > -1) {
                this._debug('update cell output', cell.handle, outputHeight);
                cell.updateOutputHeight(outputIndex, outputHeight, source);
                this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);
                if (isInit) {
                    this._onDidRenderOutput.fire(output);
                }
            }
            else {
                this._debug('tried to update cell output that does not exist');
            }
        }
    }
    _scheduleOutputHeightAck(cellInfo, outputId, height) {
        const wasEmpty = this._pendingOutputHeightAcks.size === 0;
        this._pendingOutputHeightAcks.set(outputId, { cellId: cellInfo.cellId, outputId, height });
        if (wasEmpty) {
            DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
                this._debug('ack height');
                this._updateScrollHeight();
                this._webview?.ackHeight([...this._pendingOutputHeightAcks.values()]);
                this._pendingOutputHeightAcks.clear();
            }, -1); // -1 priority because this depends on calls to layoutNotebookCell, and that may be called multiple times before this runs
        }
    }
    _getCellById(cellId) {
        return this.viewModel?.viewCells.find(vc => vc.id === cellId);
    }
    _updateMarkupCellHeight(cellId, height, isInit) {
        const cell = this._getCellById(cellId);
        if (cell && cell instanceof MarkupCellViewModel) {
            const { bottomToolbarGap } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
            this._debug('updateMarkdownCellHeight', cell.handle, height + bottomToolbarGap, isInit);
            cell.renderedMarkdownHeight = height;
        }
    }
    _setMarkupCellEditState(cellId, editState) {
        const cell = this._getCellById(cellId);
        if (cell instanceof MarkupCellViewModel) {
            this.revealInView(cell);
            cell.updateEditState(editState, 'setMarkdownCellEditState');
        }
    }
    _didStartDragMarkupCell(cellId, event) {
        const cell = this._getCellById(cellId);
        if (cell instanceof MarkupCellViewModel) {
            const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
            this._dndController?.startExplicitDrag(cell, event.dragOffsetY - webviewOffset);
        }
    }
    _didDragMarkupCell(cellId, event) {
        const cell = this._getCellById(cellId);
        if (cell instanceof MarkupCellViewModel) {
            const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
            this._dndController?.explicitDrag(cell, event.dragOffsetY - webviewOffset);
        }
    }
    _didDropMarkupCell(cellId, event) {
        const cell = this._getCellById(cellId);
        if (cell instanceof MarkupCellViewModel) {
            const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
            event.dragOffsetY -= webviewOffset;
            this._dndController?.explicitDrop(cell, event);
        }
    }
    _didEndDragMarkupCell(cellId) {
        const cell = this._getCellById(cellId);
        if (cell instanceof MarkupCellViewModel) {
            this._dndController?.endExplicitDrag(cell);
        }
    }
    _didResizeOutput(cellId) {
        const cell = this._getCellById(cellId);
        if (cell) {
            this._onDidResizeOutputEmitter.fire(cell);
        }
    }
    _updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
        if (!this.hasModel()) {
            return;
        }
        const cell = this._getCellById(cellId);
        const cellIndex = !cell ? undefined : this.getCellIndex(cell);
        if (cell?.internalMetadata.executionId === executionId && cellIndex !== undefined) {
            const renderDurationMap = cell.internalMetadata.renderDuration || {};
            renderDurationMap[rendererId] = (renderDurationMap[rendererId] ?? 0) + duration;
            this.textModel.applyEdits([
                {
                    editType: 9 /* CellEditType.PartialInternalMetadata */,
                    index: cellIndex,
                    internalMetadata: {
                        executionId: executionId,
                        renderDuration: renderDurationMap
                    }
                }
            ], true, undefined, () => undefined, undefined, false);
        }
    }
    //#endregion
    //#region Editor Contributions
    getContribution(id) {
        return (this._contributions.get(id) || null);
    }
    //#endregion
    dispose() {
        this._isDisposed = true;
        // dispose webview first
        this._webview?.dispose();
        this._webview = null;
        this.notebookEditorService.removeNotebookEditor(this);
        dispose(this._contributions.values());
        this._contributions.clear();
        this._localStore.clear();
        dispose(this._localCellStateListeners);
        this._list.dispose();
        this._cellLayoutManager?.dispose();
        this._listTopCellToolbar?.dispose();
        this._overlayContainer.remove();
        this.viewModel?.dispose();
        this._renderedEditors.clear();
        this._baseCellEditorOptions.forEach(v => v.dispose());
        this._baseCellEditorOptions.clear();
        this._notebookOverviewRulerContainer.remove();
        super.dispose();
        // unref
        this._webview = null;
        this._webviewResolvePromise = null;
        this._webviewTransparentCover = null;
        this._dndController = null;
        this._listTopCellToolbar = null;
        this._notebookViewModel = undefined;
        this._cellContextKeyManager = null;
        this._notebookTopToolbar = null;
        this._list = null;
        this._listViewInfoAccessor = null;
        this._listDelegate = null;
    }
    toJSON() {
        return {
            notebookUri: this.viewModel?.uri,
        };
    }
};
NotebookEditorWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IEditorGroupsService),
    __param(4, INotebookRendererMessagingService),
    __param(5, INotebookEditorService),
    __param(6, INotebookKernelService),
    __param(7, INotebookService),
    __param(8, IConfigurationService),
    __param(9, IContextKeyService),
    __param(10, ILayoutService),
    __param(11, IContextMenuService),
    __param(12, ITelemetryService),
    __param(13, INotebookExecutionService),
    __param(14, IEditorProgressService),
    __param(15, INotebookLoggingService)
], NotebookEditorWidget);
export { NotebookEditorWidget };
registerZIndex(ZIndex.Base, 5, 'notebook-progress-bar');
registerZIndex(ZIndex.Base, 10, 'notebook-list-insertion-indicator');
registerZIndex(ZIndex.Base, 20, 'notebook-cell-editor-outline');
registerZIndex(ZIndex.Base, 25, 'notebook-scrollbar');
registerZIndex(ZIndex.Base, 26, 'notebook-cell-status');
registerZIndex(ZIndex.Base, 26, 'notebook-folding-indicator');
registerZIndex(ZIndex.Base, 27, 'notebook-output');
registerZIndex(ZIndex.Base, 28, 'notebook-cell-bottom-toolbar-container');
registerZIndex(ZIndex.Base, 29, 'notebook-run-button-container');
registerZIndex(ZIndex.Base, 29, 'notebook-input-collapse-condicon');
registerZIndex(ZIndex.Base, 30, 'notebook-cell-output-toolbar');
registerZIndex(ZIndex.Sash, 1, 'notebook-cell-expand-part-button');
registerZIndex(ZIndex.Sash, 2, 'notebook-cell-toolbar');
registerZIndex(ZIndex.Sash, 3, 'notebook-cell-toolbar-dropdown-active');
export const notebookCellBorder = registerColor('notebook.cellBorderColor', {
    dark: transparent(listInactiveSelectionBackground, 1),
    light: transparent(listInactiveSelectionBackground, 1),
    hcDark: PANEL_BORDER,
    hcLight: PANEL_BORDER
}, nls.localize('notebook.cellBorderColor', "The border color for notebook cells."));
export const focusedEditorBorderColor = registerColor('notebook.focusedEditorBorder', focusBorder, nls.localize('notebook.focusedEditorBorder', "The color of the notebook cell editor border."));
export const cellStatusIconSuccess = registerColor('notebookStatusSuccessIcon.foreground', debugIconStartForeground, nls.localize('notebookStatusSuccessIcon.foreground', "The error icon color of notebook cells in the cell status bar."));
export const runningCellRulerDecorationColor = registerColor('notebookEditorOverviewRuler.runningCellForeground', debugIconStartForeground, nls.localize('notebookEditorOverviewRuler.runningCellForeground', "The color of the running cell decoration in the notebook editor overview ruler."));
export const cellStatusIconError = registerColor('notebookStatusErrorIcon.foreground', errorForeground, nls.localize('notebookStatusErrorIcon.foreground', "The error icon color of notebook cells in the cell status bar."));
export const cellStatusIconRunning = registerColor('notebookStatusRunningIcon.foreground', foreground, nls.localize('notebookStatusRunningIcon.foreground', "The running icon color of notebook cells in the cell status bar."));
export const notebookOutputContainerBorderColor = registerColor('notebook.outputContainerBorderColor', null, nls.localize('notebook.outputContainerBorderColor', "The border color of the notebook output container."));
export const notebookOutputContainerColor = registerColor('notebook.outputContainerBackgroundColor', null, nls.localize('notebook.outputContainerBackgroundColor', "The color of the notebook output container background."));
// TODO@rebornix currently also used for toolbar border, if we keep all of this, pick a generic name
export const CELL_TOOLBAR_SEPERATOR = registerColor('notebook.cellToolbarSeparator', {
    dark: Color.fromHex('#808080').transparent(0.35),
    light: Color.fromHex('#808080').transparent(0.35),
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, nls.localize('notebook.cellToolbarSeparator', "The color of the separator in the cell bottom toolbar"));
export const focusedCellBackground = registerColor('notebook.focusedCellBackground', null, nls.localize('focusedCellBackground', "The background color of a cell when the cell is focused."));
export const selectedCellBackground = registerColor('notebook.selectedCellBackground', {
    dark: listInactiveSelectionBackground,
    light: listInactiveSelectionBackground,
    hcDark: null,
    hcLight: null
}, nls.localize('selectedCellBackground', "The background color of a cell when the cell is selected."));
export const cellHoverBackground = registerColor('notebook.cellHoverBackground', {
    dark: transparent(focusedCellBackground, .5),
    light: transparent(focusedCellBackground, .7),
    hcDark: null,
    hcLight: null
}, nls.localize('notebook.cellHoverBackground', "The background color of a cell when the cell is hovered."));
export const selectedCellBorder = registerColor('notebook.selectedCellBorder', {
    dark: notebookCellBorder,
    light: notebookCellBorder,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, nls.localize('notebook.selectedCellBorder', "The color of the cell's top and bottom border when the cell is selected but not focused."));
export const inactiveSelectedCellBorder = registerColor('notebook.inactiveSelectedCellBorder', {
    dark: null,
    light: null,
    hcDark: focusBorder,
    hcLight: focusBorder
}, nls.localize('notebook.inactiveSelectedCellBorder', "The color of the cell's borders when multiple cells are selected."));
export const focusedCellBorder = registerColor('notebook.focusedCellBorder', focusBorder, nls.localize('notebook.focusedCellBorder', "The color of the cell's focus indicator borders when the cell is focused."));
export const inactiveFocusedCellBorder = registerColor('notebook.inactiveFocusedCellBorder', notebookCellBorder, nls.localize('notebook.inactiveFocusedCellBorder', "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."));
export const cellStatusBarItemHover = registerColor('notebook.cellStatusBarItemHoverBackground', {
    light: new Color(new RGBA(0, 0, 0, 0.08)),
    dark: new Color(new RGBA(255, 255, 255, 0.15)),
    hcDark: new Color(new RGBA(255, 255, 255, 0.15)),
    hcLight: new Color(new RGBA(0, 0, 0, 0.08)),
}, nls.localize('notebook.cellStatusBarItemHoverBackground', "The background color of notebook cell status bar items."));
export const cellInsertionIndicator = registerColor('notebook.cellInsertionIndicator', focusBorder, nls.localize('notebook.cellInsertionIndicator', "The color of the notebook cell insertion indicator."));
export const listScrollbarSliderBackground = registerColor('notebookScrollbarSlider.background', scrollbarSliderBackground, nls.localize('notebookScrollbarSliderBackground', "Notebook scrollbar slider background color."));
export const listScrollbarSliderHoverBackground = registerColor('notebookScrollbarSlider.hoverBackground', scrollbarSliderHoverBackground, nls.localize('notebookScrollbarSliderHoverBackground', "Notebook scrollbar slider background color when hovering."));
export const listScrollbarSliderActiveBackground = registerColor('notebookScrollbarSlider.activeBackground', scrollbarSliderActiveBackground, nls.localize('notebookScrollbarSliderActiveBackground', "Notebook scrollbar slider background color when clicked on."));
export const cellSymbolHighlight = registerColor('notebook.symbolHighlightBackground', {
    dark: Color.fromHex('#ffffff0b'),
    light: Color.fromHex('#fdff0033'),
    hcDark: null,
    hcLight: null
}, nls.localize('notebook.symbolHighlightBackground', "Background color of highlighted cell"));
export const cellEditorBackground = registerColor('notebook.cellEditorBackground', {
    light: SIDE_BAR_BACKGROUND,
    dark: SIDE_BAR_BACKGROUND,
    hcDark: null,
    hcLight: null
}, nls.localize('notebook.cellEditorBackground', "Cell editor background color."));
const notebookEditorBackground = registerColor('notebook.editorBackground', {
    light: EDITOR_PANE_BACKGROUND,
    dark: EDITOR_PANE_BACKGROUND,
    hcDark: null,
    hcLight: null
}, nls.localize('notebook.editorBackground', "Notebook background color."));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sc0JBQXNCLENBQUM7QUFDOUIsT0FBTyw4QkFBOEIsQ0FBQztBQUN0QyxPQUFPLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sdUNBQXVDLENBQUM7QUFDL0MsT0FBTyxtQ0FBbUMsQ0FBQztBQUMzQyxPQUFPLHNDQUFzQyxDQUFDO0FBQzlDLE9BQU8sb0NBQW9DLENBQUM7QUFDNUMsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLHlCQUF5QixDQUFDO0FBQ2pDLE9BQU8sNkJBQTZCLENBQUM7QUFDckMsT0FBTyxnQ0FBZ0MsQ0FBQztBQUN4QyxPQUFPLHdDQUF3QyxDQUFDO0FBQ2hELE9BQU8sMENBQTBDLENBQUM7QUFDbEQsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLHdDQUF3QyxDQUFDO0FBQ2hELE9BQU8sdUNBQXVDLENBQUM7QUFDL0MsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEtBQUssY0FBYyxNQUFNLDRDQUE0QyxDQUFDO0FBRzdFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxD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