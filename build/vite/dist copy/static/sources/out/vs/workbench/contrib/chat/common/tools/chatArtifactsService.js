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
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValueOpts } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { extractArtifactsFromResponse } from '../chatArtifactExtraction.js';
import { IChatToolInvocation, IChatService } from '../chatService/chatService.js';
import { ChatConfiguration } from '../constants.js';
import { chatSessionResourceToId } from '../model/chatUri.js';
export const IChatArtifactsService = createDecorator('chatArtifactsService');
let ChatArtifactsStorage = class ChatArtifactsStorage {
    constructor(storageService) {
        this._memento = new Memento('chat-artifacts', storageService);
    }
    get(key) {
        const storage = this._memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        return storage[key] || [];
    }
    set(key, artifacts) {
        const storage = this._memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storage[key] = artifacts;
        this._memento.saveMemento();
    }
    delete(key) {
        const storage = this._memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        delete storage[key];
        this._memento.saveMemento();
    }
};
ChatArtifactsStorage = __decorate([
    __param(0, IStorageService)
], ChatArtifactsStorage);
class RulesChatArtifacts extends Disposable {
    constructor(sessionResource, chatService, configurationService) {
        super();
        this.mutable = constObservable(false);
        this._responseCache = new Map();
        const configByMimeType = observableFromEvent(this, configurationService.onDidChangeConfiguration, () => configurationService.getValue(ChatConfiguration.ArtifactsRulesByMimeType) ?? {});
        const configByFilePath = observableFromEvent(this, configurationService.onDidChangeConfiguration, () => configurationService.getValue(ChatConfiguration.ArtifactsRulesByFilePath) ?? {});
        const modelSignal = observableFromEvent(this, chatService.onDidCreateModel, () => chatService.getSession(sessionResource));
        this.artifacts = derived(reader => {
            const byMimeType = configByMimeType.read(reader);
            const byFilePath = configByFilePath.read(reader);
            const model = modelSignal.read(reader);
            if (!model) {
                return [];
            }
            const requestsSignal = observableSignalFromEvent(this, model.onDidChange);
            requestsSignal.read(reader);
            const requests = model.getRequests();
            const allArtifacts = [];
            const activeResponseIds = new Set();
            const seenKeys = new Set();
            for (const request of requests) {
                const response = request.response;
                if (!response) {
                    continue;
                }
                activeResponseIds.add(response.id);
                const responseValue = response.response;
                const partsLength = responseValue.value.length;
                let completedToolCount = 0;
                for (const part of responseValue.value) {
                    if ((part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && IChatToolInvocation.resultDetails(part) !== undefined) {
                        completedToolCount++;
                    }
                }
                const cached = this._responseCache.get(response.id);
                let extracted;
                if (cached && cached.partsLength === partsLength && cached.completedToolCount === completedToolCount && cached.byMimeType === byMimeType && cached.byFilePath === byFilePath) {
                    extracted = cached.artifacts;
                }
                else {
                    extracted = extractArtifactsFromResponse(responseValue, sessionResource, byMimeType, byFilePath);
                    this._responseCache.set(response.id, { partsLength, completedToolCount, byMimeType, byFilePath, artifacts: extracted });
                }
                for (const artifact of extracted) {
                    const key = artifact.toolCallId
                        ? `${artifact.toolCallId}:${artifact.dataPartIndex}`
                        : artifact.uri;
                    if (seenKeys.has(key)) {
                        const idx = allArtifacts.findIndex(a => a.toolCallId ? `${a.toolCallId}:${a.dataPartIndex}` === key : a.uri === key);
                        if (idx !== -1) {
                            allArtifacts.splice(idx, 1);
                        }
                    }
                    seenKeys.add(key);
                    allArtifacts.push(artifact);
                }
            }
            for (const key of this._responseCache.keys()) {
                if (!activeResponseIds.has(key)) {
                    this._responseCache.delete(key);
                }
            }
            return allArtifacts;
        });
    }
    set() {
        throw new Error('Artifacts are not mutable in rules mode');
    }
    clear() {
        throw new Error('Artifacts are not mutable in rules mode');
    }
    migrate() {
        // Nothing to migrate — rules artifacts are derived from the model
    }
}
class StorageChatArtifacts {
    constructor(_storageKey, _storage) {
        this._storageKey = _storageKey;
        this._storage = _storage;
        this.mutable = constObservable(true);
        this._artifacts = observableValueOpts({ owner: this, equalsFn: () => false }, []);
        this.artifacts = this._artifacts;
        this._artifacts.set(this._storage.get(this._storageKey), undefined);
    }
    set(artifacts) {
        this._artifacts.set(artifacts, undefined);
        this._storage.set(this._storageKey, artifacts);
    }
    clear() {
        this._artifacts.set([], undefined);
        this._storage.set(this._storageKey, []);
    }
    migrate(target) {
        const current = this._artifacts.get();
        if (current.length > 0 && target.mutable.get()) {
            target.set([...current]);
        }
        this._artifacts.set([], undefined);
        this._storage.delete(this._storageKey);
    }
}
class SwitchingChatArtifacts extends Disposable {
    constructor(sessionResource, storageKey, storage, chatService, configurationService) {
        super();
        this._rules = this._register(new RulesChatArtifacts(sessionResource, chatService, configurationService));
        this._storage = new StorageChatArtifacts(storageKey, storage);
        const modeObs = observableFromEvent(this, configurationService.onDidChangeConfiguration, () => configurationService.getValue(ChatConfiguration.ArtifactsMode) ?? 'rules');
        this._active = derived(reader => {
            const mode = modeObs.read(reader);
            return mode === 'tool' ? this._storage : this._rules;
        });
        this.mutable = derived(reader => this._active.read(reader).mutable.read(reader));
        this.artifacts = derived(reader => this._active.read(reader).artifacts.read(reader));
    }
    set(artifacts) {
        const active = this._active.get();
        active.set(artifacts);
    }
    clear() {
        const active = this._active.get();
        active.clear();
    }
    migrate(target) {
        this._storage.migrate(target);
    }
}
let ChatArtifactsService = class ChatArtifactsService extends Disposable {
    constructor(storageService, _chatService, _configurationService) {
        super();
        this._chatService = _chatService;
        this._configurationService = _configurationService;
        this._instances = this._register(new DisposableMap());
        this._storage = new ChatArtifactsStorage(storageService);
    }
    getArtifacts(sessionResource) {
        const key = chatSessionResourceToId(sessionResource);
        let instance = this._instances.get(key);
        if (!instance) {
            instance = new SwitchingChatArtifacts(sessionResource, key, this._storage, this._chatService, this._configurationService);
            this._instances.set(key, instance);
        }
        return instance;
    }
};
ChatArtifactsService = __decorate([
    __param(0, IStorageService),
    __param(1, IChatService),
    __param(2, IConfigurationService)
], ChatArtifactsService);
export { ChatArtifactsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFydGlmYWN0c1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0QXJ0aWZhY3RzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFdEssT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQWlCOUQsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUF3QixzQkFBc0IsQ0FBQyxDQUFDO0FBdUJwRyxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFvQjtJQUd6QixZQUE2QixjQUErQjtRQUMzRCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLGdCQUFnQixFQUFF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