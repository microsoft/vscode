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
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { getProviderKey } from './util.js';
import { ISCMService } from '../common/scm.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
let SCMWorkingSetController = class SCMWorkingSetController extends Disposable {
    static { this.ID = 'workbench.contrib.scmWorkingSets'; }
    constructor(configurationService, editorGroupsService, scmService, storageService, layoutService) {
        super();
        this.configurationService = configurationService;
        this.editorGroupsService = editorGroupsService;
        this.scmService = scmService;
        this.storageService = storageService;
        this.layoutService = layoutService;
        this._repositoryDisposables = new DisposableMap();
        this._enabledConfig = observableConfigValue('scm.workingSets.enabled', false, this.configurationService);
        this._store.add(autorun(reader => {
            if (!this._enabledConfig.read(reader)) {
                this.storageService.remove('scm.workingSets', 1 /* StorageScope.WORKSPACE */);
                this._repositoryDisposables.clearAndDisposeAll();
                return;
            }
            this._workingSets = this._loadWorkingSets();
            this.scmService.onDidAddRepository(this._onDidAddRepository, this, reader.store);
            this.scmService.onDidRemoveRepository(this._onDidRemoveRepository, this, reader.store);
            for (const repository of this.scmService.repositories) {
                this._onDidAddRepository(repository);
            }
        }));
    }
    _onDidAddRepository(repository) {
        const disposables = new DisposableStore();
        const historyItemRefId = derived(reader => {
            const historyProvider = repository.provider.historyProvider.read(reader);
            const historyItemRef = historyProvider?.historyItemRef.read(reader);
            return historyItemRef?.id;
        });
        disposables.add(autorun(async (reader) => {
            const historyItemRefIdValue = historyItemRefId.read(reader);
            if (!historyItemRefIdValue) {
                return;
            }
            const providerKey = getProviderKey(repository.provider);
            const repositoryWorkingSets = this._workingSets.get(providerKey);
            if (!repositoryWorkingSets) {
                this._workingSets.set(providerKey, { currentHistoryItemGroupId: historyItemRefIdValue, editorWorkingSets: new Map() });
                return;
            }
            // Editors for the current working set are automatically restored
            if (repositoryWorkingSets.currentHistoryItemGroupId === historyItemRefIdValue) {
                return;
            }
            // Save the working set
            this._saveWorkingSet(providerKey, historyItemRefIdValue, repositoryWorkingSets);
            // Restore the working set
            await this._restoreWorkingSet(providerKey, historyItemRefIdValue);
        }));
        this._repositoryDisposables.set(repository, disposables);
    }
    _onDidRemoveRepository(repository) {
        this._repositoryDisposables.deleteAndDispose(repository);
    }
    _loadWorkingSets() {
        const workingSets = new Map();
        const workingSetsRaw = this.storageService.get('scm.workingSets', 1 /* StorageScope.WORKSPACE */);
        if (!workingSetsRaw) {
            return workingSets;
        }
        for (const serializedWorkingSet of JSON.parse(workingSetsRaw)) {
            workingSets.set(serializedWorkingSet.providerKey, {
                currentHistoryItemGroupId: serializedWorkingSet.currentHistoryItemGroupId,
                editorWorkingSets: new Map(serializedWorkingSet.editorWorkingSets)
            });
        }
        return workingSets;
    }
    _saveWorkingSet(providerKey, currentHistoryItemGroupId, repositoryWorkingSets) {
        const previousHistoryItemGroupId = repositoryWorkingSets.currentHistoryItemGroupId;
        const editorWorkingSets = repositoryWorkingSets.editorWorkingSets;
        const editorWorkingSet = this.editorGroupsService.saveWorkingSet(previousHistoryItemGroupId);
        this._workingSets.set(providerKey, { currentHistoryItemGroupId, editorWorkingSets: editorWorkingSets.set(previousHistoryItemGroupId, editorWorkingSet) });
        // Save to storage
        const workingSets = [];
        for (const [providerKey, { currentHistoryItemGroupId, editorWorkingSets }] of this._workingSets) {
            workingSets.push({ providerKey, currentHistoryItemGroupId, editorWorkingSets: [...editorWorkingSets] });
        }
        this.storageService.store('scm.workingSets', JSON.stringify(workingSets), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    async _restoreWorkingSet(providerKey, currentHistoryItemGroupId) {
        const workingSets = this._workingSets.get(providerKey);
        if (!workingSets) {
            return;
        }
        let editorWorkingSetId = workingSets.editorWorkingSets.get(currentHistoryItemGroupId);
        if (!editorWorkingSetId && this.configurationService.getValue('scm.workingSets.default') === 'empty') {
            editorWorkingSetId = 'empty';
        }
        if (editorWorkingSetId) {
            // Applying a working set can be the result of a user action that has been
            // initiated from the terminal (ex: switching branches). As such, we want
            // to preserve the focus in the terminal. This does not cover the scenario
            // in which the terminal is in the editor part.
            const preserveFocus = this.layoutService.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */);
            await this.editorGroupsService.applyWorkingSet(editorWorkingSetId, { preserveFocus });
        }
    }
    dispose() {
        this._repositoryDisposables.dispose();
        super.dispose();
    }
};
SCMWorkingSetController = __decorate([
    __param(0, IConfigurationService),
    __param(1, IEditorGroupsService),
    __param(2, ISCMService),
    __param(3, IStorageService),
    __param(4, IWorkbenchLayoutService)
], SCMWorkingSetController);
export { SCMWorkingSetController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ1NldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3dvcmtpbmdTZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBRTlHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDM0MsT0FBTyxFQUFrQixXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQXFCLE1BQU0sd0RBQXdELENBQUM7QUFDakgsT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sbURBQW1ELENBQUM7QUFhNUYsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO2FBQ3RDLE9BQUUsR0FBRyxrQ0FBa0MsQUFBckMsQ0FBc0M7SUFPeEQsWUFDd0Isb0JBQTRELEVBQzdELG1CQUEwRCxFQUNuRSxVQUF3QyxFQUNwQyxjQUFnRCxFQUN4QyxhQUF1RDtRQUVoRixLQUFLLEVBQUUsQ0FBQztRQU5nQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzVDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDbEQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNuQixtQkFBYyxHQUFk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