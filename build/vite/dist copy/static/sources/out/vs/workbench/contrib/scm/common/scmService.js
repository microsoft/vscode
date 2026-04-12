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
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { SCMInputChangeReason } from './scm.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Schemas } from '../../../../base/common/network.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { runOnChange } from '../../../../base/common/observable.js';
class SCMInput extends Disposable {
    get value() {
        return this._value;
    }
    get placeholder() {
        return this._placeholder;
    }
    set placeholder(placeholder) {
        this._placeholder = placeholder;
        this._onDidChangePlaceholder.fire(placeholder);
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(enabled) {
        this._enabled = enabled;
        this._onDidChangeEnablement.fire(enabled);
    }
    get visible() {
        return this._visible;
    }
    set visible(visible) {
        this._visible = visible;
        this._onDidChangeVisibility.fire(visible);
    }
    setFocus() {
        this._onDidChangeFocus.fire();
    }
    showValidationMessage(message, type) {
        this._onDidChangeValidationMessage.fire({ message: message, type: type });
    }
    clearValidation() {
        this._onDidClearValidation.fire();
    }
    get validateInput() {
        return this._validateInput;
    }
    set validateInput(validateInput) {
        this._validateInput = validateInput;
        this._onDidChangeValidateInput.fire();
    }
    constructor(repository, history) {
        super();
        this.repository = repository;
        this.history = history;
        this._value = '';
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._placeholder = '';
        this._onDidChangePlaceholder = this._register(new Emitter());
        this.onDidChangePlaceholder = this._onDidChangePlaceholder.event;
        this._enabled = true;
        this._onDidChangeEnablement = this._register(new Emitter());
        this.onDidChangeEnablement = this._onDidChangeEnablement.event;
        this._visible = true;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._onDidChangeFocus = this._register(new Emitter());
        this.onDidChangeFocus = this._onDidChangeFocus.event;
        this._onDidChangeValidationMessage = this._register(new Emitter());
        this.onDidChangeValidationMessage = this._onDidChangeValidationMessage.event;
        this._onDidClearValidation = this._register(new Emitter());
        this.onDidClearValidation = this._onDidClearValidation.event;
        this._validateInput = () => Promise.resolve(undefined);
        this._onDidChangeValidateInput = this._register(new Emitter());
        this.onDidChangeValidateInput = this._onDidChangeValidateInput.event;
        this.didChangeHistory = false;
        if (this.repository.provider.rootUri) {
            this.historyNavigator = history.getHistory(this.repository.provider.label, this.repository.provider.rootUri);
            this._register(this.history.onWillSaveHistory(event => {
                if (this.historyNavigator.isAtEnd()) {
                    this.saveValue();
                }
                if (this.didChangeHistory) {
                    event.historyDidIndeedChange();
                }
                this.didChangeHistory = false;
            }));
        }
        else { // in memory only
            this.historyNavigator = new HistoryNavigator2([''], 100);
        }
        this._value = this.historyNavigator.current();
    }
    setValue(value, transient, reason) {
        if (value === this._value) {
            return;
        }
        if (!transient) {
            this.historyNavigator.replaceLast(this._value);
            this.historyNavigator.add(value);
            this.didChangeHistory = true;
        }
        this._value = value;
        this._onDidChange.fire({ value, reason });
    }
    showNextHistoryValue() {
        if (this.historyNavigator.isAtEnd()) {
            return;
        }
        else if (!this.historyNavigator.has(this.value)) {
            this.saveValue();
            this.historyNavigator.resetCursor();
        }
        const value = this.historyNavigator.next();
        this.setValue(value, true, SCMInputChangeReason.HistoryNext);
    }
    showPreviousHistoryValue() {
        if (this.historyNavigator.isAtEnd()) {
            this.saveValue();
        }
        else if (!this.historyNavigator.has(this._value)) {
            this.saveValue();
            this.historyNavigator.resetCursor();
        }
        const value = this.historyNavigator.previous();
        this.setValue(value, true, SCMInputChangeReason.HistoryPrevious);
    }
    saveValue() {
        const oldValue = this.historyNavigator.replaceLast(this._value);
        this.didChangeHistory = this.didChangeHistory || (oldValue !== this._value);
    }
}
class SCMRepository {
    get selected() {
        return this._selected;
    }
    constructor(id, provider, disposables, inputHistory) {
        this.id = id;
        this.provider = provider;
        this.disposables = disposables;
        this._selected = false;
        this._onDidChangeSelection = new Emitter();
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this.input = new SCMInput(this, inputHistory);
    }
    setSelected(selected) {
        if (this._selected === selected) {
            return;
        }
        this._selected = selected;
        this._onDidChangeSelection.fire(selected);
    }
    dispose() {
        this.disposables.dispose();
        this._onDidChangeSelection.dispose();
        this.input.dispose();
        this.provider.dispose();
    }
}
class WillSaveHistoryEvent {
    constructor() {
        this._didChangeHistory = false;
    }
    get didChangeHistory() { return this._didChangeHistory; }
    historyDidIndeedChange() { this._didChangeHistory = true; }
}
let SCMInputHistory = class SCMInputHistory {
    constructor(storageService, workspaceContextService) {
        this.storageService = storageService;
        this.workspaceContextService = workspaceContextService;
        this.disposables = new DisposableStore();
        this.histories = new Map();
        this._onWillSaveHistory = this.disposables.add(new Emitter());
        this.onWillSaveHistory = this._onWillSaveHistory.event;
        this.histories = new Map();
        const entries = this.storageService.getObject('scm.history', 1 /* StorageScope.WORKSPACE */, []);
        for (const [providerLabel, rootUri, history] of entries) {
            let providerHistories = this.histories.get(providerLabel);
            if (!providerHistories) {
                providerHistories = new ResourceMap();
                this.histories.set(providerLabel, providerHistories);
            }
            providerHistories.set(rootUri, new HistoryNavigator2(history, 100));
        }
        if (this.migrateStorage()) {
            this.saveToStorage();
        }
        this.disposables.add(this.storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, 'scm.history', this.disposables)(e => {
            if (e.external && e.key === 'scm.history') {
                const raw = this.storageService.getObject('scm.history', 1 /* StorageScope.WORKSPACE */, []);
                for (const [providerLabel, uri, rawHistory] of raw) {
                    const history = this.getHistory(providerLabel, uri);
                    for (const value of Iterable.reverse(rawHistory)) {
                        history.prepend(value);
                    }
                }
            }
        }));
        this.disposables.add(this.storageService.onWillSaveState(_ => {
            const event = new WillSaveHistoryEvent();
            this._onWillSaveHistory.fire(event);
            if (event.didChangeHistory) {
                this.saveToStorage();
            }
        }));
    }
    saveToStorage() {
        const raw = [];
        for (const [providerLabel, providerHistories] of this.histories) {
            for (const [rootUri, history] of providerHistories) {
                if (!(history.size === 1 && history.current() === '')) {
                    raw.push([providerLabel, rootUri, [...history]]);
                }
            }
        }
        this.storageService.store('scm.history', raw, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    getHistory(providerLabel, rootUri) {
        let providerHistories = this.histories.get(providerLabel);
        if (!providerHistories) {
            providerHistories = new ResourceMap();
            this.histories.set(providerLabel, providerHistories);
        }
        let history = providerHistories.get(rootUri);
        if (!history) {
            history = new HistoryNavigator2([''], 100);
            providerHistories.set(rootUri, history);
        }
        return history;
    }
    // Migrates from Application scope storage to Workspace scope.
    // TODO@joaomoreno: Change from January 2024 onwards such that the only code is to remove all `scm/input:` storage keys
    migrateStorage() {
        let didSomethingChange = false;
        const machineKeys = Iterable.filter(this.storageService.keys(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */), key => key.startsWith('scm/input:'));
        for (const key of machineKeys) {
            try {
                const legacyHistory = JSON.parse(this.storageService.get(key, -1 /* StorageScope.APPLICATION */, ''));
                const match = /^scm\/input:([^:]+):(.+)$/.exec(key);
                if (!match || !Array.isArray(legacyHistory?.history) || !Number.isInteger(legacyHistory?.timestamp)) {
                    this.storageService.remove(key, -1 /* StorageScope.APPLICATION */);
                    continue;
                }
                const [, providerLabel, rootPath] = match;
                const rootUri = URI.file(rootPath);
                if (this.workspaceContextService.getWorkspaceFolder(rootUri)) {
                    const history = this.getHistory(providerLabel, rootUri);
                    for (const entry of Iterable.reverse(legacyHistory.history)) {
                        history.prepend(entry);
                    }
                    didSomethingChange = true;
                    this.storageService.remove(key, -1 /* StorageScope.APPLICATION */);
                }
            }
            catch {
                this.storageService.remove(key, -1 /* StorageScope.APPLICATION */);
            }
        }
        return didSomethingChange;
    }
    dispose() {
        this.disposables.dispose();
    }
};
SCMInputHistory = __decorate([
    __param(0, IStorageService),
    __param(1, IWorkspaceContextService)
], SCMInputHistory);
let SCMService = class SCMService {
    get repositories() { return this._repositories.values(); }
    get repositoryCount() { return this._repositories.size; }
    constructor(logService, workspaceContextService, contextKeyService, storageService, uriIdentityService) {
        this.logService = logService;
        this.uriIdentityService = uriIdentityService;
        this._repositories = new Map(); // used in tests
        this._onDidAddProvider = new Emitter();
        this.onDidAddRepository = this._onDidAddProvider.event;
        this._onDidRemoveProvider = new Emitter();
        this.onDidRemoveRepository = this._onDidRemoveProvider.event;
        this.inputHistory = new SCMInputHistory(storageService, workspaceContextService);
        this.providerCount = contextKeyService.createKey('scm.providerCount', 0);
        this.historyProviderCount = contextKeyService.createKey('scm.historyProviderCount', 0);
    }
    registerSCMProvider(provider) {
        this.logService.trace('SCMService#registerSCMProvider');
        if (this._repositories.has(provider.id)) {
            throw new Error(`SCM Provider ${provider.id} already exists.`);
        }
        const disposables = new DisposableStore();
        const historyProviderCount = () => {
            return Array.from(this._repositories.values())
                .filter(r => !!r.provider.historyProvider.get()).length;
        };
        disposables.add(toDisposable(() => {
            this._repositories.delete(provider.id);
            this._onDidRemoveProvider.fire(repository);
            this.providerCount.set(this._repositories.size);
            this.historyProviderCount.set(historyProviderCount());
        }));
        const repository = new SCMRepository(provider.id, provider, disposables, this.inputHistory);
        this._repositories.set(provider.id, repository);
        disposables.add(runOnChange(provider.historyProvider, () => {
            this.historyProviderCount.set(historyProviderCount());
        }));
        this.providerCount.set(this._repositories.size);
        this.historyProviderCount.set(historyProviderCount());
        this._onDidAddProvider.fire(repository);
        return repository;
    }
    getRepository(idOrResource) {
        if (typeof idOrResource === 'string') {
            return this._repositories.get(idOrResource);
        }
        if (idOrResource.scheme !== Schemas.file &&
            idOrResource.scheme !== Schemas.vscodeRemote) {
            return undefined;
        }
        let bestRepository = undefined;
        let bestMatchLength = Number.POSITIVE_INFINITY;
        for (const repository of this.repositories) {
            if (repository.provider.isHidden === true) {
                continue;
            }
            const root = repository.provider.rootUri;
            if (!root) {
                continue;
            }
            const path = this.uriIdentityService.extUri.relativePath(root, idOrResource);
            if (path && !/^\.\./.test(path) && path.length < bestMatchLength) {
                bestRepository = repository;
                bestMatchLength = path.length;
            }
        }
        return bestRepository;
    }
};
SCMService = __decorate([
    __param(0, ILogService),
    __param(1, IWorkspaceContextService),
    __param(2, IContextKeyService),
    __param(3, IStorageService),
    __param(4, IUriIdentityService)
], SCMService);
export { SCMService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9jb21tb24vc2NtU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RyxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUErRixvQkFBb0IsRUFBeUMsTUFBTSxVQUFVLENBQUM7QUFDcEwsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdkUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVwRSxNQUFNLFFBQVMsU0FBUSxVQUFVO0lBSWhDLElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FB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