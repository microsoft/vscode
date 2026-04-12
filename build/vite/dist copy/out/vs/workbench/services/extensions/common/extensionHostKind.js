/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
export var ExtensionHostKind;
(function (ExtensionHostKind) {
    ExtensionHostKind[ExtensionHostKind["LocalProcess"] = 1] = "LocalProcess";
    ExtensionHostKind[ExtensionHostKind["LocalWebWorker"] = 2] = "LocalWebWorker";
    ExtensionHostKind[ExtensionHostKind["Remote"] = 3] = "Remote";
})(ExtensionHostKind || (ExtensionHostKind = {}));
export function extensionHostKindToString(kind) {
    if (kind === null) {
        return 'None';
    }
    switch (kind) {
        case 1 /* ExtensionHostKind.LocalProcess */: return 'LocalProcess';
        case 2 /* ExtensionHostKind.LocalWebWorker */: return 'LocalWebWorker';
        case 3 /* ExtensionHostKind.Remote */: return 'Remote';
    }
}
export var ExtensionRunningPreference;
(function (ExtensionRunningPreference) {
    ExtensionRunningPreference[ExtensionRunningPreference["None"] = 0] = "None";
    ExtensionRunningPreference[ExtensionRunningPreference["Local"] = 1] = "Local";
    ExtensionRunningPreference[ExtensionRunningPreference["Remote"] = 2] = "Remote";
})(ExtensionRunningPreference || (ExtensionRunningPreference = {}));
export function extensionRunningPreferenceToString(preference) {
    switch (preference) {
        case 0 /* ExtensionRunningPreference.None */:
            return 'None';
        case 1 /* ExtensionRunningPreference.Local */:
            return 'Local';
        case 2 /* ExtensionRunningPreference.Remote */:
            return 'Remote';
    }
}
export function determineExtensionHostKinds(_localExtensions, _remoteExtensions, getExtensionKind, pickExtensionHostKind) {
    const localExtensions = toExtensionWithKind(_localExtensions, getExtensionKind);
    const remoteExtensions = toExtensionWithKind(_remoteExtensions, getExtensionKind);
    const allExtensions = new Map();
    const collectExtension = (ext) => {
        if (allExtensions.has(ext.key)) {
            return;
        }
        const local = localExtensions.get(ext.key) || null;
        const remote = remoteExtensions.get(ext.key) || null;
        const info = new ExtensionInfo(local, remote);
        allExtensions.set(info.key, info);
    };
    localExtensions.forEach((ext) => collectExtension(ext));
    remoteExtensions.forEach((ext) => collectExtension(ext));
    const extensionHostKinds = new Map();
    allExtensions.forEach((ext) => {
        const isInstalledLocally = Boolean(ext.local);
        const isInstalledRemotely = Boolean(ext.remote);
        const isLocallyUnderDevelopment = Boolean(ext.local && ext.local.isUnderDevelopment);
        const isRemotelyUnderDevelopment = Boolean(ext.remote && ext.remote.isUnderDevelopment);
        let preference = 0 /* ExtensionRunningPreference.None */;
        if (isLocallyUnderDevelopment && !isRemotelyUnderDevelopment) {
            preference = 1 /* ExtensionRunningPreference.Local */;
        }
        else if (isRemotelyUnderDevelopment && !isLocallyUnderDevelopment) {
            preference = 2 /* ExtensionRunningPreference.Remote */;
        }
        extensionHostKinds.set(ext.key, pickExtensionHostKind(ext.identifier, ext.kind, isInstalledLocally, isInstalledRemotely, preference));
    });
    return extensionHostKinds;
}
function toExtensionWithKind(extensions, getExtensionKind) {
    const result = new Map();
    extensions.forEach((desc) => {
        const ext = new ExtensionWithKind(desc, getExtensionKind(desc));
        result.set(ext.key, ext);
    });
    return result;
}
class ExtensionWithKind {
    constructor(desc, kind) {
        this.desc = desc;
        this.kind = kind;
    }
    get key() {
        return ExtensionIdentifier.toKey(this.desc.identifier);
    }
    get isUnderDevelopment() {
        return this.desc.isUnderDevelopment;
    }
}
class ExtensionInfo {
    constructor(local, remote) {
        this.local = local;
        this.remote = remote;
    }
    get key() {
        if (this.local) {
            return this.local.key;
        }
        return this.remote.key;
    }
    get identifier() {
        if (this.local) {
            return this.local.desc.identifier;
        }
        return this.remote.desc.identifier;
    }
    get kind() {
        // in case of disagreements between extension kinds, it is always
        // better to pick the local extension because it has a much higher
        // chance of being up-to-date
        if (this.local) {
            return this.local.kind;
        }
        return this.remote.kind;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdEtpbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEtpbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLHNEQUFzRCxDQUFDO0FBRWxILE1BQU0sQ0FBTixJQUFrQixpQkFJakI7QUFKRCxXQUFrQixpQkFBaUI7SUFDbEMseUVBQWdCLENBQUE7SUFDaEIsNkVBQWtCLENBQUE7SUFDbEIsNkRBQVUsQ0FBQTtBQUNYLENBQUMsRUFKaUIsaUJBQWlCLEtBQWpCLGlCQUFpQixRQUlsQztBQUVELE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxJQUE4QjtJQUN2RSxJQUFJLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNuQixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFDRCxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2QsMkNBQW1DLENBQUMsQ0FBQyxPQUFPLGNBQWMsQ0FBQztRQUMzRCw2Q0FBcUMsQ0FBQyxDQUFDLE9BQU8sZ0JBQWdCLENBQUM7UUFDL0QscUNBQTZCLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQztJQUNoRCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sQ0FBTixJQUFrQiwwQkFJakI7QUFKRCxXQUFrQiwwQkFBMEI7SUFDM0MsMkVBQUksQ0FBQTtJQUNKLDZFQUFLLENBQUE7SUFDTCwrRUFBTSxDQUFBO0FBQ1AsQ0FBQyxFQUppQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBSTNDO0FBRUQsTUFBTSxVQUFVLGtDQUFrQyxDQUFDLFVBQXNDO0lBQ3hGLFFBQVEsVUFBVSxFQUFFLENBQUM7UUFDcEI7WUFDQyxPQUFPLE1BQU0sQ0FBQztRQUNmO1lBQ0MsT0FBTyxPQUFP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