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
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { ObservableMap } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
let ChatModelStore = class ChatModelStore extends Disposable {
    constructor(delegate, logService) {
        super();
        this.delegate = delegate;
        this.logService = logService;
        this._models = new ObservableMap();
        this._modelsToDispose = new Set();
        this._pendingDisposals = new Set();
        this._modelCreateOwners = new Map();
        this._referenceOwners = new Map();
        this._referenceOwnerIds = 0;
        this._onDidDisposeModel = this._register(new Emitter());
        this.onDidDisposeModel = this._onDidDisposeModel.event;
        this._onDidCreateModel = this._register(new Emitter());
        this.onDidCreateModel = this._onDidCreateModel.event;
        const self = this;
        this._refCollection = new class extends ReferenceCollection {
            createReferencedObject(key, props, debugOwner) {
                return self.createReferencedObject(key, props, debugOwner);
            }
            destroyReferencedObject(key, object) {
                return self.destroyReferencedObject(key, object);
            }
        }();
    }
    get observable() {
        return this._models.observable;
    }
    values() {
        return this._models.values();
    }
    /**
     * Get a ChatModel directly without acquiring a reference.
     */
    get(uri) {
        return this._models.get(this.toKey(uri));
    }
    has(uri) {
        return this._models.has(this.toKey(uri));
    }
    acquireExisting(uri, debugOwner) {
        const key = this.toKey(uri);
        if (!this._models.has(key)) {
            return undefined;
        }
        return this.wrapReference(key, this._refCollection.acquire(key, undefined, debugOwner), debugOwner);
    }
    acquireOrCreate(props, debugOwner) {
        const key = this.toKey(props.sessionResource);
        return this.wrapReference(key, this._refCollection.acquire(key, props, debugOwner), debugOwner);
    }
    getReferenceDebugSnapshot() {
        const models = Array.from(this._models.values())
            .map(model => {
            const key = this.toKey(model.sessionResource);
            const owners = this._referenceOwners.get(key) ?? new Map();
            const countsByOwner = new Map();
            for (const owner of owners.values()) {
                countsByOwner.set(owner, (countsByOwner.get(owner) ?? 0) + 1);
            }
            const holders = Array.from(countsByOwner.entries())
                .map(([holder, count]) => ({ holder, count }))
                .sort((a, b) => b.count - a.count || a.holder.localeCompare(b.holder));
            return {
                sessionResource: model.sessionResource,
                title: model.title,
                createdBy: this._modelCreateOwners.get(key) ?? 'unknown',
                initialLocation: model.initialLocation,
                isImported: !!model.isImported,
                willKeepAlive: model.willKeepAlive,
                hasPendingEdits: !!model.editingSession?.entries.get().some(entry => entry.state.get() === 0 /* ModifiedFileEntryState.Modified */),
                pendingDisposal: this._modelsToDispose.has(key),
                referenceCount: owners.size,
                holders,
            };
        })
            .sort((a, b) => b.referenceCount - a.referenceCount || Number(b.hasPendingEdits) - Number(a.hasPendingEdits) || a.sessionResource.toString().localeCompare(b.sessionResource.toString()));
        return {
            totalModels: models.length,
            totalReferences: models.reduce((total, model) => total + model.referenceCount, 0),
            models,
        };
    }
    createReferencedObject(key, props, debugOwner) {
        this._modelsToDispose.delete(key);
        const existingModel = this._models.get(key);
        if (existingModel) {
            return existingModel;
        }
        if (!props) {
            throw new Error(`No start session props provided for chat session ${key}`);
        }
        this.logService.trace(`Creating chat session ${key}`);
        const model = this.delegate.createModel(props);
        this._modelCreateOwners.set(key, debugOwner ?? 'unspecified');
        if (model.sessionResource.toString() !== key) {
            throw new Error(`Chat session key mismatch for ${key}`);
        }
        this._models.set(key, model);
        this._onDidCreateModel.fire(model);
        return model;
    }
    destroyReferencedObject(key, object) {
        this._modelsToDispose.add(key);
        const promise = this.doDestroyReferencedObject(key, object);
        this._pendingDisposals.add(promise);
        promise.finally(() => {
            this._pendingDisposals.delete(promise);
        });
    }
    async doDestroyReferencedObject(key, object) {
        try {
            await this.delegate.willDisposeModel(object);
        }
        catch (error) {
            this.logService.error(error);
        }
        finally {
            if (this._modelsToDispose.has(key)) {
                this.logService.trace(`Disposing chat session ${key}`);
                this._models.delete(key);
                this._modelCreateOwners.delete(key);
                this._referenceOwners.delete(key);
                this._onDidDisposeModel.fire(object);
                object.dispose();
            }
            this._modelsToDispose.delete(key);
        }
    }
    wrapReference(key, reference, debugOwner) {
        const ownerId = ++this._referenceOwnerIds;
        let ownerEntries = this._referenceOwners.get(key);
        if (!ownerEntries) {
            ownerEntries = new Map();
            this._referenceOwners.set(key, ownerEntries);
        }
        ownerEntries.set(ownerId, debugOwner ?? 'unspecified');
        let isDisposed = false;
        return {
            object: reference.object,
            dispose: () => {
                if (isDisposed) {
                    return;
                }
                isDisposed = true;
                const owners = this._referenceOwners.get(key);
                owners?.delete(ownerId);
                if (owners?.size === 0) {
                    this._referenceOwners.delete(key);
                }
                reference.dispose();
            }
        };
    }
    /**
     * For test use only
     */
    async waitForModelDisposals() {
        await Promise.all(this._pendingDisposals);
    }
    toKey(uri) {
        return uri.toString();
    }
    dispose() {
        super.dispose();
        this._models.forEach(model => model.dispose());
    }
};
ChatModelStore = __decorate([
    __param(1, ILogService)
], ChatModelStore);
export { ChatModelStore };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsU3RvcmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWxTdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBYyxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUE0Q2pFLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxVQUFVO0lBZ0I3QyxZQUNrQixRQUFnQyxFQUNwQyxVQUF3QztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQUhTLGFBQVEsR0FBUixRQUFRLENBQXdCO1FBQ25CLGVBQVUsR0FBVixVQUFVLENBQWE7UUFmckMsWUFBTyxHQUFHLElBQUksYUFBYSxFQUFxQixDQUFDO1FBQ2pELHFCQUFnQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDckMsc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQWlCLENBQUM7UUFDN0MsdUJBQWtCLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFDL0MscUJBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQStCLENBQUM7UUFDbkUsdUJBQWtCLEdBQUcsQ0FBQyxDQUFDO1FBRWQsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBYSxDQUFDLENBQUM7UUFDL0Qsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUVqRCxzQkFBaUIsR0FBRyxJQUFJLENB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