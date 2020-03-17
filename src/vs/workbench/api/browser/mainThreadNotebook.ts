/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadNotebookShape, NotebookExtensionDescription, IExtHostContext, ExtHostNotebookShape, ExtHostContext } from '../common/extHost.protocol';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { INotebookService, IMainNotebookController } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { Emitter, Event } from 'vs/base/common/event';
import { ICell, IOutput, INotebook, INotebookMimeTypeSelector, NOTEBOOK_DISPLAY_ORDER, NotebookCellsSplice, NotebookCellOutputsSplice, CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { PieceTreeTextBufferFactory, PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';

export class MainThreadCell implements ICell {
	private _onDidChangeOutputs = new Emitter<NotebookCellOutputsSplice[]>();
	onDidChangeOutputs: Event<NotebookCellOutputsSplice[]> = this._onDidChangeOutputs.event;

	private _onDidChangeDirtyState = new Emitter<boolean>();
	onDidChangeDirtyState: Event<boolean> = this._onDidChangeDirtyState.event;

	private _outputs: IOutput[];

	get outputs(): IOutput[] {
		return this._outputs;
	}

	private _isDirty: boolean = false;

	get isDirty() {
		return this._isDirty;
	}

	set isDirty(newState: boolean) {
		this._isDirty = newState;
		this._onDidChangeDirtyState.fire(newState);
	}

	get source() {
		return this._source;
	}

	set source(newValue: string[]) {
		this._source = newValue;
		this._buffer = null;
	}

	private _buffer: PieceTreeTextBufferFactory | null = null;

	constructor(
		readonly uri: URI,
		public handle: number,
		private _source: string[],
		public language: string,
		public cellKind: CellKind,
		outputs: IOutput[]
	) {
		this._outputs = outputs;
	}

	spliceNotebookCellOutputs(splices: NotebookCellOutputsSplice[]): void {
		splices.reverse().forEach(splice => {
			this.outputs.splice(splice[0], splice[1], ...splice[2]);
		});

		this._onDidChangeOutputs.fire(splices);
	}

	save() {
		this._isDirty = false;
	}

	resolveTextBufferFactory(): PieceTreeTextBufferFactory {
		if (this._buffer) {
			return this._buffer;
		}

		let builder = new PieceTreeTextBufferBuilder();
		builder.acceptChunk(this.source.join('\n'));
		this._buffer = builder.finish(true);
		return this._buffer;
	}
}

export class MainThreadNotebookDocument extends Disposable implements INotebook {
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;
	private readonly _onDidChangeCells = new Emitter<NotebookCellsSplice[]>();
	get onDidChangeCells(): Event<NotebookCellsSplice[]> { return this._onDidChangeCells.event; }
	private _onDidChangeDirtyState = new Emitter<boolean>();
	onDidChangeDirtyState: Event<boolean> = this._onDidChangeDirtyState.event;
	private _mapping: Map<number, MainThreadCell> = new Map();
	private _cellListeners: Map<number, IDisposable> = new Map();
	cells: MainThreadCell[];
	activeCell: MainThreadCell | undefined;
	languages: string[] = [];
	renderers = new Set<number>();

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

	updateRenderers(renderers: number[]) {
		renderers.forEach(render => {
			this.renderers.add(render);
		});
	}

	updateActiveCell(handle: number) {
		this.activeCell = this._mapping.get(handle);
	}

	async createRawCell(viewType: string, uri: URI, index: number, language: string, type: CellKind): Promise<MainThreadCell | undefined> {
		let cell = await this._proxy.$createEmptyCell(viewType, uri, index, language, type);
		if (cell) {
			let mainCell = new MainThreadCell(URI.revive(cell.uri), cell.handle, cell.source, cell.language, cell.cellKind, cell.outputs);
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

	spliceNotebookCells(splices: NotebookCellsSplice[]): void {
		splices.reverse().forEach(splice => {
			let cellDtos = splice[2];
			let newCells = cellDtos.map(cell => {
				let mainCell = new MainThreadCell(URI.revive(cell.uri), cell.handle, cell.source, cell.language, cell.cellKind, cell.outputs || []);
				this._mapping.set(cell.handle, mainCell);
				let dirtyStateListener = mainCell.onDidChangeDirtyState((cellState) => {
					this.isDirty = this.isDirty || cellState;
				});
				this._cellListeners.set(cell.handle, dirtyStateListener);
				return mainCell;
			});

			this.cells.splice(splice[0], splice[1], ...newCells);
		});

		this._onDidChangeCells.fire(splices);
	}

	spliceNotebookCellOutputs(cellHandle: number, splices: NotebookCellOutputsSplice[]): void {
		let cell = this._mapping.get(cellHandle);
		cell?.spliceNotebookCellOutputs(splices);
	}

	dispose() {
		this._onWillDispose.fire();
		this._cellListeners.forEach(val => val.dispose());
		super.dispose();
	}
}

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebooks extends Disposable implements MainThreadNotebookShape {
	private readonly _notebookProviders = new Map<string, MainThreadNotebookController>();
	private readonly _proxy: ExtHostNotebookShape;

	constructor(
		extHostContext: IExtHostContext,
		@INotebookService private _notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
		this.registerListeners();
	}

	registerListeners() {
		this._register(this._notebookService.onDidChangeActiveEditor(e => {
			this._proxy.$updateActiveEditor(e.viewType, e.uri);
		}));

		let userOrder = this.configurationService.getValue<string[]>('notebook.displayOrder');
		this._proxy.$acceptDisplayOrder({
			defaultOrder: NOTEBOOK_DISPLAY_ORDER,
			userOrder: userOrder
		});

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.indexOf('notebook.displayOrder') >= 0) {
				let userOrder = this.configurationService.getValue<string[]>('notebook.displayOrder');

				this._proxy.$acceptDisplayOrder({
					defaultOrder: NOTEBOOK_DISPLAY_ORDER,
					userOrder: userOrder
				});
			}
		});
	}

	async $registerNotebookRenderer(extension: NotebookExtensionDescription, type: string, selectors: INotebookMimeTypeSelector, handle: number, preloads: UriComponents[]): Promise<void> {
		this._notebookService.registerNotebookRenderer(handle, extension, type, selectors, preloads.map(uri => URI.revive(uri)));
	}

	async $unregisterNotebookRenderer(handle: number): Promise<void> {
		this._notebookService.unregisterNotebookRenderer(handle);
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

		return;
	}

	async $updateNotebookLanguages(viewType: string, resource: UriComponents, languages: string[]): Promise<void> {
		let controller = this._notebookProviders.get(viewType);

		if (controller) {
			controller.updateLanguages(resource, languages);
		}
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<number | undefined> {
		let handle = await this._proxy.$resolveNotebook(viewType, uri);
		return handle;
	}

	async $spliceNotebookCells(viewType: string, resource: UriComponents, splices: NotebookCellsSplice[], renderers: number[]): Promise<void> {
		let controller = this._notebookProviders.get(viewType);
		controller?.spliceNotebookCells(resource, splices, renderers);
	}

	async $spliceNotebookCellOutputs(viewType: string, resource: UriComponents, cellHandle: number, splices: NotebookCellOutputsSplice[], renderers: number[]): Promise<void> {
		let controller = this._notebookProviders.get(viewType);
		controller?.spliceNotebookCellOutputs(resource, cellHandle, splices, renderers);
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		return this._proxy.$executeNotebook(viewType, uri, undefined);
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
		// TODO: resolve notebook should wait for all notebook document destory operations to finish.
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

	spliceNotebookCells(resource: UriComponents, splices: NotebookCellsSplice[], renderers: number[]): void {
		let mainthreadNotebook = this._mapping.get(URI.from(resource).toString());
		mainthreadNotebook?.updateRenderers(renderers);
		mainthreadNotebook?.spliceNotebookCells(splices);
	}

	spliceNotebookCellOutputs(resource: UriComponents, cellHandle: number, splices: NotebookCellOutputsSplice[], renderers: number[]): void {
		let mainthreadNotebook = this._mapping.get(URI.from(resource).toString());
		mainthreadNotebook?.updateRenderers(renderers);
		mainthreadNotebook?.spliceNotebookCellOutputs(cellHandle, splices);
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		this._mainThreadNotebook.executeNotebook(viewType, uri);
	}

	// Methods for ExtHost
	async createNotebookDocument(handle: number, viewType: string, resource: UriComponents): Promise<void> {
		let document = new MainThreadNotebookDocument(this._proxy, handle, viewType, URI.revive(resource));
		this._mapping.set(URI.revive(resource).toString(), document);
	}

	updateLanguages(resource: UriComponents, languages: string[]) {
		let document = this._mapping.get(URI.from(resource).toString());
		document?.updateLanguages(languages);
	}

	updateNotebookRenderers(resource: UriComponents, renderers: number[]): void {
		let document = this._mapping.get(URI.from(resource).toString());
		document?.updateRenderers(renderers);
	}

	updateNotebookActiveCell(uri: URI, cellHandle: number): void {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());
		mainthreadNotebook?.updateActiveCell(cellHandle);
	}

	async createRawCell(uri: URI, index: number, language: string, type: CellKind): Promise<ICell | undefined> {
		let mainthreadNotebook = this._mapping.get(URI.from(uri).toString());
		return mainthreadNotebook?.createRawCell(this._viewType, uri, index, language, type);
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
			this._proxy.$executeNotebook(this._viewType, uri, mainthreadNotebook.activeCell.handle);
		}
	}

	async destoryNotebookDocument(notebook: INotebook): Promise<void> {
		let document = this._mapping.get(URI.from(notebook.uri).toString());

		if (!document) {
			return;
		}

		let removeFromExtHost = await this._proxy.$destoryNotebookDocument(this._viewType, notebook.uri);
		if (removeFromExtHost) {
			document.dispose();
			this._mapping.delete(URI.from(notebook.uri).toString());
		}
	}
}
