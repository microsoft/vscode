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

class LRUMemento<K, V> {

	readonly map: LRUCache<K, V>;

	constructor(
		limit: number,
		private readonly _key: string,
		private readonly _scope: StorageScope,
		private readonly _target: StorageTarget,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this.map = new LRUCache(limit, 0.7);
		this.restore();
	}

	restore(): this {
		try {
			const value = this._storageService.get(this._key, this._scope, '[]');
			const data = JSON.parse(value);
			this.map.fromJSON(data);
		} catch {
			// ignore
		}
		return this;
	}

	store(): this {
		this._storageService.store(this._key, JSON.stringify(this.map), this._scope, this._target);
		return this;
	}
}

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _disposables = new DisposableStore();
	private readonly _kernels = new Map<string, KernelInfo>();

	private readonly _notebookInstanceBindings: LRUMemento<string, string>;
	private readonly _notebookTypeBindings: LRUMemento<string, string>;

	private readonly _onDidChangeNotebookKernelBinding = new Emitter<INotebookKernelBindEvent>();
	private readonly _onDidAddKernel = new Emitter<INotebookKernel>();
	private readonly _onDidRemoveKernel = new Emitter<INotebookKernel>();
	private readonly _onDidChangeNotebookAffinity = new Emitter<void>();

	readonly onDidChangeNotebookKernelBinding: Event<INotebookKernelBindEvent> = this._onDidChangeNotebookKernelBinding.event;
	readonly onDidAddKernel: Event<INotebookKernel> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel> = this._onDidRemoveKernel.event;
	readonly onDidChangeNotebookAffinity: Event<void> = this._onDidChangeNotebookAffinity.event;

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@IStorageService storageService: IStorageService,
	) {

		this._notebookInstanceBindings = new LRUMemento(1000, 'notebook.kernelBinding', StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService);
		this._notebookTypeBindings = new LRUMemento(100, 'notebook.typeBinding', StorageScope.GLOBAL, StorageTarget.USER, storageService);

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

	private _autoAssociateNotebook(notebook: INotebookTextModel, onlyThisKernel?: INotebookKernel): void {

		const id = this._notebookInstanceBindings.map.get(notebook.uri.toString());
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
			for (let [uri, candidate] of Array.from(this._notebookInstanceBindings.map)) {
				if (candidate === kernel.id) {
					this._notebookInstanceBindings.map.delete(uri);
					this._onDidChangeNotebookKernelBinding.fire({ notebook: URI.parse(uri), oldKernel: kernel.id, newKernel: undefined });
				}
			}
		});
	}

	getNotebookKernels(notebook: INotebookTextModelLike): { bound: INotebookKernel | undefined, all: INotebookKernel[] } {

		// all applicable kernels
		const kernels: { kernel: INotebookKernel, instanceAffinity: number, typeAffinity: number }[] = [];
		for (const info of this._kernels.values()) {
			if (info.kernel.viewType === notebook.viewType || info.kernel.viewType === '*') {
				kernels.push({
					kernel: info.kernel,
					instanceAffinity: info.notebookPriorities.get(notebook.uri) ?? 1 /* vscode.NotebookControllerPriority.Default */,
					typeAffinity: this._notebookTypeBindings.map.get(info.kernel.viewType) === info.kernel.id ? 1 : 0
				});
			}
		}

		const all = kernels
			.sort((a, b) => b.instanceAffinity - a.instanceAffinity || b.typeAffinity - a.typeAffinity || a.kernel.label.localeCompare(b.kernel.label))
			.map(obj => obj.kernel);

		// bound kernel
		const boundId = this._notebookInstanceBindings.map.get(notebook.uri.toString());
		const bound = boundId ? this._kernels.get(boundId)?.kernel : undefined;

		return { all, bound };
	}

	// default kernel for notebookType
	updateNotebookTypeKernelBinding(typeId: string, kernel: INotebookKernel): void {
		const existing = this._notebookInstanceBindings.map.get(typeId);
		if (existing !== kernel.id) {
			this._notebookTypeBindings.map.set(typeId, kernel.id);
			this._notebookInstanceBindings.store();
			this._onDidChangeNotebookAffinity.fire();
		}
	}

	// a notebook has one kernel, a kernel has N notebooks
	// notebook <-1----N-> kernel
	updateNotebookInstanceKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel | undefined): void {
		const key = notebook.uri.toString();
		const oldKernel = this._notebookInstanceBindings.map.get(key);
		if (oldKernel !== kernel?.id) {
			if (kernel) {
				this._notebookInstanceBindings.map.set(key, kernel.id);
			} else {
				this._notebookInstanceBindings.map.delete(key);
			}
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel?.id });
			this._notebookInstanceBindings.store();
		}
	}

	updateKernelNotebookAffinity(kernel: INotebookKernel, notebook: URI, preference: number | undefined): void {
		const info = this._kernels.get(kernel.id);
		if (!info) {
			throw new Error(`UNKNOWN kernel '${kernel.id}'`);
		}
		if (preference === undefined) {
			info.notebookPriorities.delete(notebook);
		} else {
			info.notebookPriorities.set(notebook, preference);
		}
		this._onDidChangeNotebookAffinity.fire();
	}
}
