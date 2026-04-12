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
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { determineExtensionHostKinds } from './extensionHostKind.js';
import { IExtensionManifestPropertiesService } from './extensionManifestPropertiesService.js';
import { LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from './extensionRunningLocation.js';
import { isProposedApiEnabled } from './extensions.js';
let ExtensionRunningLocationTracker = class ExtensionRunningLocationTracker {
    get maxLocalProcessAffinity() {
        return this._maxLocalProcessAffinity;
    }
    get maxLocalWebWorkerAffinity() {
        return this._maxLocalWebWorkerAffinity;
    }
    constructor(_registry, _extensionHostKindPicker, _environmentService, _configurationService, _logService, _extensionManifestPropertiesService) {
        this._registry = _registry;
        this._extensionHostKindPicker = _extensionHostKindPicker;
        this._environmentService = _environmentService;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
        this._runningLocation = new ExtensionIdentifierMap();
        this._maxLocalProcessAffinity = 0;
        this._maxLocalWebWorkerAffinity = 0;
    }
    set(extensionId, runningLocation) {
        this._runningLocation.set(extensionId, runningLocation);
    }
    readExtensionKinds(extensionDescription) {
        if (extensionDescription.isUnderDevelopment && this._environmentService.extensionDevelopmentKind) {
            return this._environmentService.extensionDevelopmentKind;
        }
        return this._extensionManifestPropertiesService.getExtensionKind(extensionDescription);
    }
    getRunningLocation(extensionId) {
        return this._runningLocation.get(extensionId) || null;
    }
    filterByRunningLocation(extensions, desiredRunningLocation) {
        return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
    }
    filterByExtensionHostKind(extensions, desiredExtensionHostKind) {
        return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => extRunningLocation.kind === desiredExtensionHostKind);
    }
    filterByExtensionHostManager(extensions, extensionHostManager) {
        return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => extensionHostManager.representsRunningLocation(extRunningLocation));
    }
    _computeAffinity(inputExtensions, extensionHostKind, isInitialAllocation) {
        // Only analyze extensions that can execute
        const extensions = new ExtensionIdentifierMap();
        for (const extension of inputExtensions) {
            if (extension.main || extension.browser) {
                extensions.set(extension.identifier, extension);
            }
        }
        // Also add existing extensions of the same kind that can execute
        for (const extension of this._registry.getAllExtensionDescriptions()) {
            if (extension.main || extension.browser) {
                const runningLocation = this._runningLocation.get(extension.identifier);
                if (runningLocation && runningLocation.kind === extensionHostKind) {
                    extensions.set(extension.identifier, extension);
                }
            }
        }
        // Initially, each extension belongs to its own group
        const groups = new ExtensionIdentifierMap();
        let groupNumber = 0;
        for (const [_, extension] of extensions) {
            groups.set(extension.identifier, ++groupNumber);
        }
        const changeGroup = (from, to) => {
            for (const [key, group] of groups) {
                if (group === from) {
                    groups.set(key, to);
                }
            }
        };
        // We will group things together when there are dependencies
        for (const [_, extension] of extensions) {
            if (!extension.extensionDependencies) {
                continue;
            }
            const myGroup = groups.get(extension.identifier);
            for (const depId of extension.extensionDependencies) {
                const depGroup = groups.get(depId);
                if (!depGroup) {
                    // probably can't execute, so it has no impact
                    continue;
                }
                if (depGroup === myGroup) {
                    // already in the same group
                    continue;
                }
                changeGroup(depGroup, myGroup);
            }
        }
        // We will also group things together when there are extensionAffinity declarations
        for (const [_, extension] of extensions) {
            if (!extension.extensionAffinity) {
                continue;
            }
            if (!isProposedApiEnabled(extension, 'extensionAffinity')) {
                this._logService.warn(`Extension '${extension.identifier.value}' declares 'extensionAffinity' in its package.json but does not enable the 'extensionAffinity' API proposal. Add '"enabledApiProposals": ["extensionAffinity"]' to the extension's package.json to use this feature.`);
                continue;
            }
            const myGroup = groups.get(extension.identifier);
            for (const colocateId of extension.extensionAffinity) {
                const colocateGroup = groups.get(colocateId);
                if (!colocateGroup) {
                    // the extension is not installed or can't execute, so it has no impact
                    continue;
                }
                if (colocateGroup === myGroup) {
                    // already in the same group
                    continue;
                }
                changeGroup(colocateGroup, myGroup);
            }
        }
        // Initialize with existing affinities
        const resultingAffinities = new Map();
        let lastAffinity = 0;
        for (const [_, extension] of extensions) {
            const runningLocation = this._runningLocation.get(extension.identifier);
            if (runningLocation) {
                const group = groups.get(extension.identifier);
                resultingAffinities.set(group, runningLocation.affinity);
                lastAffinity = Math.max(lastAffinity, runningLocation.affinity);
            }
        }
        // When doing extension host debugging, we will ignore the configured affinity
        // because we can currently debug a single extension host
        if (!this._environmentService.isExtensionDevelopment) {
            // Go through each configured affinity and try to accomodate it
            const configuredAffinities = this._configurationService.getValue('extensions.experimental.affinity') || {};
            const configuredExtensionIds = Object.keys(configuredAffinities);
            const configuredAffinityToResultingAffinity = new Map();
            for (const extensionId of configuredExtensionIds) {
                const configuredAffinity = configuredAffinities[extensionId];
                if (typeof configuredAffinity !== 'number' || configuredAffinity <= 0 || Math.floor(configuredAffinity) !== configuredAffinity) {
                    this._logService.info(`Ignoring configured affinity for '${extensionId}' because the value is not a positive integer.`);
                    continue;
                }
                const group = groups.get(extensionId);
                if (!group) {
                    // The extension is not known or cannot execute for this extension host kind
                    continue;
                }
                const affinity1 = resultingAffinities.get(group);
                if (affinity1) {
                    // Affinity for this group is already established
                    configuredAffinityToResultingAffinity.set(configuredAffinity, affinity1);
                    continue;
                }
                const affinity2 = configuredAffinityToResultingAffinity.get(configuredAffinity);
                if (affinity2) {
                    // Affinity for this configuration is already established
                    resultingAffinities.set(group, affinity2);
                    continue;
                }
                if (!isInitialAllocation) {
                    this._logService.info(`Ignoring configured affinity for '${extensionId}' because extension host(s) are already running. Reload window.`);
                    continue;
                }
                const affinity3 = ++lastAffinity;
                configuredAffinityToResultingAffinity.set(configuredAffinity, affinity3);
                resultingAffinities.set(group, affinity3);
            }
        }
        const result = new ExtensionIdentifierMap();
        for (const extension of inputExtensions) {
            const group = groups.get(extension.identifier) || 0;
            const affinity = resultingAffinities.get(group) || 0;
            result.set(extension.identifier, affinity);
        }
        if (lastAffinity > 0 && isInitialAllocation) {
            for (let affinity = 1; affinity <= lastAffinity; affinity++) {
                const extensionIds = [];
                for (const extension of inputExtensions) {
                    if (result.get(extension.identifier) === affinity) {
                        extensionIds.push(extension.identifier);
                    }
                }
                this._logService.info(`Placing extension(s) ${extensionIds.map(e => e.value).join(', ')} on a separate extension host.`);
            }
        }
        return { affinities: result, maxAffinity: lastAffinity };
    }
    computeRunningLocation(localExtensions, remoteExtensions, isInitialAllocation) {
        return this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, isInitialAllocation).runningLocation;
    }
    _doComputeRunningLocation(existingRunningLocation, localExtensions, remoteExtensions, isInitialAllocation) {
        // Skip extensions that have an existing running location
        localExtensions = localExtensions.filter(extension => !existingRunningLocation.has(extension.identifier));
        remoteExtensions = remoteExtensions.filter(extension => !existingRunningLocation.has(extension.identifier));
        const extensionHostKinds = determineExtensionHostKinds(localExtensions, remoteExtensions, (extension) => this.readExtensionKinds(extension), (extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) => this._extensionHostKindPicker.pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference));
        const extensions = new ExtensionIdentifierMap();
        for (const extension of localExtensions) {
            extensions.set(extension.identifier, extension);
        }
        for (const extension of remoteExtensions) {
            extensions.set(extension.identifier, extension);
        }
        const result = new ExtensionIdentifierMap();
        const localProcessExtensions = [];
        const localWebWorkerExtensions = [];
        for (const [extensionIdKey, extensionHostKind] of extensionHostKinds) {
            let runningLocation = null;
            if (extensionHostKind === 1 /* ExtensionHostKind.LocalProcess */) {
                const extensionDescription = extensions.get(extensionIdKey);
                if (extensionDescription) {
                    localProcessExtensions.push(extensionDescription);
                }
            }
            else if (extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */) {
                const extensionDescription = extensions.get(extensionIdKey);
                if (extensionDescription) {
                    localWebWorkerExtensions.push(extensionDescription);
                }
            }
            else if (extensionHostKind === 3 /* ExtensionHostKind.Remote */) {
                runningLocation = new RemoteRunningLocation();
            }
            result.set(extensionIdKey, runningLocation);
        }
        const { affinities, maxAffinity } = this._computeAffinity(localProcessExtensions, 1 /* ExtensionHostKind.LocalProcess */, isInitialAllocation);
        for (const extension of localProcessExtensions) {
            const affinity = affinities.get(extension.identifier) || 0;
            result.set(extension.identifier, new LocalProcessRunningLocation(affinity));
        }
        const { affinities: localWebWorkerAffinities, maxAffinity: maxLocalWebWorkerAffinity } = this._computeAffinity(localWebWorkerExtensions, 2 /* ExtensionHostKind.LocalWebWorker */, isInitialAllocation);
        for (const extension of localWebWorkerExtensions) {
            const affinity = localWebWorkerAffinities.get(extension.identifier) || 0;
            result.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
        }
        // Add extensions that already have an existing running location
        for (const [extensionIdKey, runningLocation] of existingRunningLocation) {
            if (runningLocation) {
                result.set(extensionIdKey, runningLocation);
            }
        }
        return { runningLocation: result, maxLocalProcessAffinity: maxAffinity, maxLocalWebWorkerAffinity: maxLocalWebWorkerAffinity };
    }
    initializeRunningLocation(localExtensions, remoteExtensions) {
        const { runningLocation, maxLocalProcessAffinity, maxLocalWebWorkerAffinity } = this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, true);
        this._runningLocation = runningLocation;
        this._maxLocalProcessAffinity = maxLocalProcessAffinity;
        this._maxLocalWebWorkerAffinity = maxLocalWebWorkerAffinity;
    }
    /**
     * Returns the running locations for the removed extensions.
     */
    deltaExtensions(toAdd, toRemove) {
        // Remove old running location
        const removedRunningLocation = new ExtensionIdentifierMap();
        for (const extensionId of toRemove) {
            const extensionKey = extensionId;
            removedRunningLocation.set(extensionKey, this._runningLocation.get(extensionKey) || null);
            this._runningLocation.delete(extensionKey);
        }
        // Determine new running location
        this._updateRunningLocationForAddedExtensions(toAdd);
        return removedRunningLocation;
    }
    /**
     * Update `this._runningLocation` with running locations for newly enabled/installed extensions.
     */
    _updateRunningLocationForAddedExtensions(toAdd) {
        // Determine new running location
        const localProcessExtensions = [];
        const localWebWorkerExtensions = [];
        for (const extension of toAdd) {
            const extensionKind = this.readExtensionKinds(extension);
            const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
            const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, 0 /* ExtensionRunningPreference.None */);
            let runningLocation = null;
            if (extensionHostKind === 1 /* ExtensionHostKind.LocalProcess */) {
                localProcessExtensions.push(extension);
            }
            else if (extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */) {
                localWebWorkerExtensions.push(extension);
            }
            else if (extensionHostKind === 3 /* ExtensionHostKind.Remote */) {
                runningLocation = new RemoteRunningLocation();
            }
            this._runningLocation.set(extension.identifier, runningLocation);
        }
        const { affinities } = this._computeAffinity(localProcessExtensions, 1 /* ExtensionHostKind.LocalProcess */, false);
        for (const extension of localProcessExtensions) {
            const affinity = affinities.get(extension.identifier) || 0;
            this._runningLocation.set(extension.identifier, new LocalProcessRunningLocation(affinity));
        }
        const { affinities: webWorkerExtensionsAffinities } = this._computeAffinity(localWebWorkerExtensions, 2 /* ExtensionHostKind.LocalWebWorker */, false);
        for (const extension of localWebWorkerExtensions) {
            const affinity = webWorkerExtensionsAffinities.get(extension.identifier) || 0;
            this._runningLocation.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
        }
    }
};
ExtensionRunningLocationTracker = __decorate([
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IConfigurationService),
    __param(4, ILogService),
    __param(5, IExtensionManifestPropertiesService)
], ExtensionRunningLocationTracker);
export { ExtensionRunningLocationTracker };
export function filterExtensionDescriptions(extensions, runningLocation, predicate) {
    return extensions.filter((ext) => {
        const extRunningLocation = runningLocation.get(ext.identifier);
        return extRunningLocation && predicate(extRunningLocation);
    });
}
export function filterExtensionIdentifiers(extensions, runningLocation, predicate) {
    return extensions.filter((ext) => {
        const extRunningLocation = runningLocation.get(ext);
        return extRunningLocation && predicate(extRunningLocation);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQXVCLHNCQUFzQixFQUF5QixNQUFNLHNEQUFzRCxDQUFDO0FBQzFJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RixPQUFPLEVBQTJFLDJCQUEyQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFOUksT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUYsT0FBTyxFQUE0QiwyQkFBMkIsRUFBRSw2QkFBNkIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVKLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRWhELElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQStCO0lBTTNDLElBQVcsdUJBQXVCO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDO0lBQ3RDLENBQUM7SUFFRCxJQUFXLHlCQUF5QjtRQUNuQyxPQUFPLElBQUksQ0FBQywwQkFBMEIsQ0FBQztJQUN4QyxDQUFDO0lBRUQsWUFDa0IsU0FBZ0QsRUFDaEQsd0JBQWtELEVBQ3JDLG1CQUFrRSxFQUN6RSxxQkFBNkQsRUFDdkUsV0FB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