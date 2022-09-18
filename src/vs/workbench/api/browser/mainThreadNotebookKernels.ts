/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { NotebookDto } from 'vs/workbench/api/browser/mainThreadNotebookDto';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookCellExecution, INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernel, INotebookKernelChangeEvent, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { ExtHostContext, ExtHostNotebookKernelsShape, ICellExecuteUpdateDto, ICellExecutionCompleteDto, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from '../common/extHost.protocol';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

abstract class MainThreadKernel implements INotebookKernel {
	private readonly _onDidChange = new Emitter<INotebookKernelChangeEvent>();
	private readonly preloads: { uri: URI; provides: readonly string[] }[];
	readonly onDidChange: Event<INotebookKernelChangeEvent> = this._onDidChange.event;

	readonly id: string;
	readonly viewType: string;
	readonly extension: ExtensionIdentifier;

	implementsInterrupt: boolean;
	label: string;
	description?: string;
	detail?: string;
	kind?: string;
	supportedLanguages: string[];
	implementsExecutionOrder: boolean;
	localResourceRoot: URI;

	public get preloadUris() {
		return this.preloads.map(p => p.uri);
	}

	public get preloadProvides() {
		return this.preloads.map(p => p.provides).flat();
	}

	constructor(data: INotebookKernelDto2, private _languageService: ILanguageService) {
		this.id = data.id;
		this.viewType = data.notebookType;
		this.extension = data.extensionId;

		this.implementsInterrupt = data.supportsInterrupt ?? false;
		this.label = data.label;
		this.description = data.description;
		this.detail = data.detail;
		this.kind = data.kind;
		this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : _languageService.getRegisteredLanguageIds();
		this.implementsExecutionOrder = data.supportsExecutionOrder ?? false;
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
		if (data.kind !== undefined) {
			this.kind = data.kind;
			event.kind = true;
		}
		if (data.supportedLanguages !== undefined) {
			this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : this._languageService.getRegisteredLanguageIds();
			event.supportedLanguages = true;
		}
		if (data.supportsExecutionOrder !== undefined) {
			this.implementsExecutionOrder = data.supportsExecutionOrder;
			event.hasExecutionOrder = true;
		}
		if (data.supportsInterrupt !== undefined) {
			this.implementsInterrupt = data.supportsInterrupt;
			event.hasInterruptHandler = true;
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

	private readonly _executions = new Map<number, INotebookCellExecution>();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageService private readonly _languageService: ILanguageService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookEditorService notebookEditorService: INotebookEditorService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookKernels);

		notebookEditorService.listNotebookEditors().forEach(this._onEditorAdd, this);
		notebookEditorService.onDidAddNotebookEditor(this._onEditorAdd, this, this._disposables);
		notebookEditorService.onDidRemoveNotebookEditor(this._onEditorRemove, this, this._disposables);

		this._disposables.add(toDisposable(() => {
			// EH shut down, complete all executions started by this EH
			this._executions.forEach(e => {
				e.complete({});
			});
		}));

		this._disposables.add(this._notebookExecutionStateService.onDidChangeCellExecution(e => {
			this._proxy.$cellExecutionChanged(e.notebook, e.cellHandle, e.changed?.state);
		}));
	}

	dispose(): void {
		this._disposables.dispose();
		for (const [, registration] of this._kernels.values()) {
			registration.dispose();
		}
	}

	// --- kernel ipc

	private _onEditorAdd(editor: INotebookEditor) {

		const ipcListener = editor.onDidReceiveMessage(e => {
			if (!editor.hasModel()) {
				return;
			}
			const { selected } = this._notebookKernelService.getMatchingKernel(editor.textModel);
			if (!selected) {
				return;
			}
			for (const [handle, candidate] of this._kernels) {
				if (candidate[0] === selected) {
					this._proxy.$acceptKernelMessageFromRenderer(handle, editor.getId(), e.message);
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
			if (this._notebookKernelService.getMatchingKernel(editor.textModel).selected !== kernel) {
				// different kernel
				continue;
			}
			if (editorId === undefined) {
				// all editors
				editor.postMessage(message);
				didSend = true;
			} else if (editor.getId() === editorId) {
				// selected editors
				editor.postMessage(message);
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
		}(data, this._languageService);

		const listener = this._notebookKernelService.onDidChangeSelectedNotebooks(e => {
			if (e.oldKernel === kernel.id) {
				this._proxy.$acceptNotebookAssociation(handle, e.notebook, false);
			} else if (e.newKernel === kernel.id) {
				this._proxy.$acceptNotebookAssociation(handle, e.notebook, true);
			}
		});

		const registration = this._notebookKernelService.registerKernel(kernel);
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

	$updateNotebookPriority(handle: number, notebook: UriComponents, value: number | undefined): void {
		const tuple = this._kernels.get(handle);
		if (tuple) {
			this._notebookKernelService.updateKernelNotebookAffinity(tuple[0], URI.revive(notebook), value);
		}
	}

	// --- execution

	$createExecution(handle: number, controllerId: string, rawUri: UriComponents, cellHandle: number): void {
		const uri = URI.revive(rawUri);
		const notebook = this._notebookService.getNotebookTextModel(uri);
		if (!notebook) {
			throw new Error(`Notebook not found: ${uri.toString()}`);
		}

		const kernel = this._notebookKernelService.getMatchingKernel(notebook);
		if (!kernel.selected || kernel.selected.id !== controllerId) {
			throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
		}
		const execution = this._notebookExecutionStateService.createCellExecution(uri, cellHandle);
		execution.confirm();
		this._executions.set(handle, execution);
	}

	$updateExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecuteUpdateDto[]>): void {
		const updates = data.value;
		try {
			const execution = this._executions.get(handle);
			execution?.update(updates.map(NotebookDto.fromCellExecuteUpdateDto));
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	$completeExecution(handle: number, data: SerializableObjectWithBuffers<ICellExecutionCompleteDto>): void {
		try {
			const execution = this._executions.get(handle);
			execution?.complete(NotebookDto.fromCellExecuteCompleteDto(data.value));
		} catch (e) {
			onUnexpectedError(e);
		} finally {
			this._executions.delete(handle);
		}
	}
}
