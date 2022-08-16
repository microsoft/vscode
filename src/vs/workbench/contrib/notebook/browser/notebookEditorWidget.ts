/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notebook';
import 'vs/css!./media/notebookCellInsertToolbar';
import 'vs/css!./media/notebookCellStatusBar';
import 'vs/css!./media/notebookCellTitleToolbar';
import 'vs/css!./media/notebookFocusIndicator';
import 'vs/css!./media/notebookToolbar';
import { PixelRatio } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { IAction } from 'vs/base/common/actions';
import { DeferredPromise, runWhenIdle, SequencerByKey } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { setTimeout0 } from 'vs/base/common/platform';
import { extname, isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { FontMeasurements } from 'vs/editor/browser/config/fontMeasurements';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { IEditor } from 'vs/editor/common/editorCommon';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import * as nls from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { registerZIndex, ZIndex } from 'vs/platform/layout/browser/zIndexRegistry';
import { IEditorProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { contrastBorder, diffInserted, diffRemoved, editorBackground, errorForeground, focusBorder, foreground, iconForeground, listInactiveSelectionBackground, registerColor, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground, textPreformatForeground, toolbarHoverBackground, transparent } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EDITOR_PANE_BACKGROUND, PANEL_BORDER, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { debugIconStartForeground } from 'vs/workbench/contrib/debug/browser/debugColors';
import { CellEditState, CellFindMatchWithIndex, CellFocusMode, CellLayoutContext, CellRevealType, IActiveNotebookEditorDelegate, IBaseCellEditorOptions, ICellOutputViewModel, ICellViewModel, ICommonCellInfo, IDisplayOutputLayoutUpdateRequest, IFocusNotebookCellOptions, IInsetRenderOutput, IModelDecorationsChangeAccessor, INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, INotebookEditorContributionDescription, INotebookEditorCreationOptions, INotebookEditorDelegate, INotebookEditorMouseEvent, INotebookEditorOptions, INotebookEditorViewState, INotebookViewCellsUpdateEvent, INotebookWebviewMessage, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorExtensionsRegistry } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { notebookDebug } from 'vs/workbench/contrib/notebook/browser/notebookLogger';
import { NotebookCellStateChangedEvent, NotebookLayoutChangedEvent, NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellContextKeyManager } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellContextKeys';
import { CellDragAndDropController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDnd';
import { ListViewInfoAccessor, NotebookCellList, NOTEBOOK_WEBVIEW_BOUNDARY } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { INotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { CodeCellRenderer, MarkupCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellRenderer';
import { IAckOutputHeight, IMarkupCellInitialization } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { ViewContext } from 'vs/workbench/contrib/notebook/browser/viewModel/viewContext';
import { NotebookEditorToolbar } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookEditorToolbar';
import { NotebookEditorContextKeys } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookEditorWidgetContextKeys';
import { NotebookOverviewRuler } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookOverviewRuler';
import { ListTopCellToolbar } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookTopCellToolbar';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, INotebookSearchOptions, RENDERER_NOT_AVAILABLE, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookOptions, OutputInnerContainerTopPadding } from 'vs/workbench/contrib/notebook/common/notebookOptions';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { INotebookRendererMessagingService } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { editorGutterModifiedBackground } from 'vs/workbench/contrib/scm/browser/dirtydiffDecorator';
import { IWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { NotebookPerfMarks } from 'vs/workbench/contrib/notebook/common/notebookPerformance';
import { BaseCellEditorOptions } from 'vs/workbench/contrib/notebook/browser/viewModel/cellEditorOptions';

const $ = DOM.$;

export function getDefaultNotebookCreationOptions(): INotebookEditorCreationOptions {
	// We inlined the id to avoid loading comment contrib in tests
	const skipContributions = ['editor.contrib.review'];
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

export class NotebookEditorWidget extends Disposable implements INotebookEditorDelegate, INotebookEditor {
	//#region Eventing
	private readonly _onDidChangeCellState = this._register(new Emitter<NotebookCellStateChangedEvent>());
	readonly onDidChangeCellState = this._onDidChangeCellState.event;
	private readonly _onDidChangeViewCells = this._register(new Emitter<INotebookViewCellsUpdateEvent>());
	readonly onDidChangeViewCells: Event<INotebookViewCellsUpdateEvent> = this._onDidChangeViewCells.event;
	private readonly _onDidChangeModel = this._register(new Emitter<NotebookTextModel | undefined>());
	readonly onDidChangeModel: Event<NotebookTextModel | undefined> = this._onDidChangeModel.event;
	private readonly _onDidChangeOptions = this._register(new Emitter<void>());
	readonly onDidChangeOptions: Event<void> = this._onDidChangeOptions.event;
	private readonly _onDidChangeDecorations = this._register(new Emitter<void>());
	readonly onDidChangeDecorations: Event<void> = this._onDidChangeDecorations.event;
	private readonly _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll: Event<void> = this._onDidScroll.event;
	private readonly _onDidChangeActiveCell = this._register(new Emitter<void>());
	readonly onDidChangeActiveCell: Event<void> = this._onDidChangeActiveCell.event;
	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection: Event<void> = this._onDidChangeSelection.event;
	private readonly _onDidChangeVisibleRanges = this._register(new Emitter<void>());
	readonly onDidChangeVisibleRanges: Event<void> = this._onDidChangeVisibleRanges.event;
	private readonly _onDidFocusEmitter = this._register(new Emitter<void>());
	readonly onDidFocusWidget = this._onDidFocusEmitter.event;
	private readonly _onDidBlurEmitter = this._register(new Emitter<void>());
	readonly onDidBlurWidget = this._onDidBlurEmitter.event;
	private readonly _onDidChangeActiveEditor = this._register(new Emitter<this>());
	readonly onDidChangeActiveEditor: Event<this> = this._onDidChangeActiveEditor.event;
	private readonly _onDidChangeActiveKernel = this._register(new Emitter<void>());
	readonly onDidChangeActiveKernel: Event<void> = this._onDidChangeActiveKernel.event;
	private readonly _onMouseUp: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	readonly onMouseUp: Event<INotebookEditorMouseEvent> = this._onMouseUp.event;
	private readonly _onMouseDown: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	readonly onMouseDown: Event<INotebookEditorMouseEvent> = this._onMouseDown.event;
	private readonly _onDidReceiveMessage = this._register(new Emitter<INotebookWebviewMessage>());
	readonly onDidReceiveMessage: Event<INotebookWebviewMessage> = this._onDidReceiveMessage.event;
	private readonly _onDidRenderOutput = this._register(new Emitter<ICellOutputViewModel>());
	private readonly onDidRenderOutput = this._onDidRenderOutput.event;
	private readonly _onDidResizeOutputEmitter = this._register(new Emitter<ICellViewModel>());
	readonly onDidResizeOutput = this._onDidResizeOutputEmitter.event;


	//#endregion
	private _overlayContainer!: HTMLElement;
	private _notebookTopToolbarContainer!: HTMLElement;
	private _notebookTopToolbar!: NotebookEditorToolbar;
	private _notebookOverviewRulerContainer!: HTMLElement;
	private _notebookOverviewRuler!: NotebookOverviewRuler;
	private _body!: HTMLElement;
	private _styleElement!: HTMLStyleElement;
	private _overflowContainer!: HTMLElement;
	private _webview: BackLayerWebView<ICommonCellInfo> | null = null;
	private _webviewResolvePromise: Promise<BackLayerWebView<ICommonCellInfo> | null> | null = null;
	private _webviewTransparentCover: HTMLElement | null = null;
	private _listDelegate: NotebookCellListDelegate | null = null;
	private _list!: INotebookCellList;
	private _listViewInfoAccessor!: ListViewInfoAccessor;
	private _dndController: CellDragAndDropController | null = null;
	private _listTopCellToolbar: ListTopCellToolbar | null = null;
	private _renderedEditors: Map<ICellViewModel, ICodeEditor> = new Map();
	private _viewContext: ViewContext;
	private _notebookViewModel: NotebookViewModel | undefined;
	private _localStore: DisposableStore = this._register(new DisposableStore());
	private _localCellStateListeners: DisposableStore[] = [];
	private _fontInfo: FontInfo | undefined;
	private _dimension: DOM.Dimension | null = null;
	private _shadowElement?: HTMLElement;
	private _shadowElementViewInfo: { height: number; width: number; top: number; left: number } | null = null;

	private readonly _editorFocus: IContextKey<boolean>;
	private readonly _outputFocus: IContextKey<boolean>;
	private readonly _editorEditable: IContextKey<boolean>;
	private readonly _cursorNavMode: IContextKey<boolean>;
	protected readonly _contributions = new Map<string, INotebookEditorContribution>();
	private _scrollBeyondLastLine: boolean;
	private readonly _insetModifyQueueByOutputId = new SequencerByKey<string>();
	private _cellContextKeyManager: CellContextKeyManager | null = null;
	private _isVisible = false;
	private readonly _uuid = generateUuid();
	private _focusTracker!: DOM.IFocusTracker;
	private _webviewFocused: boolean = false;

	private _isDisposed: boolean = false;

	get isDisposed() {
		return this._isDisposed;
	}

	set viewModel(newModel: NotebookViewModel | undefined) {
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

	get activeCodeEditor(): IEditor | undefined {
		if (this._isDisposed) {
			return;
		}

		const [focused] = this._list.getFocusedElements();
		return this._renderedEditors.get(focused);
	}

	get visibleRanges() {
		return this._list.visibleRanges || [];
	}

	private _baseCellEditorOptions = new Map<string, IBaseCellEditorOptions>();

	readonly isEmbedded: boolean;
	private _readOnly: boolean;

	public readonly scopedContextKeyService: IContextKeyService;
	private readonly instantiationService: IInstantiationService;
	private readonly _notebookOptions: NotebookOptions;

	private _currentProgress: IProgressRunner | undefined;

	get notebookOptions() {
		return this._notebookOptions;
	}

	constructor(
		readonly creationOptions: INotebookEditorCreationOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@INotebookRendererMessagingService private readonly notebookRendererMessaging: INotebookRendererMessagingService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService,
		@INotebookExecutionStateService notebookExecutionStateService: INotebookExecutionStateService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
	) {
		super();
		this.isEmbedded = creationOptions.isEmbedded ?? false;
		this._readOnly = creationOptions.isReadOnly ?? false;

		this._notebookOptions = creationOptions.options ?? new NotebookOptions(this.configurationService, notebookExecutionStateService);
		this._register(this._notebookOptions);
		this._viewContext = new ViewContext(
			this._notebookOptions,
			new NotebookEventDispatcher(),
			language => this.getBaseCellEditorOptions(language));
		this._register(this._viewContext.eventDispatcher.onDidChangeCellState(e => {
			this._onDidChangeCellState.fire(e);
		}));

		this._overlayContainer = document.createElement('div');
		this.scopedContextKeyService = contextKeyService.createScoped(this._overlayContainer);
		this.instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

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

		this._scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.scrollBeyondLastLine')) {
				this._scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');
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

			if (e.compactView || e.focusIndicator || e.insertToolbarPosition || e.cellToolbarLocation || e.dragAndDropEnabled || e.fontSize || e.outputFontSize || e.markupFontSize || e.fontFamily || e.outputFontFamily || e.insertToolbarAlignment || e.outputLineHeight) {
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

		this._register(editorGroupsService.onDidScroll(() => {
			if (!this._shadowElement || !this._isVisible) {
				return;
			}

			this.updateShadowElement(this._shadowElement);
			this.layoutContainerOverShadowElement(this._dimension);
		}));

		this.notebookEditorService.addNotebookEditor(this);

		const id = generateUuid();
		this._overlayContainer.id = `notebook-${id}`;
		this._overlayContainer.className = 'notebookOverlay';
		this._overlayContainer.classList.add('notebook-editor');
		this._overlayContainer.style.visibility = 'hidden';

		this.layoutService.container.appendChild(this._overlayContainer);
		this._createBody(this._overlayContainer);
		this._generateFontInfo();
		this._isVisible = true;
		this._editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.scopedContextKeyService);
		this._outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.scopedContextKeyService);
		this._editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.scopedContextKeyService);
		this._cursorNavMode = NOTEBOOK_CURSOR_NAVIGATION_MODE.bindTo(this.scopedContextKeyService);

		this._editorEditable.set(!creationOptions.isReadOnly);

		let contributions: INotebookEditorContributionDescription[];
		if (Array.isArray(this.creationOptions.contributions)) {
			contributions = this.creationOptions.contributions;
		} else {
			contributions = NotebookEditorExtensionsRegistry.getEditorContributions();
		}
		for (const desc of contributions) {
			let contribution: INotebookEditorContribution | undefined;
			try {
				contribution = this.instantiationService.createInstance(desc.ctor, this);
			} catch (err) {
				onUnexpectedError(err);
			}
			if (contribution) {
				if (!this._contributions.has(desc.id)) {
					this._contributions.set(desc.id, contribution);
				} else {
					contribution.dispose();
					throw new Error(`DUPLICATE notebook editor contribution: '${desc.id}'`);
				}
			}
		}

		this._updateForNotebookConfiguration();
	}

	private _debugFlag: boolean = false;

	private _debug(...args: any[]) {
		if (!this._debugFlag) {
			return;
		}

		notebookDebug(...args);
	}

	/**
	 * EditorId
	 */
	public getId(): string {
		return this._uuid;
	}

	_getViewModel(): NotebookViewModel | undefined {
		return this.viewModel;
	}

	getLength() {
		return this.viewModel?.length ?? 0;
	}

	getSelections() {
		return this.viewModel?.getSelections() ?? [];
	}

	setSelections(selections: ICellRange[]) {
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

	setFocus(focus: ICellRange) {
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

	getSelectionViewModels(): ICellViewModel[] {
		if (!this.viewModel) {
			return [];
		}

		const cellsSet = new Set<number>();

		return this.viewModel.getSelections().map(range => this.viewModel!.viewCells.slice(range.start, range.end)).reduce((a, b) => {
			b.forEach(cell => {
				if (!cellsSet.has(cell.handle)) {
					cellsSet.add(cell.handle);
					a.push(cell);
				}
			});

			return a;
		}, [] as ICellViewModel[]);
	}

	hasModel(): this is IActiveNotebookEditorDelegate {
		return !!this._notebookViewModel;
	}

	showProgress(): void {
		this._currentProgress = this.editorProgressService.show(true);
	}

	hideProgress(): void {
		if (this._currentProgress) {
			this._currentProgress.done();
			this._currentProgress = undefined;
		}
	}

	//#region Editor Core

	getBaseCellEditorOptions(language: string): IBaseCellEditorOptions {
		const existingOptions = this._baseCellEditorOptions.get(language);

		if (existingOptions) {
			return existingOptions;
		} else {
			const options = new BaseCellEditorOptions(this, this.notebookOptions, this.configurationService, language);
			this._baseCellEditorOptions.set(language, options);
			return options;
		}
	}

	private _updateForNotebookConfiguration() {
		if (!this._overlayContainer) {
			return;
		}

		this._overlayContainer.classList.remove('cell-title-toolbar-left');
		this._overlayContainer.classList.remove('cell-title-toolbar-right');
		this._overlayContainer.classList.remove('cell-title-toolbar-hidden');
		const cellToolbarLocation = this._notebookOptions.computeCellToolbarLocation(this.viewModel?.viewType);
		this._overlayContainer.classList.add(`cell-title-toolbar-${cellToolbarLocation}`);

		const cellToolbarInteraction = this._notebookOptions.getLayoutConfiguration().cellToolbarInteraction;
		let cellToolbarInteractionState = 'hover';
		this._overlayContainer.classList.remove('cell-toolbar-hover');
		this._overlayContainer.classList.remove('cell-toolbar-click');

		if (cellToolbarInteraction === 'hover' || cellToolbarInteraction === 'click') {
			cellToolbarInteractionState = cellToolbarInteraction;
		}
		this._overlayContainer.classList.add(`cell-toolbar-${cellToolbarInteractionState}`);

	}

	private _generateFontInfo(): void {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._fontInfo = FontMeasurements.readFontInfo(BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.value));
	}

	private _createBody(parent: HTMLElement): void {
		this._notebookTopToolbarContainer = document.createElement('div');
		this._notebookTopToolbarContainer.classList.add('notebook-toolbar-container');
		this._notebookTopToolbarContainer.tabIndex = 0;
		this._notebookTopToolbarContainer.style.display = 'none';
		DOM.append(parent, this._notebookTopToolbarContainer);
		this._body = document.createElement('div');
		DOM.append(parent, this._body);

		this._body.classList.add('cell-list-container');
		this._createLayoutStyles();
		this._createCellList();

		this._notebookOverviewRulerContainer = document.createElement('div');
		this._notebookOverviewRulerContainer.classList.add('notebook-overview-ruler-container');
		this._list.scrollableElement.appendChild(this._notebookOverviewRulerContainer);
		this._registerNotebookOverviewRuler();

		this._overflowContainer = document.createElement('div');
		this._overflowContainer.classList.add('notebook-overflow-widget-container', 'monaco-editor');
		DOM.append(parent, this._overflowContainer);
	}

	private _generateFontFamily() {
		return this._fontInfo?.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
	}

	private _createLayoutStyles(): void {
		this._styleElement = DOM.createStyleSheet(this._body);
		const {
			cellRightMargin,
			cellTopMargin,
			cellRunGutter,
			cellBottomMargin,
			codeCellLeftMargin,
			markdownCellGutter,
			markdownCellLeftMargin,
			markdownCellBottomMargin,
			markdownCellTopMargin,
			collapsedIndicatorHeight,
			compactView,
			focusIndicator,
			insertToolbarPosition,
			insertToolbarAlignment,
			fontSize,
			focusIndicatorLeftMargin,
			focusIndicatorGap
		} = this._notebookOptions.getLayoutConfiguration();

		const { bottomToolbarGap, bottomToolbarHeight } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);

		const styleSheets: string[] = [];
		if (!this._fontInfo) {
			this._generateFontInfo();
		}

		const fontFamily = this._generateFontFamily();

		styleSheets.push(`
		:root {
			--notebook-cell-output-font-size: ${fontSize}px;
			--notebook-cell-output-font-family: ${fontFamily};
			--notebook-cell-input-preview-font-size: ${fontSize}px;
			--notebook-cell-input-preview-font-family: ${fontFamily};
		}
		`);

		if (compactView) {
			styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${codeCellLeftMargin + cellRunGutter}px; }`);
		} else {
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
		} else {
			styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-left: 3px solid transparent;
				border-radius: 4px;
				width: 0px;
				margin-left: ${focusIndicatorLeftMargin}px;
				border-color: var(--notebook-inactive-focused-cell-border-color) !important;
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
				border-color: var(--notebook-focused-cell-border-color) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-inner-container .cell-focus-indicator-left .output-focus-indicator {
				margin-top: ${focusIndicatorGap}px;
			}
			`);
		}

		// between cell insert toolbar
		if (insertToolbarPosition === 'betweenCells' || insertToolbarPosition === 'both') {
			styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: flex; }`);
			styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .cell-list-top-cell-toolbar-container { display: flex; }`);
		} else {
			styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: none; }`);
			styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .cell-list-top-cell-toolbar-container { display: none; }`);
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

		// top insert toolbar
		const topInsertToolbarHeight = this._notebookOptions.computeTopInsertToolbarHeight(this.viewModel?.viewType);
		styleSheets.push(`.notebookOverlay .cell-list-top-cell-toolbar-container { top: -${topInsertToolbarHeight - 3}px }`);
		styleSheets.push(`.notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element,
		.notebookOverlay > .cell-list-container > .notebook-gutter > .monaco-list > .monaco-scrollable-element {
			padding-top: ${topInsertToolbarHeight}px !important;
			box-sizing: border-box;
		}`);

		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .code-cell-row div.cell.code { margin-left: ${codeCellLeftMargin + cellRunGutter}px; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell { margin-right: ${cellRightMargin}px; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .cell-inner-container { padding-top: ${cellTopMargin}px; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container.webview-backed-markdown-cell { padding: 0; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .webview-backed-markdown-cell.markdown-cell-edit-mode .cell.code { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
		styleSheets.push(`.notebookOverlay .output { margin: 0px ${cellRightMargin}px 0px ${codeCellLeftMargin + cellRunGutter}px; }`);
		styleSheets.push(`.notebookOverlay .output { width: calc(100% - ${codeCellLeftMargin + cellRunGutter + cellRightMargin}px); }`);

		// comment
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { left: ${codeCellLeftMargin + cellRunGutter}px; }`);
		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { width: calc(100% - ${codeCellLeftMargin + cellRunGutter + cellRightMargin}px); }`);

		// output collapse button
		styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton { left: -${cellRunGutter}px; }`);
		styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton {
			position: absolute;
			width: ${cellRunGutter}px;
			padding: 6px 0px;
		}`);

		// show more container
		styleSheets.push(`.notebookOverlay .output-show-more-container { margin: 0px ${cellRightMargin}px 0px ${codeCellLeftMargin + cellRunGutter}px; }`);
		styleSheets.push(`.notebookOverlay .output-show-more-container { width: calc(100% - ${codeCellLeftMargin + cellRunGutter + cellRightMargin}px); }`);

		styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.markdown { padding-left: ${cellRunGutter}px; }`);
		styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container .notebook-folding-indicator { left: ${(markdownCellGutter - 20) / 2 + markdownCellLeftMargin}px; }`);
		styleSheets.push(`.notebookOverlay > .cell-list-container .notebook-folded-hint { left: ${markdownCellGutter + markdownCellLeftMargin + 8}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row :not(.webview-backed-markdown-cell) .cell-focus-indicator-top { height: ${cellTopMargin}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-side { bottom: ${bottomToolbarGap}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-focus-indicator-left { width: ${codeCellLeftMargin + cellRunGutter}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row .cell-focus-indicator-left { width: ${codeCellLeftMargin}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator.cell-focus-indicator-right { width: ${cellRightMargin}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom { height: ${cellBottomMargin}px; }`);
		styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-shadow-container-bottom { top: ${cellBottomMargin}px; }`);

		styleSheets.push(`
			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview {
				line-height: ${collapsedIndicatorHeight}px;
			}

			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview .monaco-tokenized-source {
				max-height: ${collapsedIndicatorHeight}px;
			}
		`);

		styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
		styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .cell-list-top-cell-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);

		// cell toolbar
		styleSheets.push(`.monaco-workbench .notebookOverlay.cell-title-toolbar-right > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			right: ${cellRightMargin + 26}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-left > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			left: ${codeCellLeftMargin + cellRunGutter + 16}px;
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

		this._styleElement.textContent = styleSheets.join('\n');
	}

	private _createCellList(): void {
		this._body.classList.add('cell-list-container');

		this._dndController = this._register(new CellDragAndDropController(this, this._body));
		const getScopedContextKeyService = (container: HTMLElement) => this._list.contextKeyService.createScoped(container);
		const renderers = [
			this.instantiationService.createInstance(CodeCellRenderer, this, this._renderedEditors, this._dndController, getScopedContextKeyService),
			this.instantiationService.createInstance(MarkupCellRenderer, this, this._dndController, this._renderedEditors, getScopedContextKeyService),
		];

		renderers.forEach(renderer => {
			this._register(renderer);
		});

		this._listDelegate = this.instantiationService.createInstance(NotebookCellListDelegate);
		this._register(this._listDelegate);

		this._list = this.instantiationService.createInstance(
			NotebookCellList,
			'NotebookCellList',
			this._overlayContainer,
			this._body,
			this._viewContext,
			this._listDelegate,
			renderers,
			this.scopedContextKeyService,
			{
				setRowLineHeight: false,
				setRowHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				keyboardSupport: false,
				mouseSupport: true,
				multipleSelectionSupport: true,
				selectionNavigation: true,
				typeNavigationEnabled: true,
				additionalScrollHeight: 0,
				transformOptimization: false, //(isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
				styleController: (_suffix: string) => { return this._list; },
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
				accessibilityProvider: {
					getAriaLabel: (element) => {
						if (!this.viewModel) {
							return '';
						}
						const index = this.viewModel.getCellIndex(element);

						if (index >= 0) {
							return `Cell ${index}, ${element.cellKind === CellKind.Markup ? 'markdown' : 'code'}  cell`;
						}

						return '';
					},
					getWidgetAriaLabel() {
						return nls.localize('notebookTreeAriaLabel', "Notebook");
					}
				},
			},
		);
		this._dndController.setList(this._list);

		// create Webview

		this._register(this._list);
		this._listViewInfoAccessor = new ListViewInfoAccessor(this._list);
		this._register(this._listViewInfoAccessor);

		this._register(combinedDisposable(...renderers));

		// top cell toolbar
		this._listTopCellToolbar = this._register(this.instantiationService.createInstance(ListTopCellToolbar, this, this.scopedContextKeyService, this._list.rowsContainer));

		// transparent cover
		this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $('.webview-cover'));
		this._webviewTransparentCover.style.display = 'none';

		this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overlayContainer, (e: StandardMouseEvent) => {
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
			this._cursorNavMode.set(false);
		}));

		this._register(this._list.onContextMenu(e => {
			this.showListContextMenu(e);
		}));

		this._register(this._list.onDidChangeVisibleRanges(() => {
			this._onDidChangeVisibleRanges.fire();
		}));

		this._register(this._list.onDidScroll((e) => {
			this._onDidScroll.fire();

			if (e.scrollTop !== e.oldScrollTop) {
				this._renderedEditors.forEach((editor, cell) => {
					if (this.getActiveCell() === cell && editor) {
						SuggestController.get(editor)?.cancelSuggestWidget();
					}
				});
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
	}

	private showListContextMenu(e: IListContextMenuEvent<CellViewModel>) {
		this.contextMenuService.showContextMenu({
			getActions: () => {
				const result: IAction[] = [];
				const menu = this.menuService.createMenu(MenuId.NotebookCellTitle, this.scopedContextKeyService);
				createAndFillInContextMenuActions(menu, undefined, result);
				menu.dispose();
				return result;
			},
			getAnchor: () => e.anchor
		});
	}

	private _registerNotebookOverviewRuler() {
		this._notebookOverviewRuler = this._register(this.instantiationService.createInstance(NotebookOverviewRuler, this, this._notebookOverviewRulerContainer!));
	}

	private _registerNotebookActionsToolbar() {
		this._notebookTopToolbar = this._register(this.instantiationService.createInstance(NotebookEditorToolbar, this, this.scopedContextKeyService, this._notebookOptions, this._notebookTopToolbarContainer));
		this._register(this._notebookTopToolbar.onDidChangeState(() => {
			if (this._dimension && this._isVisible) {
				this.layout(this._dimension);
			}
		}));
	}

	private _updateOutputRenderers() {
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

	getInnerWebview(): IWebview | undefined {
		return this._webview?.webview;
	}

	setParentContextKeyService(parentContextKeyService: IContextKeyService): void {
		this.scopedContextKeyService.updateParent(parentContextKeyService);
	}

	async setModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined, perf?: NotebookPerfMarks): Promise<void> {
		if (this.viewModel === undefined || !this.viewModel.equal(textModel)) {
			const oldTopInsertToolbarHeight = this._notebookOptions.computeTopInsertToolbarHeight(this.viewModel?.viewType);
			const oldBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
			this._detachModel();
			await this._attachModel(textModel, viewState, perf);
			const newTopInsertToolbarHeight = this._notebookOptions.computeTopInsertToolbarHeight(this.viewModel?.viewType);
			const newBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);

			if (oldTopInsertToolbarHeight !== newTopInsertToolbarHeight
				|| oldBottomToolbarDimensions.bottomToolbarGap !== newBottomToolbarDimensions.bottomToolbarGap
				|| oldBottomToolbarDimensions.bottomToolbarHeight !== newBottomToolbarDimensions.bottomToolbarHeight) {
				this._styleElement?.remove();
				this._createLayoutStyles();
				this._webview?.updateOptions({
					...this.notebookOptions.computeWebviewOptions(),
					fontFamily: this._generateFontFamily()
				});
			}
			type WorkbenchNotebookOpenClassification = {
				owner: 'rebornix';
				comment: 'Identify the notebook editor view type';
				scheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File system provider scheme for the resource' };
				ext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File extension for the resource' };
				viewType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'View type of the notebook editor' };
			};

			type WorkbenchNotebookOpenEvent = {
				scheme: string;
				ext: string;
				viewType: string;
			};

			this.telemetryService.publicLog2<WorkbenchNotebookOpenEvent, WorkbenchNotebookOpenClassification>('notebook/editorOpened', {
				scheme: textModel.uri.scheme,
				ext: extname(textModel.uri),
				viewType: textModel.viewType
			});
		} else {
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

	private _backgroundMarkdownRenderRunning = false;
	private _backgroundMarkdownRendering() {
		if (this._backgroundMarkdownRenderRunning) {
			return;
		}

		this._backgroundMarkdownRenderRunning = true;
		runWhenIdle((deadline) => {
			this._backgroundMarkdownRenderingWithDeadline(deadline);
		});
	}

	private _backgroundMarkdownRenderingWithDeadline(deadline: IdleDeadline) {
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

				const firstMarkupCell = this.viewModel.viewCells.find(cell => cell.cellKind === CellKind.Markup && !this._webview?.markupPreviewMapping.has(cell.id) && !this.cellIsHidden(cell)) as MarkupCellViewModel | undefined;
				if (!firstMarkupCell) {
					return;
				}

				this.createMarkupPreview(firstMarkupCell);
			} finally {
				this._backgroundMarkdownRenderRunning = false;
			}

			if (Date.now() < endTime) {
				setTimeout0(execute);
			} else {
				this._backgroundMarkdownRendering();
			}
		};

		execute();
	}

	private updateContextKeysOnFocusChange() {
		if (!this.viewModel) {
			return;
		}

		const focused = this._list.getFocusedElements()[0];
		if (focused) {
			if (!this._cellContextKeyManager) {
				this._cellContextKeyManager = this._localStore.add(this.instantiationService.createInstance(CellContextKeyManager, this, focused as CellViewModel));
			}

			this._cellContextKeyManager.updateForElement(focused as CellViewModel);
		}
	}

	async setOptions(options: INotebookEditorOptions | undefined) {
		if (options?.isReadOnly !== undefined) {
			this._readOnly = options?.isReadOnly;
		}

		if (!this.viewModel) {
			return;
		}

		this.viewModel.updateOptions({ isReadOnly: this._readOnly });

		// reveal cell if editor options tell to do so
		const cellOptions = options?.cellOptions ?? this._parseIndexedCellOptions(options);
		if (cellOptions) {
			const cell = this.viewModel.viewCells.find(cell => cell.uri.toString() === cellOptions.resource.toString());
			if (cell) {
				this.focusElement(cell);
				const selection = cellOptions.options?.selection;
				if (selection) {
					await this.revealLineInCenterIfOutsideViewportAsync(cell, selection.startLineNumber);
				} else if (options?.cellRevealType === CellRevealType.NearTopIfOutsideViewport) {
					await this.revealNearTopIfOutsideViewportAync(cell);
				} else {
					await this.revealInCenterIfOutsideViewportAsync(cell);
				}

				const editor = this._renderedEditors.get(cell)!;
				if (editor) {
					if (cellOptions.options?.selection) {
						const { selection } = cellOptions.options;
						editor.setSelection({
							...selection,
							endLineNumber: selection.endLineNumber || selection.startLineNumber,
							endColumn: selection.endColumn || selection.startColumn
						});
						editor.revealPositionInCenterIfOutsideViewport({
							lineNumber: selection.startLineNumber,
							column: selection.startColumn
						});
						await this.revealLineInCenterIfOutsideViewportAsync(cell, selection.startLineNumber);
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

	private _parseIndexedCellOptions(options: INotebookEditorOptions | undefined) {
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

	private _detachModel() {
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


	private _updateForOptions(): void {
		if (!this.viewModel) {
			return;
		}

		this._editorEditable.set(!this.viewModel.options.isReadOnly);
		this._overflowContainer.classList.toggle('notebook-editor-editable', !this.viewModel.options.isReadOnly);
		this.getDomNode().classList.toggle('notebook-editor-editable', !this.viewModel.options.isReadOnly);
	}

	private async _resolveWebview(): Promise<BackLayerWebView<ICommonCellInfo> | null> {
		if (!this.textModel) {
			return null;
		}

		if (this._webviewResolvePromise) {
			return this._webviewResolvePromise;
		}

		if (!this._webview) {
			this._createWebview(this.getId(), this.textModel.uri);
		}

		this._webviewResolvePromise = (async () => {
			if (!this._webview) {
				throw new Error('Notebook output webview object is not created successfully.');
			}

			await this._webview.createWebview();
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

	private async _createWebview(id: string, resource: URI): Promise<void> {
		const that = this;

		this._webview = this.instantiationService.createInstance(BackLayerWebView, {
			get creationOptions() { return that.creationOptions; },
			setScrollTop(scrollTop: number) { that._listViewInfoAccessor.setScrollTop(scrollTop); },
			triggerScroll(event: IMouseWheelEvent) { that._listViewInfoAccessor.triggerScroll(event); },
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
			didResizeOutput: that._didResizeOutput.bind(that)
		}, id, resource, {
			...this._notebookOptions.computeWebviewOptions(),
			fontFamily: this._generateFontFamily()
		}, this.notebookRendererMessaging.getScoped(this._uuid));

		this._webview.element.style.width = '100%';

		// attach the webview container to the DOM tree first
		this._list.attachWebview(this._webview.element);
	}

	private async _attachModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined, perf?: NotebookPerfMarks) {
		await this._createWebview(this.getId(), textModel.uri);
		this.viewModel = this.instantiationService.createInstance(NotebookViewModel, textModel.viewType, textModel, this._viewContext, this.getLayoutInfo(), { isReadOnly: this._readOnly });
		this._viewContext.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);

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
				this._webviewTransparentCover!.style.transform = `translateY(${e.scrollTop})`;
			}
		}));

		let hasPendingChangeContentHeight = false;
		this._localStore.add(this._list.onDidChangeContentHeight(() => {
			if (hasPendingChangeContentHeight) {
				return;
			}
			hasPendingChangeContentHeight = true;

			this._localStore.add(DOM.scheduleAtNextAnimationFrame(() => {
				hasPendingChangeContentHeight = false;
				this._updateScrollHeight();
			}, 100));
		}));

		this._localStore.add(this._list.onDidRemoveOutputs(outputs => {
			outputs.forEach(output => this.removeInset(output));
		}));
		this._localStore.add(this._list.onDidHideOutputs(outputs => {
			outputs.forEach(output => this.hideInset(output));
		}));
		this._localStore.add(this._list.onDidRemoveCellsFromView(cells => {
			const hiddenCells: MarkupCellViewModel[] = [];
			const deletedCells: MarkupCellViewModel[] = [];

			for (const cell of cells) {
				if (cell.cellKind === CellKind.Markup) {
					const mdCell = cell as MarkupCellViewModel;
					if (this.viewModel?.viewCells.find(cell => cell.handle === mdCell.handle)) {
						// Cell has been folded but is still in model
						hiddenCells.push(mdCell);
					} else {
						// Cell was deleted
						deletedCells.push(mdCell);
					}
				}
			}

			this.hideMarkupPreviews(hiddenCells);
			this.deleteMarkupPreviews(deletedCells);
		}));

		// init rendering
		await this._warmupWithMarkdownRenderer(this.viewModel, viewState);

		perf?.mark('customMarkdownLoaded');

		// model attached
		this._localCellStateListeners = this.viewModel.viewCells.map(cell => this._bindCellListener(cell));
		this._lastCellWithEditorFocus = this.viewModel.viewCells.find(viewCell => this.getActiveCell() === viewCell && viewCell.focusMode === CellFocusMode.Editor) ?? null;

		this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
			if (this._isDisposed) {
				return;
			}

			// update cell listener
			e.splices.reverse().forEach(splice => {
				const [start, deleted, newCells] = splice;
				const deletedCells = this._localCellStateListeners.splice(start, deleted, ...newCells.map(cell => this._bindCellListener(cell)));

				dispose(deletedCells);
			});

			if (e.splices.some(s => s[2].some(cell => cell.cellKind === CellKind.Markup))) {
				this._backgroundMarkdownRendering();
			}
		}));

		if (this._dimension) {
			const topInserToolbarHeight = this._notebookOptions.computeTopInsertToolbarHeight(this.viewModel?.viewType);
			this._list.layout(this._dimension.height - topInserToolbarHeight, this._dimension.width);
		} else {
			this._list.layout();
		}

		this._dndController?.clearGlobalDragState();

		// restore list state at last, it must be after list layout
		this.restoreListViewState(viewState);
	}

	private _bindCellListener(cell: ICellViewModel) {
		const store = new DisposableStore();

		store.add(cell.onDidChangeLayout(e => {
			if (e.totalHeight !== undefined || e.outerWidth) {
				this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight, e.context);
			}
		}));

		if (cell.cellKind === CellKind.Code) {
			store.add((cell as CodeCellViewModel).onDidRemoveOutputs((outputs) => {
				outputs.forEach(output => this.removeInset(output));
			}));
		}

		store.add((cell as CellViewModel).onDidChangeState(e => {
			if (e.inputCollapsedChanged && cell.isInputCollapsed && cell.cellKind === CellKind.Markup) {
				this.hideMarkupPreviews([(cell as MarkupCellViewModel)]);
			}

			if (e.outputCollapsedChanged && cell.isOutputCollapsed && cell.cellKind === CellKind.Code) {
				cell.outputsViewModels.forEach(output => this.hideInset(output));
			}

			if (e.focusModeChanged) {
				this._validateCellFocusMode(cell);
			}
		}));

		return store;
	}


	private _lastCellWithEditorFocus: ICellViewModel | null = null;
	private _validateCellFocusMode(cell: ICellViewModel) {
		if (cell.focusMode !== CellFocusMode.Editor) {
			return;
		}

		if (this._lastCellWithEditorFocus && this._lastCellWithEditorFocus !== cell) {
			this._lastCellWithEditorFocus.focusMode = CellFocusMode.Container;
		}

		this._lastCellWithEditorFocus = cell;
	}

	private async _warmupWithMarkdownRenderer(viewModel: NotebookViewModel, viewState: INotebookEditorViewState | undefined) {

		await this._resolveWebview();

		// make sure that the webview is not visible otherwise users will see pre-rendered markdown cells in wrong position as the list view doesn't have a correct `top` offset yet
		this._webview!.element.style.visibility = 'hidden';
		// warm up can take around 200ms to load markdown libraries, etc.
		await this._warmupViewport(viewModel, viewState);

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
		this._webview!.element.style.visibility = 'visible';

	}

	private async _warmupViewport(viewModel: NotebookViewModel, viewState: INotebookEditorViewState | undefined) {
		if (viewState && viewState.cellTotalHeights) {
			const totalHeightCache = viewState.cellTotalHeights;
			const scrollTop = viewState.scrollPosition?.top ?? 0;
			const scrollBottom = scrollTop + Math.max(this._dimension?.height ?? 0, 1080);

			let offset = 0;
			const requests: [ICellViewModel, number][] = [];

			for (let i = 0; i < viewModel.length; i++) {
				const cell = viewModel.cellAt(i)!;

				if (offset + (totalHeightCache[i] ?? 0) < scrollTop) {
					offset += (totalHeightCache ? totalHeightCache[i] : 0);
					continue;
				} else {
					if (cell.cellKind === CellKind.Markup) {
						requests.push([cell, offset]);
					}
				}

				offset += (totalHeightCache ? totalHeightCache[i] : 0);

				if (offset > scrollBottom) {
					break;
				}
			}

			await this._webview!.initializeMarkup(requests.map(([model, offset]) => this.createMarkupCellInitialization(model, offset)));
		} else {
			const initRequests = viewModel.viewCells
				.filter(cell => cell.cellKind === CellKind.Markup)
				.slice(0, 5)
				.map(cell => this.createMarkupCellInitialization(cell, -10000));

			await this._webview!.initializeMarkup(initRequests);

			// no cached view state so we are rendering the first viewport
			// after above async call, we already get init height for markdown cells, we can update their offset
			let offset = 0;
			const offsetUpdateRequests: { id: string; top: number }[] = [];
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

	private createMarkupCellInitialization(model: ICellViewModel, offset: number): IMarkupCellInitialization {
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

	restoreListViewState(viewState: INotebookEditorViewState | undefined): void {
		if (!this.viewModel) {
			return;
		}

		if (viewState?.scrollPosition !== undefined) {
			this._list.scrollTop = viewState!.scrollPosition.top;
			this._list.scrollLeft = viewState!.scrollPosition.left;
		} else {
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
		} else if (this._list.length > 0) {
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

	private _restoreSelectedKernel(viewState: INotebookEditorViewState | undefined): void {
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

	getEditorViewState(): INotebookEditorViewState {
		const state = this.viewModel?.getEditorViewState();
		if (!state) {
			return {
				editingCells: {},
				editorViewStates: {},
				collapsedInputCells: {},
				collapsedOutputCells: {},
			};
		}

		if (this._list) {
			state.scrollPosition = { left: this._list.scrollLeft, top: this._list.scrollTop };
			const cellHeights: { [key: number]: number } = {};
			for (let i = 0; i < this.viewModel!.length; i++) {
				const elm = this.viewModel!.cellAt(i) as CellViewModel;
				if (elm.cellKind === CellKind.Code) {
					cellHeights[i] = elm.layoutInfo.totalHeight;
				} else {
					cellHeights[i] = elm.layoutInfo.totalHeight;
				}
			}

			state.cellTotalHeights = cellHeights;

			if (this.viewModel) {
				const focusRange = this.viewModel.getFocus();
				const element = this.viewModel.cellAt(focusRange.start);
				if (element) {
					const itemDOM = this._list.domElementOfElement(element);
					const editorFocused = element.getEditState() === CellEditState.Editing && !!(document.activeElement && itemDOM && itemDOM.contains(document.activeElement));

					state.editorFocused = editorFocused;
					state.focus = focusRange.start;
				}
			}
		}

		// Save contribution view states
		const contributionsState: { [key: string]: unknown } = {};
		for (const [id, contribution] of this._contributions) {
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}
		state.contributionsState = contributionsState;
		state.selectedKernelId = this.activeKernel?.id;

		return state;
	}

	private _allowScrollBeyondLastLine() {
		return this._scrollBeyondLastLine && !this.isEmbedded;
	}

	layout(dimension: DOM.Dimension, shadowElement?: HTMLElement): void {
		if (!shadowElement && this._shadowElementViewInfo === null) {
			this._dimension = dimension;
			return;
		}

		if (dimension.width <= 0 || dimension.height <= 0) {
			this.onWillHide();
			return;
		}

		if (shadowElement) {
			this.updateShadowElement(shadowElement);
		}

		if (this._shadowElementViewInfo && this._shadowElementViewInfo.width <= 0 && this._shadowElementViewInfo.height <= 0) {
			this.onWillHide();
			return;
		}

		this._dimension = new DOM.Dimension(dimension.width, dimension.height);
		const newBodyHeight = Math.max(dimension.height - (this._notebookTopToolbar?.useGlobalToolbar ? /** Toolbar height */ 26 : 0), 0);
		DOM.size(this._body, dimension.width, newBodyHeight);

		const topInserToolbarHeight = this._notebookOptions.computeTopInsertToolbarHeight(this.viewModel?.viewType);
		const newCellListHeight = Math.max(dimension.height - topInserToolbarHeight, 0);
		if (this._list.getRenderHeight() < newCellListHeight) {
			// the new dimension is larger than the list viewport, update its additional height first, otherwise the list view will move down a bit (as the `scrollBottom` will move down)
			this._list.updateOptions({ additionalScrollHeight: this._allowScrollBeyondLastLine() ? Math.max(0, (newCellListHeight - 50)) : topInserToolbarHeight });
			this._list.layout(newCellListHeight, dimension.width);
		} else {
			// the new dimension is smaller than the list viewport, if we update the additional height, the `scrollBottom` will move up, which moves the whole list view upwards a bit. So we run a layout first.
			this._list.layout(newCellListHeight, dimension.width);
			this._list.updateOptions({ additionalScrollHeight: this._allowScrollBeyondLastLine() ? Math.max(0, (newCellListHeight - 50)) : topInserToolbarHeight });
		}

		this._overlayContainer.style.visibility = 'visible';
		this._overlayContainer.style.display = 'block';
		this._overlayContainer.style.position = 'absolute';
		this._overlayContainer.style.overflow = 'hidden';

		this.layoutContainerOverShadowElement(dimension);

		if (this._webviewTransparentCover) {
			this._webviewTransparentCover.style.height = `${dimension.height}px`;
			this._webviewTransparentCover.style.width = `${dimension.width}px`;
		}

		this._notebookTopToolbar.layout(this._dimension);
		this._notebookOverviewRuler.layout();

		this._viewContext?.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
	}

	private updateShadowElement(shadowElement: HTMLElement) {
		const containerRect = shadowElement.getBoundingClientRect();

		this._shadowElement = shadowElement;
		this._shadowElementViewInfo = {
			height: containerRect.height,
			width: containerRect.width,
			top: containerRect.top,
			left: containerRect.left
		};
	}

	private layoutContainerOverShadowElement(dimension?: DOM.Dimension | null): void {
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
		} else {
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

	private focusEditor(activeElement: CellViewModel): void {
		for (const [element, editor] of this._renderedEditors.entries()) {
			if (element === activeElement) {
				editor.focus();
				return;
			}
		}
	}

	focusContainer() {
		if (this._webviewFocused) {
			this._webview?.focusWebview();
		} else {
			this._list.focusContainer();
		}
	}

	onWillHide() {
		this._isVisible = false;
		this._editorFocus.set(false);
		this._overlayContainer.style.visibility = 'hidden';
		this._overlayContainer.style.left = '-50000px';
		this._notebookTopToolbarContainer.style.display = 'none';
	}

	private editorHasDomFocus(): boolean {
		return DOM.isAncestor(document.activeElement, this.getDomNode());
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

		const windowSelection = window.getSelection();
		if (windowSelection?.rangeCount !== 1) {
			return false;
		}

		const activeSelection = windowSelection.getRangeAt(0);
		if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
			return false;
		}

		let container: any = activeSelection.commonAncestorContainer;

		if (!this._body.contains(container)) {
			return false;
		}

		while (container
			&&
			container !== this._body) {
			if ((container as HTMLElement).classList && (container as HTMLElement).classList.contains('output')) {
				return true;
			}

			container = container.parentNode;
		}

		return false;
	}

	//#endregion

	//#region Editor Features

	focusElement(cell: ICellViewModel) {
		this.viewModel?.updateSelectionsState({
			kind: SelectionStateType.Handle,
			primary: cell.handle,
			selections: [cell.handle]
		});
	}

	get scrollTop() {
		return this._list.scrollTop;
	}

	getAbsoluteTopOfElement(cell: ICellViewModel) {
		return this._list.getAbsoluteTopOfElement(cell);
	}

	scrollToBottom() {
		this._listViewInfoAccessor.scrollToBottom();
	}

	revealCellRangeInView(range: ICellRange) {
		return this._listViewInfoAccessor.revealCellRangeInView(range);
	}

	revealInView(cell: ICellViewModel) {
		this._listViewInfoAccessor.revealInView(cell);
	}

	revealInViewAtTop(cell: ICellViewModel) {
		this._listViewInfoAccessor.revealInViewAtTop(cell);
	}

	revealInCenterIfOutsideViewport(cell: ICellViewModel) {
		this._listViewInfoAccessor.revealInCenterIfOutsideViewport(cell);
	}

	async revealInCenterIfOutsideViewportAsync(cell: ICellViewModel) {
		return this._listViewInfoAccessor.revealInCenterIfOutsideViewportAsync(cell);
	}

	revealInCenter(cell: ICellViewModel) {
		this._listViewInfoAccessor.revealInCenter(cell);
	}

	revealNearTopIfOutsideViewportAync(cell: ICellViewModel) {
		return this._listViewInfoAccessor.revealNearTopIfOutsideViewportAync(cell);
	}

	async revealLineInViewAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._listViewInfoAccessor.revealLineInViewAsync(cell, line);
	}

	async revealLineInCenterAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._listViewInfoAccessor.revealLineInCenterAsync(cell, line);
	}

	async revealLineInCenterIfOutsideViewportAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._listViewInfoAccessor.revealLineInCenterIfOutsideViewportAsync(cell, line);
	}

	async revealRangeInViewAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._listViewInfoAccessor.revealRangeInViewAsync(cell, range);
	}

	async revealRangeInCenterAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._listViewInfoAccessor.revealRangeInCenterAsync(cell, range);
	}

	async revealRangeInCenterIfOutsideViewportAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._listViewInfoAccessor.revealRangeInCenterIfOutsideViewportAsync(cell, range);
	}

	async revealCellOffsetInCenterAsync(cell: ICellViewModel, offset: number): Promise<void> {
		return this._listViewInfoAccessor.revealCellOffsetInCenterAsync(cell, offset);
	}

	getViewIndexByModelIndex(index: number): number {
		if (!this._listViewInfoAccessor) {
			return -1;
		}
		const cell = this.viewModel?.viewCells[index];
		if (!cell) {
			return -1;
		}

		return this._listViewInfoAccessor.getViewIndex(cell);
	}

	getViewHeight(cell: ICellViewModel): number {
		if (!this._listViewInfoAccessor) {
			return -1;
		}

		return this._listViewInfoAccessor.getViewHeight(cell);
	}

	getCellRangeFromViewRange(startIndex: number, endIndex: number): ICellRange | undefined {
		return this._listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex);
	}

	getCellsInRange(range?: ICellRange): ReadonlyArray<ICellViewModel> {
		return this._listViewInfoAccessor.getCellsInRange(range);
	}

	setCellEditorSelection(cell: ICellViewModel, range: Range): void {
		this._listViewInfoAccessor.setCellEditorSelection(cell, range);
	}

	setHiddenAreas(_ranges: ICellRange[]): boolean {
		return this._listViewInfoAccessor.setHiddenAreas(_ranges);
	}

	getVisibleRangesPlusViewportAboveAndBelow(): ICellRange[] {
		return this._listViewInfoAccessor.getVisibleRangesPlusViewportAboveAndBelow();
	}

	//#endregion

	//#region Decorations

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[] {
		const ret = this.viewModel?.deltaCellDecorations(oldDecorations, newDecorations) || [];
		this._onDidChangeDecorations.fire();
		return ret;
	}

	deltaCellContainerClassNames(cellId: string, added: string[], removed: string[]) {
		this._webview?.deltaCellContainerClassNames(cellId, added, removed);
	}

	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null {
		return this.viewModel?.changeModelDecorations<T>(callback) || null;
	}

	//#endregion

	//#region Kernel/Execution

	private async _loadKernelPreloads(): Promise<void> {
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

	async cancelNotebookCells(cells?: Iterable<ICellViewModel>): Promise<void> {
		if (!this.viewModel || !this.hasModel()) {
			return;
		}
		if (!cells) {
			cells = this.viewModel.viewCells;
		}
		return this.notebookExecutionService.cancelNotebookCellHandles(this.textModel, Array.from(cells).map(cell => cell.handle));
	}

	async executeNotebookCells(cells?: Iterable<ICellViewModel>): Promise<void> {
		if (!this.viewModel || !this.hasModel()) {
			return;
		}
		if (!cells) {
			cells = this.viewModel.viewCells;
		}
		return this.notebookExecutionService.executeNotebookCells(this.textModel, Array.from(cells).map(c => c.model));
	}

	//#endregion

	//#region Cell operations/layout API
	private _pendingLayouts: WeakMap<ICellViewModel, IDisposable> | null = new WeakMap<ICellViewModel, IDisposable>();
	async layoutNotebookCell(cell: ICellViewModel, height: number, context?: CellLayoutContext): Promise<void> {
		this._debug('layout cell', cell.handle, height);
		const viewIndex = this._list.getViewIndex(cell);
		if (viewIndex === undefined) {
			// the cell is hidden
			return;
		}

		const relayout = (cell: ICellViewModel, height: number) => {
			if (this._isDisposed) {
				return;
			}

			this._list.updateElementHeight2(cell, height);
		};

		if (this._pendingLayouts?.has(cell)) {
			this._pendingLayouts?.get(cell)!.dispose();
		}

		const deferred = new DeferredPromise<void>();
		const doLayout = () => {
			if (this._isDisposed) {
				return;
			}

			if (!this.viewModel?.hasCell(cell)) {
				// Cell removed in the meantime?
				return;
			}

			if (this._list.elementHeight(cell) === height) {
				return;
			}

			this._pendingLayouts?.delete(cell);

			relayout(cell, height);
			deferred.complete(undefined);
		};

		if (context === CellLayoutContext.Fold) {
			doLayout();
		} else {
			const layoutDisposable = DOM.scheduleAtNextAnimationFrame(doLayout);

			this._pendingLayouts?.set(cell, toDisposable(() => {
				layoutDisposable.dispose();
				deferred.complete(undefined);
			}));
		}

		return deferred.p;
	}

	getActiveCell() {
		const elements = this._list.getFocusedElements();

		if (elements && elements.length) {
			return elements[0];
		}

		return undefined;
	}

	private _cellFocusAria(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output') {
		const index = this._notebookViewModel?.getCellIndex(cell);

		if (index !== undefined && index >= 0) {
			let position = '';
			switch (focusItem) {
				case 'editor':
					position = `the inner ${cell.cellKind === CellKind.Markup ? 'markdown' : 'code'} editor is focused, press escape to focus the cell container`;
					break;
				case 'output':
					position = `the cell output is focused, press escape to focus the cell container`;
					break;
				case 'container':
					position = `the ${cell.cellKind === CellKind.Markup ? 'markdown preview' : 'cell container'} is focused, press enter to focus the inner ${cell.cellKind === CellKind.Markup ? 'markdown' : 'code'} editor`;
					break;
				default:
					break;
			}
			aria.alert(`Cell ${this._notebookViewModel?.getCellIndex(cell)}, ${position} `);
		}
	}

	private _toggleNotebookCellSelection(selectedCell: ICellViewModel, selectFromPrevious: boolean): void {
		const currentSelections = this._list.getSelectedElements();
		const isSelected = currentSelections.includes(selectedCell);

		const previousSelection = selectFromPrevious ? currentSelections[currentSelections.length - 1] ?? selectedCell : selectedCell;
		const selectedIndex = this._list.getViewIndex(selectedCell)!;
		const previousIndex = this._list.getViewIndex(previousSelection)!;

		const cellsInSelectionRange = this.getCellsInViewRange(selectedIndex, previousIndex);
		if (isSelected) {
			// Deselect
			this._list.selectElements(currentSelections.filter(current => !cellsInSelectionRange.includes(current)));
		} else {
			// Add to selection
			this.focusElement(selectedCell);
			this._list.selectElements([...currentSelections.filter(current => !cellsInSelectionRange.includes(current)), ...cellsInSelectionRange]);
		}
	}

	private getCellsInViewRange(fromInclusive: number, toInclusive: number): ICellViewModel[] {
		const selectedCellsInRange: ICellViewModel[] = [];
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

	async focusNotebookCell(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions) {
		if (this._isDisposed) {
			return;
		}

		if (focusItem === 'editor') {
			this.focusElement(cell);
			this._cellFocusAria(cell, focusItem);
			this._list.focusView();

			cell.updateEditState(CellEditState.Editing, 'focusNotebookCell');
			cell.focusMode = CellFocusMode.Editor;
			if (!options?.skipReveal) {
				if (typeof options?.focusEditorLine === 'number') {
					this._cursorNavMode.set(true);
					await this.revealLineInViewAsync(cell, options.focusEditorLine);
					const editor = this._renderedEditors.get(cell)!;
					const focusEditorLine = options.focusEditorLine!;
					editor?.setSelection({
						startLineNumber: focusEditorLine,
						startColumn: 1,
						endLineNumber: focusEditorLine,
						endColumn: 1
					});
				} else {
					const selectionsStartPosition = cell.getSelectionsStartPosition();
					if (selectionsStartPosition?.length) {
						const firstSelectionPosition = selectionsStartPosition[0];
						await this.revealRangeInCenterIfOutsideViewportAsync(cell, Range.fromPositions(firstSelectionPosition, firstSelectionPosition));
					} else {
						this.revealInCenterIfOutsideViewport(cell);
					}
				}

			}
		} else if (focusItem === 'output') {
			this.focusElement(cell);
			this._cellFocusAria(cell, focusItem);

			if (!this.hasEditorFocus()) {
				this._list.focusView();
			}

			if (!this._webview) {
				return;
			}

			this._webview.focusOutput(cell.id, this._webviewFocused);

			cell.updateEditState(CellEditState.Preview, 'focusNotebookCell');
			cell.focusMode = CellFocusMode.Output;
			if (!options?.skipReveal) {
				this.revealInCenterIfOutsideViewport(cell);
			}
		} else {
			const itemDOM = this._list.domElementOfElement(cell);
			if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
				(document.activeElement as HTMLElement).blur();
			}

			cell.updateEditState(CellEditState.Preview, 'focusNotebookCell');
			cell.focusMode = CellFocusMode.Container;

			this.focusElement(cell);
			this._cellFocusAria(cell, focusItem);
			if (!options?.skipReveal) {
				if (typeof options?.focusEditorLine === 'number') {
					this._cursorNavMode.set(true);
					this.revealInView(cell);
				} else {
					this.revealInCenterIfOutsideViewport(cell);
				}
			}
			this._list.focusView();
		}
	}

	async focusNextNotebookCell(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output') {
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

	private async _renderCell(viewCell: CodeCellViewModel) {
		if (viewCell.isOutputCollapsed) {
			return;
		}

		const outputs = viewCell.outputsViewModels;
		for (const output of outputs) {
			const [mimeTypes, pick] = output.resolveMimeTypes(this.textModel!, undefined);
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

			const result: IInsetRenderOutput = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
			if (!this._webview?.insetMapping.has(result.source)) {
				const p = new Promise<void>(resolve => {
					this.onDidRenderOutput(e => {
						if (e.model === result.source.model) {
							resolve();
						}
					});
				});
				this.createOutput(viewCell, result, 0);
				await p;

			}

			return;
		}

	}

	private async _warmupAll(includeOutput: boolean) {
		if (!this.hasModel() || !this.viewModel) {
			return;
		}

		const cells = this.viewModel.viewCells;
		const requests = [];

		for (let i = 0; i < cells.length; i++) {
			if (cells[i].cellKind === CellKind.Markup && !this._webview!.markupPreviewMapping.has(cells[i].id)) {
				requests.push(this.createMarkupPreview(cells[i]));
			}
		}

		if (includeOutput) {
			for (let i = 0; i < this.getLength(); i++) {
				const cell = this.cellAt(i);

				if (cell?.cellKind === CellKind.Code) {
					requests.push(this._renderCell((cell as CodeCellViewModel)));
				}
			}
		}


		return Promise.all(requests);
	}

	async find(query: string, options: INotebookSearchOptions, token: CancellationToken, skipWarmup: boolean = false): Promise<CellFindMatchWithIndex[]> {
		if (!this._notebookViewModel) {
			return [];
		}

		const findMatches = this._notebookViewModel.find(query, options).filter(match => match.matches.length > 0);

		if (!options.includeMarkupPreview && !options.includeOutput) {
			this._webview?.findStop();

			return findMatches.filter(match =>
				(match.cell.cellKind === CellKind.Code && options.includeCodeInput) ||
				(match.cell.cellKind === CellKind.Markup && options.includeMarkupInput)
			);
		}

		const matchMap: { [key: string]: CellFindMatchWithIndex } = {};
		findMatches.forEach(match => {
			if (match.cell.cellKind === CellKind.Code && options.includeCodeInput) {
				matchMap[match.cell.id] = match;
			}

			if (match.cell.cellKind === CellKind.Markup && options.includeMarkupInput) {
				matchMap[match.cell.id] = match;
			}
		});

		if (this._webview) {
			// request all outputs to be rendered
			await this._warmupAll(!!options.includeOutput);
			const webviewMatches = await this._webview.find(query, { caseSensitive: options.caseSensitive, wholeWord: options.wholeWord, includeMarkup: !!options.includeMarkupPreview, includeOutput: !!options.includeOutput });
			// attach webview matches to model find matches
			webviewMatches.forEach(match => {
				if (!options.includeMarkupPreview && match.type === 'preview') {
					// skip outputs if not included
					return;
				}

				if (!options.includeOutput && match.type === 'output') {
					// skip outputs if not included
					return;
				}

				const exisitingMatch = matchMap[match.cellId];

				if (exisitingMatch) {
					exisitingMatch.matches.push(match);
				} else {
					matchMap[match.cellId] = {
						cell: this._notebookViewModel!.viewCells.find(cell => cell.id === match.cellId)! as CellViewModel,
						index: this._notebookViewModel!.viewCells.findIndex(cell => cell.id === match.cellId)!,
						matches: [match],
						modelMatchCount: 0
					};
				}
			});
		}

		const ret: CellFindMatchWithIndex[] = [];
		this._notebookViewModel.viewCells.forEach((cell, index) => {
			if (matchMap[cell.id]) {
				ret.push({
					cell: cell as CellViewModel,
					index: index,
					matches: matchMap[cell.id].matches,
					modelMatchCount: matchMap[cell.id].modelMatchCount
				});
			}
		});

		return ret;
	}

	async highlightFind(cell: CodeCellViewModel, matchIndex: number): Promise<number> {
		if (!this._webview) {
			return 0;
		}

		return this._webview?.findHighlight(matchIndex);
	}

	async unHighlightFind(matchIndex: number): Promise<void> {
		if (!this._webview) {
			return;
		}

		return this._webview?.findUnHighlight(matchIndex);
	}

	findStop() {
		this._webview?.findStop();
	}

	//#endregion

	//#region MISC

	getLayoutInfo(): NotebookLayoutInfo {
		if (!this._list) {
			throw new Error('Editor is not initalized successfully');
		}

		if (!this._fontInfo) {
			this._generateFontInfo();
		}

		return {
			width: this._dimension?.width ?? 0,
			height: this._dimension?.height ?? 0,
			scrollHeight: this._list?.getScrollHeight() ?? 0,
			fontInfo: this._fontInfo!
		};
	}

	async createMarkupPreview(cell: MarkupCellViewModel) {
		if (!this._webview) {
			return;
		}

		if (!this._webview.isResolved()) {
			await this._resolveWebview();
		}

		if (!this._webview || !this._list.webviewElement) {
			return;
		}

		if (!this.viewModel) {
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

		const cellTop = this._list.getAbsoluteTopOfElement(cell);
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

	private cellIsHidden(cell: ICellViewModel): boolean {
		const modelIndex = this.viewModel!.getCellIndex(cell);
		const foldedRanges = this.viewModel!.getHiddenRanges();
		return foldedRanges.some(range => modelIndex >= range.start && modelIndex <= range.end);
	}

	async unhideMarkupPreviews(cells: readonly MarkupCellViewModel[]) {
		if (!this._webview) {
			return;
		}

		if (!this._webview.isResolved()) {
			await this._resolveWebview();
		}

		await this._webview?.unhideMarkupPreviews(cells.map(cell => cell.id));
	}

	async hideMarkupPreviews(cells: readonly MarkupCellViewModel[]) {
		if (!this._webview || !cells.length) {
			return;
		}

		if (!this._webview.isResolved()) {
			await this._resolveWebview();
		}

		await this._webview?.hideMarkupPreviews(cells.map(cell => cell.id));
	}

	async deleteMarkupPreviews(cells: readonly MarkupCellViewModel[]) {
		if (!this._webview) {
			return;
		}

		if (!this._webview.isResolved()) {
			await this._resolveWebview();
		}

		await this._webview?.deleteMarkupPreviews(cells.map(cell => cell.id));
	}

	private async updateSelectedMarkdownPreviews(): Promise<void> {
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

	async createOutput(cell: CodeCellViewModel, output: IInsetRenderOutput, offset: number): Promise<void> {
		this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
			if (!this._webview) {
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

			if (output.type === RenderOutputType.Extension) {
				this.notebookRendererMessaging.prepare(output.renderer.id);
			}

			const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
			const top = !!webviewTop ? (0 - webviewTop) : 0;

			const cellTop = this._list.getAbsoluteTopOfElement(cell) + top;

			const existingOutput = this._webview.insetMapping.get(output.source);
			if (!existingOutput
				|| (!existingOutput.renderer && output.type === RenderOutputType.Extension)
				|| (existingOutput.renderer
					&& output.type === RenderOutputType.Extension
					&& existingOutput.renderer.id !== output.renderer.id)
			) {
				await this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
			} else {
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

	async updateOutput(cell: CodeCellViewModel, output: IInsetRenderOutput, offset: number): Promise<void> {
		this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
			if (!this._webview) {
				return;
			}

			if (!this._webview.isResolved()) {
				await this._resolveWebview();
			}

			if (!this._webview || !this._list.webviewElement) {
				return;
			}

			if (!this._webview.insetMapping.has(output.source)) {
				return this.createOutput(cell, output, offset);
			}

			if (output.type === RenderOutputType.Extension) {
				this.notebookRendererMessaging.prepare(output.renderer.id);
			}

			const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
			const top = !!webviewTop ? (0 - webviewTop) : 0;

			const cellTop = this._list.getAbsoluteTopOfElement(cell) + top;
			await this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
		});
	}

	removeInset(output: ICellOutputViewModel) {
		this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
			if (this._webview?.isResolved()) {
				this._webview.removeInsets([output]);
			}
		});
	}

	hideInset(output: ICellOutputViewModel) {
		this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
			if (this._webview?.isResolved()) {
				this._webview.hideInset(output);
			}
		});
	}

	//#region --- webview IPC ----
	postMessage(message: any) {
		if (this._webview?.isResolved()) {
			this._webview.postKernelMessage(message);
		}
	}

	//#endregion

	addClassName(className: string) {
		this._overlayContainer.classList.add(className);
	}

	removeClassName(className: string) {
		this._overlayContainer.classList.remove(className);
	}

	cellAt(index: number): ICellViewModel | undefined {
		return this.viewModel?.cellAt(index);
	}

	getCellByInfo(cellInfo: ICommonCellInfo): ICellViewModel {
		const { cellHandle } = cellInfo;
		return this.viewModel?.viewCells.find(vc => vc.handle === cellHandle) as CodeCellViewModel;
	}

	getCellByHandle(handle: number): ICellViewModel | undefined {
		return this.viewModel?.getCellByHandle(handle);
	}

	getCellIndex(cell: ICellViewModel) {
		return this.viewModel?.getCellIndexByHandle(cell.handle);
	}

	getNextVisibleCellIndex(index: number): number | undefined {
		return this.viewModel?.getNextVisibleCellIndex(index);
	}

	getPreviousVisibleCellIndex(index: number): number | undefined {
		return this.viewModel?.getPreviousVisibleCellIndex(index);
	}

	private _updateScrollHeight() {
		if (this._isDisposed || !this._webview?.isResolved()) {
			return;
		}

		if (!this._list.webviewElement) {
			return;
		}

		const scrollHeight = this._list.scrollHeight;
		this._webview!.element.style.height = `${scrollHeight + NOTEBOOK_WEBVIEW_BOUNDARY * 2}px`;

		const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
		const top = !!webviewTop ? (0 - webviewTop) : 0;

		const updateItems: IDisplayOutputLayoutUpdateRequest[] = [];
		const removedItems: ICellOutputViewModel[] = [];
		this._webview?.insetMapping.forEach((value, key) => {
			const cell = this.viewModel?.getCellByHandle(value.cellInfo.cellHandle);
			if (!cell || !(cell instanceof CodeCellViewModel)) {
				return;
			}

			this.viewModel?.viewCells.find(cell => cell.handle === value.cellInfo.cellHandle);
			const viewIndex = this._list.getViewIndex(cell);

			if (viewIndex === undefined) {
				return;
			}

			if (cell.outputsViewModels.indexOf(key) < 0) {
				// output is already gone
				removedItems.push(key);
			}

			const cellTop = this._list.getAbsoluteTopOfElement(cell);
			const outputIndex = cell.outputsViewModels.indexOf(key);
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

		const markdownUpdateItems: { id: string; top: number }[] = [];
		for (const cellId of this._webview.markupPreviewMapping.keys()) {
			const cell = this.viewModel?.viewCells.find(cell => cell.id === cellId);
			if (cell) {
				const cellTop = this._list.getAbsoluteTopOfElement(cell);
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
	private _updateOutputHeight(cellInfo: ICommonCellInfo, output: ICellOutputViewModel, outputHeight: number, isInit: boolean, source?: string): void {
		const cell = this.viewModel?.viewCells.find(vc => vc.handle === cellInfo.cellHandle);
		if (cell && cell instanceof CodeCellViewModel) {
			const outputIndex = cell.outputsViewModels.indexOf(output);
			if (outputHeight !== 0) {
				cell.updateOutputMinHeight(0);
			}
			this._debug('update cell output', cell.handle, outputHeight);
			cell.updateOutputHeight(outputIndex, outputHeight, source);
			this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);

			if (isInit) {
				this._onDidRenderOutput.fire(output);
			}
		}
	}

	private readonly _pendingOutputHeightAcks = new Map</* outputId */ string, IAckOutputHeight>();

	private _scheduleOutputHeightAck(cellInfo: ICommonCellInfo, outputId: string, height: number) {
		const wasEmpty = this._pendingOutputHeightAcks.size === 0;
		this._pendingOutputHeightAcks.set(outputId, { cellId: cellInfo.cellId, outputId, height });

		if (wasEmpty) {
			DOM.scheduleAtNextAnimationFrame(() => {
				this._debug('ack height');
				this._updateScrollHeight();

				this._webview?.ackHeight([...this._pendingOutputHeightAcks.values()]);

				this._pendingOutputHeightAcks.clear();
			}, -1); // -1 priority because this depends on calls to layoutNotebookCell, and that may be called multiple times before this runs
		}
	}

	private _getCellById(cellId: string): ICellViewModel | undefined {
		return this.viewModel?.viewCells.find(vc => vc.id === cellId);
	}

	private _updateMarkupCellHeight(cellId: string, height: number, isInit: boolean) {
		const cell = this._getCellById(cellId);
		if (cell && cell instanceof MarkupCellViewModel) {
			const { bottomToolbarGap } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
			this._debug('updateMarkdownCellHeight', cell.handle, height + bottomToolbarGap, isInit);
			cell.renderedMarkdownHeight = height;
		}
	}

	private _setMarkupCellEditState(cellId: string, editState: CellEditState): void {
		const cell = this._getCellById(cellId);
		if (cell instanceof MarkupCellViewModel) {
			this.revealInView(cell);
			cell.updateEditState(editState, 'setMarkdownCellEditState');
		}
	}

	private _didStartDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void {
		const cell = this._getCellById(cellId);
		if (cell instanceof MarkupCellViewModel) {
			const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
			this._dndController?.startExplicitDrag(cell, event.dragOffsetY - webviewOffset);
		}
	}

	private _didDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void {
		const cell = this._getCellById(cellId);
		if (cell instanceof MarkupCellViewModel) {
			const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
			this._dndController?.explicitDrag(cell, event.dragOffsetY - webviewOffset);
		}
	}

	private _didDropMarkupCell(cellId: string, event: { dragOffsetY: number; ctrlKey: boolean; altKey: boolean }): void {
		const cell = this._getCellById(cellId);
		if (cell instanceof MarkupCellViewModel) {
			const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
			event.dragOffsetY -= webviewOffset;
			this._dndController?.explicitDrop(cell, event);
		}
	}

	private _didEndDragMarkupCell(cellId: string): void {
		const cell = this._getCellById(cellId);
		if (cell instanceof MarkupCellViewModel) {
			this._dndController?.endExplicitDrag(cell);
		}
	}

	private _didResizeOutput(cellId: string): void {
		const cell = this._getCellById(cellId);
		if (cell) {
			this._onDidResizeOutputEmitter.fire(cell);
		}
	}

	//#endregion

	//#region Editor Contributions
	getContribution<T extends INotebookEditorContribution>(id: string): T {
		return <T>(this._contributions.get(id) || null);
	}

	//#endregion

	override dispose() {
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
		this._listTopCellToolbar?.dispose();

		this._overlayContainer.remove();
		this.viewModel?.dispose();

		this._renderedEditors.clear();
		this._baseCellEditorOptions.forEach(v => v.dispose());
		this._baseCellEditorOptions.clear();

		super.dispose();

		// unref
		this._webview = null;
		this._webviewResolvePromise = null;
		this._webviewTransparentCover = null;
		this._dndController = null;
		this._listTopCellToolbar = null;
		this._notebookViewModel = undefined;
		this._cellContextKeyManager = null;
		this._notebookTopToolbar = null!;
		this._list = null!;
		this._listViewInfoAccessor = null!;
		this._pendingLayouts = null;
		this._listDelegate = null;
	}

	toJSON(): { notebookUri: URI | undefined } {
		return {
			notebookUri: this.viewModel?.uri,
		};
	}
}

registerZIndex(ZIndex.Base, 5, 'notebook-progress-bar',);
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

export const focusedEditorBorderColor = registerColor('notebook.focusedEditorBorder', {
	light: focusBorder,
	dark: focusBorder,
	hcDark: focusBorder,
	hcLight: focusBorder
}, nls.localize('notebook.focusedEditorBorder', "The color of the notebook cell editor border."));

export const cellStatusIconSuccess = registerColor('notebookStatusSuccessIcon.foreground', {
	light: debugIconStartForeground,
	dark: debugIconStartForeground,
	hcDark: debugIconStartForeground,
	hcLight: debugIconStartForeground
}, nls.localize('notebookStatusSuccessIcon.foreground', "The error icon color of notebook cells in the cell status bar."));

export const cellStatusIconError = registerColor('notebookStatusErrorIcon.foreground', {
	light: errorForeground,
	dark: errorForeground,
	hcDark: errorForeground,
	hcLight: errorForeground
}, nls.localize('notebookStatusErrorIcon.foreground', "The error icon color of notebook cells in the cell status bar."));

export const cellStatusIconRunning = registerColor('notebookStatusRunningIcon.foreground', {
	light: foreground,
	dark: foreground,
	hcDark: foreground,
	hcLight: foreground
}, nls.localize('notebookStatusRunningIcon.foreground', "The running icon color of notebook cells in the cell status bar."));

export const notebookOutputContainerBorderColor = registerColor('notebook.outputContainerBorderColor', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, nls.localize('notebook.outputContainerBorderColor', "The border color of the notebook output container."));

export const notebookOutputContainerColor = registerColor('notebook.outputContainerBackgroundColor', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, nls.localize('notebook.outputContainerBackgroundColor', "The color of the notebook output container background."));

// TODO@rebornix currently also used for toolbar border, if we keep all of this, pick a generic name
export const CELL_TOOLBAR_SEPERATOR = registerColor('notebook.cellToolbarSeparator', {
	dark: Color.fromHex('#808080').transparent(0.35),
	light: Color.fromHex('#808080').transparent(0.35),
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, nls.localize('notebook.cellToolbarSeparator', "The color of the separator in the cell bottom toolbar"));

export const focusedCellBackground = registerColor('notebook.focusedCellBackground', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, nls.localize('focusedCellBackground', "The background color of a cell when the cell is focused."));

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

export const focusedCellBorder = registerColor('notebook.focusedCellBorder', {
	dark: focusBorder,
	light: focusBorder,
	hcDark: focusBorder,
	hcLight: focusBorder
}, nls.localize('notebook.focusedCellBorder', "The color of the cell's focus indicator borders when the cell is focused."));

export const inactiveFocusedCellBorder = registerColor('notebook.inactiveFocusedCellBorder', {
	dark: notebookCellBorder,
	light: notebookCellBorder,
	hcDark: notebookCellBorder,
	hcLight: notebookCellBorder
}, nls.localize('notebook.inactiveFocusedCellBorder', "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."));

export const cellStatusBarItemHover = registerColor('notebook.cellStatusBarItemHoverBackground', {
	light: new Color(new RGBA(0, 0, 0, 0.08)),
	dark: new Color(new RGBA(255, 255, 255, 0.15)),
	hcDark: new Color(new RGBA(255, 255, 255, 0.15)),
	hcLight: new Color(new RGBA(0, 0, 0, 0.08)),
}, nls.localize('notebook.cellStatusBarItemHoverBackground', "The background color of notebook cell status bar items."));

export const cellInsertionIndicator = registerColor('notebook.cellInsertionIndicator', {
	light: focusBorder,
	dark: focusBorder,
	hcDark: focusBorder,
	hcLight: focusBorder
}, nls.localize('notebook.cellInsertionIndicator', "The color of the notebook cell insertion indicator."));

export const listScrollbarSliderBackground = registerColor('notebookScrollbarSlider.background', {
	dark: scrollbarSliderBackground,
	light: scrollbarSliderBackground,
	hcDark: scrollbarSliderBackground,
	hcLight: scrollbarSliderBackground
}, nls.localize('notebookScrollbarSliderBackground', "Notebook scrollbar slider background color."));

export const listScrollbarSliderHoverBackground = registerColor('notebookScrollbarSlider.hoverBackground', {
	dark: scrollbarSliderHoverBackground,
	light: scrollbarSliderHoverBackground,
	hcDark: scrollbarSliderHoverBackground,
	hcLight: scrollbarSliderHoverBackground
}, nls.localize('notebookScrollbarSliderHoverBackground', "Notebook scrollbar slider background color when hovering."));

export const listScrollbarSliderActiveBackground = registerColor('notebookScrollbarSlider.activeBackground', {
	dark: scrollbarSliderActiveBackground,
	light: scrollbarSliderActiveBackground,
	hcDark: scrollbarSliderActiveBackground,
	hcLight: scrollbarSliderActiveBackground
}, nls.localize('notebookScrollbarSliderActiveBackground', "Notebook scrollbar slider background color when clicked on."));

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

export const notebookEditorBackground = registerColor('notebook.editorBackground', {
	light: EDITOR_PANE_BACKGROUND,
	dark: EDITOR_PANE_BACKGROUND,
	hcDark: null,
	hcLight: null
}, nls.localize('notebook.editorBackground', "Notebook background color."));

registerThemingParticipant((theme, collector) => {
	// add css variable rules

	const focusedCellBorderColor = theme.getColor(focusedCellBorder);
	const inactiveFocusedBorderColor = theme.getColor(inactiveFocusedCellBorder);
	const selectedCellBorderColor = theme.getColor(selectedCellBorder);
	collector.addRule(`
	:root {
		--notebook-focused-cell-border-color: ${focusedCellBorderColor};
		--notebook-inactive-focused-cell-border-color: ${inactiveFocusedBorderColor};
		--notebook-selected-cell-border-color: ${selectedCellBorderColor};
	}
	`);

	const cellStatusIconSuccessColor = theme.getColor(cellStatusIconSuccess);
	const cellStatusIconErrorColor = theme.getColor(cellStatusIconError);
	const cellStatusIconRunningColor = theme.getColor(cellStatusIconRunning);
	collector.addRule(`
	:root {
		--notebook-cell-status-icon-success: ${cellStatusIconSuccessColor};
		--notebook-cell-status-icon-error: ${cellStatusIconErrorColor};
		--notebook-cell-status-icon-running: ${cellStatusIconRunningColor};
	}
	`);

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.notebookOverlay .cell.markdown a,
			.notebookOverlay .output-show-more-container a,
			.notebookOverlay div.output-show-more a
			{ color: ${link};} `);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.notebookOverlay .output-show-more-container a:active,
		.notebookOverlay .output-show-more a:active
			{ color: ${activeLink}; }`);
	}
	const shortcut = theme.getColor(textPreformatForeground);
	if (shortcut) {
		collector.addRule(`.notebookOverlay code,
			.notebookOverlay .shortcut { color: ${shortcut}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.notebookOverlay .monaco-editor { border-color: ${border}; }`);
	}
	const quoteBackground = theme.getColor(textBlockQuoteBackground);
	if (quoteBackground) {
		collector.addRule(`.notebookOverlay blockquote { background: ${quoteBackground}; }`);
	}
	const quoteBorder = theme.getColor(textBlockQuoteBorder);
	if (quoteBorder) {
		collector.addRule(`.notebookOverlay blockquote { border-color: ${quoteBorder}; }`);
	}

	const containerBackground = theme.getColor(notebookOutputContainerColor);
	if (containerBackground) {
		collector.addRule(`.notebookOverlay .output { background-color: ${containerBackground}; }`);
		collector.addRule(`.notebookOverlay .output-element { background-color: ${containerBackground}; }`);
		collector.addRule(`.notebookOverlay .output-show-more-container { background-color: ${containerBackground}; }`);
	}

	const containerBorder = theme.getColor(notebookOutputContainerBorderColor);
	if (containerBorder) {
		collector.addRule(`.notebookOverlay .output-element { border-top: none !important; border: 1px solid transparent; border-color: ${containerBorder} !important; }`);
	}

	const notebookBackground = theme.getColor(editorBackground);
	if (notebookBackground) {
		collector.addRule(`.notebookOverlay .cell-drag-image .cell-editor-container > div { background: ${notebookBackground} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-title-toolbar { background-color: ${notebookBackground}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row.cell-drag-image { background-color: ${notebookBackground}; }`);
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .action-item { background-color: ${notebookBackground} }`);
		collector.addRule(`.notebookOverlay .cell-list-top-cell-toolbar-container .action-item { background-color: ${notebookBackground} }`);
	}

	const notebookBackgroundColor = theme.getColor(notebookEditorBackground);

	if (notebookBackgroundColor) {
		collector.addRule(`.monaco-workbench .notebookOverlay.notebook-editor { background-color: ${notebookBackgroundColor}; }`);
	}

	const editorBackgroundColor = theme.getColor(cellEditorBackground) ?? theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.notebookOverlay .cell .monaco-editor-background,
		.notebookOverlay .cell .margin-view-overlays,
		.notebookOverlay .cell .cell-statusbar-container { background: ${editorBackgroundColor}; }`);
	}

	const cellToolbarSeperator = theme.getColor(CELL_TOOLBAR_SEPERATOR);
	if (cellToolbarSeperator) {
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-title-toolbar { border: solid 1px ${cellToolbarSeperator}; }`);
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .action-item { border: solid 1px ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .cell-list-top-cell-toolbar-container .action-item { border: solid 1px ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .monaco-action-bar .action-item.verticalSeparator { background-color: ${cellToolbarSeperator} }`);
		collector.addRule(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container { border-bottom: solid 1px ${cellToolbarSeperator} }`);
	}

	const focusedCellBackgroundColor = theme.getColor(focusedCellBackground);
	if (focusedCellBackgroundColor) {
		collector.addRule(`.notebookOverlay .code-cell-row.focused .cell-focus-indicator { background-color: ${focusedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .markdown-cell-row.focused { background-color: ${focusedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .code-cell-row.focused .input-collapse-container { background-color: ${focusedCellBackgroundColor} !important; }`);
	}

	const selectedCellBackgroundColor = theme.getColor(selectedCellBackground);
	if (selectedCellBackground) {
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .markdown-cell-row.selected { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-top { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-left { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-right { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-bottom { background-color: ${selectedCellBackgroundColor} !important; }`);
	}

	const inactiveSelectedCellBorderColor = theme.getColor(inactiveSelectedCellBorder);
	collector.addRule(`
			.notebookOverlay .monaco-list.selection-multiple:focus-within .monaco-list-row.selected .cell-focus-indicator-top:before,
			.notebookOverlay .monaco-list.selection-multiple:focus-within .monaco-list-row.selected .cell-focus-indicator-bottom:before,
			.notebookOverlay .monaco-list.selection-multiple:focus-within .monaco-list-row.selected .cell-inner-container:not(.cell-editor-focus) .cell-focus-indicator-left:before,
			.notebookOverlay .monaco-list.selection-multiple:focus-within .monaco-list-row.selected .cell-inner-container:not(.cell-editor-focus) .cell-focus-indicator-right:before {
					border-color: ${inactiveSelectedCellBorderColor} !important;
			}
	`);

	const cellHoverBackgroundColor = theme.getColor(cellHoverBackground);
	if (cellHoverBackgroundColor) {
		collector.addRule(`.notebookOverlay .code-cell-row:not(.focused):hover .cell-focus-indicator,
			.notebookOverlay .code-cell-row:not(.focused).cell-output-hover .cell-focus-indicator,
			.notebookOverlay .markdown-cell-row:not(.focused):hover { background-color: ${cellHoverBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .code-cell-row:not(.focused):hover .input-collapse-container,
			.notebookOverlay .code-cell-row:not(.focused).cell-output-hover .input-collapse-container { background-color: ${cellHoverBackgroundColor}; }`);
	}

	const cellSymbolHighlightColor = theme.getColor(cellSymbolHighlight);
	if (cellSymbolHighlightColor) {
		collector.addRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-symbolHighlight .cell-focus-indicator,
		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-symbolHighlight {
			background-color: ${cellSymbolHighlightColor} !important;
		}`);
	}

	const focusedEditorBorderColorColor = theme.getColor(focusedEditorBorderColor);
	if (focusedEditorBorderColorColor) {
		collector.addRule(`.notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-editor-focus .cell-editor-part:before { outline: solid 1px ${focusedEditorBorderColorColor}; }`);
	}

	const cellBorderColor = theme.getColor(notebookCellBorder);
	if (cellBorderColor) {
		collector.addRule(`.notebookOverlay .cell.markdown h1 { border-color: ${cellBorderColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-editor-part:before { outline: solid 1px ${cellBorderColor}; }`);
	}

	const cellStatusBarHoverBg = theme.getColor(cellStatusBarItemHover);
	if (cellStatusBarHoverBg) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-language-picker:hover,
		.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-status-item.cell-status-item-has-command:hover { background-color: ${cellStatusBarHoverBg}; }`);
	}

	const cellInsertionIndicatorColor = theme.getColor(cellInsertionIndicator);
	if (cellInsertionIndicatorColor) {
		collector.addRule(`.notebookOverlay > .cell-list-container > .cell-list-insertion-indicator { background-color: ${cellInsertionIndicatorColor}; }`);
	}

	const scrollbarSliderBackgroundColor = theme.getColor(listScrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(` .notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .scrollbar > .slider { background: ${scrollbarSliderBackgroundColor}; } `);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(listScrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(` .notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .scrollbar > .slider:hover { background: ${scrollbarSliderHoverBackgroundColor}; } `);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(listScrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(` .notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .scrollbar > .slider.active { background: ${scrollbarSliderActiveBackgroundColor}; } `);
	}

	const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
	if (toolbarHoverBackgroundColor) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .expandInputIcon:hover,
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .expandOutputIcon:hover,
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-expand-part-button:hover {
			background-color: ${toolbarHoverBackgroundColor};
		}
	`);
	}


	// case ChangeType.Modify: return theme.getColor(editorGutterModifiedBackground);
	// case ChangeType.Add: return theme.getColor(editorGutterAddedBackground);
	// case ChangeType.Delete: return theme.getColor(editorGutterDeletedBackground);
	// diff

	const modifiedBackground = theme.getColor(editorGutterModifiedBackground);
	if (modifiedBackground) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-cell-modified .cell-focus-indicator {
			background-color: ${modifiedBackground} !important;
		}

		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-cell-modified {
			background-color: ${modifiedBackground} !important;
		}`);
	}

	const addedBackground = theme.getColor(diffInserted);
	if (addedBackground) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-cell-added .cell-focus-indicator {
			background-color: ${addedBackground} !important;
		}

		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-cell-added {
			background-color: ${addedBackground} !important;
		}`);
	}
	const deletedBackground = theme.getColor(diffRemoved);
	if (deletedBackground) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-cell-deleted .cell-focus-indicator {
			background-color: ${deletedBackground} !important;
		}

		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-cell-deleted {
			background-color: ${deletedBackground} !important;
		}`);
	}

	const iconForegroundColor = theme.getColor(iconForeground);
	if (iconForegroundColor) {
		collector.addRule(`.monaco-workbench .notebookOverlay .codicon-debug-continue { color: ${iconForegroundColor} !important; }`);
	}
});
