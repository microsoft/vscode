/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostNotebookKernelsShape, IMainContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookCellRange } from 'vs/workbench/api/common/extHostTypeConverters';
import { isNonEmptyArray } from 'vs/base/common/arrays';

type ExecuteHandler = (executions: vscode.NotebookCellExecutionTask[]) => void;
type InterruptHandler = (notebook: vscode.NotebookDocument) => void;

export class ExtHostNotebookKernels implements ExtHostNotebookKernelsShape {

	private readonly _proxy: MainThreadNotebookKernelsShape;

	private readonly _kernelData = new Map<number, { id: string, executeHandler: ExecuteHandler, interruptHandler?: InterruptHandler, onDidChangeSelection: Emitter<{ selected: boolean, notebook: vscode.NotebookDocument }> }>();
	private _handlePool: number = 0;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostNotebook: ExtHostNotebookController
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebookKernels);
	}

	createKernel(extension: IExtensionDescription, options: vscode.NotebookKernelOptions): vscode.NotebookController {

		const handle = this._handlePool++;
		const that = this;

		let isDisposed = false;
		const commandDisposables = new DisposableStore();

		const emitter = new Emitter<{ selected: boolean, notebook: vscode.NotebookDocument }>();
		this._kernelData.set(handle, { id: options.id, executeHandler: options.executeHandler, onDidChangeSelection: emitter });

		const data: INotebookKernelDto2 = {
			id: options.id,
			selector: options.selector,
			extensionId: extension.identifier,
			extensionLocation: extension.extensionLocation,
			label: options.label,
			supportedLanguages: [],
		};

		// todo@jrieken the selector needs to be massaged
		this._proxy.$addKernel(handle, data);

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

		const result: vscode.NotebookController = {
			get id() { return data.id; },
			get selector() { return data.selector; },
			onDidChangeNotebookAssociation: emitter.event,
			get label() {
				return data.label;
			},
			set label(value) {
				data.label = value;
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
				data.supportedLanguages = isNonEmptyArray(value) ? value : ['plaintext'];
				_update();
			},
			get hasExecutionOrder() {
				return data.hasExecutionOrder ?? false;
			},
			set hasExecutionOrder(value) {
				data.hasExecutionOrder = value;
				_update();
			},
			get executeHandler() {
				return that._kernelData.get(handle)!.executeHandler;
			},
			get interruptHandler() {
				return that._kernelData.get(handle)!.interruptHandler;
			},
			set interruptHandler(value) {
				that._kernelData.get(handle)!.interruptHandler = value;
				data.supportsInterrupt = Boolean(value);
				_update();
			},
			createNotebookCellExecutionTask(cell) {
				if (isDisposed) {
					throw new Error('object disposed');
				}
				//todo@jrieken
				return that._extHostNotebook.createNotebookCellExecution(cell.document.uri, cell.index, data.id)!;
			},
			dispose: () => {
				if (!isDisposed) {
					isDisposed = true;
					this._kernelData.delete(handle);
					commandDisposables.dispose();
					emitter.dispose();
					this._proxy.$removeKernel(handle);
				}
			}
		};

		result.supportedLanguages = options.supportedLanguages ?? [];
		result.interruptHandler = options.interruptHandler;
		result.hasExecutionOrder = options.hasExecutionOrder ?? false;

		return result;
	}

	$acceptSelection(handle: number, uri: UriComponents, value: boolean): void {
		const obj = this._kernelData.get(handle);
		if (obj) {
			obj.onDidChangeSelection.fire({
				selected: value,
				notebook: this._extHostNotebook.lookupNotebookDocument(URI.revive(uri))!.notebookDocument
			});
		}
	}

	$executeCells(handle: number, uri: UriComponents, ranges: ICellRange[]): void {
		const obj = this._kernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return;
		}
		const document = this._extHostNotebook.lookupNotebookDocument(URI.revive(uri));
		if (!document) {
			throw new Error('MISSING notebook');
		}

		const execs: vscode.NotebookCellExecutionTask[] = [];
		for (let range of ranges) {
			const cells = document.notebookDocument.getCells(NotebookCellRange.to(range));
			for (let cell of cells) {
				const exec = this._extHostNotebook.createNotebookCellExecution(document.uri, cell.index, obj.id);
				if (exec) {
					execs.push(exec);
				} else {
					// todo@jrieken there should always be an exec-object
					console.warn('could NOT create notebook cell execution task for: ' + cell.document.uri);
				}
			}
		}

		try {
			obj.executeHandler(execs);
		} catch (err) {
			//
			console.error(err);
		}
	}

	$cancelCells(handle: number, uri: UriComponents, ranges: ICellRange[]): void {
		const obj = this._kernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return;
		}
		const document = this._extHostNotebook.lookupNotebookDocument(URI.revive(uri));
		if (!document) {
			throw new Error('MISSING notebook');
		}
		if (obj.interruptHandler) {
			obj.interruptHandler(document.notebookDocument);
		}
	}
}
