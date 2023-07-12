/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { VSBuffer } from 'vs/base/common/buffer';
import { NotImplementedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { TestClipboardService } from 'vs/platform/clipboard/test/common/testClipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { CellFindMatchWithIndex, IActiveNotebookEditorDelegate, IBaseCellEditorOptions, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellStateChangedEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { NotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/browser/services/notebookCellStatusBarServiceImpl';
import { ListViewInfoAccessor, NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { BaseCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { NotebookEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { ViewContext } from 'vs/workbench/contrib/notebook/browser/viewModel/viewContext';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { CellKind, CellUri, ICellDto2, INotebookDiffEditorModel, INotebookEditorModel, INotebookSearchOptions, IOutputDto, IResolvedNotebookEditorModel, NotebookCellExecutionState, NotebookCellMetadata, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellExecuteUpdate, ICellExecutionComplete, ICellExecutionStateChangedEvent, IExecutionStateChangedEvent, INotebookCellExecution, INotebookExecution, INotebookExecutionStateService, INotebookFailStateChangedEvent } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { TestWorkspaceTrustRequestService } from 'vs/workbench/services/workspaces/test/common/testWorkspaceTrustService';
import { TestLayoutService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

export class TestCell extends NotebookCellTextModel {
	constructor(
		public viewType: string,
		handle: number,
		public source: string,
		language: string,
		cellKind: CellKind,
		outputs: IOutputDto[],
		languageService: ILanguageService,
	) {
		super(CellUri.generate(URI.parse('test:///fake/notebook'), handle), handle, source, language, Mimes.text, cellKind, outputs, undefined, undefined, undefined, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} }, languageService);
	}
}

export class NotebookEditorTestModel extends EditorModel implements INotebookEditorModel {
	private _dirty = false;

	protected readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	readonly onDidChangeOrphaned = Event.None;
	readonly onDidChangeReadonly = Event.None;
	readonly onDidRevertUntitled = Event.None;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;


	get viewType() {
		return this._notebook.viewType;
	}

	get resource() {
		return this._notebook.uri;
	}

	get notebook(): NotebookTextModel {
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

	isReadonly(): boolean {
		return false;
	}

	isOrphaned(): boolean {
		return false;
	}

	hasAssociatedFilePath(): boolean {
		return false;
	}

	isDirty() {
		return this._dirty;
	}

	isModified(): boolean {
		return this._dirty;
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
			this._onDidSave.fire({});
			// todo, flush all states
			return true;
		}

		return false;
	}

	saveAs(): Promise<EditorInput | undefined> {
		throw new NotImplementedError();
	}

	revert(): Promise<void> {
		throw new NotImplementedError();
	}
}

export function setupInstantiationService(disposables = new DisposableStore()) {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(ILanguageService, disposables.add(new LanguageService()));
	instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IThemeService, new TestThemeService());
	instantiationService.stub(ILanguageConfigurationService, new TestLanguageConfigurationService());
	instantiationService.stub(IModelService, instantiationService.createInstance(ModelService));
	instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
	instantiationService.stub(IContextKeyService, instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IListService, instantiationService.createInstance(ListService));
	instantiationService.stub(ILayoutService, new TestLayoutService());
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IClipboardService, TestClipboardService);
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IWorkspaceTrustRequestService, new TestWorkspaceTrustRequestService(true));
	instantiationService.stub(INotebookExecutionStateService, new TestNotebookExecutionStateService());
	instantiationService.stub(IKeybindingService, new MockKeybindingService());
	instantiationService.stub(INotebookCellStatusBarService, new NotebookCellStatusBarService());

	return instantiationService;
}

function _createTestNotebookEditor(instantiationService: TestInstantiationService, cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][]): { editor: IActiveNotebookEditorDelegate; viewModel: NotebookViewModel } {

	const viewType = 'notebook';
	const notebook = instantiationService.createInstance(NotebookTextModel, viewType, URI.parse('test'), cells.map((cell): ICellDto2 => {
		return {
			source: cell[0],
			mime: undefined,
			language: cell[1],
			cellKind: cell[2],
			outputs: cell[3] ?? [],
			metadata: cell[4]
		};
	}), {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false });

	const model = new NotebookEditorTestModel(notebook);
	const notebookOptions = new NotebookOptions(instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), false);
	const viewContext = new ViewContext(notebookOptions, new NotebookEventDispatcher(), () => ({} as IBaseCellEditorOptions));
	const viewModel: NotebookViewModel = instantiationService.createInstance(NotebookViewModel, viewType, model.notebook, viewContext, null, { isReadOnly: false });

	const cellList = createNotebookCellList(instantiationService, viewContext);
	cellList.attachViewModel(viewModel);
	const listViewInfoAccessor = new ListViewInfoAccessor(cellList);

	const notebookEditor: IActiveNotebookEditorDelegate = new class extends mock<IActiveNotebookEditorDelegate>() {
		override dispose() {
			viewModel.dispose();
		}
		override notebookOptions = notebookOptions;
		override onDidChangeModel: Event<NotebookTextModel | undefined> = new Emitter<NotebookTextModel | undefined>().event;
		override onDidChangeCellState: Event<NotebookCellStateChangedEvent> = new Emitter<NotebookCellStateChangedEvent>().event;
		override _getViewModel(): NotebookViewModel {
			return viewModel;
		}
		override textModel = viewModel.notebookDocument;
		override hasModel(): this is IActiveNotebookEditorDelegate {
			return !!viewModel;
		}
		override getLength() { return viewModel.length; }
		override getFocus() { return viewModel.getFocus(); }
		override getSelections() { return viewModel.getSelections(); }
		override setFocus(focus: ICellRange) {
			viewModel.updateSelectionsState({
				kind: SelectionStateType.Index,
				focus: focus,
				selections: viewModel.getSelections()
			});
		}
		override setSelections(selections: ICellRange[]) {
			viewModel.updateSelectionsState({
				kind: SelectionStateType.Index,
				focus: viewModel.getFocus(),
				selections: selections
			});
		}
		override getViewIndexByModelIndex(index: number) { return listViewInfoAccessor.getViewIndex(viewModel.viewCells[index]); }
		override getCellRangeFromViewRange(startIndex: number, endIndex: number) { return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex); }
		override revealCellRangeInView() { }
		override setHiddenAreas(_ranges: ICellRange[]): boolean {
			return cellList.setHiddenAreas(_ranges, true);
		}
		override getActiveCell() {
			const elements = cellList.getFocusedElements();

			if (elements && elements.length) {
				return elements[0];
			}

			return undefined;
		}
		override hasOutputTextSelection() {
			return false;
		}
		override changeModelDecorations() { return null; }
		override focusElement() { }
		override setCellEditorSelection() { }
		override async revealRangeInCenterIfOutsideViewportAsync() { }
		override async layoutNotebookCell() { }
		override async removeInset() { }
		override async focusNotebookCell() { }
		override cellAt(index: number) { return viewModel.cellAt(index)!; }
		override getCellIndex(cell: ICellViewModel) { return viewModel.getCellIndex(cell); }
		override getCellsInRange(range?: ICellRange) { return viewModel.getCellsInRange(range); }
		override getCellByHandle(handle: number) { return viewModel.getCellByHandle(handle); }
		override getNextVisibleCellIndex(index: number) { return viewModel.getNextVisibleCellIndex(index); }
		getControl() { return this; }
		override get onDidChangeSelection() { return viewModel.onDidChangeSelection as Event<any>; }
		override get onDidChangeOptions() { return viewModel.onDidChangeOptions; }
		override get onDidChangeViewCells() { return viewModel.onDidChangeViewCells; }
		override async find(query: string, options: INotebookSearchOptions): Promise<CellFindMatchWithIndex[]> {
			const findMatches = viewModel.find(query, options).filter(match => match.length > 0);
			return findMatches;
		}
		override deltaCellDecorations() { return []; }
		override onDidChangeVisibleRanges = Event.None;
		override visibleRanges: ICellRange[] = [{ start: 0, end: 100 }];
		override getId(): string { return ''; }
	};

	return { editor: notebookEditor, viewModel };
}

export function createTestNotebookEditor(instantiationService: TestInstantiationService, cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][]): { editor: INotebookEditorDelegate; viewModel: NotebookViewModel } {
	return _createTestNotebookEditor(instantiationService, cells);
}

export async function withTestNotebookDiffModel<R = any>(originalCells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], modifiedCells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], callback: (diffModel: INotebookDiffEditorModel, accessor: TestInstantiationService) => Promise<R> | R): Promise<R> {
	const disposables = new DisposableStore();
	const instantiationService = setupInstantiationService(disposables);
	const originalNotebook = createTestNotebookEditor(instantiationService, originalCells);
	const modifiedNotebook = createTestNotebookEditor(instantiationService, modifiedCells);
	const originalResource = new class extends mock<IResolvedNotebookEditorModel>() {
		override get notebook() {
			return originalNotebook.viewModel.notebookDocument;
		}
	};

	const modifiedResource = new class extends mock<IResolvedNotebookEditorModel>() {
		override get notebook() {
			return modifiedNotebook.viewModel.notebookDocument;
		}
	};

	const model = new class extends mock<INotebookDiffEditorModel>() {
		override get original() {
			return originalResource;
		}
		override get modified() {
			return modifiedResource;
		}
	};

	const res = await callback(model, instantiationService);
	if (res instanceof Promise) {
		res.finally(() => {
			originalNotebook.editor.dispose();
			originalNotebook.viewModel.dispose();
			modifiedNotebook.editor.dispose();
			modifiedNotebook.viewModel.dispose();
			disposables.dispose();
		});
	} else {
		originalNotebook.editor.dispose();
		originalNotebook.viewModel.dispose();
		modifiedNotebook.editor.dispose();
		modifiedNotebook.viewModel.dispose();
		disposables.dispose();
	}
	return res;
}

export async function withTestNotebook<R = any>(cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], callback: (editor: IActiveNotebookEditorDelegate, viewModel: NotebookViewModel, accessor: TestInstantiationService) => Promise<R> | R, accessor?: TestInstantiationService): Promise<R> {
	const disposables = new DisposableStore();
	const instantiationService = accessor ?? setupInstantiationService(disposables);
	const notebookEditor = _createTestNotebookEditor(instantiationService, cells);

	return runWithFakedTimers({ useFakeTimers: true }, async () => {
		const res = await callback(notebookEditor.editor, notebookEditor.viewModel, instantiationService);
		if (res instanceof Promise) {
			res.finally(() => {
				notebookEditor.editor.dispose();
				notebookEditor.viewModel.dispose();
				disposables.dispose();
			});
		} else {
			notebookEditor.editor.dispose();
			notebookEditor.viewModel.dispose();
			disposables.dispose();
		}
		return res;
	});
}

export function createNotebookCellList(instantiationService: TestInstantiationService, viewContext?: ViewContext) {
	const delegate: IListVirtualDelegate<CellViewModel> = {
		getHeight(element: CellViewModel) { return element.getHeight(17); },
		getTemplateId() { return 'template'; }
	};

	const renderer: IListRenderer<CellViewModel, BaseCellRenderTemplate> = {
		templateId: 'template',
		renderTemplate() { return {} as BaseCellRenderTemplate; },
		renderElement() { },
		disposeTemplate() { }
	};

	const cellList: NotebookCellList = instantiationService.createInstance(
		NotebookCellList,
		'NotebookCellList',
		DOM.$('container'),
		viewContext ?? new ViewContext(new NotebookOptions(instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), false), new NotebookEventDispatcher(), () => ({} as IBaseCellEditorOptions)),
		delegate,
		[renderer],
		instantiationService.get<IContextKeyService>(IContextKeyService),
		{
			supportDynamicHeights: true,
			multipleSelectionSupport: true,
		}
	);

	return cellList;
}

export function valueBytesFromString(value: string): VSBuffer {
	return VSBuffer.fromString(value);
}

class TestCellExecution implements INotebookCellExecution {
	constructor(
		readonly notebook: URI,
		readonly cellHandle: number,
		private onComplete: () => void,
	) { }

	readonly state: NotebookCellExecutionState = NotebookCellExecutionState.Unconfirmed;

	readonly didPause: boolean = false;
	readonly isPaused: boolean = false;

	confirm(): void {
	}

	update(updates: ICellExecuteUpdate[]): void {
	}

	complete(complete: ICellExecutionComplete): void {
		this.onComplete();
	}
}

class TestNotebookExecutionStateService implements INotebookExecutionStateService {
	_serviceBrand: undefined;

	private _executions = new ResourceMap<INotebookCellExecution>();

	onDidChangeExecution = new Emitter<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>().event;
	onDidChangeLastRunFailState = new Emitter<INotebookFailStateChangedEvent>().event;

	forceCancelNotebookExecutions(notebookUri: URI): void {
	}

	getCellExecutionsForNotebook(notebook: URI): INotebookCellExecution[] {
		return [];
	}

	getCellExecution(cellUri: URI): INotebookCellExecution | undefined {
		return this._executions.get(cellUri);
	}

	createCellExecution(notebook: URI, cellHandle: number): INotebookCellExecution {
		const onComplete = () => this._executions.delete(CellUri.generate(notebook, cellHandle));
		const exe = new TestCellExecution(notebook, cellHandle, onComplete);
		this._executions.set(CellUri.generate(notebook, cellHandle), exe);
		return exe;
	}

	getCellExecutionsByHandleForNotebook(notebook: URI): Map<number, INotebookCellExecution> | undefined {
		return;
	}

	getLastFailedCellForNotebook(notebook: URI): number | undefined {
		return;
	}
	getExecution(notebook: URI): INotebookExecution | undefined {
		return;
	}
	createExecution(notebook: URI): INotebookExecution {
		throw new Error('Method not implemented.');
	}
}
