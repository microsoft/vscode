/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, isNonEmptyArray } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { NotebookDto } from 'vs/workbench/api/browser/mainThreadNotebookDto';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { INotebookKernel, INotebookKernelChangeEvent, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { CellExecuteEditDto, ExtHostContext, ExtHostNotebookKernelsShape, IExtHostContext, INotebookKernelDto2, MainContext, MainThreadNotebookKernelsShape } from '../common/extHost.protocol';

abstract class MainThreadKernel implements INotebookKernel {

	private readonly _onDidChange = new Emitter<INotebookKernelChangeEvent>();
	private readonly preloads: { uri: URI, provides: string[]; }[];
	readonly onDidChange: Event<INotebookKernelChangeEvent> = this._onDidChange.event;

	readonly id: string;
	readonly viewType: string;
	readonly extension: ExtensionIdentifier;

	implementsInterrupt: boolean;
	label: string;
	description?: string;
	detail?: string;
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
		this.viewType = data.notebookType;
		this.extension = data.extensionId;

		this.implementsInterrupt = data.supportsInterrupt ?? false;
		this.label = data.label;
		this.description = data.description;
		this.detail = data.detail;
		this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : _modeService.getRegisteredModes();
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
		if (data.supportedLanguages !== undefined) {
			this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : this._modeService.getRegisteredModes();
			event.supportedLanguages = true;
		}
		if (data.supportsExecutionOrder !== undefined) {
			this.implementsExecutionOrder = data.supportsExecutionOrder;
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
		@INotebookService private readonly _notebookService: INotebookService,
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
			if (!editor.hasModel()) {
				return;
			}
			const { selected } = this._notebookKernelService.getMatchingKernel(editor.textModel);
			if (!selected) {
				return;
			}
			for (let [handle, candidate] of this._kernels) {
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
		}(data, this._modeService);

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

	// --- execution editss

	async $applyExecutionEdits(resource: UriComponents, cellEdits: CellExecuteEditDto[]): Promise<void> {
		const textModel = this._notebookService.getNotebookTextModel(URI.from(resource));
		if (!textModel) {
			throw new Error(`Can't apply edits to unknown notebook model: ${URI.revive(resource).toString()}`);
		}

		const edits = cellEdits.map(NotebookDto.fromCellExecuteEditDto);

		try {
			textModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
		} catch (e) {
			// Clearing outputs at the same time as the EH calling append/replaceOutputItems is an expected race, and it should be a no-op.
			// And any other failure should not throw back to the extension.
			onUnexpectedError(e);
		}
	}
}
