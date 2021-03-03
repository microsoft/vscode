/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPixelRatio, getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { IAction, Separator } from 'vs/base/common/actions';
import { SequencerByKey } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { extname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import 'vs/css!./media/notebook';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import * as nls from 'vs/nls';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { contrastBorder, diffInserted, diffRemoved, editorBackground, errorForeground, focusBorder, foreground, listInactiveSelectionBackground, registerColor, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground, textPreformatForeground, transparent } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { EditorMemento } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorMemento } from 'vs/workbench/common/editor';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { debugIconStartForeground } from 'vs/workbench/contrib/debug/browser/debugColors';
import { BOTTOM_CELL_TOOLBAR_GAP, BOTTOM_CELL_TOOLBAR_HEIGHT, CELL_BOTTOM_MARGIN, CELL_MARGIN, CELL_OUTPUT_PADDING, CELL_RUN_GUTTER, CELL_TOP_MARGIN, CODE_CELL_LEFT_MARGIN, COLLAPSED_INDICATOR_HEIGHT, MARKDOWN_CELL_BOTTOM_MARGIN, MARKDOWN_CELL_TOP_MARGIN, SCROLLABLE_ELEMENT_PADDING_TOP } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellEditState, CellFocusMode, IActiveNotebookEditor, ICellOutputViewModel, ICellViewModel, ICommonCellInfo, IDisplayOutputLayoutUpdateRequest, IFocusNotebookCellOptions, IGenericCellViewModel, IInsetRenderOutput, INotebookCellList, INotebookCellOutputLayoutInfo, INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, INotebookEditorContributionDescription, INotebookEditorCreationOptions, INotebookEditorMouseEvent, NotebookEditorOptions, NotebookLayoutInfo, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_ID, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookDecorationCSSRules, NotebookRefCountedStyleSheet } from 'vs/workbench/contrib/notebook/browser/notebookEditorDecorations';
import { NotebookEditorExtensionsRegistry } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { IKernelManagerDelegate, NotebookEditorKernelManager } from 'vs/workbench/contrib/notebook/browser/notebookEditorKernelManager';
import { errorStateIcon, successStateIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { CellContextKeyManager } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellContextKeys';
import { CellDragAndDropController } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellDnd';
import { CodeCellRenderer, ListTopCellToolbar, MarkdownCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellRenderer';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookEventDispatcher, NotebookLayoutChangedEvent } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';
import { CellViewModel, IModelDecorationsChangeAccessor, INotebookEditorViewState, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, CellToolbarLocKey, ICellRange, INotebookKernel, SelectionStateType, ShowCellStatusBarKey } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { editorGutterModifiedBackground } from 'vs/workbench/contrib/scm/browser/dirtydiffDecorator';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

const $ = DOM.$;

export class NotebookEditorWidget extends Disposable implements INotebookEditor {
	private static readonly EDITOR_MEMENTOS = new Map<string, EditorMemento<unknown>>();
	private _overlayContainer!: HTMLElement;
	private _body!: HTMLElement;
	private _overflowContainer!: HTMLElement;
	private _webview: BackLayerWebView<ICommonCellInfo> | null = null;
	private _webviewResolvePromise: Promise<BackLayerWebView<ICommonCellInfo> | null> | null = null;
	private _webviewTransparentCover: HTMLElement | null = null;
	private _list!: INotebookCellList;
	private _dndController: CellDragAndDropController | null = null;
	private _listTopCellToolbar: ListTopCellToolbar | null = null;
	private _renderedEditors: Map<ICellViewModel, ICodeEditor | undefined> = new Map();
	private _eventDispatcher: NotebookEventDispatcher | undefined;
	private _notebookViewModel: NotebookViewModel | undefined;
	private _localStore: DisposableStore = this._register(new DisposableStore());
	private _fontInfo: BareFontInfo | undefined;
	private _dimension: DOM.Dimension | null = null;
	private _shadowElementViewInfo: { height: number, width: number, top: number; left: number; } | null = null;

	private readonly _editorFocus: IContextKey<boolean>;
	private readonly _outputFocus: IContextKey<boolean>;
	private readonly _editorEditable: IContextKey<boolean>;

	private _outputRenderer: OutputRenderer;
	protected readonly _contributions = new Map<string, INotebookEditorContribution>();
	private _scrollBeyondLastLine: boolean;
	private readonly _memento: Memento;
	private readonly _onDidFocusEmitter = this._register(new Emitter<void>());
	public readonly onDidFocus = this._onDidFocusEmitter.event;
	private readonly _insetModifyQueueByOutputId = new SequencerByKey<string>();
	private _kernelManger: NotebookEditorKernelManager;
	private _cellContextKeyManager: CellContextKeyManager | null = null;
	private _isVisible = false;
	private readonly _uuid = generateUuid();
	private _webiewFocused: boolean = false;

	private _isDisposed: boolean = false;

	get isDisposed() {
		return this._isDisposed;
	}

	private readonly _onDidChangeModel = this._register(new Emitter<NotebookTextModel | undefined>());
	readonly onDidChangeModel: Event<NotebookTextModel | undefined> = this._onDidChangeModel.event;

	private readonly _onDidFocusEditorWidget = this._register(new Emitter<void>());
	readonly onDidFocusEditorWidget = this._onDidFocusEditorWidget.event;

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

	get onDidChangeKernel(): Event<void> {
		return this._kernelManger.onDidChangeKernel;
	}
	get onDidChangeAvailableKernels(): Event<void> {
		return this._kernelManger.onDidChangeAvailableKernels;
	}

	get activeKernel() {
		return this._kernelManger.activeKernel;
	}

	set activeKernel(kernel: INotebookKernel | undefined) {
		this._kernelManger.activeKernel = kernel;
	}

	private _currentKernelTokenSource: CancellationTokenSource | undefined = undefined;

	get multipleKernelsAvailable() {
		return this._kernelManger.multipleKernelsAvailable;
	}

	set multipleKernelsAvailable(state: boolean) {
		this._kernelManger.multipleKernelsAvailable = state;
	}

	private readonly _onDidChangeActiveEditor = this._register(new Emitter<this>());
	readonly onDidChangeActiveEditor: Event<this> = this._onDidChangeActiveEditor.event;

	get activeCodeEditor(): IEditor | undefined {
		if (this._isDisposed) {
			return;
		}

		const [focused] = this._list.getFocusedElements();
		return this._renderedEditors.get(focused);
	}

	private readonly _onDidChangeActiveCell = this._register(new Emitter<void>());
	readonly onDidChangeActiveCell: Event<void> = this._onDidChangeActiveCell.event;
	private _cursorNavigationMode: boolean = false;
	get cursorNavigationMode(): boolean {
		return this._cursorNavigationMode;
	}

	set cursorNavigationMode(v: boolean) {
		this._cursorNavigationMode = v;
	}

	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	get onDidChangeSelection(): Event<void> { return this._onDidChangeSelection.event; }

	private readonly _onDidChangeVisibleRanges = this._register(new Emitter<void>());
	onDidChangeVisibleRanges: Event<void> = this._onDidChangeVisibleRanges.event;

	get visibleRanges() {
		return this._list.visibleRanges || [];
	}

	readonly isEmbedded: boolean;

	public readonly scopedContextKeyService: IContextKeyService;
	private readonly instantiationService: IInstantiationService;

	constructor(
		readonly creationOptions: INotebookEditorCreationOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@INotebookService private notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();
		this.isEmbedded = creationOptions.isEmbedded || false;

		this._overlayContainer = document.createElement('div');
		this.scopedContextKeyService = contextKeyService.createScoped(this._overlayContainer);
		this.instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

		const that = this;
		this._kernelManger = instantiationService.createInstance(NotebookEditorKernelManager, <IKernelManagerDelegate>{
			getId() { return that.getId(); },
			loadKernelPreloads: that._loadKernelPreloads.bind(that),
			get viewModel() { return that.viewModel; },
			getContributedNotebookProviders(resource?: URI) {
				return that.notebookService.getContributedNotebookProviders(resource);
			},
			getContributedNotebookProvider(viewType: string): NotebookProviderInfo | undefined {
				return that.notebookService.getContributedNotebookProvider(viewType);
			},
			getNotebookKernels(viewType: string, resource: URI, token: CancellationToken): Promise<INotebookKernel[]> {
				return that.notebookService.getNotebookKernels(viewType, resource, token);
			}
		});

		this._memento = new Memento(NOTEBOOK_EDITOR_ID, storageService);

		this._outputRenderer = new OutputRenderer(this, this.instantiationService);
		this._scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.scrollBeyondLastLine')) {
				this._scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');
				if (this._dimension && this._isVisible) {
					this.layout(this._dimension);
				}
			}

			if (e.affectsConfiguration(CellToolbarLocKey) || e.affectsConfiguration(ShowCellStatusBarKey)) {
				this._updateForNotebookConfiguration();
			}
		});

		this.notebookService.addNotebookEditor(this);

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

		let contributions: INotebookEditorContributionDescription[];
		if (Array.isArray(this.creationOptions.contributions)) {
			contributions = this.creationOptions.contributions;
		} else {
			contributions = NotebookEditorExtensionsRegistry.getEditorContributions();
		}
		for (const desc of contributions) {
			try {
				const contribution = this.instantiationService.createInstance(desc.ctor, this);
				this._contributions.set(desc.id, contribution);
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		this._updateForNotebookConfiguration();
	}

	/**
	 * EditorId
	 */
	public getId(): string {
		return this._uuid;
	}

	getSelections() {
		return this.viewModel?.getSelections() ?? [];
	}

	getSelection() {
		return this.viewModel?.getSelection();
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

	hasModel(): this is IActiveNotebookEditor {
		return !!this._notebookViewModel;
	}

	//#region Editor Core

	protected getEditorMemento<T>(editorGroupService: IEditorGroupsService, key: string, limit: number = 10): IEditorMemento<T> {
		const mementoKey = `${NOTEBOOK_EDITOR_ID}${key}`;

		let editorMemento = NotebookEditorWidget.EDITOR_MEMENTOS.get(mementoKey);
		if (!editorMemento) {
			editorMemento = new EditorMemento(NOTEBOOK_EDITOR_ID, key, this.getMemento(StorageScope.WORKSPACE), limit, editorGroupService);
			NotebookEditorWidget.EDITOR_MEMENTOS.set(mementoKey, editorMemento);
		}

		return editorMemento as IEditorMemento<T>;
	}

	protected getMemento(scope: StorageScope): MementoObject {
		return this._memento.getMemento(scope, StorageTarget.MACHINE);
	}

	private _updateForNotebookConfiguration() {
		if (!this._overlayContainer) {
			return;
		}

		const cellToolbarLocation = this.configurationService.getValue<string>(CellToolbarLocKey);
		this._overlayContainer.classList.remove('cell-title-toolbar-left');
		this._overlayContainer.classList.remove('cell-title-toolbar-right');
		this._overlayContainer.classList.remove('cell-title-toolbar-hidden');

		if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right' || cellToolbarLocation === 'hidden') {
			this._overlayContainer.classList.add(`cell-title-toolbar-${cellToolbarLocation}`);
		}

		const showCellStatusBar = this.configurationService.getValue<boolean>(ShowCellStatusBarKey);
		this._overlayContainer.classList.toggle('cell-statusbar-hidden', !showCellStatusBar);
	}

	private _generateFontInfo(): void {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._fontInfo = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel(), getPixelRatio());
	}

	private _createBody(parent: HTMLElement): void {
		this._body = document.createElement('div');
		this._body.classList.add('cell-list-container');
		this._createCellList();
		DOM.append(parent, this._body);

		this._overflowContainer = document.createElement('div');
		this._overflowContainer.classList.add('notebook-overflow-widget-container', 'monaco-editor');
		DOM.append(parent, this._overflowContainer);
	}

	private _createCellList(): void {
		this._body.classList.add('cell-list-container');

		this._dndController = this._register(new CellDragAndDropController(this, this._body));
		const getScopedContextKeyService = (container: HTMLElement) => this._list.contextKeyService.createScoped(container);
		const renderers = [
			this.instantiationService.createInstance(CodeCellRenderer, this, this._renderedEditors, this._dndController, getScopedContextKeyService),
			this.instantiationService.createInstance(MarkdownCellRenderer, this, this._dndController, this._renderedEditors, getScopedContextKeyService),
		];

		this._list = this.instantiationService.createInstance(
			NotebookCellList,
			'NotebookCellList',
			this._overlayContainer,
			this._body,
			this.instantiationService.createInstance(NotebookCellListDelegate),
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
				enableKeyboardNavigation: true,
				additionalScrollHeight: 0,
				transformOptimization: false, //(isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
				styleController: (_suffix: string) => { return this._list; },
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
						return nls.localize('notebookTreeAriaLabel', "Notebook");
					}
				},
				focusNextPreviousDelegate: {
					onFocusNext: (applyFocusNext: () => void) => this._updateForCursorNavigationMode(applyFocusNext),
					onFocusPrevious: (applyFocusPrevious: () => void) => this._updateForCursorNavigationMode(applyFocusPrevious),
				}
			},
		);
		this._dndController.setList(this._list);

		// create Webview

		this._register(this._list);
		this._register(combinedDisposable(...renderers));

		// top cell toolbar
		this._listTopCellToolbar = this._register(this.instantiationService.createInstance(ListTopCellToolbar, this, this._list.rowsContainer));

		// transparent cover
		this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $('.webview-cover'));
		this._webviewTransparentCover.style.display = 'none';

		this._register(DOM.addStandardDisposableGenericMouseDownListner(this._overlayContainer, (e: StandardMouseEvent) => {
			if (e.target.classList.contains('slider') && this._webviewTransparentCover) {
				this._webviewTransparentCover.style.display = 'block';
			}
		}));

		this._register(DOM.addStandardDisposableGenericMouseUpListner(this._overlayContainer, () => {
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
			this._cursorNavigationMode = false;
		}));

		this._register(this._list.onContextMenu(e => {
			this.showListContextMenu(e);
		}));

		this._register(this._list.onDidChangeVisibleRanges(() => {
			this._onDidChangeVisibleRanges.fire();
		}));

		const widgetFocusTracker = DOM.trackFocus(this.getDomNode());
		this._register(widgetFocusTracker);
		this._register(widgetFocusTracker.onDidFocus(() => this._onDidFocusEmitter.fire()));
	}

	private showListContextMenu(e: IListContextMenuEvent<CellViewModel>) {
		this.contextMenuService.showContextMenu({
			getActions: () => {
				const result: IAction[] = [];
				const menu = this.menuService.createMenu(MenuId.NotebookCellTitle, this.scopedContextKeyService);
				const groups = menu.getActions();
				menu.dispose();

				for (let group of groups) {
					const [, actions] = group;
					result.push(...actions);
					result.push(new Separator());
				}

				result.pop(); // remove last separator
				return result;
			},
			getAnchor: () => e.anchor
		});
	}

	private _updateForCursorNavigationMode(applyFocusChange: () => void): void {
		if (this._cursorNavigationMode) {
			// Will fire onDidChangeFocus, resetting the state to Container
			applyFocusChange();

			const newFocusedCell = this._list.getFocusedElements()[0];
			if (newFocusedCell.cellKind === CellKind.Code || newFocusedCell.editState === CellEditState.Editing) {
				this.focusNotebookCell(newFocusedCell, 'editor');
			} else {
				// Reset to "Editor", the state has not been consumed
				this._cursorNavigationMode = true;
			}
		} else {
			applyFocusChange();
		}
	}

	getDomNode() {
		return this._overlayContainer;
	}

	getOverflowContainerDomNode() {
		return this._overflowContainer;
	}

	getInnerWebview(): Webview | undefined {
		return this._webview?.webview;
	}

	setParentContextKeyService(parentContextKeyService: IContextKeyService): void {
		this.scopedContextKeyService.updateParent(parentContextKeyService);
	}

	async setModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined): Promise<void> {
		if (this.viewModel === undefined || !this.viewModel.equal(textModel)) {
			this._detachModel();
			await this._attachModel(textModel, viewState);

			type WorkbenchNotebookOpenClassification = {
				scheme: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
				ext: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
				viewType: { classification: 'SystemMetaData', purpose: 'FeatureInsight'; };
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

		// clear state
		this._dndController?.clearGlobalDragState();

		this._currentKernelTokenSource = new CancellationTokenSource();
		this._localStore.add(this._currentKernelTokenSource);
		// we don't await for it, otherwise it will slow down the file opening
		this._setKernels(this._currentKernelTokenSource);

		this._localStore.add(this.notebookService.onDidChangeKernels(async (e) => {
			if (e && e.toString() !== this.textModel?.uri.toString()) {
				// kernel update is not for current document.
				return;
			}
			this._currentKernelTokenSource?.cancel();
			this._currentKernelTokenSource = new CancellationTokenSource();
			await this._setKernels(this._currentKernelTokenSource);
		}));

		this._localStore.add(this._list.onDidChangeFocus(() => {
			const focused = this._list.getFocusedElements()[0];
			if (focused) {
				if (!this._cellContextKeyManager) {
					this._cellContextKeyManager = this._localStore.add(new CellContextKeyManager(this.scopedContextKeyService, this, textModel, focused as CellViewModel));
				}

				this._cellContextKeyManager.updateForElement(focused as CellViewModel);
			}
		}));
	}

	async setOptions(options: NotebookEditorOptions | undefined) {
		// reveal cell if editor options tell to do so
		if (options?.cellOptions && this.viewModel) {
			const cellOptions = options.cellOptions;
			const cell = this.viewModel.viewCells.find(cell => cell.uri.toString() === cellOptions.resource.toString());
			if (cell) {
				this.focusElement(cell);
				await this.revealInCenterIfOutsideViewportAsync(cell);
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
		// todo@rebornix support selections not just focus
		// todo@rebornix support multipe selections
		if (options?.cellSelections && this.viewModel) {
			const focusedCell = this.viewModel.viewCells[options.cellSelections[0].start];
			this.revealInCenterIfOutsideViewport(focusedCell);
			this.focusElement(focusedCell);
		}
	}

	private _detachModel() {
		this._localStore.clear();
		this._list.detachViewModel();
		this.viewModel?.dispose();
		// avoid event
		this.viewModel = undefined;
		this._webview?.dispose();
		this._webview?.element.remove();
		this._webview = null;
		this._list.clear();
	}

	async beginComputeContributedKernels() {
		return this._kernelManger.beginComputeContributedKernels();
	}

	private async _setKernels(tokenSource: CancellationTokenSource) {
		if (!this.viewModel) {
			return;
		}

		this._kernelManger.setKernels(tokenSource);
	}

	private async _loadKernelPreloads(extensionLocation: URI, kernel: INotebookKernel) {
		if (kernel.preloads && kernel.preloads.length) {
			await this._resolveWebview();
			this._webview?.updateKernelPreloads([extensionLocation], kernel.preloads.map(preload => URI.revive(preload)));
		}
	}

	private _updateForMetadata(): void {
		if (!this.viewModel) {
			return;
		}

		const notebookMetadata = this.viewModel.metadata;
		this._editorEditable.set(!!notebookMetadata?.editable);
		this._overflowContainer.classList.toggle('notebook-editor-editable', !!notebookMetadata?.editable);
		this.getDomNode().classList.toggle('notebook-editor-editable', !!notebookMetadata?.editable);

		this._kernelManger.updateForMetadata();
	}

	private async _resolveWebview(): Promise<BackLayerWebView<ICommonCellInfo> | null> {
		if (!this.textModel) {
			return null;
		}

		if (this._webviewResolvePromise) {
			return this._webviewResolvePromise;
		}

		if (!this._webview) {
			this._webview = this.instantiationService.createInstance(BackLayerWebView, this, this.getId(), this.textModel!.uri, { outputNodePadding: CELL_OUTPUT_PADDING, outputNodeLeftPadding: CELL_OUTPUT_PADDING });
			this._webview.element.style.width = `calc(100% - ${CODE_CELL_LEFT_MARGIN + (CELL_MARGIN * 2) + CELL_RUN_GUTTER}px)`;
			this._webview.element.style.margin = `0px 0 0px ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px`;

			// attach the webview container to the DOM tree first
			this._list.rowsContainer.insertAdjacentElement('afterbegin', this._webview.element);
		}

		this._webviewResolvePromise = new Promise(async resolve => {
			if (!this._webview) {
				throw new Error('Notebook output webview object is not created successfully.');
			}

			await this._webview.createWebview();
			if (!this._webview.webview) {
				throw new Error('Notebook output webview elemented is not created successfully.');
			}

			this._webview.webview.onDidBlur(() => {
				this._outputFocus.set(false);
				this.updateEditorFocus();

				if (this._overlayContainer.contains(document.activeElement)) {
					this._webiewFocused = false;
				}
			});
			this._webview.webview.onDidFocus(() => {
				this._outputFocus.set(true);
				this.updateEditorFocus();
				this._onDidFocusEmitter.fire();

				if (this._overlayContainer.contains(document.activeElement)) {
					this._webiewFocused = true;
				}
			});

			this._localStore.add(this._webview.onMessage(({ message, forRenderer }) => {
				if (this.viewModel) {
					this.notebookService.onDidReceiveMessage(this.viewModel.viewType, this.getId(), forRenderer, message);
				}
			}));

			resolve(this._webview);
		});

		return this._webviewResolvePromise;
	}

	private async _createWebview(id: string, resource: URI): Promise<void> {
		this._webview = this.instantiationService.createInstance(BackLayerWebView, this, id, resource, { outputNodePadding: CELL_OUTPUT_PADDING, outputNodeLeftPadding: CELL_OUTPUT_PADDING });
		this._webview.element.style.width = `calc(100% - ${CODE_CELL_LEFT_MARGIN + (CELL_MARGIN * 2) + CELL_RUN_GUTTER}px)`;
		this._webview.element.style.margin = `0px 0 0px ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px`;
		// attach the webview container to the DOM tree first
		this._list.rowsContainer.insertAdjacentElement('afterbegin', this._webview.element);
	}

	private async _attachModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined) {
		await this._createWebview(this.getId(), textModel.uri);

		this._eventDispatcher = new NotebookEventDispatcher();
		this.viewModel = this.instantiationService.createInstance(NotebookViewModel, textModel.viewType, textModel, this._eventDispatcher, this.getLayoutInfo());
		this._eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);

		this._updateForMetadata();
		this._localStore.add(this._eventDispatcher.onDidChangeMetadata(() => {
			this._updateForMetadata();
		}));

		const useRenderer = this.configurationService.getValue<string>('notebook.experimental.useMarkdownRenderer');

		if (useRenderer) {
			await this._resolveWebview();

			await this._webview!.initializeMarkdown(this.viewModel.viewCells
				.filter(cell => cell.cellKind === CellKind.Markdown)
				.map(cell => ({ cellId: cell.id, content: cell.getText() }))
				// TODO: look at cell position cache instead of just getting first five cells
				.slice(0, 5));
		}


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

		this._localStore.add(this.viewModel.onDidChangeSelection(() => {
			this._onDidChangeSelection.fire();
		}));

		this._localStore.add(this._list.onWillScroll(e => {
			if (this._webview?.isResolved()) {
				this._webview.updateViewScrollTop(-e.scrollTop, true, []);
				this._webviewTransparentCover!.style.top = `${e.scrollTop}px`;
			}
		}));

		this._localStore.add(this._list.onDidChangeContentHeight(() => {
			DOM.scheduleAtNextAnimationFrame(() => {
				if (this._isDisposed) {
					return;
				}

				const scrollTop = this._list.scrollTop;
				const scrollHeight = this._list.scrollHeight;

				if (!this._webview?.isResolved()) {
					return;
				}

				this._webview!.element.style.height = `${scrollHeight}px`;

				if (this._webview?.insetMapping) {
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
						if (this._webview!.shouldUpdateInset(cell, key, cellTop)) {
							const outputIndex = cell.outputsViewModels.indexOf(key);

							const outputOffset = cellTop + cell.getOutputOffset(outputIndex);

							updateItems.push({
								output: key,
								cellTop: cellTop,
								outputOffset
							});
						}
					});

					removedItems.forEach(output => this._webview?.removeInset(output));

					if (updateItems.length) {
						this._webview?.updateViewScrollTop(-scrollTop, false, updateItems);
					}
				}

				if (this._webview?.markdownPreviewMapping) {
					const updateItems: { id: string, top: number }[] = [];
					this._webview!.markdownPreviewMapping.forEach(cellId => {
						const cell = this.viewModel?.viewCells.find(cell => cell.id === cellId);
						if (cell) {
							const cellTop = this._list.getAbsoluteTopOfElement(cell);
							updateItems.push({ id: cellId, top: cellTop });
						}
					});
					this._webview?.updateMarkdownScrollTop(updateItems);
				}
			});
		}));

		this._localStore.add(this._list.onDidRemoveOutput(output => {
			this.removeInset(output);
		}));
		this._localStore.add(this._list.onDidHideOutput(output => {
			this.hideInset(output);
		}));
		this._localStore.add(this._list.onDidRemoveCellFromView(cell => {
			if (cell.cellKind === CellKind.Markdown) {
				this.removeMarkdownPreview(cell as MarkdownCellViewModel);
			}
		}));

		this._list.attachViewModel(this.viewModel);

		if (this._dimension) {
			this._list.layout(this._dimension.height - SCROLLABLE_ELEMENT_PADDING_TOP, this._dimension.width);
		} else {
			this._list.layout();
		}

		this._dndController?.clearGlobalDragState();

		// restore list state at last, it must be after list layout
		this.restoreListViewState(viewState);
	}

	restoreListViewState(viewState: INotebookEditorViewState | undefined): void {
		if (viewState?.scrollPosition !== undefined) {
			this._list.scrollTop = viewState!.scrollPosition.top;
			this._list.scrollLeft = viewState!.scrollPosition.left;
		} else {
			this._list.scrollTop = 0;
			this._list.scrollLeft = 0;
		}

		const focusIdx = typeof viewState?.focus === 'number' ? viewState.focus : 0;
		if (focusIdx < this._list.length) {
			const element = this._list.element(focusIdx);
			if (element) {
				this.viewModel?.updateSelectionsState({
					kind: SelectionStateType.Handle,
					primary: element.handle,
					selections: [element.handle]
				});
			}
		} else if (this._list.length > 0) {
			this.viewModel?.updateSelectionsState({
				kind: SelectionStateType.Index,
				selections: [{ start: 0, end: 1 }]
			});
		}

		if (viewState?.editorFocused) {
			const cell = this.viewModel?.viewCells[focusIdx];
			if (cell) {
				cell.focusMode = CellFocusMode.Editor;
			}
		}
	}

	getEditorViewState(): INotebookEditorViewState {
		const state = this.viewModel?.getEditorViewState();
		if (!state) {
			return {
				editingCells: {},
				editorViewStates: {}
			};
		}

		if (this._list) {
			state.scrollPosition = { left: this._list.scrollLeft, top: this._list.scrollTop };
			const cellHeights: { [key: number]: number } = {};
			for (let i = 0; i < this.viewModel!.length; i++) {
				const elm = this.viewModel!.viewCells[i] as CellViewModel;
				if (elm.cellKind === CellKind.Code) {
					cellHeights[i] = elm.layoutInfo.totalHeight;
				} else {
					cellHeights[i] = elm.layoutInfo.totalHeight;
				}
			}

			state.cellTotalHeights = cellHeights;

			const focus = this._list.getFocus()[0];
			if (typeof focus === 'number' && this.viewModel) {
				const element = this.viewModel.viewCells[focus];
				if (element) {
					const itemDOM = this._list.domElementOfElement(element);
					const editorFocused = element.editState === CellEditState.Editing && !!(document.activeElement && itemDOM && itemDOM.contains(document.activeElement));

					state.editorFocused = editorFocused;
					state.focus = focus;
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
		return state;
	}

	layout(dimension: DOM.Dimension, shadowElement?: HTMLElement): void {
		if (!shadowElement && this._shadowElementViewInfo === null) {
			this._dimension = dimension;
			return;
		}

		if (shadowElement) {
			const containerRect = shadowElement.getBoundingClientRect();

			this._shadowElementViewInfo = {
				height: containerRect.height,
				width: containerRect.width,
				top: containerRect.top,
				left: containerRect.left
			};
		}

		this._dimension = new DOM.Dimension(dimension.width, dimension.height);
		DOM.size(this._body, dimension.width, dimension.height);
		this._list.updateOptions({ additionalScrollHeight: this._scrollBeyondLastLine ? dimension.height - SCROLLABLE_ELEMENT_PADDING_TOP : 0 });
		this._list.layout(dimension.height - SCROLLABLE_ELEMENT_PADDING_TOP, dimension.width);

		this._overlayContainer.style.visibility = 'visible';
		this._overlayContainer.style.display = 'block';
		this._overlayContainer.style.position = 'absolute';

		const containerRect = this._overlayContainer.parentElement?.getBoundingClientRect();
		this._overlayContainer.style.top = `${this._shadowElementViewInfo!.top - (containerRect?.top || 0)}px`;
		this._overlayContainer.style.left = `${this._shadowElementViewInfo!.left - (containerRect?.left || 0)}px`;
		this._overlayContainer.style.width = `${dimension ? dimension.width : this._shadowElementViewInfo!.width}px`;
		this._overlayContainer.style.height = `${dimension ? dimension.height : this._shadowElementViewInfo!.height}px`;

		if (this._webviewTransparentCover) {
			this._webviewTransparentCover.style.height = `${dimension.height}px`;
			this._webviewTransparentCover.style.width = `${dimension.width}px`;
		}

		this._eventDispatcher?.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
	}
	//#endregion

	//#region Focus tracker
	focus() {
		this._isVisible = true;
		this._editorFocus.set(true);

		if (this._webiewFocused) {
			this._webview?.focusWebview();
		} else {
			const focus = this._list.getFocus()[0];
			if (typeof focus === 'number' && this.viewModel) {
				const element = this.viewModel.viewCells[focus];

				if (element.focusMode === CellFocusMode.Editor) {
					element.editState = CellEditState.Editing;
					element.focusMode = CellFocusMode.Editor;
					this._onDidFocusEditorWidget.fire();
					return;
				}

			}
			this._list.domFocus();
		}

		this._onDidFocusEditorWidget.fire();
	}

	onWillHide() {
		this._isVisible = false;
		this._editorFocus.set(false);
		this._overlayContainer.style.visibility = 'hidden';
		this._overlayContainer.style.left = '-50000px';
	}

	updateEditorFocus() {
		// Note - focus going to the webview will fire 'blur', but the webview element will be
		// a descendent of the notebook editor root.
		const focused = DOM.isAncestor(document.activeElement, this._overlayContainer);
		this._editorFocus.set(focused);
		this.viewModel?.setFocus(focused);
	}

	hasFocus() {
		return this._editorFocus.get() || false;
	}

	hasWebviewFocus() {
		return this._webiewFocused;
	}

	hasOutputTextSelection() {
		if (!this.hasFocus()) {
			return false;
		}

		const windowSelection = window.getSelection();
		if (windowSelection?.rangeCount !== 1) {
			return false;
		}

		const activeSelection = windowSelection.getRangeAt(0);
		if (activeSelection.endOffset - activeSelection.startOffset === 0) {
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

	revealCellRangeInView(range: ICellRange) {
		return this._list.revealElementsInView(range);
	}

	revealInView(cell: ICellViewModel) {
		this._list.revealElementInView(cell);
	}

	revealInViewAtTop(cell: ICellViewModel) {
		this._list.revealElementInViewAtTop(cell);
	}

	revealInCenterIfOutsideViewport(cell: ICellViewModel) {
		this._list.revealElementInCenterIfOutsideViewport(cell);
	}

	async revealInCenterIfOutsideViewportAsync(cell: ICellViewModel) {
		return this._list.revealElementInCenterIfOutsideViewportAsync(cell);
	}

	revealInCenter(cell: ICellViewModel) {
		this._list.revealElementInCenter(cell);
	}

	async revealLineInViewAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._list.revealElementLineInViewAsync(cell, line);
	}

	async revealLineInCenterAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._list.revealElementLineInCenterAsync(cell, line);
	}

	async revealLineInCenterIfOutsideViewportAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this._list.revealElementLineInCenterIfOutsideViewportAsync(cell, line);
	}

	async revealRangeInViewAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._list.revealElementRangeInViewAsync(cell, range);
	}

	async revealRangeInCenterAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._list.revealElementRangeInCenterAsync(cell, range);
	}

	async revealRangeInCenterIfOutsideViewportAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this._list.revealElementRangeInCenterIfOutsideViewportAsync(cell, range);
	}

	setCellEditorSelection(cell: ICellViewModel, range: Range): void {
		this._list.setCellSelection(cell, range);
	}

	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null {
		return this.viewModel?.changeModelDecorations<T>(callback) || null;
	}

	setHiddenAreas(_ranges: ICellRange[]): boolean {
		return this._list.setHiddenAreas(_ranges, true);
	}

	//#endregion

	//#region Decorations
	private _editorStyleSheets = new Map<string, NotebookRefCountedStyleSheet>();
	private _decorationRules = new Map<string, NotebookDecorationCSSRules>();
	private _decortionKeyToIds = new Map<string, string[]>();

	private _registerDecorationType(key: string) {
		const options = this.notebookService.resolveEditorDecorationOptions(key);

		if (options) {
			const styleElement = DOM.createStyleSheet(this._body);
			const styleSheet = new NotebookRefCountedStyleSheet({
				removeEditorStyleSheets: (key) => {
					this._editorStyleSheets.delete(key);
				}
			}, key, styleElement);
			this._editorStyleSheets.set(key, styleSheet);
			this._decorationRules.set(key, new NotebookDecorationCSSRules(this.themeService, styleSheet, {
				key,
				options,
				styleSheet
			}));
		}
	}

	setEditorDecorations(key: string, range: ICellRange): void {
		if (!this.viewModel) {
			return;
		}

		// create css style for the decoration
		if (!this._editorStyleSheets.has(key)) {
			this._registerDecorationType(key);
		}

		const decorationRule = this._decorationRules.get(key);
		if (!decorationRule) {
			return;
		}

		const existingDecorations = this._decortionKeyToIds.get(key) || [];
		const newDecorations = this.viewModel.viewCells.slice(range.start, range.end).map(cell => ({
			handle: cell.handle,
			options: { className: decorationRule.className, outputClassName: decorationRule.className, topClassName: decorationRule.topClassName }
		}));

		this._decortionKeyToIds.set(key, this.deltaCellDecorations(existingDecorations, newDecorations));
	}

	removeEditorDecorations(key: string): void {
		if (this._decorationRules.has(key)) {
			this._decorationRules.get(key)?.dispose();
		}

		const cellDecorations = this._decortionKeyToIds.get(key);
		this.deltaCellDecorations(cellDecorations || [], []);
	}


	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[] {
		return this.viewModel?.deltaCellDecorations(oldDecorations, newDecorations) || [];
	}

	deltaCellOutputContainerClassNames(cellId: string, added: string[], removed: string[]) {
		this._webview?.deltaCellOutputContainerClassNames(cellId, added, removed);
	}

	//#endregion

	//#region Mouse Events
	private readonly _onMouseUp: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseUp: Event<INotebookEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseDown: Event<INotebookEditorMouseEvent> = this._onMouseDown.event;

	//#endregion

	//#region Kernel/Execution
	async cancelNotebookExecution(): Promise<void> {
		return this._kernelManger.cancelNotebookExecution();
	}

	async executeNotebook(): Promise<void> {
		return this._kernelManger.executeNotebook();
	}

	async cancelNotebookCellExecution(cell: ICellViewModel): Promise<void> {
		return this._kernelManger.cancelNotebookCellExecution(cell);
	}

	async executeNotebookCell(cell: ICellViewModel): Promise<void> {
		if (!this.viewModel) {
			return;
		}

		// TODO@roblourens, don't use the "execute" command for this
		if (cell.cellKind === CellKind.Markdown) {
			this.focusNotebookCell(cell, 'container');
			return;
		}

		return this._kernelManger.executeNotebookCell(cell);
	}

	//#endregion

	//#region Cell operations/layout API
	private _pendingLayouts = new WeakMap<ICellViewModel, IDisposable>();
	async layoutNotebookCell(cell: ICellViewModel, height: number): Promise<void> {
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

		if (this._pendingLayouts.has(cell)) {
			this._pendingLayouts.get(cell)!.dispose();
		}

		let r: () => void;
		const layoutDisposable = DOM.scheduleAtNextAnimationFrame(() => {
			if (this._isDisposed) {
				return;
			}

			this._pendingLayouts.delete(cell);

			relayout(cell, height);
			r();
		});

		this._pendingLayouts.set(cell, toDisposable(() => {
			layoutDisposable.dispose();
			r();
		}));

		return new Promise(resolve => { r = resolve; });
	}

	private _nearestCodeCellIndex(index: number /* exclusive */, direction: 'above' | 'below') {
		if (!this.viewModel) {
			return -1;
		}

		const nearest = this.viewModel.viewCells.slice(0, index).reverse().findIndex(cell => cell.cellKind === CellKind.Code);
		if (nearest > -1) {
			return index - nearest - 1;
		} else {
			const nearestCellTheOtherDirection = this.viewModel.viewCells.slice(index + 1).findIndex(cell => cell.cellKind === CellKind.Code);
			if (nearestCellTheOtherDirection > -1) {
				return index + nearestCellTheOtherDirection;
			}
			return -1;
		}
	}

	insertNotebookCell(cell: ICellViewModel | undefined, type: CellKind, direction: 'above' | 'below' = 'above', initialText: string = '', ui: boolean = false): CellViewModel | null {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		const index = cell ? this.viewModel.getCellIndex(cell) : 0;
		const nextIndex = ui ? this.viewModel.getNextVisibleCellIndex(index) : index + 1;
		let language;
		if (type === CellKind.Code) {
			const supportedLanguages = this._kernelManger.activeKernel?.supportedLanguages ?? this.modeService.getRegisteredModes();
			const defaultLanguage = supportedLanguages[0] || 'plaintext';
			if (cell?.cellKind === CellKind.Code) {
				language = cell.language;
			} else if (cell?.cellKind === CellKind.Markdown) {
				const nearestCodeCellIndex = this._nearestCodeCellIndex(index, direction);
				if (nearestCodeCellIndex > -1) {
					language = this.viewModel.viewCells[nearestCodeCellIndex].language;
				} else {
					language = defaultLanguage;
				}
			} else {
				if (cell === undefined && direction === 'above') {
					// insert cell at the very top
					language = this.viewModel.viewCells.find(cell => cell.cellKind === CellKind.Code)?.language || defaultLanguage;
				} else {
					language = defaultLanguage;
				}
			}

			if (!supportedLanguages.includes(language)) {
				// the language no longer exists
				language = defaultLanguage;
			}
		} else {
			language = 'markdown';
		}

		const insertIndex = cell ?
			(direction === 'above' ? index : nextIndex) :
			index;
		const focused = this._list.getFocusedElements();
		const selections = this._list.getSelectedElements();
		return this.viewModel.createCell(insertIndex, initialText, language, type, undefined, [], true, undefined, focused[0]?.handle ?? null, selections);
	}

	async splitNotebookCell(cell: ICellViewModel): Promise<CellViewModel[] | null> {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		const index = this.viewModel.getCellIndex(cell);

		return this.viewModel.splitNotebookCell(index);
	}

	async joinNotebookCells(cell: ICellViewModel, direction: 'above' | 'below', constraint?: CellKind): Promise<ICellViewModel | null> {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		const index = this.viewModel.getCellIndex(cell);
		const ret = await this.viewModel.joinNotebookCells(index, direction, constraint);

		if (ret) {
			ret.deletedCells.forEach(cell => {
				if (this._pendingLayouts.has(cell)) {
					this._pendingLayouts.get(cell)!.dispose();
				}
			});

			return ret.cell;
		} else {
			return null;
		}
	}

	async deleteNotebookCell(cell: ICellViewModel): Promise<boolean> {
		if (!this.viewModel) {
			return false;
		}

		if (!this.viewModel.metadata.editable) {
			return false;
		}

		if (this._pendingLayouts.has(cell)) {
			this._pendingLayouts.get(cell)!.dispose();
		}

		const index = this.viewModel.getCellIndex(cell);
		this.viewModel.deleteCell(index, true);
		return true;
	}

	async moveCellDown(cell: ICellViewModel): Promise<ICellViewModel | null> {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		const index = this.viewModel.getCellIndex(cell);
		if (index === this.viewModel.length - 1) {
			return null;
		}

		const newIdx = index + 2; // This is the adjustment for the index before the cell has been "removed" from its original index
		return this._moveCellToIndex(index, 1, newIdx);
	}

	async moveCellUp(cell: ICellViewModel): Promise<ICellViewModel | null> {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		const index = this.viewModel.getCellIndex(cell);
		if (index === 0) {
			return null;
		}

		const newIdx = index - 1;
		return this._moveCellToIndex(index, 1, newIdx);
	}

	async moveCellsToIdx(index: number, length: number, toIdx: number): Promise<ICellViewModel | null> {
		if (!this.viewModel) {
			return null;
		}

		if (!this.viewModel.metadata.editable) {
			return null;
		}

		return this._moveCellToIndex(index, length, toIdx);
	}

	/**
	 * @param index The current index of the cell
	 * @param desiredIndex The desired index, in an index scheme for the state of the tree before the current cell has been "removed".
	 * @example to move the cell from index 0 down one spot, call with (0, 2)
	 */
	private async _moveCellToIndex(index: number, length: number, desiredIndex: number): Promise<ICellViewModel | null> {
		if (!this.viewModel) {
			return null;
		}

		if (index < desiredIndex) {
			// The cell is moving "down", it will free up one index spot and consume a new one
			desiredIndex -= length;
		}

		if (index === desiredIndex) {
			return null;
		}

		if (!this.viewModel.moveCellToIdx(index, length, desiredIndex, true)) {
			throw new Error('Notebook Editor move cell, index out of range');
		}

		let r: (val: ICellViewModel | null) => void;
		DOM.scheduleAtNextAnimationFrame(() => {
			if (this._isDisposed) {
				r(null);
				return;
			}

			if (!this.viewModel) {
				r(null);
				return;
			}

			const viewCell = this.viewModel.viewCells[desiredIndex];
			this._list.revealElementInView(viewCell);
			r(viewCell);
		});

		return new Promise(resolve => { r = resolve; });
	}

	getActiveCell() {
		const elements = this._list.getFocusedElements();

		if (elements && elements.length) {
			return elements[0];
		}

		return undefined;
	}

	focusNotebookCell(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions) {
		if (this._isDisposed) {
			return;
		}

		if (focusItem === 'editor') {
			this.focusElement(cell);
			this._list.focusView();

			cell.editState = CellEditState.Editing;
			cell.focusMode = CellFocusMode.Editor;
			if (!options?.skipReveal) {
				this.revealInCenterIfOutsideViewport(cell);
			}
		} else if (focusItem === 'output') {
			this.focusElement(cell);
			this._list.focusView();

			if (!this._webview) {
				return;
			}
			this._webview.focusOutput(cell.id);

			cell.editState = CellEditState.Preview;
			cell.focusMode = CellFocusMode.Container;
			if (!options?.skipReveal) {
				this.revealInCenterIfOutsideViewport(cell);
			}
		} else {
			const itemDOM = this._list.domElementOfElement(cell);
			if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
				(document.activeElement as HTMLElement).blur();
			}

			cell.editState = CellEditState.Preview;
			cell.focusMode = CellFocusMode.Container;

			this.focusElement(cell);
			if (!options?.skipReveal) {
				this.revealInCenterIfOutsideViewport(cell);
			}
			this._list.focusView();
		}
	}

	focusNextNotebookCell(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output') {
		const idx = this.viewModel?.getCellIndex(cell);
		if (typeof idx !== 'number') {
			return;
		}

		const newCell = this.viewModel?.viewCells[idx + 1];
		if (!newCell) {
			return;
		}

		this.focusNotebookCell(newCell, focusItem);
	}

	//#endregion

	//#region MISC

	getLayoutInfo(): NotebookLayoutInfo {
		if (!this._list) {
			throw new Error('Editor is not initalized successfully');
		}

		return {
			width: this._dimension!.width,
			height: this._dimension!.height,
			fontInfo: this._fontInfo!
		};
	}

	getCellOutputLayoutInfo(cell: IGenericCellViewModel): INotebookCellOutputLayoutInfo {
		if (!this._list) {
			throw new Error('Editor is not initalized successfully');
		}

		return {
			width: this._dimension!.width,
			height: this._dimension!.height,
			fontInfo: this._fontInfo!
		};
	}

	triggerScroll(event: IMouseWheelEvent) {
		this._list.triggerScrollFromMouseWheelEvent(event);
	}

	async createMarkdownPreview(cell: MarkdownCellViewModel) {
		if (!this._webview) {
			return;
		}

		await this._resolveWebview();

		if (!this._webview) {
			return;
		}

		const cellTop = this._list.getAbsoluteTopOfElement(cell);
		if (this._webview.markdownPreviewMapping.has(cell.id)) {
			await this._webview.showMarkdownPreview(cell.id, cell.getText(), cellTop);
		} else {
			await this._webview.createMarkdownPreview(cell.id, cell.getText(), cellTop);
		}
	}

	async unhideMarkdownPreview(cell: MarkdownCellViewModel) {
		if (!this._webview) {
			return;
		}

		await this._resolveWebview();

		await this._webview?.unhideMarkdownPreview(cell.id);
	}

	async hideMarkdownPreview(cell: MarkdownCellViewModel) {
		if (!this._webview) {
			return;
		}

		await this._resolveWebview();

		await this._webview?.hideMarkdownPreview(cell.id);
	}

	async removeMarkdownPreview(cell: MarkdownCellViewModel) {
		if (!this._webview) {
			return;
		}

		await this._resolveWebview();

		await this._webview?.removeMarkdownPreview(cell.id);
	}

	async createInset(cell: CodeCellViewModel, output: IInsetRenderOutput, offset: number): Promise<void> {
		this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
			if (!this._webview) {
				return;
			}

			await this._resolveWebview();

			if (!this._webview!.insetMapping.has(output.source)) {
				const cellTop = this._list.getAbsoluteTopOfElement(cell);
				await this._webview!.createInset({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
			} else {
				const cellTop = this._list.getAbsoluteTopOfElement(cell);
				const scrollTop = this._list.scrollTop;
				const outputIndex = cell.outputsViewModels.indexOf(output.source);
				const outputOffset = cellTop + cell.getOutputOffset(outputIndex);

				this._webview!.updateViewScrollTop(-scrollTop, true, [{ output: output.source, cellTop, outputOffset }]);
			}
		});
	}

	removeInset(output: ICellOutputViewModel) {
		this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
			if (this._webview?.isResolved()) {
				this._webview.removeInset(output);
			}
		});
	}

	hideInset(output: ICellOutputViewModel) {
		if (this._webview?.isResolved()) {
			this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
				this._webview!.hideInset(output);
			});
		}
	}

	getOutputRenderer(): OutputRenderer {
		return this._outputRenderer;
	}

	postMessage(forRendererId: string | undefined, message: any) {
		if (this._webview?.isResolved()) {
			if (forRendererId === undefined) {
				this._webview.webview.postMessage(message);
			} else {
				this._webview.postRendererMessage(forRendererId, message);
			}
		}
	}

	addClassName(className: string) {
		this._overlayContainer.classList.add(className);
	}

	removeClassName(className: string) {
		this._overlayContainer.classList.remove(className);
	}

	getCellByInfo(cellInfo: ICommonCellInfo): ICellViewModel {
		const { cellHandle } = cellInfo;
		return this.viewModel?.viewCells.find(vc => vc.handle === cellHandle) as CodeCellViewModel;
	}

	getCellById(cellId: string): ICellViewModel | undefined {
		return this.viewModel?.viewCells.find(vc => vc.id === cellId);
	}

	updateOutputHeight(cellInfo: ICommonCellInfo, output: ICellOutputViewModel, outputHeight: number, isInit: boolean): void {
		const cell = this.viewModel?.viewCells.find(vc => vc.handle === cellInfo.cellHandle);
		if (cell && cell instanceof CodeCellViewModel) {
			const outputIndex = cell.outputsViewModels.indexOf(output);
			cell.updateOutputHeight(outputIndex, outputHeight);
			this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);
		}
	}

	updateMarkdownCellHeight(cellId: string, height: number, isInit: boolean) {
		const cell = this.getCellById(cellId);
		if (cell && cell instanceof MarkdownCellViewModel) {
			cell.renderedMarkdownHeight = height;
		}
	}

	setMarkdownCellEditState(cellId: string, editState: CellEditState): void {
		const cell = this.getCellById(cellId);
		if (cell && cell instanceof MarkdownCellViewModel) {
			cell.editState = editState;
		}
	}

	markdownCellDragStart(cellId: string, ctx: { clientY: number }): void {
		const cell = this.getCellById(cellId);
		if (cell && cell instanceof MarkdownCellViewModel) {
			this._dndController?.startExplicitDrag(cell, ctx);
		}
	}

	markdownCellDrag(cellId: string, ctx: { clientY: number }): void {
		const cell = this.viewModel?.viewCells.find(vc => vc.id === cellId);

		if (cell && cell instanceof MarkdownCellViewModel) {
			this._dndController?.explicitDrag(cell, ctx);
		}
	}

	markdownCellDragEnd(cellId: string, ctx: { clientY: number, ctrlKey: boolean, altKey: boolean }): void {
		const cell = this.viewModel?.viewCells.find(vc => vc.id === cellId);

		if (cell && cell instanceof MarkdownCellViewModel) {
			this._dndController?.endExplicitDrag(cell, ctx);
		}
	}

	//#endregion

	//#region Editor Contributions
	getContribution<T extends INotebookEditorContribution>(id: string): T {
		return <T>(this._contributions.get(id) || null);
	}

	//#endregion

	dispose() {
		this._isDisposed = true;
		// dispose webview first
		this._webview?.dispose();
		this._webview = null;

		this.notebookService.removeNotebookEditor(this);
		dispose(this._contributions.values());
		this._contributions.clear();

		this._localStore.clear();
		this._list.dispose();
		this._listTopCellToolbar?.dispose();

		this._overlayContainer.remove();
		this.viewModel?.dispose();
		super.dispose();
	}

	toJSON(): { notebookUri: URI | undefined } {
		return {
			notebookUri: this.viewModel?.uri,
		};
	}
}

export const notebookCellBorder = registerColor('notebook.cellBorderColor', {
	dark: transparent(listInactiveSelectionBackground, 1),
	light: transparent(listInactiveSelectionBackground, 1),
	hc: PANEL_BORDER
}, nls.localize('notebook.cellBorderColor', "The border color for notebook cells."));

export const focusedEditorBorderColor = registerColor('notebook.focusedEditorBorder', {
	light: focusBorder,
	dark: focusBorder,
	hc: focusBorder
}, nls.localize('notebook.focusedEditorBorder', "The color of the notebook cell editor border."));

export const cellStatusIconSuccess = registerColor('notebookStatusSuccessIcon.foreground', {
	light: debugIconStartForeground,
	dark: debugIconStartForeground,
	hc: debugIconStartForeground
}, nls.localize('notebookStatusSuccessIcon.foreground', "The error icon color of notebook cells in the cell status bar."));

export const cellStatusIconError = registerColor('notebookStatusErrorIcon.foreground', {
	light: errorForeground,
	dark: errorForeground,
	hc: errorForeground
}, nls.localize('notebookStatusErrorIcon.foreground', "The error icon color of notebook cells in the cell status bar."));

export const cellStatusIconRunning = registerColor('notebookStatusRunningIcon.foreground', {
	light: foreground,
	dark: foreground,
	hc: foreground
}, nls.localize('notebookStatusRunningIcon.foreground', "The running icon color of notebook cells in the cell status bar."));

export const notebookOutputContainerColor = registerColor('notebook.outputContainerBackgroundColor', {
	dark: notebookCellBorder,
	light: notebookCellBorder,
	hc: null
}, nls.localize('notebook.outputContainerBackgroundColor', "The Color of the notebook output container background."));

// TODO@rebornix currently also used for toolbar border, if we keep all of this, pick a generic name
export const CELL_TOOLBAR_SEPERATOR = registerColor('notebook.cellToolbarSeparator', {
	dark: Color.fromHex('#808080').transparent(0.35),
	light: Color.fromHex('#808080').transparent(0.35),
	hc: contrastBorder
}, nls.localize('notebook.cellToolbarSeparator', "The color of the separator in the cell bottom toolbar"));

export const focusedCellBackground = registerColor('notebook.focusedCellBackground', {
	dark: null,
	light: null,
	hc: null
}, nls.localize('focusedCellBackground', "The background color of a cell when the cell is focused."));

export const selectedCellBackground = registerColor('notebook.selectedCellBackground', {
	dark: Color.fromHex('#383B3D').transparent(0.5),
	light: Color.fromHex('#c8ddf1').transparent(0.5),
	hc: null
}, nls.localize('selectedCellBackground', "The background color of a cell when the cell is selected."));


export const cellHoverBackground = registerColor('notebook.cellHoverBackground', {
	dark: transparent(focusedCellBackground, .5),
	light: transparent(focusedCellBackground, .7),
	hc: null
}, nls.localize('notebook.cellHoverBackground', "The background color of a cell when the cell is hovered."));

export const selectedCellBorder = registerColor('notebook.selectedCellBorder', {
	dark: notebookCellBorder,
	light: notebookCellBorder,
	hc: contrastBorder
}, nls.localize('notebook.selectedCellBorder', "The color of the cell's top and bottom border when the cell is selected but not focused."));

export const focusedCellBorder = registerColor('notebook.focusedCellBorder', {
	dark: focusBorder,
	light: focusBorder,
	hc: focusBorder
}, nls.localize('notebook.focusedCellBorder', "The color of the cell's top and bottom border when the cell is focused."));

export const inactiveFocusedCellBorder = registerColor('notebook.inactiveFocusedCellBorder', {
	dark: notebookCellBorder,
	light: notebookCellBorder,
	hc: notebookCellBorder
}, nls.localize('notebook.inactiveFocusedCellBorder', "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."));

export const cellStatusBarItemHover = registerColor('notebook.cellStatusBarItemHoverBackground', {
	light: new Color(new RGBA(0, 0, 0, 0.08)),
	dark: new Color(new RGBA(255, 255, 255, 0.15)),
	hc: new Color(new RGBA(255, 255, 255, 0.15)),
}, nls.localize('notebook.cellStatusBarItemHoverBackground', "The background color of notebook cell status bar items."));

export const cellInsertionIndicator = registerColor('notebook.cellInsertionIndicator', {
	light: focusBorder,
	dark: focusBorder,
	hc: focusBorder
}, nls.localize('notebook.cellInsertionIndicator', "The color of the notebook cell insertion indicator."));

export const listScrollbarSliderBackground = registerColor('notebookScrollbarSlider.background', {
	dark: scrollbarSliderBackground,
	light: scrollbarSliderBackground,
	hc: scrollbarSliderBackground
}, nls.localize('notebookScrollbarSliderBackground', "Notebook scrollbar slider background color."));

export const listScrollbarSliderHoverBackground = registerColor('notebookScrollbarSlider.hoverBackground', {
	dark: scrollbarSliderHoverBackground,
	light: scrollbarSliderHoverBackground,
	hc: scrollbarSliderHoverBackground
}, nls.localize('notebookScrollbarSliderHoverBackground', "Notebook scrollbar slider background color when hovering."));

export const listScrollbarSliderActiveBackground = registerColor('notebookScrollbarSlider.activeBackground', {
	dark: scrollbarSliderActiveBackground,
	light: scrollbarSliderActiveBackground,
	hc: scrollbarSliderActiveBackground
}, nls.localize('notebookScrollbarSliderActiveBackground', "Notebook scrollbar slider background color when clicked on."));

export const cellSymbolHighlight = registerColor('notebook.symbolHighlightBackground', {
	dark: Color.fromHex('#ffffff0b'),
	light: Color.fromHex('#fdff0033'),
	hc: null
}, nls.localize('notebook.symbolHighlightBackground', "Background color of highlighted cell"));

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element,
	.notebookOverlay > .cell-list-container > .notebook-gutter > .monaco-list > .monaco-scrollable-element {
		padding-top: ${SCROLLABLE_ELEMENT_PADDING_TOP}px;
		box-sizing: border-box;
	}`);

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.notebookOverlay .output a,
			.notebookOverlay .cell.markdown a,
			.notebookOverlay .output-show-more-container a
			{ color: ${link};} `);

	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.notebookOverlay .output a:hover,
			.notebookOverlay .cell .output a:active,
			.notebookOverlay .output-show-more-container a:active
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

	const editorBackgroundColor = theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.notebookOverlay .cell .monaco-editor-background,
			.notebookOverlay .cell .margin-view-overlays,
			.notebookOverlay .cell .cell-statusbar-container { background: ${editorBackgroundColor}; }`);
		collector.addRule(`.notebookOverlay .cell-drag-image .cell-editor-container > div { background: ${editorBackgroundColor} !important; }`);

		collector.addRule(`.notebookOverlay .monaco-list-row .cell-title-toolbar { background-color: ${editorBackgroundColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row.cell-drag-image { background-color: ${editorBackgroundColor}; }`);
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .action-item { background-color: ${editorBackgroundColor} }`);
		collector.addRule(`.notebookOverlay .cell-list-top-cell-toolbar-container .action-item { background-color: ${editorBackgroundColor} }`);
	}

	const cellToolbarSeperator = theme.getColor(CELL_TOOLBAR_SEPERATOR);
	if (cellToolbarSeperator) {
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-title-toolbar { border: solid 1px ${cellToolbarSeperator}; }`);
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .action-item { border: solid 1px ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .cell-list-top-cell-toolbar-container .action-item { border: solid 1px ${cellToolbarSeperator} }`);
		collector.addRule(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-collapsed-part { border-bottom: solid 1px ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .monaco-action-bar .action-item.verticalSeparator { background-color: ${cellToolbarSeperator} }`);
	}

	const focusedCellBackgroundColor = theme.getColor(focusedCellBackground);
	if (focusedCellBackgroundColor) {
		collector.addRule(`.notebookOverlay .code-cell-row.focused .cell-focus-indicator,
			.notebookOverlay .markdown-cell-row.focused { background-color: ${focusedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .code-cell-row.focused .cell-collapsed-part { background-color: ${focusedCellBackgroundColor} !important; }`);
	}

	const selectedCellBackgroundColor = theme.getColor(selectedCellBackground);
	if (selectedCellBackground) {
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .markdown-cell-row.selected { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-top { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-left { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-right { background-color: ${selectedCellBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .monaco-list.selection-multiple .code-cell-row.selected .cell-focus-indicator-bottom { background-color: ${selectedCellBackgroundColor} !important; }`);
	}

	const cellHoverBackgroundColor = theme.getColor(cellHoverBackground);
	if (cellHoverBackgroundColor) {
		collector.addRule(`.notebookOverlay .code-cell-row:not(.focused):hover .cell-focus-indicator,
			.notebookOverlay .code-cell-row:not(.focused).cell-output-hover .cell-focus-indicator,
			.notebookOverlay .markdown-cell-row:not(.focused):hover { background-color: ${cellHoverBackgroundColor} !important; }`);
		collector.addRule(`.notebookOverlay .code-cell-row:not(.focused):hover .cell-collapsed-part,
			.notebookOverlay .code-cell-row:not(.focused).cell-output-hover .cell-collapsed-part { background-color: ${cellHoverBackgroundColor}; }`);
	}

	const focusedCellBorderColor = theme.getColor(focusedCellBorder);
	collector.addRule(`
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-focus-indicator-bottom:before,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container:not(.cell-editor-focus) .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container:not(.cell-editor-focus) .cell-focus-indicator-right:before {
				border-color: ${focusedCellBorderColor} !important;
			}`);

	const inactiveFocusedBorderColor = theme.getColor(inactiveFocusedCellBorder);
	collector.addRule(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-focus-indicator-bottom:before {
				border-color: ${inactiveFocusedBorderColor} !important;
			}`);

	const selectedCellBorderColor = theme.getColor(selectedCellBorder);
	collector.addRule(`
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-editor-focus .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-editor-focus .cell-focus-indicator-bottom:before,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container.cell-editor-focus:before {
				border-color: ${selectedCellBorderColor} !important;
			}`);

	const cellSymbolHighlightColor = theme.getColor(cellSymbolHighlight);
	if (cellSymbolHighlightColor) {
		collector.addRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-symbolHighlight .cell-focus-indicator,
		.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-symbolHighlight {
			background-color: ${cellSymbolHighlightColor} !important;
		}`);
	}

	const focusedEditorBorderColorColor = theme.getColor(focusedEditorBorderColor);
	if (focusedEditorBorderColorColor) {
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-editor-focus .cell-editor-part:before { outline: solid 1px ${focusedEditorBorderColorColor}; }`);
	}

	const cellBorderColor = theme.getColor(notebookCellBorder);
	if (cellBorderColor) {
		collector.addRule(`.notebookOverlay .cell.markdown h1 { border-color: ${cellBorderColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-editor-part:before { outline: solid 1px ${cellBorderColor}; }`);
	}

	const cellStatusSuccessIcon = theme.getColor(cellStatusIconSuccess);
	if (cellStatusSuccessIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status ${ThemeIcon.asCSSSelector(successStateIcon)} { color: ${cellStatusSuccessIcon} }`);
	}

	const cellStatusErrorIcon = theme.getColor(cellStatusIconError);
	if (cellStatusErrorIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status ${ThemeIcon.asCSSSelector(errorStateIcon)} { color: ${cellStatusErrorIcon} }`);
	}

	const cellStatusRunningIcon = theme.getColor(cellStatusIconRunning);
	if (cellStatusRunningIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status .codicon-sync { color: ${cellStatusRunningIcon} }`);
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
		// collector.addRule(` .monaco-workbench .notebookOverlay .output-plaintext::-webkit-scrollbar-track { background: ${scrollbarSliderBackgroundColor}; } `);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(listScrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(` .notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .scrollbar > .slider:hover { background: ${scrollbarSliderHoverBackgroundColor}; } `);
		collector.addRule(` .monaco-workbench .notebookOverlay .output-plaintext::-webkit-scrollbar-thumb { background: ${scrollbarSliderHoverBackgroundColor}; } `);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(listScrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(` .notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .scrollbar > .slider.active { background: ${scrollbarSliderActiveBackgroundColor}; } `);
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

	// Cell Margin
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell { margin: 0px ${CELL_MARGIN * 2}px 0px ${CELL_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.code { margin-left: ${CODE_CELL_LEFT_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .cell-inner-container:not(.webview-backed-markdown-cell) { padding-top: ${CELL_TOP_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container:not(.webview-backed-markdown-cell) { padding-bottom: ${MARKDOWN_CELL_BOTTOM_MARGIN}px; padding-top: ${MARKDOWN_CELL_TOP_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .output { margin: 0px ${CELL_MARGIN}px 0px ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .output { width: calc(100% - ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER + (CELL_MARGIN * 2)}px); }`);

	collector.addRule(`.notebookOverlay .output-show-more-container { margin: 0px ${CELL_MARGIN}px 0px ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .output-show-more-container { width: calc(100% - ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER + (CELL_MARGIN * 2)}px); }`);

	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.markdown { padding-left: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .cell .run-button-container { width: 20px; margin: 0px ${Math.floor(CELL_RUN_GUTTER - 20) / 2}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top { height: ${CELL_TOP_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-side { bottom: ${BOTTOM_CELL_TOOLBAR_GAP}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-focus-indicator-left,
	.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-drag-handle { width: ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row .cell-focus-indicator-left { width: ${CODE_CELL_LEFT_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator.cell-focus-indicator-right { width: ${CELL_MARGIN * 2}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom { height: ${CELL_BOTTOM_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .cell-shadow-container-bottom { top: ${CELL_BOTTOM_MARGIN}px; }`);

	collector.addRule(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-collapsed-part { margin-left: ${CODE_CELL_LEFT_MARGIN + CELL_RUN_GUTTER}px; height: ${COLLAPSED_INDICATOR_HEIGHT}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-top-cell-toolbar-container { top: -${SCROLLABLE_ELEMENT_PADDING_TOP}px }`);

	collector.addRule(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { height: ${BOTTOM_CELL_TOOLBAR_HEIGHT}px }`);
	collector.addRule(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .cell-list-top-cell-toolbar-container { height: ${BOTTOM_CELL_TOOLBAR_HEIGHT}px }`);
	collector.addRule(`.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-left:before, .monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-right:before { top: -${CELL_TOP_MARGIN}px; height: calc(100% + ${CELL_TOP_MARGIN + CELL_BOTTOM_MARGIN}px)}`);
});
