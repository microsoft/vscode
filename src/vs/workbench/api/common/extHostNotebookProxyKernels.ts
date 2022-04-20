/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookProxyKernelsShape, IMainContext, INotebookProxyKernelDto, MainContext, MainThreadNotebookProxyKernelsShape } from 'vs/workbench/api/common/extHost.protocol';
import { createKernelId, ExtHostNotebookKernels } from 'vs/workbench/api/common/extHostNotebookKernels';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import * as vscode from 'vscode';

interface IProxyKernelData {
	extensionId: ExtensionIdentifier;
	controller: vscode.NotebookProxyController;
	onDidChangeSelection: Emitter<{ selected: boolean; notebook: vscode.NotebookDocument }>;
	associatedNotebooks: ResourceMap<boolean>;
}

export type SelectKernelReturnArgs = ControllerInfo | { notebookEditorId: string } | ControllerInfo & { notebookEditorId: string } | undefined;
type ControllerInfo = { id: string; extension: string };


export class ExtHostNotebookProxyKernels implements ExtHostNotebookProxyKernelsShape {

	private readonly _proxy: MainThreadNotebookProxyKernelsShape;

	private readonly _proxyKernelData: Map<number, IProxyKernelData> = new Map<number, IProxyKernelData>();
	private _handlePool: number = 0;

	private readonly _onDidChangeCellExecutionState = new Emitter<vscode.NotebookCellExecutionStateChangeEvent>();
	readonly onDidChangeNotebookCellExecutionState = this._onDidChangeCellExecutionState.event;

	constructor(
		mainContext: IMainContext,
		private readonly extHostNotebook: ExtHostNotebookKernels,
		@ILogService private readonly _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebookProxyKernels);
	}

	createNotebookProxyController(extension: IExtensionDescription, id: string, viewType: string, label: string, handler: () => vscode.NotebookController | string | Thenable<vscode.NotebookController | string>): vscode.NotebookProxyController {
		const handle = this._handlePool++;

		let isDisposed = false;
		const commandDisposables = new DisposableStore();
		const onDidChangeSelection = new Emitter<{ selected: boolean; notebook: vscode.NotebookDocument }>();

		const data: INotebookProxyKernelDto = {
			id: createKernelId(extension.identifier, id),
			notebookType: viewType,
			extensionId: extension.identifier,
			extensionLocation: extension.extensionLocation,
			label: label || extension.identifier.value,
		};

		let _resolveHandler = handler;

		this._proxy.$addProxyKernel(handle, data).catch(err => {
			// this can happen when a kernel with that ID is already registered
			console.log(err);
			isDisposed = true;
		});

		let tokenPool = 0;
		const _update = () => {
			if (isDisposed) {
				return;
			}
			const myToken = ++tokenPool;
			Promise.resolve().then(() => {
				if (myToken === tokenPool) {
					this._proxy.$updateProxyKernel(handle, data);
				}
			});
		};

		// notebook documents that are associated to this controller
		const associatedNotebooks = new ResourceMap<boolean>();

		const controller: vscode.NotebookProxyController = {
			get id() { return id; },
			get notebookType() { return data.notebookType; },
			onDidChangeSelectedNotebooks: onDidChangeSelection.event,
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
			get kind() {
				checkProposedApiEnabled(extension, 'notebookControllerKind');
				return data.kind ?? '';
			},
			set kind(value) {
				checkProposedApiEnabled(extension, 'notebookControllerKind');
				data.kind = value;
				_update();
			},
			get resolveHandler() {
				return _resolveHandler;
			},
			dispose: () => {
				if (!isDisposed) {
					this._logService.trace(`NotebookProxyController[${handle}], DISPOSED`);
					isDisposed = true;
					this._proxyKernelData.delete(handle);
					commandDisposables.dispose();
					onDidChangeSelection.dispose();
					this._proxy.$removeProxyKernel(handle);
				}
			}
		};

		this._proxyKernelData.set(handle, {
			extensionId: extension.identifier,
			controller,
			onDidChangeSelection,
			associatedNotebooks
		});
		return controller;
	}

	async $resolveKernel(handle: number): Promise<string | null> {
		const obj = this._proxyKernelData.get(handle);
		if (!obj) {
			// extension can dispose kernels in the meantime
			return null;
		}

		const controller = await obj.controller.resolveHandler();
		if (typeof controller === 'string') {
			return controller;
		} else {
			return this.extHostNotebook.getIdByController(controller);
		}
	}
}

