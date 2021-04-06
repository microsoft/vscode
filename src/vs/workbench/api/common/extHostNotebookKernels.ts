/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostNotebookKernelsShape, IMainContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import * as vscode from 'vscode';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';

export interface VsCodeNotebookKernel {

	readonly id: string;

	// select notebook of a type and/or by file-pattern
	readonly selector: NotebookSelector;

	// is this kernel selected
	readonly selected: boolean;

	// fired when kernel is selected/unselected
	readonly onDidChangeSelection: Event<boolean>;

	// UI properties (get/set)
	label: string;
	description: string;
	supportedLanguages: string[];
	hasExecutionOrder: boolean;

	// invoked when Run, Run All, Run Selections is triggered,
	// command is invoked with [kernel, cells] as arguments
	executeCommand: vscode.Command;

	// optional kernel interrupt command
	interruptCommand?: vscode.Command;

	// // kernels (and _only_ they) can create executions
	createNotebookCellExecutionTask(uri: vscode.Uri, index: number): vscode.NotebookCellExecutionTask;

	// // kernels can establish IPC channels to (visible) notebook editors
	// createNotebookCommunication(editor: vscode.NotebookEditor): vscode.NotebookCommunication;

	// remove kernel
	dispose(): void;
}

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

	createKernel(id: string, label: string, selector: NotebookSelector, executeCommand: vscode.Command): VsCodeNotebookKernel {

		const handle = this._handlePool++;
		const that = this;

		const commandDisposables = new DisposableStore();

		const emitter = new Emitter<boolean>();
		this._selectionState.set(handle, { value: false, emitter });

		const data: INotebookKernelDto2 = {
			id,
			selector,
			label,
			executeCommand: this._extHostCommands.converter.toInternal(executeCommand, commandDisposables),
			supportedLanguages: [],
		};
		this._proxy.$addKernel(handle, data);

		// update: all setters write directly into the dto object
		// and trigger an update. the actual update will only happen
		// once per event loop
		let tokenPool = 0;
		const _update = () => {
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
