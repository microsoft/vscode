/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { INotebookKernel, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernelBindEvent, INotebookKernelService, INotebookTextModelLike } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { LRUCache, ResourceMap } from 'vs/base/common/map';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { runWhenIdle } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

class KernelInfo {

	private static _logicClock = 0;

	readonly kernel: INotebookKernel;
	public score: number;
	readonly time: number;

	readonly notebookPriorities = new ResourceMap<number>();

	constructor(kernel: INotebookKernel) {
		this.kernel = kernel;
		this.score = -1;
		this.time = KernelInfo._logicClock++;
	}
}

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private static _storageKey = 'notebook.kernelBindings';

	private readonly _disposables = new DisposableStore();
	private readonly _kernels = new Map<string, KernelInfo>();
	private readonly _kernelBindings = new LRUCache<string, string>(1000, 0.7);

	private readonly _onDidChangeNotebookKernelBinding = new Emitter<INotebookKernelBindEvent>();
	private readonly _onDidAddKernel = new Emitter<INotebookKernel>();
	private readonly _onDidRemoveKernel = new Emitter<INotebookKernel>();

	readonly onDidChangeNotebookKernelBinding: Event<INotebookKernelBindEvent> = this._onDidChangeNotebookKernelBinding.event;
	readonly onDidAddKernel: Event<INotebookKernel> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel> = this._onDidRemoveKernel.event;

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@IStorageService private _storageService: IStorageService,
		@ILogService logService: ILogService,
	) {

		try {
			const value = _storageService.get(NotebookKernelService._storageKey, StorageScope.WORKSPACE, '[]');
			const data = JSON.parse(value);
			this._kernelBindings.fromJSON(data);
		} catch {
			logService.warn('FAILED to restore kernel bindings');
		}

		// auto associate kernels to new notebook documents
		this._disposables.add(_notebookService.onDidAddNotebookDocument(this._autoAssociateNotebook, this));
	}

	dispose() {
		this._disposables.dispose();
		this._onDidChangeNotebookKernelBinding.dispose();
		this._onDidAddKernel.dispose();
		this._onDidRemoveKernel.dispose();
		this._kernels.clear();
	}

	private _persistBindingsSoon(): void {
		runWhenIdle(() => {
			const raw = JSON.stringify(this._kernelBindings);
			this._storageService.store(NotebookKernelService._storageKey, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}, 100);
	}

	private _autoAssociateNotebook(notebook: INotebookTextModel, onlyThisKernel?: INotebookKernel): void {

		const id = this._kernelBindings.get(notebook.uri.toString());
		if (!id) {
			// no kernel associated
			return;
		}
		const existingKernel = this._kernels.get(id);
		if (!existingKernel) {
			// associated kernel not known
			return;
		}
		if (!onlyThisKernel || existingKernel.kernel === onlyThisKernel) {
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel: undefined, newKernel: existingKernel.kernel.id });
		}
	}

	registerKernel(kernel: INotebookKernel): IDisposable {
		if (this._kernels.has(kernel.id)) {
			throw new Error(`NOTEBOOK CONTROLLER with id '${kernel.id}' already exists`);
		}

		this._kernels.set(kernel.id, new KernelInfo(kernel));
		this._onDidAddKernel.fire(kernel);

		// auto associate the new kernel to existing notebooks it was
		// associated to in the past.
		for (const notebook of this._notebookService.getNotebookTextModels()) {
			this._autoAssociateNotebook(notebook, kernel);
		}

		return toDisposable(() => {
			if (this._kernels.delete(kernel.id)) {
				this._onDidRemoveKernel.fire(kernel);
			}
			for (let [uri, candidate] of Array.from(this._kernelBindings)) {
				if (candidate === kernel.id) {
					this._kernelBindings.delete(uri);
					this._onDidChangeNotebookKernelBinding.fire({ notebook: URI.parse(uri), oldKernel: kernel.id, newKernel: undefined });
				}
			}
		});
	}

	getNotebookKernels(notebook: INotebookTextModelLike): { bound: INotebookKernel | undefined, all: INotebookKernel[] } {

		// all applicable kernels
		const kernels: { kernel: INotebookKernel, priority: number }[] = [];
		for (const info of this._kernels.values()) {
			if (info.kernel.viewType === notebook.viewType || info.kernel.viewType === '*') {
				kernels.push({ kernel: info.kernel, priority: info.notebookPriorities.get(notebook.uri) ?? 1 /* vscode.NotebookControllerPriority.Default */ });
			}
		}

		const all = kernels
			.sort((a, b) => b.priority - a.priority || a.kernel.label.localeCompare(b.kernel.label))
			.map(obj => obj.kernel);

		// bound kernel
		const boundId = this._kernelBindings.get(notebook.uri.toString());
		const bound = boundId ? this._kernels.get(boundId)?.kernel : undefined;

		return { all, bound };
	}

	// a notebook has one kernel, a kernel has N notebooks
	// notebook <-1----N-> kernel
	updateNotebookKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel | undefined): void {
		const key = notebook.uri.toString();
		const oldKernel = this._kernelBindings.get(key);
		if (oldKernel !== kernel?.id) {
			if (kernel) {
				this._kernelBindings.set(key, kernel.id);
			} else {
				this._kernelBindings.delete(key);
			}
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel?.id });
			this._persistBindingsSoon();
		}
	}

	updateKernelNotebookPriority(kernel: INotebookKernel, notebook: URI, preference: number | undefined): void {
		const info = this._kernels.get(kernel.id);
		if (!info) {
			throw new Error(`UNKNOWN kernel '${kernel.id}'`);
		}
		if (preference === undefined) {
			info.notebookPriorities.delete(notebook);
		} else {
			info.notebookPriorities.set(notebook, preference);
		}
	}
}
