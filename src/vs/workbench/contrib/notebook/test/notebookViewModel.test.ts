/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { PieceTreeTextBufferFactory } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookViewModel';
import { generateCellPath, ICell, INotebook, IOutput, NotebookCellOutputsSplice, NotebookCellsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';

class MockCell implements ICell {
	uri: URI;
	private _onDidChangeOutputs = new Emitter<NotebookCellOutputsSplice[]>();
	onDidChangeOutputs: Event<NotebookCellOutputsSplice[]> = this._onDidChangeOutputs.event;
	private _isDirty: boolean = false;
	private _outputs: IOutput[];
	get outputs(): IOutput[] {
		return this._outputs;
	}

	get isDirty() {
		return this._isDirty;
	}

	set isDirty(newState: boolean) {
		this._isDirty = newState;

	}

	constructor(
		public viewType: string,
		public handle: number,
		public source: string[],
		public language: string,
		public cell_type: 'markdown' | 'code',
		outputs: IOutput[]
	) {
		this._outputs = outputs;
		this.uri = URI.from({
			scheme: 'vscode-notebook',
			authority: viewType,
			path: generateCellPath(cell_type, handle),
			query: ''
		});
	}

	resolveTextBufferFactory(): PieceTreeTextBufferFactory {
		throw new Error('Method not implemented.');
	}
}

class MockNotebook extends Disposable implements INotebook {
	private readonly _onDidChangeCells = new Emitter<NotebookCellsSplice[]>();
	get onDidChangeCells(): Event<NotebookCellsSplice[]> { return this._onDidChangeCells.event; }
	private _onDidChangeDirtyState = new Emitter<boolean>();
	onDidChangeDirtyState: Event<boolean> = this._onDidChangeDirtyState.event;
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;
	cells: MockCell[];
	activeCell: MockCell | undefined;
	languages: string[] = [];
	renderers = new Set<number>();


	constructor(
		public handle: number,
		public viewType: string,
		public uri: URI
	) {
		super();

		this.cells = [];
	}

	save(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
}

suite('NotebookViewModel', () => {
	const instantiationService = new TestInstantiationService();

	const createCellViewModel = (viewType: string, notebookHandle: number, cellhandle: number, source: string[], language: string, cell_type: 'markdown' | 'code', outputs: IOutput[]) => {
		const mockCell = new MockCell(viewType, cellhandle, source, language, cell_type, outputs);
		return instantiationService.createInstance(CellViewModel, viewType, notebookHandle, mockCell, false);
	};

	const withNotebookDocument = (cells: [string[], string, 'markdown' | 'code', IOutput[]][], callback: (viewModel: NotebookViewModel) => void) => {
		const viewType = 'notebook';
		const notebook = new MockNotebook(0, viewType, URI.parse('test'));
		notebook.cells = cells.map((cell, index) => {
			return new MockCell(viewType, index, cell[0], cell[1], cell[2], cell[3]);
		});
		const model = new NotebookEditorModel(notebook);
		const viewModel = new NotebookViewModel(viewType, model, instantiationService);
		viewModel.initialize(undefined);

		callback(viewModel);

		viewModel.dispose();
		return;
	};

	test('ctor', function () {
		const notebook = new MockNotebook(0, 'notebook', URI.parse('test'));
		const model = new NotebookEditorModel(notebook);
		const viewModel = new NotebookViewModel('notebook', model, instantiationService);
		assert.equal(viewModel.viewType, 'notebook');
	});

	test('insert/delete', function () {
		withNotebookDocument(
			[
				[['var a = 1;'], 'javascript', 'code', []],
				[['var b = 2;'], 'javascript', 'code', []]
			],
			(viewModel) => {
				const cell = createCellViewModel(viewModel.viewType, viewModel.handle, 0, ['var c = 3;'], 'javascript', 'code', []);
				viewModel.insertCell(1, cell);
				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell), 1);

				viewModel.deleteCell(1);
				assert.equal(viewModel.viewCells.length, 2);
				assert.equal(viewModel.notebookDocument.cells.length, 2);
				assert.equal(viewModel.getViewCellIndex(cell), -1);
			}
		);
	});

	test('index', function () {
		withNotebookDocument(
			[
				[['var a = 1;'], 'javascript', 'code', []],
				[['var b = 2;'], 'javascript', 'code', []]
			],
			(viewModel) => {
				const firstViewCell = viewModel.viewCells[0];
				const lastViewCell = viewModel.viewCells[viewModel.viewCells.length - 1];

				const insertIndex = viewModel.getViewCellIndex(firstViewCell) + 1;
				const cell = createCellViewModel(viewModel.viewType, viewModel.handle, 3, ['var c = 3;'], 'javascript', 'code', []);
				viewModel.insertCell(insertIndex, cell);

				const addedCellIndex = viewModel.getViewCellIndex(cell);
				viewModel.deleteCell(addedCellIndex);

				const secondInsertIndex = viewModel.getViewCellIndex(lastViewCell) + 1;
				const cell2 = createCellViewModel(viewModel.viewType, viewModel.handle, 4, ['var d = 4;'], 'javascript', 'code', []);
				viewModel.insertCell(secondInsertIndex, cell2);

				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell2), 2);
			}
		);
	});
});
