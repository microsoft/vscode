/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadNotebookShape, NotebookExtensionDescription, IExtHostContext, ExtHostNotebookShape, ExtHostContext } from '../common/extHost.protocol';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { INotebookService, IMainNotebookController } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { INotebook, ICell, IOutput } from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';

export class MainThreadCell implements ICell {
	private _onDidChangeOutputs = new Emitter<void>();
	onDidChangeOutputs: Event<void> = this._onDidChangeOutputs.event;

	private _onDidChangeDirtyState = new Emitter<boolean>();
	onDidChangeDirtyState: Event<boolean> = this._onDidChangeDirtyState.event;

	private _outputs: IOutput[];

	public get outputs(): IOutput[] {
		return this._outputs;
	}

	public set outputs(newOutputs: IOutput[]) {
		this._outputs = newOutputs;
		this._onDidChangeOutputs.fire();
	}

	private _isDirty: boolean = false;

	get isDirty() {
		return this._isDirty;
	}

	set isDirty(newState: boolean) {
		this._isDirty = newState;
		this._onDidChangeDirtyState.fire(newState);
	}

	constructor(
		public handle: number,
		public source: string[],
		public language: string,
		public cell_type: 'markdown' | 'code',
		outputs: IOutput[]
	) {
		this._outputs = outputs;
	}

	save() {
		this._isDirty = false;
	}
}

export class MainThreadNotebookDocument extends Disposable implements INotebook {
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onWillDispose: Event<void> = this._onWillDispose.event;
	private readonly _onDidChangeCells = new Emitter<void>();
	get onDidChangeCells(): Event<void> { return this._onDidChangeCells.event; }
	private _onDidChangeDirtyState = new Emitter<boolean>();
	onDidChangeDirtyState: Event<boolean> = this._onDidChangeDirtyState.event;
	private _mapping: Map<number, MainThreadCell> = new Map();
	private _cellListeners: Map<number, IDisposable> = new Map();
	public cells: MainThreadCell[];
	public activeCell: MainThreadCell | undefined;
	public languages: string[] = [];

	private _isDirty: boolean = false;

	get isDirty() {
		return this._isDirty;
	}

	set isDirty(newState: boolean) {
		this._isDirty = newState;
		this._onDidChangeDirtyState.fire(newState);
	}

	constructor(
		private readonly _proxy: ExtHostNotebookShape,
		public handle: number,
		public viewType: string,
		public uri: URI
	) {
		super();
		this.cells = [];
	}

	updateLanguages(languages: string[]) {
		this.languages = languages;
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
				let mainCell = new MainThreadCell(cell.handle, cell.source, cell.language, cell.cell_type, cell.outputs);
				this._mapping.set(cell.handle, mainCell);
				this.cells.push(mainCell);
				let dirtyStateListener = mainCell.onDidChangeDirtyState((cellState) => {
					this.isDirty = this.isDirty || cellState;
				});
				this._cellListeners.set(cell.handle, dirtyStateListener);
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

	async createRawCell(viewType: string, uri: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<MainThreadCell | undefined> {
		let cell = await this._proxy.$createRawCell(viewType, uri, index, language, type);
		if (cell) {
			let mainCell = new MainThreadCell(cell.handle, cell.source, cell.language, cell.cell_type, cell.outputs);
			this._mapping.set(cell.handle, mainCell);
			this.cells.splice(index, 0, mainCell);

			let dirtyStateListener = mainCell.onDidChangeDirtyState((cellState) => {
				this.isDirty = this.isDirty || cellState;
			});

			this._cellListeners.set(cell.handle, dirtyStateListener);
			return mainCell;
		}

		return;
	}

	async deleteCell(uri: URI, index: number): Promise<boolean> {
		let deleteExtHostCell = await this._proxy.$deleteCell(this.viewType, uri, index);
		if (deleteExtHostCell) {
			let cell = this.cells[index];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
			this.cells.splice(index, 1);
			return true;
		}

		return false;
	}

	async save(): Promise<boolean> {
		let ret = await this._proxy.$saveNotebook(this.viewType, this.uri);

		if (ret) {
			this.cells.forEach((cell) => {
				cell.save();
			});
		}

		return ret;
	}

	dispose() {
		this._onWillDispose.fire();
		super.dispose();
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
		this._register(this._notebookService.onDidChangeActiveEditor(e => {
			this._proxy.$updateActiveEditor(e.viewType, e.uri);
		}));
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

	async $createNotebookDocument(handle: number, viewType: string, resource: UriComponents): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.createNotebookDocument(handle, viewType, resource);
		}

		// let document = new MainThreadNotebookDocument(this._proxy, handle, viewType, URI.revive(resource));
		// this._documents.set(handle, document);
		return;
	}

	async $updateNotebookCells(viewType: string, resource: UriComponents, cells: ICell[]): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateNotebookCells(resource, cells);
		}
	}

	async $updateNotebookCell(viewType: string, resource: UriComponents, cell: ICell): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateNotebookCell(resource, cell);
		}

	}

	async $updateNotebookLanguages(viewType: string, resource: UriComponents, languages: string[]): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateLanguages(resource, languages);
		}
	}

	async $updateNotebook(viewType: string, resource: UriComponents, notebook: INotebook): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateNotebook(resource, notebook);
		}
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<number | undefined> {
		let handle = await this._proxy.$resolveNotebook(viewType, uri);
		return handle;
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
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			return mainthreadNotebook;
		}

		let notebookHandle = await this._mainThreadNotebook.resolveNotebook(viewType, uri);
		if (notebookHandle !== undefined) {
			mainthreadNotebook = this._mapping.get(URI.from(uri).toString());
			return mainthreadNotebook;
		}

		return undefined;
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		this._mainThreadNotebook.executeNotebook(viewType, uri);
	}

	// Methods for ExtHost
	async createNotebookDocument(handle: number, viewType: string, resource: UriComponents): Promise<void> {
		let document = new MainThreadNotebookDocument(this._proxy, handle, viewType, URI.revive(resource));
		this._mapping.set(URI.revive(resource).toString(), document);
	}

	updateNotebook(resource: UriComponents, notebook: INotebook): void {
		let mainthreadNotebook = this._mapping.get(URI.from(resource).toString());

		if (mainthreadNotebook) {
			mainthreadNotebook.updateCells(notebook.cells);
		}
	}

	updateLanguages(resource: UriComponents, languages: string[]) {
		let document = this._mapping.get(URI.from(resource).toString());

		if (document) {
			document.updateLanguages(languages);
		}
	}

	updateNotebookCells(resource: UriComponents, cells: ICell[]): void {
		let document = this._mapping.get(URI.from(resource).toString());

		if (document) {
			document.updateCells(cells);
		}
	}

	updateNotebookCell(resource: UriComponents, cell: ICell): void {
		let document = this._mapping.get(URI.from(resource).toString());

		if (document) {
			document.updateCell(cell);
		}
	}

	updateNotebookActiveCell(uri: URI, cellHandle: number): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			mainthreadNotebook.updateActiveCell(cellHandle);
		}
	}

	async createRawCell(uri: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<ICell | undefined> {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			return mainthreadNotebook.createRawCell(this._viewType, uri, index, language, type);
		}

		return;
	}

	async deleteCell(uri: URI, index: number): Promise<boolean> {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook) {
			return mainthreadNotebook.deleteCell(uri, index);
		}

		return false;
	}

	executeNotebookActiveCell(uri: URI): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());

		if (mainthreadNotebook && mainthreadNotebook.activeCell) {
			this._proxy.$executeNotebookCell(this._viewType, uri, mainthreadNotebook.activeCell.handle);
		}
	}

	destoryNotebookDocument(notebook: INotebook): void {
		let mainthreadNotebook = this._mapping.get(URI.from(notebook.uri).toString());

		if (mainthreadNotebook) {
			mainthreadNotebook.dispose();
			this._mapping.delete(URI.from(notebook.uri).toString());
		}
	}
}
