/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { LinkedMap, Touch } from 'vs/base/common/map';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelService, INotebookTextModelLike } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';

interface ISerializedKernelsListPerType {
	entries: string[];
}

interface ISerializedKernelsList {
	[viewType: string]: ISerializedKernelsListPerType;
}

const MAX_KERNELS_IN_HISTORY = 5;

export class NotebookKernelHistoryService extends Disposable implements INotebookKernelHistoryService {
	declare _serviceBrand: undefined;

	private static STORAGE_KEY = 'notebook.kernelHistory';
	private _mostRecentKernelsMap: { [key: string]: LinkedMap<string, string> } = {};

	constructor(@IStorageService private readonly _storageService: IStorageService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookLoggingService private readonly _notebookLoggingService: INotebookLoggingService) {
		super();

		this._loadState();
		this._register(this._storageService.onWillSaveState(() => this._saveState()));
		this._register(this._storageService.onDidChangeValue(StorageScope.WORKSPACE, NotebookKernelHistoryService.STORAGE_KEY, this._register(new DisposableStore()))(() => {
			this._restoreState();
		}));
	}

	getKernels(notebook: INotebookTextModelLike): { selected: INotebookKernel | undefined; all: INotebookKernel[] } {
		const allAvailableKernels = this._notebookKernelService.getMatchingKernel(notebook);
		const allKernels = allAvailableKernels.all;
		const selectedKernel = allAvailableKernels.selected;
		// We will suggest the only kernel
		const suggested = allAvailableKernels.all.length === 1 ? allAvailableKernels.all[0] : undefined;
		this._notebookLoggingService.debug('History', `getMatchingKernels: ${allAvailableKernels.all.length} kernels available for ${notebook.uri.path}. Selected: ${allAvailableKernels.selected?.label}. Suggested: ${suggested?.label}`);
		const mostRecentKernelIds = this._mostRecentKernelsMap[notebook.viewType] ? [...this._mostRecentKernelsMap[notebook.viewType].values()] : [];
		const all = mostRecentKernelIds.map(kernelId => allKernels.find(kernel => kernel.id === kernelId)).filter(kernel => !!kernel) as INotebookKernel[];
		this._notebookLoggingService.debug('History', `mru: ${mostRecentKernelIds.length} kernels in history, ${all.length} registered already.`);

		return {
			selected: selectedKernel ?? suggested,
			all
		};
	}

	addMostRecentKernel(kernel: INotebookKernel): void {
		const key = kernel.id;
		const viewType = kernel.viewType;
		const recentKeynels = this._mostRecentKernelsMap[viewType] ?? new LinkedMap<string, string>();

		recentKeynels.set(key, key, Touch.AsOld);


		if (recentKeynels.size > MAX_KERNELS_IN_HISTORY) {
			const reserved = [...recentKeynels.entries()].slice(0, MAX_KERNELS_IN_HISTORY);
			recentKeynels.fromJSON(reserved);
		}

		this._mostRecentKernelsMap[viewType] = recentKeynels;
	}

	private _saveState(): void {
		let notEmpty = false;
		for (const [_, kernels] of Object.entries(this._mostRecentKernelsMap)) {
			notEmpty = notEmpty || kernels.size > 0;
		}

		if (notEmpty) {
			const serialized = this._serialize();
			this._storageService.store(NotebookKernelHistoryService.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.USER);
		} else {
			this._storageService.remove(NotebookKernelHistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _restoreState(): void {
		const serialized = this._storageService.get(NotebookKernelHistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (serialized) {
			try {
				for (const [viewType, kernels] of JSON.parse(serialized)) {
					const linkedMap = this._mostRecentKernelsMap[viewType] ?? new LinkedMap<string, string>();
					for (const entry of kernels.entries) {
						linkedMap.set(entry, entry, Touch.AsOld);
					}

					this._mostRecentKernelsMap[viewType] = linkedMap;
				}
			} catch (e) {
				console.error('Deserialize notebook kernel history failed', e);
			}
		}
	}

	private _loadState(): void {
		const serialized = this._storageService.get(NotebookKernelHistoryService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (serialized) {
			try {
				this._deserialize(JSON.parse(serialized));
			} catch (e) {
				this._mostRecentKernelsMap = {};
			}
		} else {
			this._mostRecentKernelsMap = {};
		}
	}

	private _serialize(): ISerializedKernelsList {
		const result: ISerializedKernelsList = Object.create(null);

		for (const [viewType, kernels] of Object.entries(this._mostRecentKernelsMap)) {
			result[viewType] = {
				entries: [...kernels.values()]
			};
		}
		return result;
	}

	private _deserialize(serialized: ISerializedKernelsList): void {
		this._mostRecentKernelsMap = {};

		for (const [viewType, kernels] of Object.entries(serialized)) {
			const linkedMap = new LinkedMap<string, string>();
			const mapValues: [string, string][] = [];

			for (const entry of kernels.entries) {
				mapValues.push([entry, entry]);
			}

			linkedMap.fromJSON(mapValues);
			this._mostRecentKernelsMap[viewType] = linkedMap;
		}
	}

	_clear(): void {
		this._mostRecentKernelsMap = {};
		this._saveState();
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.clearNotebookKernelsMRUCache',
			title: {
				value: localize('workbench.notebook.clearNotebookKernelsMRUCache', "Clear Notebook Kernels MRU Cache"),
				original: 'Clear Notebook Kernels MRU Cache'
			},
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(INotebookKernelHistoryService) as NotebookKernelHistoryService;
		historyService._clear();
	}
});
