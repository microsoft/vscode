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
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { EditorFontLigatures } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { ILanguageConfigurationService } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { NullCommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
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
import { IActiveNotebookEditorDelegate, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { ListViewInfoAccessor } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { OutputRenderer } from 'vs/workbench/contrib/notebook/browser/view/output/outputRenderer';
import { NotebookEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { ViewContext } from 'vs/workbench/contrib/notebook/browser/viewModel/viewContext';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, CellUri, INotebookDiffEditorModel, INotebookEditorModel, IOutputDto, IResolvedNotebookEditorModel, NotebookCellMetadata, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { TestWorkspaceTrustRequestService } from 'vs/workbench/services/workspaces/test/common/testWorkspaceTrustService';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

export class TestCell extends NotebookCellTextModel {
	constructor(
		public viewType: string,
		handle: number,
		public source: string,
		language: string,
		cellKind: CellKind,
		outputs: IOutputDto[],
		modeService: IModeService,
	) {
		super(CellUri.generate(URI.parse('test:///fake/notebook'), handle), handle, source, language, Mimes.text, cellKind, outputs, undefined, undefined, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false }, modeService);
	}
}

export class NotebookEditorTestModel extends EditorModel implements INotebookEditorModel {
	private _dirty = false;

	protected readonly _onDidSave = this._register(new Emitter<void>());
	readonly onDidSave = this._onDidSave.event;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	readonly onDidChangeOrphaned = Event.None;
	readonly onDidChangeReadonly = Event.None;

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
			this._onDidSave.fire();
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
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(IModeService, disposables.add(new ModeServiceImpl()));
	instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(IThemeService, new TestThemeService());
	instantiationService.stub(ILanguageConfigurationService, new TestLanguageConfigurationService());
	instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
	instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
	instantiationService.stub(IContextKeyService, instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IListService, instantiationService.createInstance(ListService));
	instantiationService.stub(IClipboardService, new BrowserClipboardService());
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IWorkspaceTrustRequestService, new TestWorkspaceTrustRequestService(true));

	return instantiationService;
}

function _createTestNotebookEditor(instantiationService: TestInstantiationService, cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][]): { editor: IActiveNotebookEditorDelegate, viewModel: NotebookViewModel; } {

	const viewType = 'notebook';
	const notebook = instantiationService.createInstance(NotebookTextModel, viewType, URI.parse('test'), cells.map(cell => {
		return {
			source: cell[0],
			language: cell[1],
			cellKind: cell[2],
			outputs: cell[3] ?? [],
			metadata: cell[4]
		};
	}), {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false });

	const model = new NotebookEditorTestModel(notebook);
	const notebookOptions = new NotebookOptions(instantiationService.get(IConfigurationService));
	const viewContext = new ViewContext(notebookOptions, new NotebookEventDispatcher());
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
		override getOutputRenderer() {
			return new OutputRenderer({
				creationOptions: notebookEditor.creationOptions,
				getCellOutputLayoutInfo() {
					return {
						height: 100,
						width: 100,
						fontInfo: new FontInfo({
							zoomLevel: 0,
							pixelRatio: 1,
							fontFamily: 'mockFont',
							fontWeight: 'normal',
							fontSize: 14,
							fontFeatureSettings: EditorFontLigatures.OFF,
							lineHeight: 19,
							letterSpacing: 1.5,
							isMonospace: true,
							typicalHalfwidthCharacterWidth: 10,
							typicalFullwidthCharacterWidth: 20,
							canUseHalfwidthRightwardsArrow: true,
							spaceWidth: 10,
							middotWidth: 10,
							wsmiddotWidth: 10,
							maxDigitWidth: 10,
						}, true)
					};
				}
			}, instantiationService, NullCommandService);
		}
		override async layoutNotebookCell() { }
		override async removeInset() { }
		override async focusNotebookCell() { }
		override cellAt(index: number) { return viewModel.cellAt(index)!; }
		override getCellIndex(cell: ICellViewModel) { return viewModel.getCellIndex(cell); }
		override getCellsInRange(range?: ICellRange) { return viewModel.getCellsInRange(range); }
		override getNextVisibleCellIndex(index: number) { return viewModel.getNextVisibleCellIndex(index); }
		getControl() { return this; }
		override get onDidChangeSelection() { return viewModel.onDidChangeSelection as Event<any>; }
		override get onDidChangeOptions() { return viewModel.onDidChangeOptions; }
		override get onDidChangeViewCells() { return viewModel.onDidChangeViewCells; }

	};

	return { editor: notebookEditor, viewModel };
}

export function createTestNotebookEditor(instantiationService: TestInstantiationService, cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][]): { editor: INotebookEditorDelegate, viewModel: NotebookViewModel; } {
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
}

export function createNotebookCellList(instantiationService: TestInstantiationService, viewContext?: ViewContext) {
	const delegate: IListVirtualDelegate<CellViewModel> = {
		getHeight(element: CellViewModel) { return element.getHeight(17); },
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
		viewContext ?? new ViewContext(new NotebookOptions(instantiationService.get(IConfigurationService)), new NotebookEventDispatcher()),
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

export function valueBytesFromString(value: string): VSBuffer {
	return VSBuffer.fromString(value);
}
