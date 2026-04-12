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
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService, IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { shuffle } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ExeBasedRecommendations } from './exeBasedRecommendations.js';
import { WorkspaceRecommendations } from './workspaceRecommendations.js';
import { FileBasedRecommendations } from './fileBasedRecommendations.js';
import { KeymapRecommendations } from './keymapRecommendations.js';
import { LanguageRecommendations } from './languageRecommendations.js';
import { ConfigBasedRecommendations } from './configBasedRecommendations.js';
import { IExtensionRecommendationNotificationService } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { WebRecommendations } from './webRecommendations.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { RemoteRecommendations } from './remoteRecommendations.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IUserDataInitializationService } from '../../../services/userData/browser/userDataInit.js';
import { isString } from '../../../../base/common/types.js';
let ExtensionRecommendationsService = class ExtensionRecommendationsService extends Disposable {
    constructor(instantiationService, lifecycleService, galleryService, telemetryService, environmentService, extensionManagementService, extensionRecommendationsManagementService, extensionRecommendationNotificationService, extensionsWorkbenchService, remoteExtensionsScannerService, userDataInitializationService) {
        super();
        this.lifecycleService = lifecycleService;
        this.galleryService = galleryService;
        this.telemetryService = telemetryService;
        this.environmentService = environmentService;
        this.extensionManagementService = extensionManagementService;
        this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
        this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.remoteExtensionsScannerService = remoteExtensionsScannerService;
        this.userDataInitializationService = userDataInitializationService;
        this._onDidChangeRecommendations = this._register(new Emitter());
        this.onDidChangeRecommendations = this._onDidChangeRecommendations.event;
        this.workspaceRecommendations = this._register(instantiationService.createInstance(WorkspaceRecommendations));
        this.fileBasedRecommendations = this._register(instantiationService.createInstance(FileBasedRecommendations));
        this.configBasedRecommendations = this._register(instantiationService.createInstance(ConfigBasedRecommendations));
        this.exeBasedRecommendations = this._register(instantiationService.createInstance(ExeBasedRecommendations));
        this.keymapRecommendations = this._register(instantiationService.createInstance(KeymapRecommendations));
        this.webRecommendations = this._register(instantiationService.createInstance(WebRecommendations));
        this.languageRecommendations = this._register(instantiationService.createInstance(LanguageRecommendations));
        this.remoteRecommendations = this._register(instantiationService.createInstance(RemoteRecommendations));
        if (!this.isEnabled()) {
            this.sessionSeed = 0;
            this.activationPromise = Promise.resolve();
            return;
        }
        this.sessionSeed = +new Date();
        // Activation
        this.activationPromise = this.activate();
        this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
    }
    async activate() {
        try {
            await Promise.allSettled([
                this.remoteExtensionsScannerService.whenExtensionsReady(),
                this.userDataInitializationService.whenInitializationFinished(),
                this.lifecycleService.when(3 /* LifecyclePhase.Restored */)
            ]);
        }
        catch (error) { /* ignore */ }
        // activate all recommendations
        await Promise.all([
            this.workspaceRecommendations.activate(),
            this.configBasedRecommendations.activate(),
            this.fileBasedRecommendations.activate(),
            this.keymapRecommendations.activate(),
            this.languageRecommendations.activate(),
            this.webRecommendations.activate(),
            this.remoteRecommendations.activate()
        ]);
        this._register(Event.any(this.workspaceRecommendations.onDidChangeRecommendations, this.configBasedRecommendations.onDidChangeRecommendations, this.extensionRecommendationsManagementService.onDidChangeIgnoredRecommendations)(() => this._onDidChangeRecommendations.fire()));
        this.promptWorkspaceRecommendations();
    }
    isEnabled() {
        return this.galleryService.isEnabled() && !this.environmentService.isExtensionDevelopment;
    }
    async activateProactiveRecommendations() {
        await Promise.all([this.exeBasedRecommendations.activate(), this.configBasedRecommendations.activate()]);
    }
    getAllRecommendationsWithReason() {
        /* Activate proactive recommendations */
        this.activateProactiveRecommendations();
        const output = Object.create(null);
        const allRecommendations = [
            ...this.configBasedRecommendations.recommendations,
            ...this.exeBasedRecommendations.recommendations,
            ...this.fileBasedRecommendations.recommendations,
            ...this.workspaceRecommendations.recommendations,
            ...this.keymapRecommendations.recommendations,
            ...this.languageRecommendations.recommendations,
            ...this.webRecommendations.recommendations,
        ];
        for (const { extension, reason } of allRecommendations) {
            if (isString(extension) && this.isExtensionAllowedToBeRecommended(extension)) {
                output[extension.toLowerCase()] = reason;
            }
        }
        return output;
    }
    async getConfigBasedRecommendations() {
        await this.configBasedRecommendations.activate();
        return {
            important: this.toExtensionIds(this.configBasedRecommendations.importantRecommendations),
            others: this.toExtensionIds(this.configBasedRecommendations.otherRecommendations)
        };
    }
    async getOtherRecommendations() {
        await this.activationPromise;
        await this.activateProactiveRecommendations();
        const recommendations = [
            ...this.configBasedRecommendations.otherRecommendations,
            ...this.exeBasedRecommendations.otherRecommendations,
            ...this.webRecommendations.recommendations
        ];
        const extensionIds = this.toExtensionIds(recommendations);
        shuffle(extensionIds, this.sessionSeed);
        return extensionIds;
    }
    async getImportantRecommendations() {
        await this.activateProactiveRecommendations();
        const recommendations = [
            ...this.fileBasedRecommendations.importantRecommendations,
            ...this.configBasedRecommendations.importantRecommendations,
            ...this.exeBasedRecommendations.importantRecommendations,
        ];
        const extensionIds = this.toExtensionIds(recommendations);
        shuffle(extensionIds, this.sessionSeed);
        return extensionIds;
    }
    getKeymapRecommendations() {
        return this.toExtensionIds(this.keymapRecommendations.recommendations);
    }
    getLanguageRecommendations() {
        return this.toExtensionIds(this.languageRecommendations.recommendations);
    }
    getRemoteRecommendations() {
        return this.toExtensionIds(this.remoteRecommendations.recommendations);
    }
    async getWorkspaceRecommendations() {
        if (!this.isEnabled()) {
            return [];
        }
        await this.workspaceRecommendations.activate();
        const result = [];
        for (const { extension } of this.workspaceRecommendations.recommendations) {
            if (isString(extension)) {
                if (!result.includes(extension.toLowerCase()) && this.isExtensionAllowedToBeRecommended(extension)) {
                    result.push(extension.toLowerCase());
                }
            }
            else {
                result.push(extension);
            }
        }
        return result;
    }
    async getExeBasedRecommendations(exe) {
        await this.exeBasedRecommendations.activate();
        const { important, others } = exe ? this.exeBasedRecommendations.getRecommendations(exe)
            : { important: this.exeBasedRecommendations.importantRecommendations, others: this.exeBasedRecommendations.otherRecommendations };
        return { important: this.toExtensionIds(important), others: this.toExtensionIds(others) };
    }
    getFileBasedRecommendations() {
        return this.toExtensionIds(this.fileBasedRecommendations.recommendations);
    }
    onDidInstallExtensions(results) {
        for (const e of results) {
            if (e.source && !URI.isUri(e.source) && e.operation === 2 /* InstallOperation.Install */) {
                const extRecommendations = this.getAllRecommendationsWithReason() || {};
                const recommendationReason = extRecommendations[e.source.identifier.id.toLowerCase()];
                if (recommendationReason) {
                    /* __GDPR__
                        "extensionGallery:install:recommendations" : {
                            "owner": "sandy081",
                            "recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                            "${include}": [
                                "${GalleryExtensionTelemetryData}"
                            ]
                        }
                    */
                    this.telemetryService.publicLog('extensionGallery:install:recommendations', { ...e.source.telemetryData, recommendationReason: recommendationReason.reasonId });
                }
            }
        }
    }
    toExtensionIds(recommendations) {
        const extensionIds = [];
        for (const { extension } of recommendations) {
            if (isString(extension) && this.isExtensionAllowedToBeRecommended(extension) && !extensionIds.includes(extension.toLowerCase())) {
                extensionIds.push(extension.toLowerCase());
            }
        }
        return extensionIds;
    }
    isExtensionAllowedToBeRecommended(extensionId) {
        return !this.extensionRecommendationsManagementService.ignoredRecommendations.includes(extensionId.toLowerCase());
    }
    async promptWorkspaceRecommendations() {
        const installed = await this.extensionsWorkbenchService.queryLocal();
        const allowedRecommendations = [
            ...this.workspaceRecommendations.recommendations,
            ...this.configBasedRecommendations.importantRecommendations.filter(recommendation => !recommendation.whenNotInstalled || recommendation.whenNotInstalled.every(id => installed.every(local => !areSameExtensions(local.identifier, { id }))))
        ]
            .map(({ extension }) => extension)
            .filter(extension => !isString(extension) || this.isExtensionAllowedToBeRecommended(extension));
        if (allowedRecommendations.length) {
            await this._registerP(timeout(5000));
            await this.extensionRecommendationNotificationService.promptWorkspaceRecommendations(allowedRecommendations);
        }
    }
    _registerP(o) {
        this._register(toDisposable(() => o.cancel()));
        return o;
    }
};
ExtensionRecommendationsService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILifecycleService),
    __param(2, IExtensionGalleryService),
    __param(3, ITelemetryService),
    __param(4, IEnvironmentService),
    __param(5, IExtensionManagementService),
    __param(6, IExtensionIgnoredRecommendationsService),
    __param(7, IExtensionRecommendationNotificationService),
    __param(8, IExtensionsWorkbenchService),
    __param(9, IRemoteExtensionsScannerService),
    __param(10, IUserDataInitializationService)
], ExtensionRecommendationsService);
export { ExtensionRecommendationsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLHdCQUF3QixFQUE0QyxNQUFNLHdFQUF3RSxDQUFDO0FBQ3pMLE9BQU8sRUFBbUUsdUNBQXVDLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6TSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQWtCLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbkUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThC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