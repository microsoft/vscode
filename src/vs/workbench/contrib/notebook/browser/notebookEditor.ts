/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notebook';
import { getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { ICompositeCodeEditor, IEditor } from 'vs/editor/common/editorCommon';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { contrastBorder, editorBackground, focusBorder, foreground, registerColor, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground, textPreformatForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorOptions, IEditorCloseEvent, IEditorMemento } from 'vs/workbench/common/editor';
import { CELL_MARGIN, CELL_RUN_GUTTER, EDITOR_TOP_MARGIN } from 'vs/workbench/contrib/notebook/browser/constants';
import { FoldingController } from 'vs/workbench/contrib/notebook/browser/contrib/fold/folding';
import { NotebookFindWidget } from 'vs/workbench/contrib/notebook/browser/contrib/notebookFindWidget';
import { CellEditState, CellFocusMode, ICellRange, ICellViewModel, INotebookCellList, INotebookEditor, INotebookEditorMouseEvent, NotebookLayoutInfo, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput, NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { CodeCellRenderer, MarkdownCellRenderer, NotebookCellListDelegate } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellRenderer';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookEventDispatcher, NotebookLayoutChangedEvent } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, IModelDecorationsChangeAccessor, INotebookEditorViewState, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellKind, CellUri, IOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { getExtraColor } from 'vs/workbench/contrib/welcome/walkThrough/common/walkThroughUtils';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

const $ = DOM.$;
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';

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

export class NotebookCodeEditors implements ICompositeCodeEditor {

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChangeActiveEditor = new Emitter<this>();
	readonly onDidChangeActiveEditor: Event<this> = this._onDidChangeActiveEditor.event;

	constructor(
		private _list: INotebookCellList,
		private _renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>
	) {
		_list.onDidChangeFocus(_e => this._onDidChangeActiveEditor.fire(this), undefined, this._disposables);
	}

	dispose(): void {
		this._onDidChangeActiveEditor.dispose();
		this._disposables.dispose();
	}

	get activeCodeEditor(): IEditor | undefined {
		const [focused] = this._list.getFocusedElements();
		return this._renderedEditors.get(focused);
	}
}

export class NotebookEditor extends BaseEditor implements INotebookEditor {
	static readonly ID: string = 'workbench.editor.notebook';
	private rootElement!: HTMLElement;
	private body!: HTMLElement;
	private webview: BackLayerWebView | null = null;
	private webviewTransparentCover: HTMLElement | null = null;
	private list: INotebookCellList | undefined;
	private control: ICompositeCodeEditor | undefined;
	private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined> = new Map();
	private eventDispatcher: NotebookEventDispatcher | undefined;
	private notebookViewModel: NotebookViewModel | undefined;
	private localStore: DisposableStore = this._register(new DisposableStore());
	private editorMemento: IEditorMemento<INotebookEditorViewState>;
	private readonly groupListener = this._register(new MutableDisposable());
	private fontInfo: BareFontInfo | undefined;
	private dimension: DOM.Dimension | null = null;
	private editorFocus: IContextKey<boolean> | null = null;
	private editorEditable: IContextKey<boolean> | null = null;
	private editorExecutingNotebook: IContextKey<boolean> | null = null;
	private outputRenderer: OutputRenderer;
	private findWidget: NotebookFindWidget;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@INotebookService private notebookService: INotebookService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @IEditorProgressService private readonly progressService: IEditorProgressService,
	) {
		super(NotebookEditor.ID, telemetryService, themeService, storageService);

		this.editorMemento = this.getEditorMemento<INotebookEditorViewState>(editorGroupService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
		this.outputRenderer = new OutputRenderer(this, this.instantiationService);
		this.findWidget = this.instantiationService.createInstance(NotebookFindWidget, this);
		this.findWidget.updateTheme(this.themeService.getColorTheme());
	}

	get viewModel() {
		return this.notebookViewModel;
	}

	get minimumWidth(): number { return 375; }
	get maximumWidth(): number { return Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /*noop*/ }
	set maximumWidth(value: number) { /*noop*/ }


	//#region Editor Core


	public get isNotebookEditor() {
		return true;
	}

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = DOM.append(parent, $('.notebook-editor'));
		this.createBody(this.rootElement);
		this.generateFontInfo();
		this.editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.contextKeyService);
		this.editorFocus.set(true);
		this._register(this.onDidFocus(() => {
			this.editorFocus?.set(true);
		}));

		this._register(this.onDidBlur(() => {
			this.editorFocus?.set(false);
		}));

		this.editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.contextKeyService);
		this.editorEditable.set(true);
		this.editorExecutingNotebook = NOTEBOOK_EDITOR_EXECUTING_NOTEBOOK.bindTo(this.contextKeyService);
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
		DOM.append(parent, this.findWidget.getDomNode());
	}

	private createCellList(): void {
		DOM.addClass(this.body, 'cell-list-container');

		const renders = [
			this.instantiationService.createInstance(CodeCellRenderer, this, this.contextKeyService, this.renderedEditors),
			this.instantiationService.createInstance(MarkdownCellRenderer, this.contextKeyService, this),
		];

		this.list = this.instantiationService.createInstance(
			NotebookCellList,
			'NotebookCellList',
			this.body,
			this.instantiationService.createInstance(NotebookCellListDelegate),
			renders,
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
					getAriaLabel() { return null; }
				}
			},
		);

		this.control = new NotebookCodeEditors(this.list, this.renderedEditors);
		this.webview = this.instantiationService.createInstance(BackLayerWebView, this);
		this._register(this.webview.onMessage(message => {
			if (this.viewModel) {
				this.notebookService.onDidReceiveMessage(this.viewModel.viewType, this.viewModel.uri, message);
			}
		}));
		this.list.rowsContainer.appendChild(this.webview.element);

		this._register(this.list);

		// transparent cover
		this.webviewTransparentCover = DOM.append(this.list.rowsContainer, $('.webview-cover'));
		this.webviewTransparentCover.style.display = 'none';

		this._register(DOM.addStandardDisposableGenericMouseDownListner(this.rootElement, (e: StandardMouseEvent) => {
			if (DOM.hasClass(e.target, 'slider') && this.webviewTransparentCover) {
				this.webviewTransparentCover.style.display = 'block';
			}
		}));

		this._register(DOM.addStandardDisposableGenericMouseUpListner(this.rootElement, (e: StandardMouseEvent) => {
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

	}

	getControl() {
		return this.control;
	}

	getInnerWebview(): Webview | undefined {
		return this.webview?.webview;
	}

	onHide() {
		this.editorFocus?.set(false);
		if (this.webview) {
			this.localStore.clear();
			this.list?.rowsContainer.removeChild(this.webview?.element);
			this.webview?.dispose();
			this.webview = null;
		}

		this.list?.clear();
		super.onHide();
	}

	setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);
		this.groupListener.value = ((group as IEditorGroupView).onWillCloseEditor(e => this.onWillCloseEditorInGroup(e)));
	}

	private onWillCloseEditorInGroup(e: IEditorCloseEvent): void {
		const editor = e.editor;
		if (!(editor instanceof NotebookEditorInput)) {
			return; // only handle files
		}

		if (editor === this.input) {
			this.saveTextEditorViewState(editor);
		}
	}

	focus() {
		super.focus();
		this.editorFocus?.set(true);
	}

	async setInput(input: NotebookEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (this.input instanceof NotebookEditorInput) {
			this.saveTextEditorViewState(this.input);
		}

		await super.setInput(input, options, token);
		const model = await input.resolve();

		if (this.notebookViewModel === undefined || !this.notebookViewModel.equal(model) || this.webview === null) {
			this.detachModel();
			await this.attachModel(input, model);
		}

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
					}
					if (!cellOptions.options?.preserveFocus) {
						editor.focus();
					}
				}
			}
		}
	}

	clearInput(): void {
		if (this.input && this.input instanceof NotebookEditorInput && !this.input.isDisposed()) {
			this.saveTextEditorViewState(this.input);
		}

		super.clearInput();
	}

	private detachModel() {
		this.localStore.clear();
		this.list?.detachViewModel();
		this.notebookViewModel?.dispose();
		this.notebookViewModel = undefined;
		this.webview?.clearInsets();
		this.webview?.clearPreloadsCache();
		this.findWidget.clear();
		this.list?.clear();
	}

	private async attachModel(input: NotebookEditorInput, model: NotebookEditorModel) {
		if (!this.webview) {
			this.webview = this.instantiationService.createInstance(BackLayerWebView, this);
			this.list?.rowsContainer.insertAdjacentElement('afterbegin', this.webview!.element);
		}

		this.eventDispatcher = new NotebookEventDispatcher();
		this.notebookViewModel = this.instantiationService.createInstance(NotebookViewModel, input.viewType!, model, this.eventDispatcher, this.getLayoutInfo());
		this.editorEditable?.set(!!this.notebookViewModel.metadata?.editable);
		this.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
		const viewState = this.loadTextEditorViewState(input);
		this.notebookViewModel.restoreEditorViewState(viewState);

		this.localStore.add(this.eventDispatcher.onDidChangeMetadata((e) => {
			this.editorEditable?.set(e.source.editable);
		}));

		this.localStore.add(this.instantiationService.createInstance(FoldingController, this));

		this.webview?.updateRendererPreloads(this.notebookViewModel.renderers);

		this.localStore.add(this.list!.onWillScroll(e => {
			this.webview!.updateViewScrollTop(-e.scrollTop, []);
			this.webviewTransparentCover!.style.top = `${e.scrollTop}px`;
		}));

		this.localStore.add(this.list!.onDidChangeContentHeight(() => {
			const scrollTop = this.list?.scrollTop || 0;
			const scrollHeight = this.list?.scrollHeight || 0;
			this.webview!.element.style.height = `${scrollHeight}px`;
			let updateItems: { cell: CodeCellViewModel, output: IOutput, cellTop: number }[] = [];

			if (this.webview?.insetMapping) {
				this.webview?.insetMapping.forEach((value, key) => {
					const cell = value.cell;
					const cellTop = this.list?.getAbsoluteTopOfElement(cell) || 0;
					if (this.webview!.shouldUpdateInset(cell, key, cellTop)) {
						updateItems.push({
							cell: cell,
							output: key,
							cellTop: cellTop
						});
					}
				});

				if (updateItems.length) {
					this.webview?.updateViewScrollTop(-scrollTop, updateItems);
				}
			}
		}));

		this.list!.attachViewModel(this.notebookViewModel);
		this.localStore.add(this.list!.onDidRemoveOutput(output => {
			this.removeInset(output);
		}));

		this.list!.layout();

		if (viewState?.scrollPosition !== undefined) {
			this.list!.scrollTop = viewState!.scrollPosition.top;
			this.list!.scrollLeft = viewState!.scrollPosition.left;
		} else {
			this.list!.scrollTop = 0;
			this.list!.scrollLeft = 0;
		}
	}

	private saveTextEditorViewState(input: NotebookEditorInput): void {
		if (this.group && this.notebookViewModel) {
			const state = this.notebookViewModel.saveEditorViewState();
			if (this.list) {
				state.scrollPosition = { left: this.list.scrollLeft, top: this.list.scrollTop };
				let cellHeights: { [key: number]: number } = {};
				for (let i = 0; i < this.viewModel!.viewCells.length; i++) {
					const elm = this.viewModel!.viewCells[i] as CellViewModel;
					if (elm.cellKind === CellKind.Code) {
						cellHeights[i] = elm.layoutInfo.totalHeight;
					} else {
						cellHeights[i] = 0;
					}
				}

				state.cellTotalHeights = cellHeights;
			}

			this.editorMemento.saveEditorState(this.group, input.resource, state);
		}
	}

	private loadTextEditorViewState(input: NotebookEditorInput): INotebookEditorViewState | undefined {
		if (this.group) {
			return this.editorMemento.loadEditorState(this.group, input.resource);
		}

		return;
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = new DOM.Dimension(dimension.width, dimension.height);
		DOM.toggleClass(this.rootElement, 'mid-width', dimension.width < 1000 && dimension.width >= 600);
		DOM.toggleClass(this.rootElement, 'narrow-width', dimension.width < 600);
		DOM.size(this.body, dimension.width, dimension.height);
		this.list?.updateOptions({ additionalScrollHeight: dimension.height });
		this.list?.layout(dimension.height, dimension.width);

		if (this.webviewTransparentCover) {
			this.webviewTransparentCover.style.height = `${dimension.height}px`;
			this.webviewTransparentCover.style.width = `${dimension.width}px`;
		}

		this.eventDispatcher?.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
	}

	protected saveState(): void {
		if (this.input instanceof NotebookEditorInput) {
			this.saveTextEditorViewState(this.input);
		}

		super.saveState();
	}

	//#endregion

	//#region Editor Features

	selectElement(cell: ICellViewModel) {
		this.list?.selectElement(cell);
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

	revealLineInView(cell: ICellViewModel, line: number): void {
		this.list?.revealElementLineInView(cell, line);
	}

	revealLineInCenter(cell: ICellViewModel, line: number) {
		this.list?.revealElementLineInCenter(cell, line);
	}

	revealLineInCenterIfOutsideViewport(cell: ICellViewModel, line: number) {
		this.list?.revealElementLineInCenterIfOutsideViewport(cell, line);
	}

	revealRangeInView(cell: ICellViewModel, range: Range): void {
		this.list?.revealElementRangeInView(cell, range);
	}

	revealRangeInCenter(cell: ICellViewModel, range: Range): void {
		this.list?.revealElementRangeInCenter(cell, range);
	}

	revealRangeInCenterIfOutsideViewport(cell: ICellViewModel, range: Range): void {
		this.list?.revealElementRangeInCenterIfOutsideViewport(cell, range);
	}

	setCellSelection(cell: ICellViewModel, range: Range): void {
		this.list?.setCellSelection(cell, range);
	}

	changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any {
		return this.notebookViewModel?.changeDecorations(callback);
	}

	setHiddenAreas(_ranges: ICellRange[]): boolean {
		return this.list!.setHiddenAreas(_ranges);
	}

	//#endregion

	//#region Find Delegate

	public showFind() {
		this.findWidget.reveal();
	}

	public hideFind() {
		this.findWidget.hide();
		this.focus();
	}

	//#endregion

	//#region Mouse Events
	private readonly _onMouseUp: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseUp: Event<INotebookEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<INotebookEditorMouseEvent> = this._register(new Emitter<INotebookEditorMouseEvent>());
	public readonly onMouseDown: Event<INotebookEditorMouseEvent> = this._onMouseDown.event;

	//#endregion

	//#region Cell operations
	async layoutNotebookCell(cell: ICellViewModel, height: number): Promise<void> {
		let relayout = (cell: ICellViewModel, height: number) => {
			this.list?.updateElementHeight2(cell, height);
		};

		let r: () => void;
		DOM.scheduleAtNextAnimationFrame(() => {
			relayout(cell, height);
			r();
		});

		return new Promise(resolve => { r = resolve; });
	}

	async insertNotebookCell(cell: ICellViewModel, type: CellKind, direction: 'above' | 'below', initialText: string = ''): Promise<void> {
		const newLanguages = this.notebookViewModel!.languages;
		const language = newLanguages && newLanguages.length ? newLanguages[0] : 'markdown';
		const index = this.notebookViewModel!.getCellIndex(cell);
		const insertIndex = direction === 'above' ? index : index + 1;
		const newCell = this.notebookViewModel!.createCell(insertIndex, initialText.split(/\r?\n/g), language, type, true);
		this.list?.focusElement(newCell);

		if (type === CellKind.Markdown) {
			newCell.editState = CellEditState.Editing;
		}

		let r: () => void;
		DOM.scheduleAtNextAnimationFrame(() => {
			this.list?.revealElementInCenterIfOutsideViewport(cell);
			r();
		});

		return new Promise(resolve => { r = resolve; });
	}

	async deleteNotebookCell(cell: ICellViewModel): Promise<void> {
		(cell as CellViewModel).save();
		const index = this.notebookViewModel!.getCellIndex(cell);
		this.notebookViewModel!.deleteCell(index, true);
	}

	async moveCellDown(cell: ICellViewModel): Promise<void> {
		const index = this.notebookViewModel!.getCellIndex(cell);
		if (index === this.notebookViewModel!.viewCells.length - 1) {
			return;
		}

		const newIdx = index + 1;
		return this.moveCellToIndex(index, newIdx);
	}

	async moveCellUp(cell: ICellViewModel): Promise<void> {
		const index = this.notebookViewModel!.getCellIndex(cell);
		if (index === 0) {
			return;
		}

		const newIdx = index - 1;
		return this.moveCellToIndex(index, newIdx);
	}

	private async moveCellToIndex(index: number, newIdx: number): Promise<void> {
		if (!this.notebookViewModel!.moveCellToIdx(index, newIdx, true)) {
			return;
		}

		let r: () => void;
		DOM.scheduleAtNextAnimationFrame(() => {
			this.list?.revealElementInCenterIfOutsideViewport(this.notebookViewModel!.viewCells[index + 1]);
			r();
		});

		return new Promise(resolve => { r = resolve; });
	}

	editNotebookCell(cell: CellViewModel): void {
		cell.editState = CellEditState.Editing;

		this.renderedEditors.get(cell)?.focus();
	}

	saveNotebookCell(cell: ICellViewModel): void {
		cell.editState = CellEditState.Preview;
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
		// return this.progressService.showWhile(this._executeNotebook());
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

			for (let cell of this.notebookViewModel!.viewCells) {
				if (cell.cellKind === CellKind.Code) {
					await this._executeNotebookCell(cell, tokenSource);
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
		const tokenSource = new CancellationTokenSource();
		try {
			this._executeNotebookCell(cell, tokenSource);
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
				const notebookUri = CellUri.parse(cell.uri)?.notebook;
				if (notebookUri) {
					return await this.notebookService.executeNotebookCell(viewType, notebookUri, cell.handle, tokenSource.token);
				}
			}
		} finally {
			cell.currentTokenSource = undefined;
		}
	}

	focusNotebookCell(cell: ICellViewModel, focusEditor: boolean) {
		if (focusEditor) {
			this.selectElement(cell);
			this.list?.focusView();

			cell.editState = CellEditState.Editing;
			cell.focusMode = CellFocusMode.Editor;
			this.revealInCenterIfOutsideViewport(cell);
		} else {
			let itemDOM = this.list?.domElementOfElement(cell);
			if (document.activeElement && itemDOM && itemDOM.contains(document.activeElement)) {
				(document.activeElement as HTMLElement).blur();
			}

			cell.editState = CellEditState.Preview;
			cell.focusMode = CellFocusMode.Editor;

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

	createInset(cell: CodeCellViewModel, output: IOutput, shadowContent: string, offset: number) {
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

	removeInset(output: IOutput) {
		if (!this.webview) {
			return;
		}

		this.webview!.removeInset(output);
	}

	getOutputRenderer(): OutputRenderer {
		return this.outputRenderer;
	}

	postMessage(message: any) {
		this.webview?.webview.sendMessage(message);
	}

	//#endregion

	toJSON(): any {
		return {
			notebookHandle: this.viewModel?.handle
		};
	}
}

const embeddedEditorBackground = 'walkThrough.embeddedEditorBackground';

export const focusedCellIndicator = registerColor('notebook.focusedCellIndicator', {
	light: new Color(new RGBA(102, 175, 224)),
	dark: new Color(new RGBA(12, 125, 157)),
	hc: new Color(new RGBA(0, 73, 122))
}, nls.localize('notebook.focusedCellIndicator', "The color of the focused notebook cell indicator."));

export const notebookOutputContainerColor = registerColor('notebook.outputContainerBackgroundColor', {
	dark: new Color(new RGBA(255, 255, 255, 0.06)),
	light: new Color(new RGBA(228, 230, 241)),
	hc: null
}
	, nls.localize('notebook.outputContainerBackgroundColor', "The Color of the notebook output container background."));

// TODO currently also used for toolbar border, if we keep all of this, pick a generic name
export const CELL_TOOLBAR_SEPERATOR = registerColor('notebook.cellToolbarSeperator', {
	dark: Color.fromHex('#808080').transparent(0.35),
	light: Color.fromHex('#808080').transparent(0.35),
	hc: contrastBorder
}, nls.localize('cellToolbarSeperator', "The color of seperator in Cell bottom toolbar"));


registerThemingParticipant((theme, collector) => {
	const color = getExtraColor(theme, embeddedEditorBackground, { dark: 'rgba(0, 0, 0, .4)', extra_dark: 'rgba(200, 235, 255, .064)', light: '#f4f4f4', hc: null });
	if (color) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .monaco-editor-background,
			.monaco-workbench .part.editor > .content .notebook-editor .cell .margin-view-overlays,
			.monaco-workbench .part.editor > .content .notebook-editor .cell .cell-statusbar-container { background: ${color}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .output a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .output a:hover,
			.monaco-workbench .part.editor > .content .notebook-editor .cell .output a:active { color: ${activeLink}; }`);
	}
	const shortcut = theme.getColor(textPreformatForeground);
	if (shortcut) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor code,
			.monaco-workbench .part.editor > .content .notebook-editor .shortcut { color: ${shortcut}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-editor { border-color: ${border}; }`);
	}
	const quoteBackground = theme.getColor(textBlockQuoteBackground);
	if (quoteBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { background: ${quoteBackground}; }`);
	}
	const quoteBorder = theme.getColor(textBlockQuoteBorder);
	if (quoteBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor blockquote { border-color: ${quoteBorder}; }`);
	}

	const containerBackground = theme.getColor(notebookOutputContainerColor);
	if (containerBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .output { background-color: ${containerBackground}; }`);
	}

	const editorBackgroundColor = theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-statusbar-container { border-top: solid 1px ${editorBackgroundColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-list-row > .monaco-toolbar { background-color: ${editorBackgroundColor}; }`);
	}

	const focusedCellIndicatorColor = theme.getColor(focusedCellIndicator);
	if (focusedCellIndicatorColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-list-row.focused .notebook-cell-focus-indicator { border-color: ${focusedCellIndicatorColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-list-row.selected .notebook-cell-focus-indicator { border-color: ${focusedCellIndicatorColor}; }`);
	}

	const cellToolbarSeperator = theme.getColor(CELL_TOOLBAR_SEPERATOR);
	if (cellToolbarSeperator) {
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-bottom-toolbar-container .seperator { background-color: ${cellToolbarSeperator} }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-bottom-toolbar-container .seperator-short { background-color: ${cellToolbarSeperator} }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .monaco-list-row > .monaco-toolbar { border: solid 1px ${cellToolbarSeperator}; }`);
	}

	// Cell Margin
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row  > div.cell { margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN}px; }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row { padding-top: ${EDITOR_TOP_MARGIN}px; }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .output { margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN + CELL_RUN_GUTTER}px }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-bottom-toolbar-container { width: calc(100% - ${CELL_MARGIN * 2 + CELL_RUN_GUTTER}px); margin: 0px ${CELL_MARGIN}px 0px ${CELL_MARGIN + CELL_RUN_GUTTER}px }`);

	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .cell-editor-container { width: calc(100% - ${CELL_RUN_GUTTER}px); }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .markdown-editor-container { margin-left: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row  > div.cell.markdown { padding-left: ${CELL_RUN_GUTTER}px; }`);
	collector.addRule(`.monaco-workbench .part.editor > .content .notebook-editor .cell .run-button-container { width: ${CELL_RUN_GUTTER}px; }`);
});
