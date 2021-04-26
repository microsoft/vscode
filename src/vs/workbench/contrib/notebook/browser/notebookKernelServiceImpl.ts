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
import { revive } from 'vs/base/common/marshalling';

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

class LRUMemento<K = string> {

	private readonly _map: LRUCache<string, string>;

	constructor(
		limit: number,
		private readonly _keys: { asString(key: K): string, asKey(s: string): K },
		private readonly _key: string,
		private readonly _scope: StorageScope,
		private readonly _target: StorageTarget,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._map = new LRUCache(limit, 0.7);
		this.restore();
	}

	restore(): this {
		try {
			const value = this._storageService.get(this._key, this._scope, '[]');
			const data = JSON.parse(value);
			this._map.fromJSON(data);
		} catch {
			// ignore
		}
		return this;
	}

	store(): this {
		this._storageService.store(this._key, JSON.stringify(this._map), this._scope, this._target);
		return this;
	}

	set(key: K, value: string): void {
		this._map.set(this._keys.asString(key), value);
	}

	get(key: K): string | undefined {
		return this._map.get(this._keys.asString(key));
	}

	delete(key: K): boolean {
		return this._map.delete(this._keys.asString(key));
	}

	*[Symbol.iterator](): IterableIterator<[K, string]> {
		for (const [key, value] of this._map) {
			yield [this._keys.asKey(key), value];
		}
	}
}

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _disposables = new DisposableStore();
	private readonly _kernels = new Map<string, KernelInfo>();

	private readonly _notebookInstanceBindings: LRUMemento<INotebookTextModelLike>;
	private readonly _notebookTypeBindings: LRUMemento<string>;

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

		this._notebookInstanceBindings = new LRUMemento(1000, { asString: notebook => JSON.stringify({ viewType: notebook.viewType, uri: notebook.viewType }), asKey: s => revive(JSON.parse(s)) }, 'notebook.controllerInstanceBinding', StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService);
		this._notebookTypeBindings = new LRUMemento(100, { asString: s => s, asKey: s => s }, 'notebook.controllerTypeBinding', StorageScope.GLOBAL, StorageTarget.USER, storageService);

		// auto associate kernels to new notebook documents, also emit event when
		// a notebook has been closed (but don't update the memento)
		this._disposables.add(_notebookService.onDidAddNotebookDocument(this._tryAutoBindNotebook, this));
		this._disposables.add(_notebookService.onDidRemoveNotebookDocument(e => {
			const kernelId = this._notebookInstanceBindings.get(e);
			if (kernelId) {
				this._onDidChangeNotebookKernelBinding.fire({ notebook: e.uri, oldKernel: kernelId, newKernel: undefined });
			}
		}));
	}

	dispose() {
		this._disposables.dispose();
		this._onDidChangeNotebookKernelBinding.dispose();
		this._onDidAddKernel.dispose();
		this._onDidRemoveKernel.dispose();
		this._kernels.clear();
	}

	private _tryAutoBindNotebook(notebook: INotebookTextModel, onlyThisKernel?: INotebookKernel): void {

		const id = this._notebookInstanceBindings.get(notebook);
		if (!id) {
			// no kernel associated
			return;
		}
		const existingKernel = this._kernels.get(id);
		if (!existingKernel || !NotebookKernelService._score(existingKernel.kernel, notebook)) {
			// associated kernel not known, not matching
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
			this._tryAutoBindNotebook(notebook, kernel);
		}

		return toDisposable(() => {
			if (this._kernels.delete(kernel.id)) {
				this._onDidRemoveKernel.fire(kernel);
			}
			for (const [key, candidate] of Array.from(this._notebookInstanceBindings)) {
				if (candidate === kernel.id) {
					this._onDidChangeNotebookKernelBinding.fire({ notebook: key.uri, oldKernel: kernel.id, newKernel: undefined });
				}
			}
		});
	}

	getNotebookKernels(notebook: INotebookTextModelLike): { bound: INotebookKernel | undefined, all: INotebookKernel[] } {

		// all applicable kernels
		const kernels: { kernel: INotebookKernel, instanceAffinity: number, typeAffinity: number, score: number }[] = [];
		for (const info of this._kernels.values()) {
			const score = NotebookKernelService._score(info.kernel, notebook);
			if (score) {
				kernels.push({
					score,
					kernel: info.kernel,
					instanceAffinity: info.notebookPriorities.get(notebook.uri) ?? 1 /* vscode.NotebookControllerPriority.Default */,
					typeAffinity: this._notebookTypeBindings.get(info.kernel.viewType) === info.kernel.id ? 1 : 0
				});
			}
		}

		const all = kernels
			.sort((a, b) => b.instanceAffinity - a.instanceAffinity || b.typeAffinity - a.typeAffinity || a.score - b.score || a.kernel.label.localeCompare(b.kernel.label))
			.map(obj => obj.kernel);

		// bound kernel
		const boundId = this._notebookInstanceBindings.get(notebook);
		const bound = boundId ? this._kernels.get(boundId)?.kernel : undefined;

		return { all, bound };
	}

	private static _score(kernel: INotebookKernel, notebook: INotebookTextModelLike): number {
		if (kernel.viewType === '*') {
			return 5;
		} else if (kernel.viewType === notebook.viewType) {
			return 10;
		} else {
			return 0;
		}
	}

	// default kernel for notebookType
	updateNotebookTypeKernelBinding(typeId: string, kernel: INotebookKernel): void {
		const existing = this._notebookTypeBindings.get(typeId);
		if (existing !== kernel.id) {
			this._notebookTypeBindings.set(typeId, kernel.id);
			this._notebookTypeBindings.store();
			this._onDidChangeNotebookAffinity.fire();
		}
	}

	// a notebook has one kernel, a kernel has N notebooks
	// notebook <-1----N-> kernel
	updateNotebookInstanceKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel | undefined): void {
		const oldKernel = this._notebookInstanceBindings.get(notebook);
		if (oldKernel !== kernel?.id) {
			if (kernel) {
				this._notebookInstanceBindings.set(notebook, kernel.id);
			} else {
				this._notebookInstanceBindings.delete(notebook);
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
