/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostNotebookKernelsShape, IMainContext, INotebookKernelDto2, MainContext, MainThreadNotebookDocumentsShape, MainThreadNotebookKernelsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as extHostTypeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { asWebviewUri } from 'vs/workbench/api/common/shared/webview';
import { ResourceMap } from 'vs/base/common/map';
import { timeout } from 'vs/base/common/async';
import { ExtHostCell, ExtHostNotebookDocument } from 'vs/workbench/api/common/extHostNotebookDocument';
import { CellEditType, IImmediateCellEditOperation, NotebookCellExecutionState, NullablePartialNotebookCellInternalMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { asArray } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';

interface IKernelData {
	extensionId: ExtensionIdentifier,
	controller: vscode.NotebookController;
	onDidChangeSelection: Emitter<{ selected: boolean; notebook: vscode.NotebookDocument; }>;
	onDidReceiveMessage: Emitter<{ editor: vscode.NotebookEditor, message: any }>;
	associatedNotebooks: ResourceMap<boolean>;
}

export class ExtHostNotebookKernels implements ExtHostNotebookKernelsShape {

	private readonly _proxy: MainThreadNotebookKernelsShape;
	private readonly _activeExecutions = new ResourceMap<NotebookCellExecutionTask>();

	private readonly _kernelData = new Map<number, IKernelData>();
	private _handlePool: number = 0;

	constructor(
		private readonly _mainContext: IMainContext,
		private readonly _initData: IExtHostInitDataService,
		private readonly _extHostNotebook: ExtHostNotebookController,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = _mainContext.getProxy(MainContext.MainThreadNotebookKernels);
	}

	createNotebookController(extension: IExtensionDescription, id: string, viewType: string, label: string, handler?: vscode.NotebookExecuteHandler, preloads?: vscode.NotebookKernelPreload[]): vscode.NotebookController {

		for (let data of this._kernelData.values()) {
			if (data.controller.id === id && ExtensionIdentifier.equals(extension.identifier, data.extensionId)) {
				throw new Error(`notebook controller with id '${id}' ALREADY exist`);
			}
		}


		const handle = this._handlePool++;
		const that = this;

		this._logService.trace(`NotebookController[${handle}], CREATED by ${extension.identifier.value}, ${id}`);

		const _defaultExecutHandler = () => console.warn(`NO execute handler from notebook controller '${data.id}' of extension: '${extension.identifier}'`);

		let isDisposed = false;
		const commandDisposables = new DisposableStore();

		const onDidChangeSelection = new Emitter<{ selected: boolean, notebook: vscode.NotebookDocument }>();
		const onDidReceiveMessage = new Emitter<{ editor: vscode.NotebookEditor, message: any }>();

		const data: INotebookKernelDto2 = {
			id: `${extension.identifier.value}/${id}`,
			viewType,
			extensionId: extension.identifier,
			extensionLocation: extension.extensionLocation,
			label: label || extension.identifier.value,
			preloads: preloads ? preloads.map(extHostTypeConverters.NotebookKernelPreload.from) : []
		};

		//
		let _executeHandler: vscode.NotebookExecuteHandler = handler ?? _defaultExecutHandler;
		let _interruptHandler: vscode.NotebookInterruptHandler | undefined;

		// todo@jrieken the selector needs to be massaged
		this._proxy.$addKernel(handle, data).catch(err => {
			// this can happen when a kernel with that ID is already registered
			console.log(err);
			isDisposed = true;
		});

		// update: all setters write directly into the dto object
		// and trigger an update. the actual update will only happen
		// once per event loop execution
		let tokenPool = 0;
		const _update = () => {
			if (isDisposed) {
				return;
			}
			const myToken = ++tokenPool;
			Promise.resolve().then(() => {
				if (myToken === tokenPool) {
					this._proxy.$updateKernel(handle, data);
				}
			});
		};

		// notebook documents that are associated to this controller
		const associatedNotebooks = new ResourceMap<boolean>();

		const controller: vscode.NotebookController = {
			get id() { return id; },
			get viewType() { return data.viewType; },
			onDidChangeNotebookAssociation: onDidChangeSelection.event,
			get label() {
				return data.label;
			},
			set label(value) {
				data.label = value ?? extension.displayName ?? extension.name;
				_update();
			},
			get detail() {
				return data.detail ?? '';
			},
			set detail(value) {
				data.detail = value;
				_update();
			},
			get description() {
				return data.description ?? '';
			},
			set description(value) {
				data.description = value;
				_update();
			},
			get supportedLanguages() {
				return data.supportedLanguages;
			},
			set supportedLanguages(value) {
				data.supportedLanguages = value;
				_update();
			},
			get hasExecutionOrder() {
				return data.hasExecutionOrder ?? false;
			},
			set hasExecutionOrder(value) {
				data.hasExecutionOrder = value;
				_update();
			},
			get preloads() {
				return data.preloads ? data.preloads.map(extHostTypeConverters.NotebookKernelPreload.to) : [];
			},
			get executeHandler() {
				return _executeHandler;
			},
			set executeHandler(value) {
				_executeHandler = value ?? _defaultExecutHandler;
			},
			get interruptHandler() {
				return _interruptHandler;
			},
			set interruptHandler(value) {
				_interruptHandler = value;
				data.supportsInterrupt = Boolean(value);
				_update();
			},
			createNotebookCellExecutionTask(cell) {
				if (isDisposed) {
					throw new Error('notebook controller is DISPOSED');
				}
				if (!associatedNotebooks.has(cell.notebook.uri)) {
					that._logService.trace(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`, Array.from(associatedNotebooks.keys()).map(u => u.toString()));
					throw new Error(`notebook controller is NOT associated to notebook: ${cell.notebook.uri.toString()}`);
				}
				return that._createNotebookCellExecution(cell);
			},
			dispose: () => {
				if (!isDisposed) {
					this._logService.trace(`NotebookController[${handle}], DISPOSED`);
					isDisposed = true;
					this._kernelData.delete(handle);
					commandDisposables.dispose();
					onDidChangeSelection.dispose();
					onDidReceiveMessage.dispose();
					this._proxy.$removeKernel(handle);
				}
			},
			// --- ipc
			onDidReceiveMessage: onDidReceiveMessage.event,
			postMessage(message, editor) {
				return that._proxy.$postMessage(handle, editor && that._extHostNotebook.getIdByEditor(editor), message);
			},
			asWebviewUri(uri: URI) {
				return asWebviewUri(String(handle), uri, that._initData.remote.authority);
			},
			// --- priority
			updateNotebookAffinity(notebook, priority) {
				that._proxy.$updateNotebookPriority(handle, notebook.uri, priority);
			}
		};

		this._kernelData.set(handle, {
			extensionId: extension.identifier,
			controller,
			onDidReceiveMessage,
			onDidChangeSelection,
			associatedNotebooks
		});
		return controller;
	}

	$acceptNotebookAssociation(handle: number, uri: UriComponents, value: boolean): void {
		const obj = this._kernelData.get(handle);
		if (obj) {
			// update data structure
			const notebook = this._extHostNotebook.getNotebookDocument(URI.revive(uri))!;
			if (value) {
				obj.associatedNotebooks.set(notebook.uri, true);
			} else {
				obj.associatedNotebooks.delete(notebook.uri);
			}
			this._logService.trace(`NotebookController[${handle}] ASSOCIATE notebook`, notebook.uri.toString(), value);
			// send event
			obj.onDidChangeSelection.fire({
				selected: value,
				notebook: notebook.apiNotebook
			});
		}
	}

	async $executeCells(handle: number, uri: UriComponents, handles: number[]): Promise<void> {
		const obj = this._kernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return;
		}
		const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
		const cells: vscode.NotebookCell[] = [];
		for (let cellHandle of handles) {
			const cell = document.getCell(cellHandle);
			if (cell) {
				cells.push(cell.apiCell);
			}
		}

		try {
			this._logService.trace(`NotebookController[${handle}] EXECUTE cells`, document.uri.toString(), cells.length);
			await obj.controller.executeHandler.call(obj.controller, cells, document.apiNotebook, obj.controller);
		} catch (err) {
			//
			this._logService.error(`NotebookController[${handle}] execute cells FAILED`, err);
			console.error(err);
		}
	}

	async $cancelCells(handle: number, uri: UriComponents, handles: number[]): Promise<void> {
		const obj = this._kernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return;
		}
		const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
		if (obj.controller.interruptHandler) {
			await obj.controller.interruptHandler.call(obj.controller, document.apiNotebook);
		}

		// we do both? interrupt and cancellation or should we be selective?
		for (let cellHandle of handles) {
			const cell = document.getCell(cellHandle);
			if (cell) {
				this._activeExecutions.get(cell.uri)?.cancel();
			}
		}
	}

	$acceptKernelMessageFromRenderer(handle: number, editorId: string, message: any): void {
		const obj = this._kernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return;
		}

		const editor = this._extHostNotebook.getEditorById(editorId);
		if (!editor) {
			throw new Error(`send message for UNKNOWN editor: ${editorId}`);
		}

		obj.onDidReceiveMessage.fire(Object.freeze({ editor: editor.apiEditor, message }));
	}

	// ---

	_createNotebookCellExecution(cell: vscode.NotebookCell): vscode.NotebookCellExecutionTask {
		if (cell.index < 0) {
			throw new Error('CANNOT execute cell that has been REMOVED from notebook');
		}
		const notebook = this._extHostNotebook.getNotebookDocument(cell.notebook.uri);
		const cellObj = notebook.getCellFromApiCell(cell);
		if (!cellObj) {
			throw new Error('invalid cell');
		}
		if (this._activeExecutions.has(cellObj.uri)) {
			throw new Error(`duplicate execution for ${cellObj.uri}`);
		}
		const execution = new NotebookCellExecutionTask(cellObj.notebook, cellObj, this._mainContext.getProxy(MainContext.MainThreadNotebookDocuments));
		this._activeExecutions.set(cellObj.uri, execution);
		const listener = execution.onDidChangeState(() => {
			if (execution.state === NotebookCellExecutionTaskState.Resolved) {
				execution.dispose();
				listener.dispose();
				this._activeExecutions.delete(cellObj.uri);
			}
		});
		return execution.asApiObject();
	}
}


enum NotebookCellExecutionTaskState {
	Init,
	Started,
	Resolved
}

class NotebookCellExecutionTask extends Disposable {
	private _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState = this._onDidChangeState.event;

	private _state = NotebookCellExecutionTaskState.Init;
	get state(): NotebookCellExecutionTaskState { return this._state; }

	private readonly _tokenSource = this._register(new CancellationTokenSource());

	private readonly _collector: TimeoutBasedCollector<IImmediateCellEditOperation>;

	private _executionOrder: number | undefined;

	constructor(
		private readonly _document: ExtHostNotebookDocument,
		private readonly _cell: ExtHostCell,
		private readonly _proxy: MainThreadNotebookDocumentsShape
	) {
		super();

		this._collector = new TimeoutBasedCollector(10, edits => this.applyEdits(edits));

		this._executionOrder = _cell.internalMetadata.executionOrder;
		this.mixinMetadata({
			runState: NotebookCellExecutionState.Pending,
			executionOrder: null
		});
	}

	cancel(): void {
		this._tokenSource.cancel();
	}

	private async applyEditSoon(edit: IImmediateCellEditOperation): Promise<void> {
		await this._collector.addItem(edit);
	}

	private async applyEdits(edits: IImmediateCellEditOperation[]): Promise<void> {
		return this._proxy.$applyEdits(this._document.uri, edits, false);
	}

	private verifyStateForOutput() {
		if (this._state === NotebookCellExecutionTaskState.Init) {
			throw new Error('Must call start before modifying cell output');
		}

		if (this._state === NotebookCellExecutionTaskState.Resolved) {
			throw new Error('Cannot modify cell output after calling resolve');
		}
	}

	private mixinMetadata(mixinMetadata: NullablePartialNotebookCellInternalMetadata) {
		const edit: IImmediateCellEditOperation = { editType: CellEditType.PartialInternalMetadata, handle: this._cell.handle, internalMetadata: mixinMetadata };
		this.applyEdits([edit]);
	}

	private cellIndexToHandle(cellIndex: number | undefined): number {
		if (typeof cellIndex !== 'number') {
			return this._cell.handle;
		}
		const cell = this._document.getCellFromIndex(cellIndex);
		if (!cell) {
			throw new Error('INVALID cell index');
		}
		return cell.handle;
	}

	asApiObject(): vscode.NotebookCellExecutionTask {
		const that = this;
		return Object.freeze(<vscode.NotebookCellExecutionTask>{
			get document() { return that._document.apiNotebook; },
			get cell() { return that._cell.apiCell; },

			get executionOrder() { return that._executionOrder; },
			set executionOrder(v: number | undefined) {
				that._executionOrder = v;
				that.mixinMetadata({
					executionOrder: v
				});
			},

			start(context?: vscode.NotebookCellExecuteStartContext): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved || that._state === NotebookCellExecutionTaskState.Started) {
					throw new Error('Cannot call start again');
				}

				that._state = NotebookCellExecutionTaskState.Started;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: NotebookCellExecutionState.Executing,
					runStartTime: context?.startTime ?? null
				});
			},

			end(result?: vscode.NotebookCellExecuteEndContext): void {
				if (that._state === NotebookCellExecutionTaskState.Resolved) {
					throw new Error('Cannot call resolve twice');
				}

				that._state = NotebookCellExecutionTaskState.Resolved;
				that._onDidChangeState.fire();

				that.mixinMetadata({
					runState: null,
					lastRunSuccess: result?.success ?? null,
					runEndTime: result?.endTime ?? null,
				});
			},

			clearOutput(cellIndex?: number): Thenable<void> {
				that.verifyStateForOutput();
				return this.replaceOutput([], cellIndex);
			},

			async appendOutput(outputs: vscode.NotebookCellOutput | vscode.NotebookCellOutput[], cellIndex?: number): Promise<void> {
				that.verifyStateForOutput();
				const handle = that.cellIndexToHandle(cellIndex);
				outputs = asArray(outputs);
				return that.applyEditSoon({ editType: CellEditType.Output, handle, append: true, outputs: outputs.map(extHostTypeConverters.NotebookCellOutput.from) });
			},

			async replaceOutput(outputs: vscode.NotebookCellOutput | vscode.NotebookCellOutput[], cellIndex?: number): Promise<void> {
				that.verifyStateForOutput();
				const handle = that.cellIndexToHandle(cellIndex);
				outputs = asArray(outputs);
				return that.applyEditSoon({ editType: CellEditType.Output, handle, outputs: outputs.map(extHostTypeConverters.NotebookCellOutput.from) });
			},

			async appendOutputItems(items: vscode.NotebookCellOutputItem | vscode.NotebookCellOutputItem[], outputId: string): Promise<void> {
				that.verifyStateForOutput();
				items = asArray(items);
				return that.applyEditSoon({ editType: CellEditType.OutputItems, append: true, items: items.map(extHostTypeConverters.NotebookCellOutputItem.from), outputId });
			},

			async replaceOutputItems(items: vscode.NotebookCellOutputItem | vscode.NotebookCellOutputItem[], outputId: string): Promise<void> {
				that.verifyStateForOutput();
				items = asArray(items);
				return that.applyEditSoon({ editType: CellEditType.OutputItems, items: items.map(extHostTypeConverters.NotebookCellOutputItem.from), outputId });
			},

			token: that._tokenSource.token
		});
	}
}

class TimeoutBasedCollector<T> {
	private batch: T[] = [];
	private waitPromise: Promise<void> | undefined;

	constructor(
		private readonly delay: number,
		private readonly callback: (items: T[]) => Promise<void>) { }

	addItem(item: T): Promise<void> {
		this.batch.push(item);
		if (!this.waitPromise) {
			this.waitPromise = timeout(this.delay).then(() => {
				this.waitPromise = undefined;
				const batch = this.batch;
				this.batch = [];
				return this.callback(batch);
			});
		}

		return this.waitPromise;
	}
}
