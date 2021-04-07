/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostNotebookKernelsShape, IMainContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import * as vscode from 'vscode';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

export class ExtHostNotebookKernels implements ExtHostNotebookKernelsShape {

	private readonly _proxy: MainThreadNotebookKernelsShape;

	private readonly _selectionState = new Map<number, { value: boolean, emitter: Emitter<boolean> }>();
	private _handlePool: number = 0;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostCommands: ExtHostCommands,
		private readonly _extHostNotebook: ExtHostNotebookController
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebookKernels);
	}

	createKernel(extension: IExtensionDescription, id: string, label: string, selector: NotebookSelector, executeCommand: vscode.Command): vscode.NotebookKernel2 {

		const handle = this._handlePool++;
		const that = this;

		let isDisposed = false;
		const commandDisposables = new DisposableStore();

		const emitter = new Emitter<boolean>();
		this._selectionState.set(handle, { value: false, emitter });

		const data: INotebookKernelDto2 = {
			id,
			selector,
			displayName: extension.displayName ?? extension.name,
			label,
			executeCommand: this._extHostCommands.converter.toInternal(executeCommand, commandDisposables),
			supportedLanguages: [],
		};
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

		return {
			get id() { return data.id; },
			get selector() { return data.selector; },
			get selected() { return that._selectionState.get(handle)?.value ?? false; },
			onDidChangeSelection: emitter.event,
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
			get executeCommand() {
				return that._extHostCommands.converter.fromInternal(data.executeCommand)!;
			},
			set executeCommand(value) {
				data.executeCommand = that._extHostCommands.converter.toInternal(value, commandDisposables);
				_update();
			},
			get interruptCommand() {
				return data.interruptCommand && that._extHostCommands.converter.fromInternal(data.interruptCommand);
			},
			set interruptCommand(value) {
				data.interruptCommand = that._extHostCommands.converter.toInternal(value, commandDisposables);
				_update();
			},
			createNotebookCellExecutionTask(uri, index) {
				return that._extHostNotebook.createNotebookCellExecution(uri, index, data.id)!;
			},
			dispose: () => {
				isDisposed = true;
				this._selectionState.delete(handle);
				commandDisposables.dispose();
				emitter.dispose();
				this._proxy.$removeKernel(handle);
			}
		};
	}

	$acceptSelection(handle: number, value: boolean): void {
		const obj = this._selectionState.get(handle);
		if (obj) {
			obj.value = value;
			obj.emitter.fire(value);
		}
	}
}
