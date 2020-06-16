/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, DisposableStore, Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/notebook';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { IEditor } from 'vs/editor/common/editorCommon';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { contrastBorder, editorBackground, focusBorder, foreground, registerColor, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground, textPreformatForeground, errorForeground, transparent } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorMemento } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions, IEditorMemento } from 'vs/workbench/common/editor';
import { CELL_MARGIN, CELL_RUN_GUTTER, EDITOR_BOTTOM_PADDING, EDITOR_TOP_MARGIN, EDITOR_TOP_PADDING, SCROLLABLE_ELEMENT_PADDING_TOP, BOTTOM_CELL_TOOLBAR_HEIGHT } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellEditState, CellFocusMode, ICellRange, ICellViewModel, INotebookCellList, INotebookEditor, INotebookEditorContribution, INotebookEditorMouseEvent, NotebookLayoutInfo, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_RUNNABLE, NOTEBOOK_HAS_MULTIPLE_KERNELS, NOTEBOOK_OUTPUT_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorExtensionsRegistry } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { CellDragAndDropController, CodeCellRenderer, MarkdownCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellRenderer';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookEventDispatcher, NotebookLayoutChangedEvent } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, IModelDecorationsChangeAccessor, INotebookEditorViewState, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellKind, IProcessedOutput, INotebookKernelInfo, INotebookKernelInfoDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { generateUuid } from 'vs/base/common/uuid';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { URI } from 'vs/base/common/uri';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { debugIconStartForeground } from 'vs/workbench/contrib/debug/browser/debugToolBar';
import { CellContextKeyManager } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellContextKeys';

const $ = DOM.$;

export class NotebookEditorOptions extends EditorOptions {

	readonly cellOptions?: IResourceEditorInput;

	constructor(options: Partial<NotebookEditorOptions>) {
		super();
		this.overwrite(options);
		this.cellOptions = options.cellOptions;
	}

	with(options: Partial<NotebookEditorOptions>): NotebookEditorOptions {
		return new NotebookEditorOptions({ ...this, ...options });
	}
}

export class NotebookEditorWidget extends Disposable implements INotebookEditor {
	static readonly ID: string = 'workbench.editor.notebook';
	private static readonly EDITOR_MEMENTOS = new Map<string, EditorMemento<any>>();
	private overlayContainer!: HTMLElement;
	private body!: HTMLElement;
	private webview: BackLayerWebView | null = null;
	private webviewTransparentCover: HTMLElement | null = null;
	private list: INotebookCellList | undefined;
	private dndController: CellDragAndDropController | null = null;
	private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined> = new Map();
	private eventDispatcher: NotebookEventDispatcher | undefined;
	private notebookViewModel: NotebookViewModel | undefined;
	private localStore: DisposableStore = this._register(new DisposableStore());
	private fontInfo: BareFontInfo | undefined;
	private dimension: DOM.Dimension | null = null;
	private shadowElementViewInfo: { height: number, width: number, top: number; left: number; } | null = null;
	private editorFocus: IContextKey<boolean> | null = null;
	private outputFocus: IContextKey<boolean> | null = null;
	private editorEditable: IContextKey<boolean> | null = null;
	private editorRunnable: IContextKey<boolean> | null = null;
	private editorExecutingNotebook: IContextKey<boolean> | null = null;
	private notebookHasMultipleKernels: IContextKey<boolean> | null = null;
	private outputRenderer: OutputRenderer;
	protected readonly _contributions: { [key: string]: INotebookEditorContribution; };
	private scrollBeyondLastLine: boolean;
	private readonly memento: Memento;
	private _isDisposed: boolean = false;
	private readonly _onDidFocusWidget = this._register(new Emitter<void>());
	public get onDidFocus(): Event<any> { return this._onDidFocusWidget.event; }
	private _cellContextKeyManager: CellContextKeyManager | null = null;
	private _isVisible = false;

	get isDisposed() {
		return this._isDisposed;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@INotebookService private notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@ILayoutService private readonly _layoutService: ILayoutService
	) {
		super();
		this.memento = new Memento(NotebookEditorWidget.ID, storageService);

		this.outputRenderer = new OutputRenderer(this, this.instantiationService);
		this._contributions = {};
		this.scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.scrollBeyondLastLine')) {
				this.scrollBeyondLastLine = this.configurationService.getValue<boolean>('editor.scrollBeyondLastLine');
				if (this.dimension && this._isVisible) {
					this.layout(this.dimension);
				}
			}
		});

		this.notebookService.addNotebookEditor(this);
	}

	private _uuid = generateUuid();
	public getId(): string {
		return this._uuid;
	}

	private readonly _onDidChangeModel = new Emitter<NotebookTextModel | undefined>();
	readonly onDidChangeModel: Event<NotebookTextModel | undefined> = this._onDidChangeModel.event;

	private readonly _onDidFocusEditorWidget = new Emitter<void>();
	readonly onDidFocusEditorWidget = this._onDidFocusEditorWidget.event;

	set viewModel(newModel: NotebookViewModel | undefined) {
		this.notebookViewModel = newModel;
		this._onDidChangeModel.fire(newModel?.notebookDocument);
	}

	get viewModel() {
		return this.notebookViewModel;
	}

	get uri() {
		return this.notebookViewModel?.uri;
	}

	get textModel() {
		return this.notebookViewModel?.notebookDocument;
	}

	hasModel() {
		return !!this.notebookViewModel;
	}

	private _activeKernel: INotebookKernelInfo | undefined = undefined;
	private readonly _onDidChangeKernel = new Emitter<void>();
	readonly onDidChangeKernel: Event<void> = this._onDidChangeKernel.event;

	get activeKernel() {
		return this._activeKernel;
	}

	set activeKernel(kernel: INotebookKernelInfo | undefined) {
		if (this._isDisposed) {
			return;
		}

		this._activeKernel = kernel;
		this._onDidChangeKernel.fire();
	}

	private readonly _onDidChangeActiveEditor = this._register(new Emitter<this>());
	readonly onDidChangeActiveEditor: Event<this> = this._onDidChangeActiveEditor.event;

	get activeCodeEditor(): IEditor | undefined {
		if (this._isDisposed) {
			return;
		}

		const [focused] = this.list!.getFocusedElements();
		return this.renderedEditors.get(focused);
	}

	//#region Editor Core

	protected getEditorMemento<T>(editorGroupService: IEditorGroupsService, key: string, limit: number = 10): IEditorMemento<T> {
		const mementoKey = `${NotebookEditorWidget.ID}${key}`;

		let editorMemento = NotebookEditorWidget.EDITOR_MEMENTOS.get(mementoKey);
		if (!editorMemento) {
			editorMemento = new EditorMemento(NotebookEditorWidget.ID, key, this.getMemento(StorageScope.WORKSPACE), limit, editorGroupService);
			NotebookEditorWidget.EDITOR_MEMENTOS.set(mementoKey, editorMemento);
		}

		return editorMemento;
	}

	protected getMemento(scope: StorageScope): MementoObject {
		return this.memento.getMemento(scope);
	}

	public get isNotebookEditor() {
		return true;
	}

	updateEditorFocus() {
		// Note - focus going to the webview will fire 'blur', but the webview element will be
		// a descendent of the notebook editor root.
		this.editorFocus?.set(DOM.isAncestor(document.activeElement, this.overlayContainer));
	}

	hasFocus() {
		return this.editorFocus?.get() || false;
	}

	createEditor(): void {
		this.overlayContainer = document.createElement('div');
		const id = generateUuid();
		this.overlayContainer.id = `notebook-${id}`;
		this.overlayContainer.className = 'notebookOverlay';
		DOM.addClass(this.overlayContainer, 'notebook-editor');
		this.overlayContainer.style.visibility = 'hidden';

		this._layoutService.container.appendChild(this.overlayContainer);
		this.createBody(this.overlayContainer);
		this.generateFontInfo();
		this.editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.contextKeyService);
		this.editorFocus.set(true);
		this._isVisible = true;
		this.outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.contextKeyService);
		this.editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.contextKeyService);
		this.editorEditable.set(true);
		this.editorRunnable = NOTEBOOK_EDITOR_RUNNABLE.bindTo(this.contextKeyService);
		this.editorRunnable.set(true);
		this.editorExecutingNotebook = NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK.bindTo(this.contextKeyService);
		this.notebookHasMultipleKernels = NOTEBOOK_HAS_MULTIPLE_KERNELS.bindTo(this.contextKeyService);
		this.notebookHasMultipleKernels.set(false);

		const contributions = NotebookEditorExtensionsRegistry.getEditorContributions();

		for (const desc of contributions) {
			try {
				const contribution = this.instantiationService.createInstance(desc.ctor, this);
				this._contributions[desc.id] = contribution;
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}

	private generateFontInfo(): void {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.fontInfo = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel());
	}

	private createBody(parent: HTMLElement): void {
		this.body = document.createElement('div');
		DOM.addClass(this.body, 'cell-list-container');
		this.createCellList();
		DOM.append(parent, this.body);
	}

	private createCellList(): void {
		DOM.addClass(this.body, 'cell-list-container');

		this.dndController = this._register(new CellDragAndDropController(this, this.body));
		const getScopedContextKeyService = (container?: HTMLElement) => this.list!.contextKeyService.createScoped(container);
		const renderers = [
			this.instantiationService.createInstance(CodeCellRenderer, this, this.renderedEditors, this.dndController, getScopedContextKeyService),
			this.instantiationService.createInstance(MarkdownCellRenderer, this, this.dndController, this.renderedEditors, getScopedContextKeyService),
		];

		this.list = this.instantiationService.createInstance(
			NotebookCellList,
			'NotebookCellList',
			this.body,
			this.instantiationService.createInstance(NotebookCellListDelegate),
			renderers,
			this.contextKeyService,
			{
				setRowLineHeight: false,
				setRowHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				keyboardSupport: false,
				mouseSupport: true,
				multipleSelectionSupport: false,
				enableKeyboardNavigation: true,
				additionalScrollHeight: 0,
				transformOptimization: false,
				styleController: (_suffix: string) => { return this.list!; },
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
				}
			},
		);
		this.dndController.setList(this.list);

		// create Webview

		this._register(this.list);
		this._register(combinedDisposable(...renderers));

		// transparent cover
		this.webviewTransparentCover = DOM.append(this.list.rowsContainer, $('.webview-cover'));
		this.webviewTransparentCover.style.display = 'none';

		this._register(DOM.addStandardDisposableGenericMouseDownListner(this.overlayContainer, (e: StandardMouseEvent) => {
			if (DOM.hasClass(e.target, 'slider') && this.webviewTransparentCover) {
				this.webviewTransparentCover.style.display = 'block';
			}
		}));

		this._register(DOM.addStandardDisposableGenericMouseUpListner(this.overlayContainer, () => {
			if (this.webviewTransparentCover) {
				// no matter when
				this.webviewTransparentCover.style.display = 'none';
			}
		}));

		this._register(this.list.onMouseDown(e => {
			if (e.element) {
				this._onMouseDown.fire({ event: e.browserEvent, target: e.element });
			}
		}));

		this._register(this.list.onMouseUp(e => {
			if (e.element) {
				this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
			}
		}));

		this._register(this.list.onDidChangeFocus(_e => this._onDidChangeActiveEditor.fire(this)));

		const widgetFocusTracker = DOM.trackFocus(this.getDomNode());
		this._register(widgetFocusTracker);
		this._register(widgetFocusTracker.onDidFocus(() => this._onDidFocusWidget.fire()));
	}

	getDomNode() {
		return this.overlayContainer;
	}

	onWillHide() {
		this._isVisible = false;
		this.editorFocus?.set(false);
		this.overlayContainer.style.visibility = 'hidden';
		this.overlayContainer.style.left = '-50000px';
	}

	getInnerWebview(): Webview | undefined {
		return this.webview?.webview;
	}

	focus() {
		this._isVisible = true;
		this.editorFocus?.set(true);
		this.list?.domFocus();
		this._onDidFocusEditorWidget.fire();
	}

	async setModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined, options: EditorOptions | undefined): Promise<void> {
		if (this.notebookViewModel === undefined || !this.notebookViewModel.equal(textModel)) {
			this.detachModel();
			await this.attachModel(textModel, viewState);
		}

		// clear state
		this.dndController?.clearGlobalDragState();

		this._setKernels(textModel);

		this.localStore.add(this.notebookService.onDidChangeKernels(() => {
			if (this.activeKernel === undefined) {
				this._setKernels(textModel);
			}
		}));

		this.localStore.add(this.list!.onDidChangeFocus(() => {
			const focused = this.list!.getFocusedElements()[0];
			if (focused) {
				if (!this._cellContextKeyManager) {
					this._cellContextKeyManager = this.localStore.add(new CellContextKeyManager(this.contextKeyService, textModel, focused as any));
				}

				this._cellContextKeyManager.updateForElement(focused as any);
			}
		}));

		// reveal cell if editor options tell to do so
		if (options instanceof NotebookEditorOptions && options.cellOptions) {
			const cellOptions = options.cellOptions;
			const cell = this.notebookViewModel!.viewCells.find(cell => cell.uri.toString() === cellOptions.resource.toString());
			if (cell) {
				this.selectElement(cell);
				this.revealInCenterIfOutsideViewport(cell);
				const editor = this.renderedEditors.get(cell)!;
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
					}
					if (!cellOptions.options?.preserveFocus) {
						editor.focus();
					}
				}
			}
		} else if (this.notebookViewModel!.viewCells.length === 1 && this.notebookViewModel!.viewCells[0].cellKind === CellKind.Code) {
			// there is only one code cell in the document
			const cell = this.notebookViewModel!.viewCells[0];
			if (cell.getTextLength() === 0) {
				// the cell is empty, very likely a template cell, focus it
				this.selectElement(cell);
				await this.revealLineInCenterAsync(cell, 1);
				const editor = this.renderedEditors.get(cell)!;
				if (editor) {
					editor.focus();
				}
			}
		}
	}

	private detachModel() {
		this.localStore.clear();
		this.list?.detachViewModel();
		this.viewModel?.dispose();
		// avoid event
		this.notebookViewModel = undefined;
		// this.webview?.clearInsets();
		// this.webview?.clearPreloadsCache();
		this.webview?.dispose();
		this.webview?.element.remove();
		this.webview = null;
		this.list?.clear();
	}

	private _setKernels(textModel: NotebookTextModel) {
		const provider = this.notebookService.getContributedNotebookProviders(this.viewModel!.uri)[0];
		const availableKernels = this.notebookService.getContributedNotebookKernels(textModel.viewType, textModel.uri);

		if (provider.kernel && availableKernels.length > 0) {
			this.notebookHasMultipleKernels!.set(true);
		} else if (availableKernels.length > 1) {
			this.notebookHasMultipleKernels!.set(true);
		} else {
			this.notebookHasMultipleKernels!.set(false);
		}

		if (provider && provider.kernel) {
			// it has a builtin kernel, don't automatically choose a kernel
			this.loadKernelPreloads(provider.providerExtensionLocation, provider.kernel);
			return;
		}

		// the provider doesn't have a builtin kernel, choose a kernel
		this.activeKernel = availableKernels[0];
		if (this.activeKernel) {
			this.loadKernelPreloads(this.activeKernel.extensionLocation, this.activeKernel);
		}
	}

	private loadKernelPreloads(extensionLocation: URI, kernel: INotebookKernelInfoDto) {
		if (kernel.preloads) {
			this.webview?.updateKernelPreloads([extensionLocation], kernel.preloads.map(preload => URI.revive(preload)));
		}
	}

	private updateForMetadata(): void {
		this.editorEditable?.set(!!this.viewModel!.metadata?.editable);
		this.editorRunnable?.set(!!this.viewModel!.metadata?.runnable);
		DOM.toggleClass(this.overlayContainer, 'notebook-editor-editable', !!this.viewModel!.metadata?.editable);
		DOM.toggleClass(this.getDomNode(), 'notebook-editor-editable', !!this.viewModel!.metadata?.editable);
	}

	private async createWebview(id: string, document: URI): Promise<void> {
		this.webview = this.instantiationService.createInstance(BackLayerWebView, this, id, document);
		// attach the webview container to the DOM tree first
		this.list?.rowsContainer.insertAdjacentElement('afterbegin', this.webview.element);
		await this.webview.createWebview();
		this.webview.webview.onDidBlur(() => {
			this.outputFocus?.set(false);
			this.updateEditorFocus();
		});
		this.webview.webview.onDidFocus(() => {
			this.outputFocus?.set(true);
			this.updateEditorFocus();
			this._onDidFocusWidget.fire();
		});

		this.localStore.add(this.webview.onMessage(message => {
			if (this.viewModel) {
				this.notebookService.onDidReceiveMessage(this.viewModel.viewType, this.getId(), message);
			}
		}));
	}

	private async attachModel(textModel: NotebookTextModel, viewState: INotebookEditorViewState | undefined) {
		await this.createWebview(this.getId(), textModel.uri);

		this.eventDispatcher = new NotebookEventDispatcher();
		this.viewModel = this.instantiationService.createInstance(NotebookViewModel, textModel.viewType, textModel, this.eventDispatcher, this.getLayoutInfo());
		this.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);

		this.updateForMetadata();
		this.localStore.add(this.eventDispatcher.onDidChangeMetadata(() => {
			this.updateForMetadata();
		}));

		// restore view states, including contributions

		{
			// restore view state
			this.viewModel.restoreEditorViewState(viewState);

			// contribution state restore

			const contributionsState = viewState?.contributionsState || {};
			const keys = Object.keys(this._contributions);
			for (let i = 0, len = keys.length; i < len; i++) {
				const id = keys[i];
				const contribution = this._contributions[id];
				if (typeof contribution.restoreViewState === 'function') {
					contribution.restoreViewState(contributionsState[id]);
				}
			}
		}

		this.webview?.updateRendererPreloads(this.viewModel.renderers);

		this.localStore.add(this.list!.onWillScroll(e => {
			this.webview!.updateViewScrollTop(-e.scrollTop, []);
			this.webviewTransparentCover!.style.top = `${e.scrollTop}px`;
		}));

		this.localStore.add(this.list!.onDidChangeContentHeight(() => {
			DOM.scheduleAtNextAnimationFrame(() => {
				if (this._isDisposed) {
					return;
				}

				const scrollTop = this.list?.scrollTop || 0;
				const scrollHeight = this.list?.scrollHeight || 0;
				this.webview!.element.style.height = `${scrollHeight}px`;

				if (this.webview?.insetMapping) {
					let updateItems: { cell: CodeCellViewModel, output: IProcessedOutput, cellTop: number }[] = [];
					let removedItems: IProcessedOutput[] = [];
					this.webview?.insetMapping.forEach((value, key) => {
						const cell = value.cell;
						const viewIndex = this.list?.getViewIndex(cell);

						if (viewIndex === undefined) {
							return;
						}

						if (cell.outputs.indexOf(key) < 0) {
							// output is already gone
							removedItems.push(key);
						}

						const cellTop = this.list?.getAbsoluteTopOfElement(cell) || 0;
						if (this.webview!.shouldUpdateInset(cell, key, cellTop)) {
							updateItems.push({
								cell: cell,
								output: key,
								cellTop: cellTop
							});
						}
					});

					removedItems.forEach(output => this.webview?.removeInset(output));

					if (updateItems.length) {
						this.webview?.updateViewScrollTop(-scrollTop, updateItems);
					}
				}
			});
		}));

		this.list!.attachViewModel(this.viewModel);
		this.localStore.add(this.list!.onDidRemoveOutput(output => {
			this.removeInset(output);
		}));
		this.localStore.add(this.list!.onDidHideOutput(output => {
			this.hideInset(output);
		}));

		this.list!.layout();
		this.dndController?.clearGlobalDragState();

		// restore list state at last, it must be after list layout
		this.restoreListViewState(viewState);
	}

	private restoreListViewState(viewState: INotebookEditorViewState | undefined): void {
		if (viewState?.scrollPosition !== undefined) {
			this.list!.scrollTop = viewState!.scrollPosition.top;
			this.list!.scrollLeft = viewState!.scrollPosition.left;
		} else {
			this.list!.scrollTop = 0;
			this.list!.scrollLeft = 0;
		}

		const focusIdx = typeof viewState?.focus === 'number' ? viewState.focus : 0;
		if (focusIdx < this.list!.length) {
			this.list!.setFocus([focusIdx]);
			this.list!.setSelection([focusIdx]);
		} else if (this.list!.length > 0) {
			this.list!.setFocus([0]);
		}

		if (viewState?.editorFocused) {
			this.list?.focusView();
			const cell = this.notebookViewModel?.viewCells[focusIdx];
			if (cell) {
				cell.focusMode = CellFocusMode.Editor;
			}
		}
	}

	getEditorViewState(): INotebookEditorViewState {
		const state = this.notebookViewModel?.getEditorViewState();
		if (!state) {
			return {
				editingCells: {},
				editorViewStates: {}
			};
		}

		if (this.list) {
			state.scrollPosition = { left: this.list.scrollLeft, top: this.list.scrollTop };
			let cellHeights: { [key: number]: number } = {};
			for (let i = 0; i < this.viewModel!.length; i++) {
				const elm = this.viewModel!.viewCells[i] as CellViewModel;
				if (elm.cellKind === CellKind.Code) {
					cellHeights[i] = elm.layoutInfo.totalHeight;
				} else {
					cellHeights[i] = 0;
				}
			}

			state.cellTotalHeights = cellHeights;

			const focus = this.list.getFocus()[0];
			if (typeof focus === 'number') {
				const element = this.notebookViewModel!.viewCells[focus];
				const itemDOM = this.list?.domElementOfElement(element!);
				let editorFocused = false;
				if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
					editorFocused = true;
				}

				state.editorFocused = editorFocused;
				state.focus = focus;
			}
		}

		// Save contribution view states
		const contributionsState: { [key: string]: any } = {};

		const keys = Object.keys(this._contributions);
		for (const id of keys) {
			const contribution = this._contributions[id];
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}

		state.contributionsState = contributionsState;
		return state;
	}

	// private saveEditorViewState(input: NotebookEditorInput): void {
	// 	if (this.group && this.notebookViewModel) {
	// 	}
	// }

	// private loadTextEditorViewState(): INotebookEditorViewState | undefined {
	// 	return this.editorMemento.loadEditorState(this.group, input.resource);
	// }

	layout(dimension: DOM.Dimension, shadowElement?: HTMLElement): void {
		if (!shadowElement && this.shadowElementViewInfo === null) {
			this.dimension = dimension;
			return;
		}

		if (shadowElement) {
			const containerRect = shadowElement.getBoundingClientRect();

			this.shadowElementViewInfo = {
				height: containerRect.height,
				width: containerRect.width,
				top: containerRect.top,
				left: containerRect.left
			};
		}

		this.dimension = new DOM.Dimension(dimension.width, dimension.height);
		DOM.size(this.body, dimension.width, dimension.height);
		this.list?.updateOptions({ additionalScrollHeight: this.scrollBeyondLastLine ? dimension.height - SCROLLABLE_ELEMENT_PADDING_TOP : 0 });
		this.list?.layout(dimension.height - SCROLLABLE_ELEMENT_PADDING_TOP, dimension.width);

		this.overlayContainer.style.visibility = 'visible';
		this.overlayContainer.style.display = 'block';
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.top = `${this.shadowElementViewInfo!.top}px`;
		this.overlayContainer.style.left = `${this.shadowElementViewInfo!.left}px`;
		this.overlayContainer.style.width = `${dimension ? dimension.width : this.shadowElementViewInfo!.width}px`;
		this.overlayContainer.style.height = `${dimension ? dimension.height : this.shadowElementViewInfo!.height}px`;

		if (this.webviewTransparentCover) {
			this.webviewTransparentCover.style.height = `${dimension.height}px`;
			this.webviewTransparentCover.style.width = `${dimension.width}px`;
		}

		this.eventDispatcher?.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
	}

	// protected saveState(): void {
	// 	if (this.input instanceof NotebookEditorInput) {
	// 		this.saveEditorViewState(this.input);
	// 	}

	// 	super.saveState();
	// }

	//#endregion

	//#region Editor Features

	selectElement(cell: ICellViewModel) {
		this.list?.selectElement(cell);
		// this.viewModel!.selectionHandles = [cell.handle];
	}

	revealInView(cell: ICellViewModel) {
		this.list?.revealElementInView(cell);
	}

	revealInCenterIfOutsideViewport(cell: ICellViewModel) {
		this.list?.revealElementInCenterIfOutsideViewport(cell);
	}

	revealInCenter(cell: ICellViewModel) {
		this.list?.revealElementInCenter(cell);
	}

	async revealLineInViewAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this.list?.revealElementLineInViewAsync(cell, line);
	}

	async revealLineInCenterAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this.list?.revealElementLineInCenterAsync(cell, line);
	}

	async revealLineInCenterIfOutsideViewportAsync(cell: ICellViewModel, line: number): Promise<void> {
		return this.list?.revealElementLineInCenterIfOutsideViewportAsync(cell, line);
	}

	async revealRangeInViewAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this.list?.revealElementRangeInViewAsync(cell, range);
	}

	async revealRangeInCenterAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this.list?.revealElementRangeInCenterAsync(cell, range);
	}

	async revealRangeInCenterIfOutsideViewportAsync(cell: ICellViewModel, range: Range): Promise<void> {
		return this.list?.revealElementRangeInCenterIfOutsideViewportAsync(cell, range);
	}

	setCellSelection(cell: ICellViewModel, range: Range): void {
		this.list?.setCellSelection(cell, range);
	}

	changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any {
		return this.notebookViewModel?.changeDecorations(callback);
	}

	setHiddenAreas(_ranges: ICellRange[]): boolean {
		return this.list!.setHiddenAreas(_ranges, true);
	}

	//#endregion

	//#region Mouse Events
	private readonly _onMouseUp: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseUp: Event<INotebookEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseDown: Event<INotebookEditorMouseEvent> = this._onMouseDown.event;

	private pendingLayouts = new WeakMap<ICellViewModel, IDisposable>();

	//#endregion

	//#region Cell operations
	async layoutNotebookCell(cell: ICellViewModel, height: number): Promise<void> {
		const viewIndex = this.list!.getViewIndex(cell);
		if (viewIndex === undefined) {
			// the cell is hidden
			return;
		}

		let relayout = (cell: ICellViewModel, height: number) => {
			if (this._isDisposed) {
				return;
			}

			this.list?.updateElementHeight2(cell, height);
		};

		if (this.pendingLayouts.has(cell)) {
			this.pendingLayouts.get(cell)!.dispose();
		}

		let r: () => void;
		const layoutDisposable = DOM.scheduleAtNextAnimationFrame(() => {
			if (this._isDisposed) {
				return;
			}

			this.pendingLayouts.delete(cell);

			relayout(cell, height);
			r();
		});

		this.pendingLayouts.set(cell, toDisposable(() => {
			layoutDisposable.dispose();
			r();
		}));

		return new Promise(resolve => { r = resolve; });
	}

	insertNotebookCell(cell: ICellViewModel | undefined, type: CellKind, direction: 'above' | 'below' = 'above', initialText: string = '', ui: boolean = false): CellViewModel | null {
		if (!this.notebookViewModel!.metadata.editable) {
			return null;
		}

		const newLanguages = this.notebookViewModel!.languages;
		const language = (type === CellKind.Code && newLanguages && newLanguages.length) ? newLanguages[0] : 'markdown';
		const index = cell ? this.notebookViewModel!.getCellIndex(cell) : 0;
		const nextIndex = ui ? this.notebookViewModel!.getNextVisibleCellIndex(index) : index + 1;
		const insertIndex = cell ?
			(direction === 'above' ? index : nextIndex) :
			index;
		const newCell = this.notebookViewModel!.createCell(insertIndex, initialText.split(/\r?\n/g), language, type, cell?.metadata, true);
		return newCell;
	}

	async splitNotebookCell(cell: ICellViewModel): Promise<CellViewModel[] | null> {
		const index = this.notebookViewModel!.getCellIndex(cell);

		return this.notebookViewModel!.splitNotebookCell(index);
	}

	async joinNotebookCells(cell: ICellViewModel, direction: 'above' | 'below', constraint?: CellKind): Promise<ICellViewModel | null> {
		const index = this.notebookViewModel!.getCellIndex(cell);
		const ret = await this.notebookViewModel!.joinNotebookCells(index, direction, constraint);

		if (ret) {
			ret.deletedCells.forEach(cell => {
				if (this.pendingLayouts.has(cell)) {
					this.pendingLayouts.get(cell)!.dispose();
				}
			});

			return ret.cell;
		} else {
			return null;
		}
	}

	async deleteNotebookCell(cell: ICellViewModel): Promise<boolean> {
		if (!this.notebookViewModel!.metadata.editable) {
			return false;
		}

		if (this.pendingLayouts.has(cell)) {
			this.pendingLayouts.get(cell)!.dispose();
		}

		const index = this.notebookViewModel!.getCellIndex(cell);
		this.notebookViewModel!.deleteCell(index, true);
		return true;
	}

	async moveCellDown(cell: ICellViewModel): Promise<boolean> {
		if (!this.notebookViewModel!.metadata.editable) {
			return false;
		}

		const index = this.notebookViewModel!.getCellIndex(cell);
		if (index === this.notebookViewModel!.length - 1) {
			return false;
		}

		const newIdx = index + 1;
		return this.moveCellToIndex(index, newIdx);
	}

	async moveCellUp(cell: ICellViewModel): Promise<boolean> {
		if (!this.notebookViewModel!.metadata.editable) {
			return false;
		}

		const index = this.notebookViewModel!.getCellIndex(cell);
		if (index === 0) {
			return false;
		}

		const newIdx = index - 1;
		return this.moveCellToIndex(index, newIdx);
	}

	async moveCell(cell: ICellViewModel, relativeToCell: ICellViewModel, direction: 'above' | 'below'): Promise<boolean> {
		if (!this.notebookViewModel!.metadata.editable) {
			return false;
		}

		if (cell === relativeToCell) {
			return false;
		}

		const originalIdx = this.notebookViewModel!.getCellIndex(cell);
		const relativeToIndex = this.notebookViewModel!.getCellIndex(relativeToCell);

		let newIdx = direction === 'above' ? relativeToIndex : relativeToIndex + 1;
		if (originalIdx < newIdx) {
			newIdx--;
		}

		return this.moveCellToIndex(originalIdx, newIdx);
	}

	private async moveCellToIndex(index: number, newIdx: number): Promise<boolean> {
		if (index === newIdx) {
			return false;
		}

		if (!this.notebookViewModel!.moveCellToIdx(index, newIdx, true)) {
			throw new Error('Notebook Editor move cell, index out of range');
		}

		let r: (val: boolean) => void;
		DOM.scheduleAtNextAnimationFrame(() => {
			if (this._isDisposed) {
				r(false);
			}

			this.list?.revealElementInView(this.notebookViewModel!.viewCells[newIdx]);
			r(true);
		});

		return new Promise(resolve => { r = resolve; });
	}

	editNotebookCell(cell: CellViewModel): void {
		if (!cell.getEvaluatedMetadata(this.notebookViewModel!.metadata).editable) {
			return;
		}

		cell.editState = CellEditState.Editing;

		this.renderedEditors.get(cell)?.focus();
	}

	getActiveCell() {
		let elements = this.list?.getFocusedElements();

		if (elements && elements.length) {
			return elements[0];
		}

		return undefined;
	}

	cancelNotebookExecution(): void {
		if (!this.notebookViewModel!.currentTokenSource) {
			throw new Error('Notebook is not executing');
		}


		this.notebookViewModel!.currentTokenSource.cancel();
		this.notebookViewModel!.currentTokenSource = undefined;
	}

	async executeNotebook(): Promise<void> {
		if (!this.notebookViewModel!.metadata.runnable) {
			return;
		}

		return this._executeNotebook();
	}

	async _executeNotebook(): Promise<void> {
		if (this.notebookViewModel!.currentTokenSource) {
			return;
		}

		const tokenSource = new CancellationTokenSource();
		try {
			this.editorExecutingNotebook!.set(true);
			this.notebookViewModel!.currentTokenSource = tokenSource;
			const provider = this.notebookService.getContributedNotebookProviders(this.viewModel!.uri)[0];
			if (provider) {
				const viewType = provider.id;
				const notebookUri = this.notebookViewModel!.uri;

				if (this._activeKernel) {
					await this.notebookService.executeNotebook2(this.notebookViewModel!.viewType, this.notebookViewModel!.uri, this._activeKernel.id, tokenSource.token);
				} else if (provider.kernel) {
					return await this.notebookService.executeNotebook(viewType, notebookUri, true, tokenSource.token);
				} else {
					return await this.notebookService.executeNotebook(viewType, notebookUri, false, tokenSource.token);
				}
			}

		} finally {
			this.editorExecutingNotebook!.set(false);
			this.notebookViewModel!.currentTokenSource = undefined;
			tokenSource.dispose();
		}
	}

	cancelNotebookCellExecution(cell: ICellViewModel): void {
		if (!cell.currentTokenSource) {
			throw new Error('Cell is not executing');
		}

		cell.currentTokenSource.cancel();
		cell.currentTokenSource = undefined;
	}

	async executeNotebookCell(cell: ICellViewModel): Promise<void> {
		if (cell.cellKind === CellKind.Markdown) {
			cell.editState = CellEditState.Preview;
			return;
		}

		if (!cell.getEvaluatedMetadata(this.notebookViewModel!.metadata).runnable) {
			return;
		}

		const tokenSource = new CancellationTokenSource();
		try {
			await this._executeNotebookCell(cell, tokenSource);
		} finally {
			tokenSource.dispose();
		}
	}

	private async _executeNotebookCell(cell: ICellViewModel, tokenSource: CancellationTokenSource): Promise<void> {
		try {
			cell.currentTokenSource = tokenSource;

			const provider = this.notebookService.getContributedNotebookProviders(this.viewModel!.uri)[0];
			if (provider) {
				const viewType = provider.id;
				const notebookUri = this.notebookViewModel!.uri;

				if (this._activeKernel) {
					return await this.notebookService.executeNotebookCell2(viewType, notebookUri, cell.handle, this._activeKernel.id, tokenSource.token);
				} else if (provider.kernel) {
					return await this.notebookService.executeNotebookCell(viewType, notebookUri, cell.handle, true, tokenSource.token);
				} else {
					return await this.notebookService.executeNotebookCell(viewType, notebookUri, cell.handle, false, tokenSource.token);
				}
			}
		} finally {
			cell.currentTokenSource = undefined;
		}
	}

	focusNotebookCell(cell: ICellViewModel, focusItem: 'editor' | 'container' | 'output') {
		if (this._isDisposed) {
			return;
		}

		if (focusItem === 'editor') {
			this.selectElement(cell);
			this.list?.focusView();

			cell.editState = CellEditState.Editing;
			cell.focusMode = CellFocusMode.Editor;
			this.revealInCenterIfOutsideViewport(cell);
		} else if (focusItem === 'output') {
			this.selectElement(cell);
			this.list?.focusView();

			if (!this.webview) {
				return;
			}
			this.webview.focusOutput(cell.id);

			cell.editState = CellEditState.Preview;
			cell.focusMode = CellFocusMode.Container;
			this.revealInCenterIfOutsideViewport(cell);
		} else {
			let itemDOM = this.list?.domElementOfElement(cell);
			if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
				(document.activeElement as HTMLElement).blur();
			}

			cell.editState = CellEditState.Preview;
			cell.focusMode = CellFocusMode.Container;

			this.selectElement(cell);
			this.revealInCenterIfOutsideViewport(cell);
			this.list?.focusView();
		}
	}

	//#endregion

	//#region MISC

	getLayoutInfo(): NotebookLayoutInfo {
		if (!this.list) {
			throw new Error('Editor is not initalized successfully');
		}

		return {
			width: this.dimension!.width,
			height: this.dimension!.height,
			fontInfo: this.fontInfo!
		};
	}

	triggerScroll(event: IMouseWheelEvent) {
		this.list?.triggerScrollFromMouseWheelEvent(event);
	}

	createInset(cell: CodeCellViewModel, output: IProcessedOutput, shadowContent: string, offset: number) {
		if (!this.webview) {
			return;
		}

		let preloads = this.notebookViewModel!.renderers;

		if (!this.webview!.insetMapping.has(output)) {
			let cellTop = this.list?.getAbsoluteTopOfElement(cell) || 0;
			this.webview!.createInset(cell, output, cellTop, offset, shadowContent, preloads);
		} else {
			let cellTop = this.list?.getAbsoluteTopOfElement(cell) || 0;
			let scrollTop = this.list?.scrollTop || 0;

			this.webview!.updateViewScrollTop(-scrollTop, [{ cell: cell, output: output, cellTop: cellTop }]);
		}
	}

	removeInset(output: IProcessedOutput) {
		if (!this.webview) {
			return;
		}

		this.webview!.removeInset(output);
	}

	hideInset(output: IProcessedOutput) {
		if (!this.webview) {
			return;
		}

		this.webview!.hideInset(output);
	}

	getOutputRenderer(): OutputRenderer {
		return this.outputRenderer;
	}

	postMessage(message: any) {
		this.webview?.webview.postMessage(message);
	}

	//#endregion

	//#region Editor Contributions
	public getContribution<T extends INotebookEditorContribution>(id: string): T {
		return <T>(this._contributions[id] || null);
	}

	//#endregion

	dispose() {
		this._isDisposed = true;
		this.notebookService.removeNotebookEditor(this);
		const keys = Object.keys(this._contributions);
		for (let i = 0, len = keys.length; i < len; i++) {
			const contributionId = keys[i];
			this._contributions[contributionId].dispose();
		}

		this.localStore.clear();
		this.list?.dispose();
		this.webview?.dispose();

		this.overlayContainer.remove();
		this.viewModel?.dispose();

		// this._layoutService.container.removeChild(this.overlayContainer);

		super.dispose();
	}

	toJSON(): any {
		return {
			notebookHandle: this.viewModel?.handle
		};
	}
}

export const notebookCellBorder = registerColor('notebook.cellBorderColor', {
	dark: transparent(PANEL_BORDER, .6),
	light: transparent(PANEL_BORDER, .4),
	hc: PANEL_BORDER
}, nls.localize('notebook.cellBorderColor', "The border color for notebook cells."));

export const focusedCellIndicator = registerColor('notebook.focusedCellIndicator', {
	light: focusBorder,
	dark: focusBorder,
	hc: focusBorder
}, nls.localize('notebook.focusedCellIndicator', "The color of the notebook cell indicator."));

export const focusedEditorIndicator = registerColor('notebook.focusedEditorIndicator', {
	light: focusBorder,
	dark: focusBorder,
	hc: focusBorder
}, nls.localize('notebook.focusedEditorIndicator', "The color of the notebook cell editor indicator."));

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

// TODO currently also used for toolbar border, if we keep all of this, pick a generic name
export const CELL_TOOLBAR_SEPERATOR = registerColor('notebook.cellToolbarSeperator', {
	dark: Color.fromHex('#808080').transparent(0.35),
	light: Color.fromHex('#808080').transparent(0.35),
	hc: contrastBorder
}, nls.localize('cellToolbarSeperator', "The color of seperator in Cell bottom toolbar"));

export const cellStatusBarItemHover = registerColor('notebook.cellStatusBarItemHoverBackground', {
	light: new Color(new RGBA(0, 0, 0, 0.08)),
	dark: new Color(new RGBA(255, 255, 255, 0.15)),
	hc: new Color(new RGBA(255, 255, 255, 0.15)),
}, nls.localize('notebook.cellStatusBarItemHoverBackground', "The background color of notebook cell status bar items."));

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element {
		padding-top: ${SCROLLABLE_ELEMENT_PADDING_TOP}px;
		box-sizing: border-box;
	}`);

	// const color = getExtraColor(theme, embeddedEditorBackground, { dark: 'rgba(0, 0, 0, .4)', extra_dark: 'rgba(200, 235, 255, .064)', light: '#f4f4f4', hc: null });
	const color = theme.getColor(editorBackground);
	if (color) {
		collector.addRule(`.notebookOverlay .cell .monaco-editor-background,
			.notebookOverlay .cell .margin-view-overlays,
			.notebookOverlay .cell .cell-statusbar-container { background: ${color}; }`);
		collector.addRule(`.notebookOverlay .cell-drag-image .cell-editor-container > div { background: ${color} !important; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.notebookOverlay .output a,
			.notebookOverlay .cell.markdown a { color: ${link};} `);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.notebookOverlay .output a:hover,
			.notebookOverlay .cell .output a:active { color: ${activeLink}; }`);
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
	}

	const editorBackgroundColor = theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.notebookOverlay .cell-statusbar-container { border-top: solid 1px ${editorBackgroundColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row > .monaco-toolbar { background-color: ${editorBackgroundColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row.cell-drag-image { background-color: ${editorBackgroundColor}; }`);
	}

	const cellToolbarSeperator = theme.getColor(CELL_TOOLBAR_SEPERATOR);
	if (cellToolbarSeperator) {
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .separator { background-color: ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container .action-item:first-child::after { background-color: ${cellToolbarSeperator} }`);
		collector.addRule(`.notebookOverlay .monaco-list-row > .monaco-toolbar { border: solid 1px ${cellToolbarSeperator}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row:hover .notebook-cell-focus-indicator,
			.notebookOverlay .monaco-list-row.cell-output-hover .notebook-cell-focus-indicator { border-color: ${cellToolbarSeperator}; }`);
	}

	const focusedCellIndicatorColor = theme.getColor(focusedCellIndicator);
	if (focusedCellIndicatorColor) {
		collector.addRule(`.notebookOverlay .monaco-list-row.focused .notebook-cell-focus-indicator { border-color: ${focusedCellIndicatorColor}; }`);
		collector.addRule(`.notebookOverlay .monaco-list-row .notebook-cell-focus-indicator { border-color: ${focusedCellIndicatorColor}; }`);
		collector.addRule(`.notebookOverlay > .cell-list-container > .cell-list-insertion-indicator { background-color: ${focusedCellIndicatorColor}; }`);
	}

	const focusedEditorIndicatorColor = theme.getColor(focusedEditorIndicator);
	if (focusedEditorIndicatorColor) {
		collector.addRule(`.notebookOverlay .monaco-list-row.cell-editor-focus .cell-editor-part:before { outline: solid 1px ${focusedEditorIndicatorColor}; }`);
	}

	const editorBorderColor = theme.getColor(notebookCellBorder);
	if (editorBorderColor) {
		collector.addRule(`.notebookOverlay .monaco-list-row .cell-editor-part:before { outline: solid 1px ${editorBorderColor}; }`);
	}

	const headingBorderColor = theme.getColor(notebookCellBorder);
	if (headingBorderColor) {
		collector.addRule(`.notebookOverlay .cell.markdown h1 { border-color: ${headingBorderColor}; }`);
	}

	const cellStatusSuccessIcon = theme.getColor(cellStatusIconSuccess);
	if (cellStatusSuccessIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status .codicon-check { color: ${cellStatusSuccessIcon} }`);
	}

	const cellStatusErrorIcon = theme.getColor(cellStatusIconError);
	if (cellStatusErrorIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status .codicon-error { color: ${cellStatusErrorIcon} }`);
	}

	const cellStatusRunningIcon = theme.getColor(cellStatusIconRunning);
	if (cellStatusRunningIcon) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-run-status .codicon-sync { color: ${cellStatusRunningIcon} }`);
	}

	const cellStatusBarHoverBg = theme.getColor(cellStatusBarItemHover);
	if (cellStatusBarHoverBg) {
		collector.addRule(`.monaco-workbench .notebookOverlay .cell-statusbar-container .cell-language-picker:hover { background-color: ${cellStatusBarHoverBg}; }`);
	}

	// const widgetShadowColor = theme.getColor(widgetShadow);
	// if (widgetShadowColor) {
	// 	collector.addRule(`.notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .monaco-toolbar {
	// 		box-shadow:  0 0 8px 4px ${widgetShadowColor}
	// 	}`)
	// }

	// Cell Margin
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row  > div.cell { margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row { padding-top: ${EDITOR_TOP_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .output { margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN + CELL_RUN_GUTTER}px }`);
	collector.addRule(`.notebookOverlay .cell-bottom-toolbar-container { width: calc(100% - ${CELL_MARGIN * 2 + CELL_RUN_GUTTER}px); margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN + CELL_RUN_GUTTER}px }`);

	collector.addRule(`.notebookOverlay .markdown-cell-row .cell .cell-editor-part { margin-left: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row  > div.cell.markdown { padding-left: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay .cell .run-button-container { width: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.notebookOverlay > .cell-list-container > .cell-list-insertion-indicator { left: ${CELL_MARGIN + CELL_RUN_GUTTER}px; right: ${CELL_MARGIN}px; }`);
	collector.addRule(`.notebookOverlay .cell-drag-image .cell-editor-container > div { padding: ${EDITOR_TOP_PADDING}px 16px ${EDITOR_BOTTOM_PADDING}px 16px; }`);
	collector.addRule(`.notebookOverlay .monaco-list .monaco-list-row .notebook-cell-focus-indicator { left: ${CELL_MARGIN}px; bottom: ${BOTTOM_CELL_TOOLBAR_HEIGHT}px; }`);
});
