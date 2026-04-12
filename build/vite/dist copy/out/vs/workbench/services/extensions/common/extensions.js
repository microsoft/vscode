/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { getExtensionId, getGalleryExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ImplicitActivationEvents } from '../../../../platform/extensionManagement/common/implicitActivationEvents.js';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const nullExtensionDescription = Object.freeze({
    identifier: new ExtensionIdentifier('nullExtensionDescription'),
    name: 'Null Extension Description',
    version: '0.0.0',
    publisher: 'vscode',
    engines: { vscode: '' },
    extensionLocation: URI.parse('void:location'),
    isBuiltin: false,
    targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
    isUserBuiltin: false,
    isUnderDevelopment: false,
    preRelease: false,
});
export const webWorkerExtHostConfig = 'extensions.webWorker';
export const IExtensionService = createDecorator('extensionService');
export class MissingExtensionDependency {
    constructor(dependency) {
        this.dependency = dependency;
    }
}
export var ExtensionHostStartup;
(function (ExtensionHostStartup) {
    /**
     * The extension host should be launched immediately and doesn't require a `$startExtensionHost` call.
     */
    ExtensionHostStartup[ExtensionHostStartup["EagerAutoStart"] = 1] = "EagerAutoStart";
    /**
     * The extension host should be launched immediately and needs a `$startExtensionHost` call.
     */
    ExtensionHostStartup[ExtensionHostStartup["EagerManualStart"] = 2] = "EagerManualStart";
    /**
     * The extension host should be launched lazily and only when it has extensions it needs to host. It doesn't require a `$startExtensionHost` call.
     */
    ExtensionHostStartup[ExtensionHostStartup["LazyAutoStart"] = 3] = "LazyAutoStart";
})(ExtensionHostStartup || (ExtensionHostStartup = {}));
export class ExtensionHostExtensions {
    get versionId() {
        return this._versionId;
    }
    get allExtensions() {
        return this._allExtensions;
    }
    get myExtensions() {
        return this._myExtensions;
    }
    constructor(versionId, allExtensions, myExtensions) {
        this._versionId = versionId;
        this._allExtensions = allExtensions.slice(0);
        this._myExtensions = myExtensions.slice(0);
        this._myActivationEvents = null;
    }
    toSnapshot() {
        return {
            versionId: this._versionId,
            allExtensions: this._allExtensions,
            myExtensions: this._myExtensions,
            activationEvents: ImplicitActivationEvents.createActivationEventsMap(this._allExtensions)
        };
    }
    set(versionId, allExtensions, myExtensions) {
        if (this._versionId > versionId) {
            throw new Error(`ExtensionHostExtensions: invalid versionId ${versionId} (current: ${this._versionId})`);
        }
        const toRemove = [];
        const toAdd = [];
        const myToRemove = [];
        const myToAdd = [];
        const oldExtensionsMap = extensionDescriptionArrayToMap(this._allExtensions);
        const newExtensionsMap = extensionDescriptionArrayToMap(allExtensions);
        const extensionsAreTheSame = (a, b) => {
            return ((a.extensionLocation.toString() === b.extensionLocation.toString())
                || (a.isBuiltin === b.isBuiltin)
                || (a.isUserBuiltin === b.isUserBuiltin)
                || (a.isUnderDevelopment === b.isUnderDevelopment));
        };
        for (const oldExtension of this._allExtensions) {
            const newExtension = newExtensionsMap.get(oldExtension.identifier);
            if (!newExtension) {
                toRemove.push(oldExtension.identifier);
                oldExtensionsMap.delete(oldExtension.identifier);
                continue;
            }
            if (!extensionsAreTheSame(oldExtension, newExtension)) {
                // The new extension is different than the old one
                // (e.g. maybe it executes in a different location)
                toRemove.push(oldExtension.identifier);
                oldExtensionsMap.delete(oldExtension.identifier);
                continue;
            }
        }
        for (const newExtension of allExtensions) {
            const oldExtension = oldExtensionsMap.get(newExtension.identifier);
            if (!oldExtension) {
                toAdd.push(newExtension);
                continue;
            }
            if (!extensionsAreTheSame(oldExtension, newExtension)) {
                // The new extension is different than the old one
                // (e.g. maybe it executes in a different location)
                toRemove.push(oldExtension.identifier);
                oldExtensionsMap.delete(oldExtension.identifier);
                continue;
            }
        }
        const myOldExtensionsSet = new ExtensionIdentifierSet(this._myExtensions);
        const myNewExtensionsSet = new ExtensionIdentifierSet(myExtensions);
        for (const oldExtensionId of this._myExtensions) {
            if (!myNewExtensionsSet.has(oldExtensionId)) {
                myToRemove.push(oldExtensionId);
            }
        }
        for (const newExtensionId of myExtensions) {
            if (!myOldExtensionsSet.has(newExtensionId)) {
                myToAdd.push(newExtensionId);
            }
        }
        const addActivationEvents = ImplicitActivationEvents.createActivationEventsMap(toAdd);
        const delta = { versionId, toRemove, toAdd, addActivationEvents, myToRemove, myToAdd };
        this.delta(delta);
        return delta;
    }
    delta(extensionsDelta) {
        if (this._versionId >= extensionsDelta.versionId) {
            // ignore older deltas
            return null;
        }
        const { toRemove, toAdd, myToRemove, myToAdd } = extensionsDelta;
        // First handle removals
        const toRemoveSet = new ExtensionIdentifierSet(toRemove);
        const myToRemoveSet = new ExtensionIdentifierSet(myToRemove);
        for (let i = 0; i < this._allExtensions.length; i++) {
            if (toRemoveSet.has(this._allExtensions[i].identifier)) {
                this._allExtensions.splice(i, 1);
                i--;
            }
        }
        for (let i = 0; i < this._myExtensions.length; i++) {
            if (myToRemoveSet.has(this._myExtensions[i])) {
                this._myExtensions.splice(i, 1);
                i--;
            }
        }
        // Then handle additions
        for (const extension of toAdd) {
            this._allExtensions.push(extension);
        }
        for (const extensionId of myToAdd) {
            this._myExtensions.push(extensionId);
        }
        // clear cached activation events
        this._myActivationEvents = null;
        return extensionsDelta;
    }
    containsExtension(extensionId) {
        for (const myExtensionId of this._myExtensions) {
            if (ExtensionIdentifier.equals(myExtensionId, extensionId)) {
                return true;
            }
        }
        return false;
    }
    containsActivationEvent(activationEvent) {
        if (!this._myActivationEvents) {
            this._myActivationEvents = this._readMyActivationEvents();
        }
        return this._myActivationEvents.has(activationEvent);
    }
    _readMyActivationEvents() {
        const result = new Set();
        for (const extensionDescription of this._allExtensions) {
            if (!this.containsExtension(extensionDescription.identifier)) {
                continue;
            }
            const activationEvents = ImplicitActivationEvents.readActivationEvents(extensionDescription);
            for (const activationEvent of activationEvents) {
                result.add(activationEvent);
            }
        }
        return result;
    }
}
function extensionDescriptionArrayToMap(extensions) {
    const result = new ExtensionIdentifierMap();
    for (const extension of extensions) {
        result.set(extension.identifier, extension);
    }
    return result;
}
export function isProposedApiEnabled(extension, proposal) {
    if (!extension.enabledApiProposals) {
        return false;
    }
    return true; // extension.enabledApiProposals.includes(proposal);
}
export function checkProposedApiEnabled(extension, proposal) {
    if (!isProposedApiEnabled(extension, proposal)) {
        throw new Error(`Extension '${extension.identifier.value}' CANNOT use API proposal: ${proposal}.\nIts package.json#enabledApiProposals-property declares: ${extension.enabledApiProposals?.join(', ') ?? '[]'} but NOT ${proposal}.\n The missing proposal MUST be added and you must start in extension development mode or use the following command line switch: --enable-proposed-api ${extension.identifier.value}`);
    }
}
export class ActivationTimes {
    constructor(codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) {
        this.codeLoadingTime = codeLoadingTime;
        this.activateCallTime = activateCallTime;
        this.activateResolvedTime = activateResolvedTime;
        this.activationReason = activationReason;
    }
}
export class ExtensionPointContribution {
    constructor(description, value) {
        this.description = description;
        this.value = value;
    }
}
export var ActivationKind;
(function (ActivationKind) {
    ActivationKind[ActivationKind["Normal"] = 0] = "Normal";
    ActivationKind[ActivationKind["Immediate"] = 1] = "Immediate";
})(ActivationKind || (ActivationKind = {}));
export function toExtension(extensionDescription) {
    return {
        type: extensionDescription.isBuiltin ? 0 /* ExtensionType.System */ : 1 /* ExtensionType.User */,
        isBuiltin: extensionDescription.isBuiltin || extensionDescription.isUserBuiltin,
        identifier: { id: getGalleryExtensionId(extensionDescription.publisher, extensionDescription.name), uuid: extensionDescription.uuid },
        manifest: extensionDescription,
        location: extensionDescription.extensionLocation,
        targetPlatform: extensionDescription.targetPlatform,
        validations: [],
        isValid: true,
        preRelease: extensionDescription.preRelease,
        publisherDisplayName: extensionDescription.publisherDisplayName,
    };
}
export function toExtensionDescription(extension, isUnderDevelopment) {
    const id = getExtensionId(extension.manifest.publisher, extension.manifest.name);
    return {
        id,
        identifier: new ExtensionIdentifier(id),
        isBuiltin: extension.type === 0 /* ExtensionType.System */,
        isUserBuiltin: extension.type === 1 /* ExtensionType.User */ && extension.isBuiltin,
        isUnderDevelopment: !!isUnderDevelopment,
        extensionLocation: extension.location,
        uuid: extension.identifier.uuid,
        targetPlatform: extension.targetPlatform,
        publisherDisplayName: extension.publisherDisplayName,
        preRelease: extension.preRelease,
        ...extension.manifest
    };
}
export class NullExtensionService {
    constructor() {
        this.onDidRegisterExtensions = Event.None;
        this.onDidChangeExtensionsStatus = Event.None;
        this.onDidChangeExtensions = Event.None;
        this.onWillActivateByEvent = Event.None;
        this.onDidChangeResponsiveChange = Event.None;
        this.onWillStop = Event.None;
        this.extensions = [];
    }
    activateByEvent(_activationEvent) { return Promise.resolve(undefined); }
    activateById(extensionId, reason) { return Promise.resolve(undefined); }
    activationEventIsDone(_activationEvent) { return false; }
    whenInstalledExtensionsRegistered() { return Promise.resolve(true); }
    getExtension() { return Promise.resolve(undefined); }
    readExtensionPointContributions(_extPoint) { return Promise.resolve(Object.create(null)); }
    getExtensionsStatus() { return Object.create(null); }
    getInspectPorts(_extensionHostKind, _tryEnableInspector) { return Promise.resolve([]); }
    async stopExtensionHosts() { return true; }
    async startExtensionHosts() { }
    async setRemoteEnvironment(_env) { }
    canAddExtension() { return false; }
    canRemoveExtension() { return false; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ25JLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBNkYsTUFBTSxzREFBc0QsQ0FBQztBQUV0TyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFPN0YsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBd0I7SUFDNUUsVUFBVSxFQUFFLElBQUksbUJBQW1CLENBQUMsMEJBQTBCLENBQUM7SUFDL0QsSUFBSSxFQUFFLDRCQUE0QjtJQUNsQyxPQUFPLEVBQUUsT0FBTztJQUNoQixTQUFTLEVBQUUsUUFBUTtJQUNuQixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFO0lBQ3ZCLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDO0lBQzdDLFNBQVMsRUFBRSxLQUFLO0lBQ2hCLGNBQWMsNENBQTBCO0lBQ3hDLGFBQWEsRUFBRSxLQUFLO0lBQ3BCLGtCQUFrQixFQUFFLEtBQUs7SUFDekIsVUFBVSxFQUFFLEtBQUs7Q0FDakIsQ0FBQyxDQUFDO0FBR0gsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcs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