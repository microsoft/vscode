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
import { Emitter } from '../../../../base/common/event.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions, IExtensionFeaturesManagementService } from './extensionFeatures.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { isBoolean } from '../../../../base/common/types.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { distinct } from '../../../../base/common/arrays.js';
import { equals } from '../../../../base/common/objects.js';
const FEATURES_STATE_KEY = 'extension.features.state';
let ExtensionFeaturesManagementService = class ExtensionFeaturesManagementService extends Disposable {
    constructor(storageService, dialogService, extensionService) {
        super();
        this.storageService = storageService;
        this.dialogService = dialogService;
        this.extensionService = extensionService;
        this._onDidChangeEnablement = this._register(new Emitter());
        this.onDidChangeEnablement = this._onDidChangeEnablement.event;
        this._onDidChangeAccessData = this._register(new Emitter());
        this.onDidChangeAccessData = this._onDidChangeAccessData.event;
        this.extensionFeaturesState = new Map();
        this.registry = Registry.as(Extensions.ExtensionFeaturesRegistry);
        this.extensionFeaturesState = this.loadState();
        this.garbageCollectOldRequests();
        this._register(storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, FEATURES_STATE_KEY, this._store)(e => this.onDidStorageChange(e)));
    }
    isEnabled(extension, featureId) {
        const feature = this.registry.getExtensionFeature(featureId);
        if (!feature) {
            return false;
        }
        const isDisabled = this.getExtensionFeatureState(extension, featureId)?.disabled;
        if (isBoolean(isDisabled)) {
            return !isDisabled;
        }
        const defaultExtensionAccess = feature.access.extensionsList?.[extension._lower];
        if (isBoolean(defaultExtensionAccess)) {
            return defaultExtensionAccess;
        }
        return !feature.access.requireUserConsent;
    }
    setEnablement(extension, featureId, enabled) {
        const feature = this.registry.getExtensionFeature(featureId);
        if (!feature) {
            throw new Error(`No feature with id '${featureId}'`);
        }
        const featureState = this.getAndSetIfNotExistsExtensionFeatureState(extension, featureId);
        if (featureState.disabled !== !enabled) {
            featureState.disabled = !enabled;
            this._onDidChangeEnablement.fire({ extension, featureId, enabled });
            this.saveState();
        }
    }
    getEnablementData(featureId) {
        const result = [];
        const feature = this.registry.getExtensionFeature(featureId);
        if (feature) {
            for (const [extension, featuresStateMap] of this.extensionFeaturesState) {
                const featureState = featuresStateMap.get(featureId);
                if (featureState?.disabled !== undefined) {
                    result.push({ extension: new ExtensionIdentifier(extension), enabled: !featureState.disabled });
                }
            }
        }
        return result;
    }
    async getAccess(extension, featureId, justification) {
        const feature = this.registry.getExtensionFeature(featureId);
        if (!feature) {
            return false;
        }
        const featureState = this.getAndSetIfNotExistsExtensionFeatureState(extension, featureId);
        if (featureState.disabled) {
            return false;
        }
        if (featureState.disabled === undefined) {
            let enabled = true;
            if (feature.access.requireUserConsent) {
                const extensionDescription = this.extensionService.extensions.find(e => ExtensionIdentifier.equals(e.identifier, extension));
                const confirmationResult = await this.dialogService.confirm({
                    title: localize('accessExtensionFeature', "Access '{0}' Feature", feature.label),
                    message: localize('accessExtensionFeatureMessage', "'{0}' extension would like to access the '{1}' feature.", extensionDescription?.displayName ?? extension._lower, feature.label),
                    detail: justification ?? feature.description,
                    custom: true,
                    primaryButton: localize('allow', "Allow"),
                    cancelButton: localize('disallow', "Don't Allow"),
                });
                enabled = confirmationResult.confirmed;
            }
            this.setEnablement(extension, featureId, enabled);
            if (!enabled) {
                return false;
            }
        }
        const accessTime = new Date();
        featureState.accessData.current = {
            accessTimes: [accessTime].concat(featureState.accessData.current?.accessTimes ?? []),
            lastAccessed: accessTime,
            status: featureState.accessData.current?.status
        };
        featureState.accessData.accessTimes = (featureState.accessData.accessTimes ?? []).concat(accessTime);
        this.saveState();
        this._onDidChangeAccessData.fire({ extension, featureId, accessData: featureState.accessData });
        return true;
    }
    getAllAccessDataForExtension(extension) {
        const result = new Map();
        const extensionState = this.extensionFeaturesState.get(extension._lower);
        if (extensionState) {
            for (const [featureId, featureState] of extensionState) {
                result.set(featureId, featureState.accessData);
            }
        }
        return result;
    }
    getAccessData(extension, featureId) {
        const feature = this.registry.getExtensionFeature(featureId);
        if (!feature) {
            return;
        }
        return this.getExtensionFeatureState(extension, featureId)?.accessData;
    }
    setStatus(extension, featureId, status) {
        const feature = this.registry.getExtensionFeature(featureId);
        if (!feature) {
            throw new Error(`No feature with id '${featureId}'`);
        }
        const featureState = this.getAndSetIfNotExistsExtensionFeatureState(extension, featureId);
        featureState.accessData.current = {
            accessTimes: featureState.accessData.current?.accessTimes ?? [],
            lastAccessed: featureState.accessData.current?.lastAccessed ?? new Date(),
            status
        };
        this._onDidChangeAccessData.fire({ extension, featureId, accessData: this.getAccessData(extension, featureId) });
    }
    getExtensionFeatureState(extension, featureId) {
        return this.extensionFeaturesState.get(extension._lower)?.get(featureId);
    }
    getAndSetIfNotExistsExtensionFeatureState(extension, featureId) {
        let extensionState = this.extensionFeaturesState.get(extension._lower);
        if (!extensionState) {
            extensionState = new Map();
            this.extensionFeaturesState.set(extension._lower, extensionState);
        }
        let featureState = extensionState.get(featureId);
        if (!featureState) {
            featureState = { accessData: { accessTimes: [] } };
            extensionState.set(featureId, featureState);
        }
        return featureState;
    }
    onDidStorageChange(e) {
        if (e.external) {
            const oldState = this.extensionFeaturesState;
            this.extensionFeaturesState = this.loadState();
            for (const extensionId of distinct([...oldState.keys(), ...this.extensionFeaturesState.keys()])) {
                const extension = new ExtensionIdentifier(extensionId);
                const oldExtensionFeaturesState = oldState.get(extensionId);
                const newExtensionFeaturesState = this.extensionFeaturesState.get(extensionId);
                for (const featureId of distinct([...oldExtensionFeaturesState?.keys() ?? [], ...newExtensionFeaturesState?.keys() ?? []])) {
                    const isEnabled = this.isEnabled(extension, featureId);
                    const wasEnabled = !oldExtensionFeaturesState?.get(featureId)?.disabled;
                    if (isEnabled !== wasEnabled) {
                        this._onDidChangeEnablement.fire({ extension, featureId, enabled: isEnabled });
                    }
                    const newAccessData = this.getAccessData(extension, featureId);
                    const oldAccessData = oldExtensionFeaturesState?.get(featureId)?.accessData;
                    if (!equals(newAccessData, oldAccessData)) {
                        this._onDidChangeAccessData.fire({ extension, featureId, accessData: newAccessData ?? { accessTimes: [] } });
                    }
                }
            }
        }
    }
    loadState() {
        let data = {};
        const raw = this.storageService.get(FEATURES_STATE_KEY, 0 /* StorageScope.PROFILE */, '{}');
        try {
            data = JSON.parse(raw);
        }
        catch (e) {
            // ignore
        }
        const result = new Map();
        for (const extensionId in data) {
            const extensionFeatureState = new Map();
            const extensionFeatures = data[extensionId];
            for (const featureId in extensionFeatures) {
                const extensionFeature = extensionFeatures[featureId];
                extensionFeatureState.set(featureId, {
                    disabled: extensionFeature.disabled,
                    accessData: {
                        accessTimes: (extensionFeature.accessTimes ?? []).map(time => new Date(time)),
                    }
                });
            }
            result.set(extensionId.toLowerCase(), extensionFeatureState);
        }
        return result;
    }
    saveState() {
        const data = {};
        this.extensionFeaturesState.forEach((extensionState, extensionId) => {
            const extensionFeatures = {};
            extensionState.forEach((featureState, featureId) => {
                extensionFeatures[featureId] = {
                    disabled: featureState.disabled,
                    accessTimes: featureState.accessData.accessTimes.map(time => time.getTime()),
                };
            });
            data[extensionId] = extensionFeatures;
        });
        this.storageService.store(FEATURES_STATE_KEY, JSON.stringify(data), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    garbageCollectOldRequests() {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        let modified = false;
        for (const [, featuresStateMap] of this.extensionFeaturesState) {
            for (const [, featureState] of featuresStateMap) {
                const originalLength = featureState.accessData.accessTimes.length;
                featureState.accessData.accessTimes = featureState.accessData.accessTimes.filter(accessTime => accessTime > thirtyDaysAgo);
                if (featureState.accessData.accessTimes.length !== originalLength) {
                    modified = true;
                }
            }
        }
        if (modified) {
            this.saveState();
        }
    }
};
ExtensionFeaturesManagementService = __decorate([
    __param(0, IStorageService),
    __param(1, IDialogService),
    __param(2, IExtensionService)
], ExtensionFeaturesManagementService);
registerSingleton(IExtensionFeaturesManagementService, ExtensionFeaturesManagementService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWV0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQStCLG1DQUFtQyxFQUE4QixNQUFNLHdCQUF3QixDQUFDO0FBQ2xKLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQVcsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBTzVELE1BQU0sa0JBQWtCLEdBQUcsMEJBQTBCLENBQUM7QUFFdEQsSUFBTSxrQ0FBa0MsR0FBeEMs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