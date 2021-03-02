/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { NotImplementedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { ICompositeCodeEditor, IEditor } from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { EditorModel } from 'vs/workbench/common/editor';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution, INotebookEditorMouseEvent, NotebookLayoutInfo, INotebookDeltaDecoration, INotebookEditorCreationOptions, NotebookEditorOptions, ICellOutputViewModel, IInsetRenderOutput, ICommonCellInfo, IGenericCellViewModel, INotebookCellOutputLayoutInfo, CellEditState, IActiveNotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { NotebookEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, IModelDecorationsChangeAccessor, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, CellUri, ICellRange, INotebookEditorModel, INotebookKernel, IOutputDto, IResolvedNotebookEditorModel, NotebookCellMetadata, notebookDocumentMetadataDefaults } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Webview } from 'vs/workbench/contrib/webview/browser/webview';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';

export class TestCell extends NotebookCellTextModel {
	constructor(
		public viewType: string,
		handle: number,
		public source: string,
		language: string,
		cellKind: CellKind,
		outputs: IOutputDto[],
		modelService: ITextModelService
	) {
		super(CellUri.generate(URI.parse('test:///fake/notebook'), handle), handle, source, language, cellKind, outputs, undefined, { transientMetadata: {}, transientOutputs: false }, modelService);
	}
}

export class TestNotebookEditor implements INotebookEditor {
	isEmbedded = false;
	private _isDisposed = false;

	get isDisposed() {
		return this._isDisposed;
	}

	creationOptions: INotebookEditorCreationOptions = { isEmbedded: false };

	constructor(readonly viewModel: NotebookViewModel) { }

	getSelection(): ICellRange | undefined {
		throw new Error('Method not implemented.');
	}
	getSelections(): ICellRange[] {
		throw new Error('Method not implemented.');
	}
	getSelectionViewModels(): ICellViewModel[] {
		throw new Error('Method not implemented.');
	}
	revealCellRangeInView(range: ICellRange): void {
		throw new Error('Method not implemented.');
	}
	revealInViewAtTop(cell: ICellViewModel): void {
		throw new Error('Method not implemented.');
	}
	getCellOutputLayoutInfo(cell: IGenericCellViewModel): INotebookCellOutputLayoutInfo {
		throw new Error('Method not implemented.');
	}
	focusNextNotebookCell(cell: ICellViewModel, focus: 'editor' | 'container' | 'output'): void {
		throw new Error('Method not implemented.');
	}
	getCellByInfo(cellInfo: ICommonCellInfo): ICellViewModel {
		throw new Error('Method not implemented.');
	}
	getCellById(cellId: string): ICellViewModel {
		throw new Error('Method not implemented.');
	}
	updateOutputHeight(cellInfo: ICommonCellInfo, output: ICellOutputViewModel, height: number, isInit: boolean): void {
		throw new Error('Method not implemented.');
	}

	setMarkdownCellEditState(cellId: string, editState: CellEditState): void {
		throw new Error('Method not implemented.');
	}
	markdownCellDragStart(cellId: string, position: { clientY: number }): void {
		throw new Error('Method not implemented.');
	}
	markdownCellDrag(cellId: string, position: { clientY: number }): void {
		throw new Error('Method not implemented.');
	}
	markdownCellDragEnd(cellId: string, position: { clientY: number }): void {
		throw new Error('Method not implemented.');
	}
	async beginComputeContributedKernels(): Promise<INotebookKernel[]> {
		return [];
	}
	setEditorDecorations(key: string, range: ICellRange): void {
		// throw new Error('Method not implemented.');
	}
	removeEditorDecorations(key: string): void {
		// throw new Error('Method not implemented.');
	}
	setOptions(options: NotebookEditorOptions | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}

	hideInset(output: ICellOutputViewModel): void {
		throw new Error('Method not implemented.');
	}

	multipleKernelsAvailable: boolean = false;
	onDidChangeAvailableKernels: Event<void> = new Emitter<void>().event;
	onDidChangeActiveCell: Event<void> = new Emitter<void>().event;
	onDidChangeVisibleRanges: Event<void> = new Emitter<void>().event;
	onDidChangeSelection: Event<void> = new Emitter<void>().event;
	visibleRanges: ICellRange[] = [];
	textModel?: NotebookTextModel | undefined;

	hasModel(): this is IActiveNotebookEditor {
		return true;
	}

	onDidFocusEditorWidget: Event<void> = new Emitter<void>().event;
	hasFocus(): boolean {
		return true;
	}

	hasWebviewFocus() {
		return false;
	}

	hasOutputTextSelection() {
		return false;
	}

	getId(): string {
		return 'notebook.testEditor';
	}

	cursorNavigationMode = false;
	activeKernel: INotebookKernel | undefined;
	onDidChangeKernel: Event<void> = new Emitter<void>().event;
	onDidChangeActiveEditor: Event<ICompositeCodeEditor> = new Emitter<ICompositeCodeEditor>().event;
	activeCodeEditor: IEditor | undefined;
	getDomNode(): HTMLElement {
		throw new Error('Method not implemented.');
	}

	getOverflowContainerDomNode(): HTMLElement {
		throw new Error('Method not implemented.');
	}

	private _onDidChangeModel = new Emitter<NotebookTextModel | undefined>();
	onDidChangeModel: Event<NotebookTextModel | undefined> = this._onDidChangeModel.event;
	getContribution<T extends INotebookEditorContribution>(id: string): T {
		throw new Error('Method not implemented.');
	}
	onMouseUp(listener: (e: INotebookEditorMouseEvent) => void): IDisposable {
		throw new Error('Method not implemented.');
	}
	onMouseDown(listener: (e: INotebookEditorMouseEvent) => void): IDisposable {
		throw new Error('Method not implemented.');
	}

	setHiddenAreas(_ranges: ICellRange[]): boolean {
		throw new Error('Method not implemented.');
	}

	getInnerWebview(): Webview | undefined {
		throw new Error('Method not implemented.');
	}

	cancelNotebookCellExecution(cell: ICellViewModel): void {
		throw new Error('Method not implemented.');
	}

	executeNotebook(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	cancelNotebookExecution(): void {
		throw new Error('Method not implemented.');
	}

	executeNotebookCell(cell: ICellViewModel): Promise<void> {
		throw new Error('Method not implemented.');
	}

	postMessage(): void {
		throw new Error('Method not implemented.');
	}

	addClassName(className: string): void {
		throw new Error('Method not implemented.');
	}

	removeClassName(className: string): void {
		throw new Error('Method not implemented.');
	}

	setCellEditorSelection(cell: CellViewModel, selection: Range): void {
		throw new Error('Method not implemented.');
	}

	focusElement(cell: CellViewModel): void {
		throw new Error('Method not implemented.');
	}

	moveCellDown(cell: CellViewModel): Promise<ICellViewModel | null> {
		throw new Error('Method not implemented.');
	}

	moveCellUp(cell: CellViewModel): Promise<ICellViewModel | null> {
		throw new Error('Method not implemented.');
	}

	async moveCellsToIdx(index: number, length: number, toIdx: number): Promise<ICellViewModel | null> {
		throw new Error('Method not implemented.');
	}

	splitNotebookCell(cell: ICellViewModel): Promise<CellViewModel[] | null> {
		throw new Error('Method not implemented.');
	}

	joinNotebookCells(cell: ICellViewModel, direction: 'above' | 'below', constraint?: CellKind): Promise<ICellViewModel | null> {
		throw new Error('Method not implemented.');
	}

	setSelection(cell: CellViewModel, selection: Range): void {
		throw new Error('Method not implemented.');
	}
	revealRangeInViewAsync(cell: CellViewModel, range: Range): Promise<void> {
		throw new Error('Method not implemented.');
	}
	revealRangeInCenterAsync(cell: CellViewModel, range: Range): Promise<void> {
		throw new Error('Method not implemented.');
	}
	revealRangeInCenterIfOutsideViewportAsync(cell: CellViewModel, range: Range): Promise<void> {
		throw new Error('Method not implemented.');
	}

	revealLineInViewAsync(cell: CellViewModel, line: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getLayoutInfo(): NotebookLayoutInfo {
		throw new Error('Method not implemented.');
	}
	revealLineInCenterIfOutsideViewportAsync(cell: CellViewModel, line: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	revealLineInCenterAsync(cell: CellViewModel, line: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	focus(): void {
		throw new Error('Method not implemented.');
	}
	showFind(): void {
		throw new Error('Method not implemented.');
	}
	hideFind(): void {
		throw new Error('Method not implemented.');
	}
	revealInView(cell: CellViewModel): void {
		throw new Error('Method not implemented.');
	}
	revealInCenter(cell: CellViewModel): void {
		throw new Error('Method not implemented.');
	}
	revealInCenterIfOutsideViewport(cell: CellViewModel): void {
		throw new Error('Method not implemented.');
	}
	insertNotebookCell(cell: CellViewModel, type: CellKind, direction: 'above' | 'below'): CellViewModel {
		throw new Error('Method not implemented.');
	}
	deleteNotebookCell(cell: CellViewModel): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	focusNotebookCell(cell: CellViewModel, focusItem: 'editor' | 'container' | 'output'): void {
		// throw new Error('Method not implemented.');
	}
	getActiveCell(): CellViewModel | undefined {
		// throw new Error('Method not implemented.');
		return;
	}
	async layoutNotebookCell(cell: CellViewModel, height: number): Promise<void> {
		// throw new Error('Method not implemented.');
		return;
	}
	createInset(cell: CellViewModel, output: IInsetRenderOutput, offset: number): Promise<void> {
		return Promise.resolve();
	}
	createMarkdownPreview(cell: ICellViewModel): Promise<void> {
		return Promise.resolve();
	}
	async unhideMarkdownPreview(cell: ICellViewModel): Promise<void> {
		// noop
	}
	async hideMarkdownPreview(cell: ICellViewModel): Promise<void> {
		// noop
	}
	removeMarkdownPreview(cell: ICellViewModel): Promise<void> {
		return Promise.resolve();
	}
	updateMarkdownCellHeight(cellId: string, height: number, isInit: boolean): void {
		// noop
	}
	removeInset(output: ICellOutputViewModel): void {
		// throw new Error('Method not implemented.');
	}
	triggerScroll(event: IMouseWheelEvent): void {
		// throw new Error('Method not implemented.');
	}
	getFontInfo(): BareFontInfo | undefined {
		return BareFontInfo.createFromRawSettings({
			fontFamily: 'Monaco',
		}, 1, 1, true);
	}
	getOutputRenderer(): OutputRenderer {
		throw new Error('Method not implemented.');
	}

	changeModelDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T | null {
		throw new Error('Method not implemented.');
	}

	deltaCellDecorations(oldDecorations: string[], newDecorations: INotebookDeltaDecoration[]): string[] {
		throw new Error('Method not implemented.');
	}

	deltaCellOutputContainerClassNames(cellId: string, added: string[], removed: string[]): void {
		throw new Error('Method not implemented.');
	}

	dispose() {
		this._isDisposed = true;
	}
}

// export function createTestCellViewModel(instantiationService: IInstantiationService, viewType: string, notebookHandle: number, cellhandle: number, source: string[], language: string, cellKind: CellKind, outputs: IOutput[]) {
// 	const mockCell = new TestCell(viewType, cellhandle, source, language, cellKind, outputs);
// 	return createCellViewModel(instantiationService, viewType, notebookHandle, mockCell);
// }

export class NotebookEditorTestModel extends EditorModel implements INotebookEditorModel {
	private _dirty = false;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;


	get viewType() {
		return this._notebook.viewType;
	}

	get resource() {
		return this._notebook.uri;
	}

	get notebook() {
		return this._notebook;
	}

	constructor(
		private _notebook: NotebookTextModel
	) {
		super();

		if (_notebook && _notebook.onDidChangeContent) {
			this._register(_notebook.onDidChangeContent(() => {
				this._dirty = true;
				this._onDidChangeDirty.fire();
				this._onDidChangeContent.fire();
			}));
		}
	}
	lastResolvedFileStat: IFileStatWithMetadata | undefined;

	isDirty() {
		return this._dirty;
	}

	isUntitled() {
		return this._notebook.uri.scheme === Schemas.untitled;
	}

	getNotebook(): NotebookTextModel {
		return this._notebook;
	}

	async load(): Promise<IResolvedNotebookEditorModel> {
		return this;
	}

	async save(): Promise<boolean> {
		if (this._notebook) {
			this._dirty = false;
			this._onDidChangeDirty.fire();
			// todo, flush all states
			return true;
		}

		return false;
	}

	saveAs(): Promise<boolean> {
		throw new NotImplementedError();
	}

	revert(): Promise<void> {
		throw new NotImplementedError();
	}
}

export function setupInstantiationService() {
	const instantiationService = new TestInstantiationService();

	instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IThemeService, new TestThemeService());
	instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
	instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
	instantiationService.stub(IContextKeyService, instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IListService, instantiationService.createInstance(ListService));

	return instantiationService;
}

export function withTestNotebook<R = any>(accessor: ServicesAccessor, cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], callback: (editor: TestNotebookEditor, viewModel: NotebookViewModel, textModel: NotebookTextModel) => R): R {

	const instantiationService = accessor.get(IInstantiationService);
	const undoRedoService = accessor.get(IUndoRedoService);
	const textModelService = accessor.get(ITextModelService);
	const bulkEditService = accessor.get(IBulkEditService);

	const viewType = 'notebook';
	const notebook = new NotebookTextModel(viewType, URI.parse('test'), cells.map(cell => {
		return {
			source: cell[0],
			language: cell[1],
			cellKind: cell[2],
			outputs: cell[3] ?? [],
			metadata: cell[4]
		};
	}), notebookDocumentMetadataDefaults, { transientMetadata: {}, transientOutputs: false }, undoRedoService, textModelService);
	const model = new NotebookEditorTestModel(notebook);
	const eventDispatcher = new NotebookEventDispatcher();
	const viewModel = new NotebookViewModel(viewType, model.notebook, eventDispatcher, null, instantiationService, bulkEditService, undoRedoService);
	const editor = new TestNotebookEditor(viewModel);

	const res = callback(editor, viewModel, notebook);
	if (res instanceof Promise) {
		res.finally(() => viewModel.dispose());
	} else {
		viewModel.dispose();
	}
	return res;
}

export function createNotebookCellList(instantiationService: TestInstantiationService) {
	const delegate: IListVirtualDelegate<number> = {
		getHeight() { return 20; },
		getTemplateId() { return 'template'; }
	};

	const renderer: IListRenderer<number, void> = {
		templateId: 'template',
		renderTemplate() { },
		renderElement() { },
		disposeTemplate() { }
	};

	const cellList: NotebookCellList = instantiationService.createInstance(
		NotebookCellList,
		'NotebookCellList',
		DOM.$('container'),
		DOM.$('body'),
		delegate,
		[renderer],
		instantiationService.get<IContextKeyService>(IContextKeyService),
		{
			supportDynamicHeights: true,
			multipleSelectionSupport: true,
			enableKeyboardNavigation: true,
			focusNextPreviousDelegate: {
				onFocusNext: (applyFocusNext: () => void) => { applyFocusNext(); },
				onFocusPrevious: (applyFocusPrevious: () => void) => { applyFocusPrevious(); },
			}
		}
	);

	return cellList;
}
