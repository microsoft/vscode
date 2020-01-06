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

export class MainThreadNotebook implements INotebook {

	private readonly _onDidChangeCells = new Emitter<void>();
	get onDidChangeCells(): Event<void> { return this._onDidChangeCells.event; }
	private _mapping: Map<number, MainThreadCell> = new Map();
	public cells: MainThreadCell[];

	constructor(
		public handle: number,
		public metadata: IMetadata,
		cells: ICell[]
	) {
		this.cells = [];
		cells.forEach(cell => {
			let mainCell = new MainThreadCell(cell.handle, cell.source, cell.cell_type, cell.outputs);
			this._mapping.set(cell.handle, mainCell);
			this.cells.push(mainCell);
		});
	}

	updateCells(newCells: ICell[]) {
		// todo, handle cell insertion and deletion
		newCells.forEach(newCell => {
			let cell = this._mapping.get(newCell.handle);
			if (cell) {
				cell.outputs = newCell.outputs;
			}
		});

		this._onDidChangeCells.fire();
	}
}

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks extends Disposable implements MainThreadNotebookShape {
	private readonly _notebookProviders = new Map<string, MainThreadNotebookController>();
	private readonly _proxy: ExtHostNotebookShape;

	constructor(
		extHostContext: IExtHostContext,
		@INotebookService private _notebookService: INotebookService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
	}

	$registerNotebookProvider(extension: NotebookExtensionDescription, viewType: string): void {
		let controller = new MainThreadNotebookController(this);
		this._notebookProviders.set(viewType, controller);
		this._notebookService.registerNotebookController(viewType, controller);
	}

	$unregisterNotebookProvider(viewType: string): void {
		this._notebookProviders.delete(viewType);
		this._notebookService.unregisterNotebookProvider(viewType);
	}

	$updateNotebook(viewType: string, uri: URI, notebook: INotebook): void {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateNotebook(uri, notebook);
		}
	}

	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		return this._proxy.$resolveNotebook(viewType, uri);
	}

	executeNotebook(viewType: string, uri: URI): Promise<void> {
		return this._proxy.$executeNotebook(viewType, uri);
	}
}

export class MainThreadNotebookController implements IMainNotebookController {
	private _mapping: Map<string, MainThreadNotebook> = new Map();

	constructor(
		private _mainThreadNotebook: MainThreadNotebooks
	) {
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		let notebook = await this._mainThreadNotebook.resolveNotebook(viewType, uri);
		if (notebook) {
			let mainthreadNotebook = new MainThreadNotebook(notebook.handle, notebook.metadata, notebook.cells);
			this._mapping.set(uri.toString(), mainthreadNotebook);
			return mainthreadNotebook;
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
}
