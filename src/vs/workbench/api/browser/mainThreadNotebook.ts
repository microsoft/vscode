/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadNotebookShape, NotebookExtensionDescription, IExtHostContext, ExtHostNotebookShape, ExtHostContext } from '../common/extHost.protocol';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { INotebookService, IMainNotebookController } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { INotebook, IMetadata, ICell, IOutput } from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';

export class MainThreadCell implements ICell {
	private _onDidChangeOutputs = new Emitter<void>();
	onDidChangeOutputs: Event<void> = this._onDidChangeOutputs.event;

	private _outputs: IOutput[];

	public get outputs(): IOutput[] {
		return this._outputs;
	}

	public set outputs(newOutputs: IOutput[]) {
		this._outputs = newOutputs;
		this._onDidChangeOutputs.fire();
	}

	constructor(
		public handle: number,
		public source: string[],
		public cell_type: 'markdown' | 'code',
		outputs: IOutput[]
	) {
		this._outputs = outputs;
	}
}

export class MainThreadNotebookDocument implements INotebook {

	private readonly _onDidChangeCells = new Emitter<void>();
	get onDidChangeCells(): Event<void> { return this._onDidChangeCells.event; }
	private _mapping: Map<number, MainThreadCell> = new Map();
	public cells: MainThreadCell[];
	public activeCell: MainThreadCell | undefined;

	constructor(
		private readonly _proxy: ExtHostNotebookShape,
		public handle: number,
		public resource: URI
	) {
		this.cells = [];
	}

	updateCell(cell: ICell) {
		let mcell = this._mapping.get(cell.handle);

		if (mcell) {
			mcell.outputs = cell.outputs;
		}
	}

	updateCells(newCells: ICell[]) {
		// todo, handle cell insertion and deletion

		if (this.cells.length === 0) {
			newCells.forEach(cell => {
				let mainCell = new MainThreadCell(cell.handle, cell.source, cell.cell_type, cell.outputs);
				this._mapping.set(cell.handle, mainCell);
				this.cells.push(mainCell);
			});
		} else {
			newCells.forEach(newCell => {
				let cell = this._mapping.get(newCell.handle);
				if (cell) {
					cell.outputs = newCell.outputs;
				}
			});
		}

		this._onDidChangeCells.fire();
	}

	updateActiveCell(handle: number) {
		this.activeCell = this._mapping.get(handle);
	}
}

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks extends Disposable implements MainThreadNotebookShape {
	private readonly _notebookProviders = new Map<string, MainThreadNotebookController>();
	private readonly _proxy: ExtHostNotebookShape;

	private readonly _documents: Map<number, MainThreadNotebookDocument> = new Map();
	constructor(
		extHostContext: IExtHostContext,
		@INotebookService private _notebookService: INotebookService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
	}

	async $registerNotebookProvider(extension: NotebookExtensionDescription, viewType: string): Promise<void> {
		let controller = new MainThreadNotebookController(this._proxy, this, viewType);
		this._notebookProviders.set(viewType, controller);
		this._notebookService.registerNotebookController(viewType, extension, controller);
		return;
	}

	async $unregisterNotebookProvider(viewType: string): Promise<void> {
		this._notebookProviders.delete(viewType);
		this._notebookService.unregisterNotebookProvider(viewType);
		return;
	}

	async $createNotebookDocument(handle: number, resource: URI): Promise<void> {
		let document = new MainThreadNotebookDocument(this._proxy, handle, resource);
		this._documents.set(handle, document);
		return;
	}

	async $updateNotebookCells(handle: number, cells: ICell[]): Promise<void> {
		let document = this._documents.get(handle);

		if (document) {
			document.updateCells(cells);
		}
	}

	async $updateNotebookCell(handle: number, cell: ICell): Promise<void> {
		let document = this._documents.get(handle);

		if (document) {
			document.updateCell(cell);
		}
	}


	async $updateNotebook(viewType: string, uri: URI, notebook: INotebook): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateNotebook(uri, notebook);
		}
	}
	async resolveNotebook(viewType: string, uri: URI): Promise<MainThreadNotebookDocument | undefined> {
		let handle = await this._proxy.$resolveNotebook(viewType, uri);

		if (handle !== undefined) {
			const doc = this._documents.get(handle);

			if (doc === undefined) {
				console.log('resolve notebook from main but undefined');
			}

			return doc;
		}

		return;
	}

	executeNotebook(viewType: string, uri: URI): Promise<void> {
		return this._proxy.$executeNotebook(viewType, uri);
	}
}

export class MainThreadNotebookController implements IMainNotebookController {
	private _mapping: Map<string, MainThreadNotebookDocument> = new Map();

	constructor(
		private readonly _proxy: ExtHostNotebookShape,
		private _mainThreadNotebook: MainThreadNotebooks,
		private _viewType: string
	) {
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		let notebook = await this._mainThreadNotebook.resolveNotebook(viewType, uri);
		if (notebook) {
			this._mapping.set(uri.toString(), notebook);
			return notebook;
		}
		return undefined;
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		this._mainThreadNotebook.executeNotebook(viewType, uri);
	}

	updateNotebook(uri: URI, notebook: INotebook): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			mainthreadNotebook.updateCells(notebook.cells);
		}
	}

	updateNotebookActiveCell(uri: URI, cellHandle: number): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			mainthreadNotebook.updateActiveCell(cellHandle);
		}
	}

	executeNotebookActiveCell(uri: URI): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook && mainthreadNotebook.activeCell) {
			this._proxy.$executeNotebookCell(this._viewType, uri, mainthreadNotebook.activeCell.handle);
		}
	}
}
