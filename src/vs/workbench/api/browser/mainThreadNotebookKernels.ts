/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, isNonEmptyArray } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { INotebookKernel, INotebookKernelChangeEvent } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookSelector';
import { ExtHostContext, ExtHostNotebookKernelsShape, IExtHostContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from '../common/extHost.protocol';

abstract class MainThreadKernel implements INotebookKernel {

	private readonly _onDidChange = new Emitter<INotebookKernelChangeEvent>();
	private readonly preloads: { uri: URI, provides: string[] }[];
	readonly onDidChange: Event<INotebookKernelChangeEvent> = this._onDidChange.event;

	readonly id: string;
	readonly selector: NotebookSelector;
	readonly extension: ExtensionIdentifier;

	implementsInterrupt: boolean;
	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	supportedLanguages: string[];
	implementsExecutionOrder: boolean;
	localResourceRoot: URI;

	public get preloadUris() {
		return this.preloads.map(p => p.uri);
	}

	public get preloadProvides() {
		return flatten(this.preloads.map(p => p.provides));
	}

	constructor(data: INotebookKernelDto2, private _modeService: IModeService) {
		this.id = data.id;
		this.selector = data.selector;
		this.extension = data.extensionId;

		this.implementsInterrupt = data.supportsInterrupt ?? false;
		this.label = data.label;
		this.description = data.description;
		this.detail = data.detail;
		this.isPreferred = data.isPreferred;
		this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : _modeService.getRegisteredModes();
		this.implementsExecutionOrder = data.hasExecutionOrder ?? false;
		this.localResourceRoot = URI.revive(data.extensionLocation);
		this.preloads = data.preloads?.map(u => ({ uri: URI.revive(u.uri), provides: u.provides })) ?? [];
	}


	update(data: Partial<INotebookKernelDto2>) {

		const event: INotebookKernelChangeEvent = Object.create(null);
		if (data.label !== undefined) {
			this.label = data.label;
			event.label = true;
		}
		if (data.description !== undefined) {
			this.description = data.description;
			event.description = true;
		}
		if (data.detail !== undefined) {
			this.detail = data.detail;
			event.detail = true;
		}
		if (data.isPreferred !== undefined) {
			this.isPreferred = data.isPreferred;
			event.isPreferred = true;
		}
		if (data.supportedLanguages !== undefined) {
			this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : this._modeService.getRegisteredModes();
			event.supportedLanguages = true;
		}
		if (data.hasExecutionOrder !== undefined) {
			this.implementsExecutionOrder = data.hasExecutionOrder;
			event.hasExecutionOrder = true;
		}
		this._onDidChange.fire(event);
	}

	abstract executeNotebookCellsRequest(uri: URI, cellHandles: number[]): Promise<void>;
	abstract cancelNotebookCellExecution(uri: URI, cellHandles: number[]): Promise<void>;
}

@extHostNamedCustomer(MainContext.MainThreadNotebookKernels)
export class MainThreadNotebookKernels implements MainThreadNotebookKernelsShape {

	private readonly _editors = new Map<INotebookEditor, IDisposable>();
	private readonly _disposables = new DisposableStore();

	private readonly _kernels = new Map<number, [kernel: MainThreadKernel, registraion: IDisposable]>();
	private readonly _proxy: ExtHostNotebookKernelsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IModeService private readonly _modeService: IModeService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookEditorService notebookEditorService: INotebookEditorService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookKernels);

		notebookEditorService.listNotebookEditors().forEach(this._onEditorAdd, this);
		notebookEditorService.onDidAddNotebookEditor(this._onEditorAdd, this, this._disposables);
		notebookEditorService.onDidRemoveNotebookEditor(this._onEditorRemove, this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		for (let [, registration] of this._kernels.values()) {
			registration.dispose();
		}
	}

	// --- kernel ipc

	private _onEditorAdd(editor: INotebookEditor) {

		const ipcListener = editor.onDidReceiveMessage(e => {
			if (e.forRenderer) {
				return;
			}
			if (!editor.hasModel()) {
				return;
			}
			const { bound: kernel } = this._notebookKernelService.getNotebookKernels(editor.viewModel.notebookDocument);
			if (!kernel) {
				return;
			}
			for (let [handle, candidate] of this._kernels) {
				if (candidate[0] === kernel) {
					this._proxy.$acceptRendererMessage(handle, editor.getId(), e.message);
					break;
				}
			}
		});
		this._editors.set(editor, ipcListener);
	}

	private _onEditorRemove(editor: INotebookEditor) {
		this._editors.get(editor)?.dispose();
		this._editors.delete(editor);
	}

	async $postMessage(handle: number, editorId: string | undefined, message: any): Promise<boolean> {
		const tuple = this._kernels.get(handle);
		if (!tuple) {
			throw new Error('kernel already disposed');
		}
		const [kernel] = tuple;
		let didSend = false;
		for (const [editor] of this._editors) {
			if (!editor.hasModel()) {
				continue;
			}
			if (this._notebookKernelService.getNotebookKernels(editor.viewModel.notebookDocument).bound !== kernel) {
				// different kernel
				continue;
			}
			if (editorId === undefined) {
				// all editors
				editor.postMessage(undefined, message);
				didSend = true;
			} else if (editor.getId() === editorId) {
				// selected editors
				editor.postMessage(undefined, message);
				didSend = true;
				break;
			}
		}
		return didSend;
	}

	// --- kernel adding/updating/removal

	async $addKernel(handle: number, data: INotebookKernelDto2): Promise<void> {
		const that = this;
		const kernel = new class extends MainThreadKernel {
			async executeNotebookCellsRequest(uri: URI, handles: number[]): Promise<void> {
				await that._proxy.$executeCells(handle, uri, handles);
			}
			async cancelNotebookCellExecution(uri: URI, handles: number[]): Promise<void> {
				await that._proxy.$cancelCells(handle, uri, handles);
			}
		}(data, this._modeService);
		const registration = this._notebookKernelService.registerKernel(kernel);

		const listener = this._notebookKernelService.onDidChangeNotebookKernelBinding(e => {
			if (e.oldKernel === kernel.id) {
				this._proxy.$acceptSelection(handle, e.notebook, false);
			} else if (e.newKernel === kernel.id) {
				this._proxy.$acceptSelection(handle, e.notebook, true);
			}
		});

		this._kernels.set(handle, [kernel, combinedDisposable(listener, registration)]);
	}

	$updateKernel(handle: number, data: Partial<INotebookKernelDto2>): void {
		const tuple = this._kernels.get(handle);
		if (tuple) {
			tuple[0].update(data);
		}
	}

	$removeKernel(handle: number): void {
		const tuple = this._kernels.get(handle);
		if (tuple) {
			tuple[1].dispose();
			this._kernels.delete(handle);
		}
	}
}
