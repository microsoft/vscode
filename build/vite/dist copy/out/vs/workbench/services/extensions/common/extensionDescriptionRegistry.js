/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { Emitter } from '../../../../base/common/event.js';
import * as path from '../../../../base/common/path.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { promiseWithResolvers } from '../../../../base/common/async.js';
export class DeltaExtensionsResult {
    constructor(versionId, removedDueToLooping) {
        this.versionId = versionId;
        this.removedDueToLooping = removedDueToLooping;
    }
}
export class ExtensionDescriptionRegistry extends Disposable {
    static isHostExtension(extensionId, myRegistry, globalRegistry) {
        if (myRegistry.getExtensionDescription(extensionId)) {
            // I have this extension
            return false;
        }
        const extensionDescription = globalRegistry.getExtensionDescription(extensionId);
        if (!extensionDescription) {
            // unknown extension
            return false;
        }
        if ((extensionDescription.main || extensionDescription.browser) && extensionDescription.api === 'none') {
            return true;
        }
        return false;
    }
    constructor(_activationEventsReader, extensionDescriptions) {
        super();
        this._activationEventsReader = _activationEventsReader;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._versionId = 0;
        this._extensionDescriptions = extensionDescriptions;
        this._initialize();
    }
    _initialize() {
        // Ensure extensions are stored in the order: builtin, user, under development
        this._extensionDescriptions.sort(extensionCmp);
        this._extensionsMap = new ExtensionIdentifierMap();
        this._extensionsArr = [];
        this._activationMap = new Map();
        for (const extensionDescription of this._extensionDescriptions) {
            if (this._extensionsMap.has(extensionDescription.identifier)) {
                // No overwriting allowed!
                console.error('Extension `' + extensionDescription.identifier.value + '` is already registered');
                continue;
            }
            this._extensionsMap.set(extensionDescription.identifier, extensionDescription);
            this._extensionsArr.push(extensionDescription);
            const activationEvents = this._activationEventsReader.readActivationEvents(extensionDescription);
            for (const activationEvent of activationEvents) {
                if (!this._activationMap.has(activationEvent)) {
                    this._activationMap.set(activationEvent, []);
                }
                this._activationMap.get(activationEvent).push(extensionDescription);
            }
        }
    }
    set(extensionDescriptions) {
        this._extensionDescriptions = extensionDescriptions;
        this._initialize();
        this._versionId++;
        this._onDidChange.fire(undefined);
        return {
            versionId: this._versionId
        };
    }
    deltaExtensions(toAdd, toRemove) {
        // It is possible that an extension is removed, only to be added again at a different version
        // so we will first handle removals
        this._extensionDescriptions = removeExtensions(this._extensionDescriptions, toRemove);
        // Then, handle the extensions to add
        this._extensionDescriptions = this._extensionDescriptions.concat(toAdd);
        // Immediately remove looping extensions!
        const looping = ExtensionDescriptionRegistry._findLoopingExtensions(this._extensionDescriptions);
        this._extensionDescriptions = removeExtensions(this._extensionDescriptions, looping.map(ext => ext.identifier));
        this._initialize();
        this._versionId++;
        this._onDidChange.fire(undefined);
        return new DeltaExtensionsResult(this._versionId, looping);
    }
    static _findLoopingExtensions(extensionDescriptions) {
        const G = new class {
            constructor() {
                this._arcs = new Map();
                this._nodesSet = new Set();
                this._nodesArr = [];
            }
            addNode(id) {
                if (!this._nodesSet.has(id)) {
                    this._nodesSet.add(id);
                    this._nodesArr.push(id);
                }
            }
            addArc(from, to) {
                this.addNode(from);
                this.addNode(to);
                if (this._arcs.has(from)) {
                    this._arcs.get(from).push(to);
                }
                else {
                    this._arcs.set(from, [to]);
                }
            }
            getArcs(id) {
                if (this._arcs.has(id)) {
                    return this._arcs.get(id);
                }
                return [];
            }
            hasOnlyGoodArcs(id, good) {
                const dependencies = G.getArcs(id);
                for (let i = 0; i < dependencies.length; i++) {
                    if (!good.has(dependencies[i])) {
                        return false;
                    }
                }
                return true;
            }
            getNodes() {
                return this._nodesArr;
            }
        };
        const descs = new ExtensionIdentifierMap();
        for (const extensionDescription of extensionDescriptions) {
            descs.set(extensionDescription.identifier, extensionDescription);
            if (extensionDescription.extensionDependencies) {
                for (const depId of extensionDescription.extensionDependencies) {
                    G.addArc(ExtensionIdentifier.toKey(extensionDescription.identifier), ExtensionIdentifier.toKey(depId));
                }
            }
        }
        // initialize with all extensions with no dependencies.
        const good = new Set();
        G.getNodes().filter(id => G.getArcs(id).length === 0).forEach(id => good.add(id));
        // all other extensions will be processed below.
        const nodes = G.getNodes().filter(id => !good.has(id));
        let madeProgress;
        do {
            madeProgress = false;
            // find one extension which has only good deps
            for (let i = 0; i < nodes.length; i++) {
                const id = nodes[i];
                if (G.hasOnlyGoodArcs(id, good)) {
                    nodes.splice(i, 1);
                    i--;
                    good.add(id);
                    madeProgress = true;
                }
            }
        } while (madeProgress);
        // The remaining nodes are bad and have loops
        return nodes.map(id => descs.get(id));
    }
    containsActivationEvent(activationEvent) {
        return this._activationMap.has(activationEvent);
    }
    containsExtension(extensionId) {
        return this._extensionsMap.has(extensionId);
    }
    getExtensionDescriptionsForActivationEvent(activationEvent) {
        const extensions = this._activationMap.get(activationEvent);
        return extensions ? extensions.slice(0) : [];
    }
    getAllExtensionDescriptions() {
        return this._extensionsArr.slice(0);
    }
    getSnapshot() {
        return new ExtensionDescriptionRegistrySnapshot(this._versionId, this.getAllExtensionDescriptions());
    }
    getExtensionDescription(extensionId) {
        const extension = this._extensionsMap.get(extensionId);
        return extension ? extension : undefined;
    }
    getExtensionDescriptionByUUID(uuid) {
        for (const extensionDescription of this._extensionsArr) {
            if (extensionDescription.uuid === uuid) {
                return extensionDescription;
            }
        }
        return undefined;
    }
    getExtensionDescriptionByIdOrUUID(extensionId, uuid) {
        return (this.getExtensionDescription(extensionId)
            ?? (uuid ? this.getExtensionDescriptionByUUID(uuid) : undefined));
    }
}
export class ExtensionDescriptionRegistrySnapshot {
    constructor(versionId, extensions) {
        this.versionId = versionId;
        this.extensions = extensions;
    }
}
export class LockableExtensionDescriptionRegistry {
    constructor(activationEventsReader) {
        this._lock = new Lock();
        this._actual = new ExtensionDescriptionRegistry(activationEventsReader, []);
    }
    async acquireLock(customerName) {
        const lock = await this._lock.acquire(customerName);
        return new ExtensionDescriptionRegistryLock(this, lock);
    }
    deltaExtensions(acquiredLock, toAdd, toRemove) {
        if (!acquiredLock.isAcquiredFor(this)) {
            throw new Error('Lock is not held');
        }
        return this._actual.deltaExtensions(toAdd, toRemove);
    }
    containsActivationEvent(activationEvent) {
        return this._actual.containsActivationEvent(activationEvent);
    }
    containsExtension(extensionId) {
        return this._actual.containsExtension(extensionId);
    }
    getExtensionDescriptionsForActivationEvent(activationEvent) {
        return this._actual.getExtensionDescriptionsForActivationEvent(activationEvent);
    }
    getAllExtensionDescriptions() {
        return this._actual.getAllExtensionDescriptions();
    }
    getSnapshot() {
        return this._actual.getSnapshot();
    }
    getExtensionDescription(extensionId) {
        return this._actual.getExtensionDescription(extensionId);
    }
    getExtensionDescriptionByUUID(uuid) {
        return this._actual.getExtensionDescriptionByUUID(uuid);
    }
    getExtensionDescriptionByIdOrUUID(extensionId, uuid) {
        return this._actual.getExtensionDescriptionByIdOrUUID(extensionId, uuid);
    }
}
export class ExtensionDescriptionRegistryLock extends Disposable {
    constructor(_registry, lock) {
        super();
        this._registry = _registry;
        this._isDisposed = false;
        this._register(lock);
    }
    isAcquiredFor(registry) {
        return !this._isDisposed && this._registry === registry;
    }
}
class LockCustomer {
    constructor(name) {
        this.name = name;
        const withResolvers = promiseWithResolvers();
        this.promise = withResolvers.promise;
        this._resolve = withResolvers.resolve;
    }
    resolve(value) {
        this._resolve(value);
    }
}
class Lock {
    constructor() {
        this._pendingCustomers = [];
        this._isLocked = false;
    }
    async acquire(customerName) {
        const customer = new LockCustomer(customerName);
        this._pendingCustomers.push(customer);
        this._advance();
        return customer.promise;
    }
    _advance() {
        if (this._isLocked) {
            // cannot advance yet
            return;
        }
        if (this._pendingCustomers.length === 0) {
            // no more waiting customers
            return;
        }
        const customer = this._pendingCustomers.shift();
        this._isLocked = true;
        let customerHoldsLock = true;
        const logLongRunningCustomerTimeout = setTimeout(() => {
            if (customerHoldsLock) {
                console.warn(`The customer named ${customer.name} has been holding on to the lock for 30s. This might be a problem.`);
            }
        }, 30 * 1000 /* 30 seconds */);
        const releaseLock = () => {
            if (!customerHoldsLock) {
                return;
            }
            clearTimeout(logLongRunningCustomerTimeout);
            customerHoldsLock = false;
            this._isLocked = false;
            this._advance();
        };
        customer.resolve(toDisposable(releaseLock));
    }
}
var SortBucket;
(function (SortBucket) {
    SortBucket[SortBucket["Builtin"] = 0] = "Builtin";
    SortBucket[SortBucket["User"] = 1] = "User";
    SortBucket[SortBucket["Dev"] = 2] = "Dev";
})(SortBucket || (SortBucket = {}));
/**
 * Ensure that:
 * - first are builtin extensions
 * - second are user extensions
 * - third are extensions under development
 *
 * In each bucket, extensions must be sorted alphabetically by their folder name.
 */
function extensionCmp(a, b) {
    const aSortBucket = (a.isBuiltin ? 0 /* SortBucket.Builtin */ : a.isUnderDevelopment ? 2 /* SortBucket.Dev */ : 1 /* SortBucket.User */);
    const bSortBucket = (b.isBuiltin ? 0 /* SortBucket.Builtin */ : b.isUnderDevelopment ? 2 /* SortBucket.Dev */ : 1 /* SortBucket.User */);
    if (aSortBucket !== bSortBucket) {
        return aSortBucket - bSortBucket;
    }
    const aLastSegment = path.posix.basename(a.extensionLocation.path);
    const bLastSegment = path.posix.basename(b.extensionLocation.path);
    if (aLastSegment < bLastSegment) {
        return -1;
    }
    if (aLastSegment > bLastSegment) {
        return 1;
    }
    return 0;
}
function removeExtensions(arr, toRemove) {
    const toRemoveSet = new ExtensionIdentifierSet(toRemove);
    return arr.filter(extension => !toRemoveSet.has(extension.identifier));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBeUIsTUFBTSxzREFBc0QsQ0FBQztBQUNsSyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhFLE1BQU0sT0FBTyxxQkFBcUI7SUFDakMsWUFDaUIsU0FBaUIsRUFDakIsbUJBQTRDO1FBRDVDLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFDakIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUF5QjtJQUN6RCxDQUFDO0NBQ0w7QUFZRCxNQUFNLE9BQU8sNEJBQTZCLFNBQVEsVUFBVTtJQUVwRCxNQUFNLENBQUMsZUFBZSxDQUFDLFdBQXlDLEVBQUUsVUFBd0MsRUFBRSxjQUE0QztRQUM5SixJQUFJLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ3JELHdCQUF3QjtZQUN4QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLG9CQUFvQixHQUFHLGNBQWMsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMzQixvQkFBb0I7WUFD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