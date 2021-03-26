/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { NotImplementedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { EditorModel } from 'vs/workbench/common/editor';
import { ICellViewModel, IActiveNotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, CellUri, ICellRange, INotebookEditorModel, IOutputDto, IResolvedNotebookEditorModel, NotebookCellMetadata, notebookDocumentMetadataDefaults } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { NotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { ListViewInfoAccessor } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { mock } from 'vs/base/test/common/mock';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

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

export class NotebookEditorTestModel extends EditorModel implements INotebookEditorModel {
	private _dirty = false;

	protected readonly _onDidSave = this._register(new Emitter<void>());
	readonly onDidSave = this._onDidSave.event;

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
			this._onDidSave.fire();
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

export async function withTestNotebook<R = any>(cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], callback: (editor: IActiveNotebookEditor, accessor: ServicesAccessor) => Promise<R> | R): Promise<R> {
	const instantiationService = setupInstantiationService();
	const viewType = 'notebook';
	const notebook = instantiationService.createInstance(NotebookTextModel, viewType, URI.parse('test'), cells.map(cell => {
		return {
			source: cell[0],
			language: cell[1],
			cellKind: cell[2],
			outputs: cell[3] ?? [],
			metadata: cell[4]
		};
	}), notebookDocumentMetadataDefaults, { transientMetadata: {}, transientOutputs: false });

	const model = new NotebookEditorTestModel(notebook);
	const eventDispatcher = new NotebookEventDispatcher();
	const viewModel: NotebookViewModel = instantiationService.createInstance(NotebookViewModel, viewType, model.notebook, eventDispatcher, null);

	const cellList = createNotebookCellList(instantiationService);
	cellList.attachViewModel(viewModel);
	const listViewInfoAccessor = new ListViewInfoAccessor(cellList);

	const notebookEditor: IActiveNotebookEditor = new class extends mock<IActiveNotebookEditor>() {
		onDidChangeModel: Event<NotebookTextModel | undefined> = new Emitter<NotebookTextModel | undefined>().event;
		get viewModel() { return viewModel; }
		hasModel(): this is IActiveNotebookEditor {
			return !!this.viewModel;
		}
		getFocus() { return viewModel.getFocus(); }
		getSelections() { return viewModel.getSelections(); }
		getViewIndex(cell: ICellViewModel) { return listViewInfoAccessor.getViewIndex(cell); }
		getCellRangeFromViewRange(startIndex: number, endIndex: number) { return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex); }
		revealCellRangeInView() { }
		setHiddenAreas(_ranges: ICellRange[]): boolean {
			return cellList.setHiddenAreas(_ranges, true);
		}
	};

	const res = await callback(notebookEditor, instantiationService);
	if (res instanceof Promise) {
		res.finally(() => viewModel.dispose());
	} else {
		viewModel.dispose();
	}
	return res;
}

export function createNotebookCellList(instantiationService: TestInstantiationService) {
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
