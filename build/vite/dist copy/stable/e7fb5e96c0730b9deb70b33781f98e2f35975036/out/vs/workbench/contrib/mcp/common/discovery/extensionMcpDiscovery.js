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
var ExtensionMcpDiscovery_1;
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { mcpActivationEvent, mcpContributionPoint } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpServerDefinition } from '../mcpTypes.js';
const cacheKey = 'mcp.extCachedServers';
const _mcpExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint(mcpContributionPoint);
var PersistWhen;
(function (PersistWhen) {
    PersistWhen[PersistWhen["CollectionExists"] = 0] = "CollectionExists";
    PersistWhen[PersistWhen["Always"] = 1] = "Always";
})(PersistWhen || (PersistWhen = {}));
let ExtensionMcpDiscovery = ExtensionMcpDiscovery_1 = class ExtensionMcpDiscovery extends Disposable {
    constructor(_mcpRegistry, storageService, _extensionService, _contextKeyService) {
        super();
        this._mcpRegistry = _mcpRegistry;
        this._extensionService = _extensionService;
        this._contextKeyService = _contextKeyService;
        this.fromGallery = false;
        this._extensionCollectionIdsToPersist = new Map();
        this._conditionalCollections = this._register(new DisposableMap());
        this.cachedServers = storageService.getObject(cacheKey, 1 /* StorageScope.WORKSPACE */, {});
        this._register(storageService.onWillSaveState(() => {
            let updated = false;
            for (const [collectionId, behavior] of this._extensionCollectionIdsToPersist.entries()) {
                const collection = this._mcpRegistry.collections.get().find(c => c.id === collectionId);
                let defs = collection?.serverDefinitions.get();
                if (!collection || collection.lazy) {
                    if (behavior === 1 /* PersistWhen.Always */) {
                        defs = [];
                    }
                    else {
                        continue;
                    }
                }
                if (defs) {
                    updated = true;
                    this.cachedServers[collectionId] = { servers: defs.map(McpServerDefinition.toSerialized) };
                }
            }
            if (updated) {
                storageService.store(cacheKey, this.cachedServers, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            }
        }));
    }
    start() {
        const extensionCollections = this._register(new DisposableMap());
        this._register(_mcpExtensionPoint.setHandler((_extensions, delta) => {
            const { added, removed } = delta;
            for (const collections of removed) {
                for (const coll of collections.value) {
                    const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
                    extensionCollections.deleteAndDispose(id);
                    this._conditionalCollections.deleteAndDispose(id);
                }
            }
            for (const collections of added) {
                if (!ExtensionMcpDiscovery_1._validate(collections)) {
                    continue;
                }
                for (const coll of collections.value) {
                    const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
                    this._extensionCollectionIdsToPersist.set(id, 0 /* PersistWhen.CollectionExists */);
                    // Handle conditional collections with 'when' clause
                    if (coll.when) {
                        this._registerConditionalCollection(id, coll, collections, extensionCollections);
                    }
                    else {
                        // Register collection immediately if no 'when' clause
                        this._registerCollection(id, coll, collections, extensionCollections);
                    }
                }
            }
        }));
    }
    _registerCollection(id, coll, collections, extensionCollections) {
        const serverDefs = this.cachedServers.hasOwnProperty(id) ? this.cachedServers[id].servers : undefined;
        const dispo = this._mcpRegistry.registerCollection({
            id,
            label: coll.label,
            remoteAuthority: null,
            trustBehavior: 0 /* McpServerTrust.Kind.Trusted */,
            scope: 1 /* StorageScope.WORKSPACE */,
            configTarget: 2 /* ConfigurationTarget.USER */,
            serverDefinitions: observableValue(this, serverDefs?.map(McpServerDefinition.fromSerialized) || []),
            lazy: {
                isCached: !!serverDefs,
                load: () => this._activateExtensionServers(coll.id).then(() => {
                    // persist (an empty collection) in case the extension doesn't end up publishing one
                    this._extensionCollectionIdsToPersist.set(id, 1 /* PersistWhen.Always */);
                }),
                removed: () => {
                    extensionCollections.deleteAndDispose(id);
                    this._conditionalCollections.deleteAndDispose(id);
                },
            },
            source: collections.description.identifier
        });
        extensionCollections.set(id, dispo);
    }
    _registerConditionalCollection(id, coll, collections, extensionCollections) {
        const whenClause = ContextKeyExpr.deserialize(coll.when);
        if (!whenClause) {
            // Invalid when clause, treat as always false
            return;
        }
        const evaluate = () => {
            const nowSatisfied = this._contextKeyService.contextMatchesRules(whenClause);
            const isRegistered = extensionCollections.has(id);
            if (nowSatisfied && !isRegistered) {
                this._registerCollection(id, coll, collections, extensionCollections);
            }
            else if (!nowSatisfied && isRegistered) {
                extensionCollections.deleteAndDispose(id);
            }
        };
        const contextKeyListener = this._contextKeyService.onDidChangeContext(evaluate);
        evaluate();
        // Store disposable for this conditional collection
        this._conditionalCollections.set(id, contextKeyListener);
    }
    async _activateExtensionServers(collectionId) {
        await this._extensionService.activateByEvent(mcpActivationEvent(collectionId));
        await Promise.all(this._mcpRegistry.delegates.get()
            .map(r => r.waitForInitialProviderPromises()));
    }
    static _validate(user) {
        if (!Array.isArray(user.value)) {
            user.collector.error(localize('invalidData', "Expected an array of MCP collections"));
            return false;
        }
        for (const contribution of user.value) {
            if (typeof contribution.id !== 'string' || isFalsyOrWhitespace(contribution.id)) {
                user.collector.error(localize('invalidId', "Expected 'id' to be a non-empty string."));
                return false;
            }
            if (typeof contribution.label !== 'string' || isFalsyOrWhitespace(contribution.label)) {
                user.collector.error(localize('invalidLabel', "Expected 'label' to be a non-empty string."));
                return false;
            }
            if (contribution.when !== undefined && (typeof contribution.when !== 'string' || isFalsyOrWhitespace(contribution.when))) {
                user.collector.error(localize('invalidWhen', "Expected 'when' to be a non-empty string."));
                return false;
            }
        }
        return true;
    }
};
ExtensionMcpDiscovery = ExtensionMcpDiscovery_1 = __decorate([
    __param(0, IMcpRegistry),
    __param(1, IStorageService),
    __param(2, IExtensionService),
    __param(3, IContextKeyService)
], ExtensionMcpDiscovery);
export { ExtensionMcpDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWNwRGlzY292ZXJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9kaXNjb3ZlcnkvZXh0ZW5zaW9uTWNwRGlzY292ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTdHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxLQUFLLGtCQUFrQixNQUFNLDhEQUE4RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQWtCLE1BQU0sZ0JBQWdCLENBQUM7QUFHbEcsTUFBTSxRQUFRLEdBQUcsc0JBQXNCLENBQUM7QUFNeEMsTUFBTSxrQkFBa0IsR0FBRyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRTlHLElBQVcsV0FHVjtBQUhELFdBQVcsV0FBVztJQUNy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