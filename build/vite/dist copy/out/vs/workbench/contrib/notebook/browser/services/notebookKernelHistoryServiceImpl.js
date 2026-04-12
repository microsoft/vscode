/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotebookKernelHistoryService_1;
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { LinkedMap } from '../../../../../base/common/map.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
const MAX_KERNELS_IN_HISTORY = 5;
let NotebookKernelHistoryService = class NotebookKernelHistoryService extends Disposable {
    static { NotebookKernelHistoryService_1 = this; }
    static { this.STORAGE_KEY = 'notebook.kernelHistory'; }
    constructor(_storageService, _notebookKernelService, _notebookLoggingService) {
        super();
        this._storageService = _storageService;
        this._notebookKernelService = _notebookKernelService;
        this._notebookLoggingService = _notebookLoggingService;
        this._mostRecentKernelsMap = {};
        this._loadState();
        this._register(this._storageService.onWillSaveState(() => this._saveState()));
        this._register(this._storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, NotebookKernelHistoryService_1.STORAGE_KEY, this._store)(() => {
            this._loadState();
        }));
    }
    getKernels(notebook) {
        const allAvailableKernels = this._notebookKernelService.getMatchingKernel(notebook);
        const allKernels = allAvailableKernels.all;
        const selectedKernel = allAvailableKernels.selected;
        // We will suggest the only kernel
        const suggested = allAvailableKernels.all.length === 1 ? allAvailableKernels.all[0] : undefined;
        this._notebookLoggingService.debug('History', `getMatchingKernels: ${allAvailableKernels.all.length} kernels available for ${notebook.uri.path}. Selected: ${allAvailableKernels.selected?.label}. Suggested: ${suggested?.label}`);
        const mostRecentKernelIds = this._mostRecentKernelsMap[notebook.notebookType] ? [...this._mostRecentKernelsMap[notebook.notebookType].values()] : [];
        const all = mostRecentKernelIds.map(kernelId => allKernels.find(kernel => kernel.id === kernelId)).filter(kernel => !!kernel);
        this._notebookLoggingService.debug('History', `mru: ${mostRecentKernelIds.length} kernels in history, ${all.length} registered already.`);
        return {
            selected: selectedKernel ?? suggested,
            all
        };
    }
    addMostRecentKernel(kernel) {
        const key = kernel.id;
        const viewType = kernel.viewType;
        const recentKeynels = this._mostRecentKernelsMap[viewType] ?? new LinkedMap();
        recentKeynels.set(key, key, 1 /* Touch.AsOld */);
        if (recentKeynels.size > MAX_KERNELS_IN_HISTORY) {
            const reserved = [...recentKeynels.entries()].slice(0, MAX_KERNELS_IN_HISTORY);
            recentKeynels.fromJSON(reserved);
        }
        this._mostRecentKernelsMap[viewType] = recentKeynels;
    }
    _saveState() {
        let notEmpty = false;
        for (const [_, kernels] of Object.entries(this._mostRecentKernelsMap)) {
            notEmpty = notEmpty || kernels.size > 0;
        }
        if (notEmpty) {
            const serialized = this._serialize();
            this._storageService.store(NotebookKernelHistoryService_1.STORAGE_KEY, JSON.stringify(serialized), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        }
        else {
            this._storageService.remove(NotebookKernelHistoryService_1.STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        }
    }
    _loadState() {
        const serialized = this._storageService.get(NotebookKernelHistoryService_1.STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        if (serialized) {
            try {
                this._deserialize(JSON.parse(serialized));
            }
            catch (e) {
                this._mostRecentKernelsMap = {};
            }
        }
        else {
            this._mostRecentKernelsMap = {};
        }
    }
    _serialize() {
        const result = Object.create(null);
        for (const [viewType, kernels] of Object.entries(this._mostRecentKernelsMap)) {
            result[viewType] = {
                entries: [...kernels.values()]
            };
        }
        return result;
    }
    _deserialize(serialized) {
        this._mostRecentKernelsMap = {};
        for (const [viewType, kernels] of Object.entries(serialized)) {
            const linkedMap = new LinkedMap();
            const mapValues = [];
            for (const entry of kernels.entries) {
                mapValues.push([entry, entry]);
            }
            linkedMap.fromJSON(mapValues);
            this._mostRecentKernelsMap[viewType] = linkedMap;
        }
    }
    _clear() {
        this._mostRecentKernelsMap = {};
        this._saveState();
    }
};
NotebookKernelHistoryService = NotebookKernelHistoryService_1 = __decorate([
    __param(0, IStorageService),
    __param(1, INotebookKernelService),
    __param(2, INotebookLoggingService)
], NotebookKernelHistoryService);
export { NotebookKernelHistoryService };
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.clearNotebookKernelsMRUCache',
            title: localize2('workbench.notebook.clearNotebookKernelsMRUCache', "Clear Notebook Kernels MRU Cache"),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(INotebookKernelHistoryService);
        historyService._clear();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFNBQVMsRUFBUyxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU3RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBbUIsNkJBQTZCLEVBQUUsc0JBQXNCLEVBQTBCLE1BQU0sdUNBQXVDLENBQUM7QUFDdkosT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFVakYsTUFBTSxzQkFBc0IsR0FBRyxDQUFDLENBQUM7QUFFMUIsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNkIsU0FBUSxVQUFVOzthQUc1QyxnQkFBVyxHQUFHLHdCQUF3QixBQUEzQixDQUE0QjtJQUd0RCxZQUE2QixlQUFpRCxFQUNyRCxzQkFBK0QsRUFDOUQsdUJBQWlFO1FBQzFGLEtBQUssRUFBRSxDQUFDO1FBSHFDLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUNwQywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQzdDLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FB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