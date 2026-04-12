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
var ContributedExternalUriOpenersStore_1;
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { updateContributedOpeners } from './configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
let ContributedExternalUriOpenersStore = class ContributedExternalUriOpenersStore extends Disposable {
    static { ContributedExternalUriOpenersStore_1 = this; }
    static { this.STORAGE_ID = 'externalUriOpeners'; }
    constructor(storageService, _extensionService) {
        super();
        this._extensionService = _extensionService;
        this._openers = new Map();
        this._memento = new Memento(ContributedExternalUriOpenersStore_1.STORAGE_ID, storageService);
        this._mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        for (const [id, value] of Object.entries(this._mementoObject || {})) {
            if (value) {
                this.add(id, value.extensionId, { isCurrentlyRegistered: false });
            }
        }
        this.invalidateOpenersOnExtensionsChanged();
        this._register(this._extensionService.onDidChangeExtensions(() => this.invalidateOpenersOnExtensionsChanged()));
        this._register(this._extensionService.onDidChangeExtensionsStatus(() => this.invalidateOpenersOnExtensionsChanged()));
    }
    didRegisterOpener(id, extensionId) {
        this.add(id, extensionId, {
            isCurrentlyRegistered: true
        });
    }
    add(id, extensionId, options) {
        const existing = this._openers.get(id);
        if (existing) {
            existing.isCurrentlyRegistered = existing.isCurrentlyRegistered || options.isCurrentlyRegistered;
            return;
        }
        const entry = {
            extensionId,
            isCurrentlyRegistered: options.isCurrentlyRegistered
        };
        this._openers.set(id, entry);
        this._mementoObject[id] = entry;
        this._memento.saveMemento();
        this.updateSchema();
    }
    delete(id) {
        this._openers.delete(id);
        delete this._mementoObject[id];
        this._memento.saveMemento();
        this.updateSchema();
    }
    async invalidateOpenersOnExtensionsChanged() {
        await this._extensionService.whenInstalledExtensionsRegistered();
        const registeredExtensions = this._extensionService.extensions;
        for (const [id, entry] of this._openers) {
            const extension = registeredExtensions.find(r => r.identifier.value === entry.extensionId);
            if (extension) {
                if (!this._extensionService.canRemoveExtension(extension)) {
                    // The extension is running. We should have registered openers at this point
                    if (!entry.isCurrentlyRegistered) {
                        this.delete(id);
                    }
                }
            }
            else {
                // The opener came from an extension that is no longer enabled/installed
                this.delete(id);
            }
        }
    }
    updateSchema() {
        const ids = [];
        const descriptions = [];
        for (const [id, entry] of this._openers) {
            ids.push(id);
            descriptions.push(entry.extensionId);
        }
        updateContributedOpeners(ids, descriptions);
    }
};
ContributedExternalUriOpenersStore = ContributedExternalUriOpenersStore_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IExtensionService)
], ContributedExternalUriOpenersStore);
export { ContributedExternalUriOpenersStore };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0ZWRPcGVuZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZXJuYWxVcmlPcGVuZXIvY29tbW9uL2NvbnRyaWJ1dGVkT3BlbmVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBWS9FLElBQU0sa0NBQWtDLEdBQXhDLE1BQU0sa0NBQW1DLFNBQVEsVUFBVTs7YUFFekMsZUFBVSxHQUFHLG9CQUFvQixBQUF2QixDQUF3QjtJQU0xRCxZQUNrQixjQUErQixFQUM3QixpQkFBcUQ7UUFFeEUsS0FBSyxFQUFFLENBQUM7UUFGNEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQU54RCxhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQW9DLENBQUM7UUFVdkUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxvQ0FBa0MsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsNkRBQTZDLENBQUM7UUFDNUYsS0FBSyxNQUFNLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO1lB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