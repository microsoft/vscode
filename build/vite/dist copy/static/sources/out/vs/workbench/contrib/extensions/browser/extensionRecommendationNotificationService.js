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
import { distinct } from '../../../../base/common/arrays.js';
import { createCancelablePromise, Promises, raceCancellablePromises, raceCancellation, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { RecommendationSourceToString } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
const ignoreImportantExtensionRecommendationStorageKey = 'extensionsAssistant/importantRecommendationsIgnore';
const donotShowWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
class RecommendationsNotification extends Disposable {
    constructor(severity, message, choices, notificationService) {
        super();
        this.severity = severity;
        this.message = message;
        this.choices = choices;
        this.notificationService = notificationService;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this.cancelled = false;
        this.onDidCloseDisposable = this._register(new MutableDisposable());
        this.onDidChangeVisibilityDisposable = this._register(new MutableDisposable());
    }
    show() {
        if (!this.notificationHandle) {
            this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { sticky: true, priority: NotificationPriority.OPTIONAL, onCancel: () => this.cancelled = true }));
        }
    }
    hide() {
        if (this.notificationHandle) {
            this.onDidCloseDisposable.clear();
            this.notificationHandle.close();
            this.cancelled = false;
            this.updateNotificationHandle(this.notificationService.prompt(this.severity, this.message, this.choices, { priority: NotificationPriority.SILENT, onCancel: () => this.cancelled = true }));
        }
    }
    isCancelled() {
        return this.cancelled;
    }
    updateNotificationHandle(notificationHandle) {
        this.onDidCloseDisposable.clear();
        this.onDidChangeVisibilityDisposable.clear();
        this.notificationHandle = notificationHandle;
        this.onDidCloseDisposable.value = this.notificationHandle.onDidClose(() => {
            this.onDidCloseDisposable.dispose();
            this.onDidChangeVisibilityDisposable.dispose();
            this._onDidClose.fire();
            this._onDidClose.dispose();
            this._onDidChangeVisibility.dispose();
        });
        this.onDidChangeVisibilityDisposable.value = this.notificationHandle.onDidChangeVisibility((e) => this._onDidChangeVisibility.fire(e));
    }
}
let ExtensionRecommendationNotificationService = class ExtensionRecommendationNotificationService extends Disposable {
    // Ignored Important Recommendations
    get ignoredRecommendations() {
        return distinct([...JSON.parse(this.storageService.get(ignoreImportantExtensionRecommendationStorageKey, 0 /* StorageScope.PROFILE */, '[]'))].map(i => i.toLowerCase()));
    }
    constructor(configurationService, storageService, notificationService, telemetryService, extensionsWorkbenchService, extensionManagementService, extensionEnablementService, extensionIgnoredRecommendationsService, userDataSyncEnablementService, workbenchEnvironmentService, uriIdentityService) {
        super();
        this.configurationService = configurationService;
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.telemetryService = telemetryService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionManagementService = extensionManagementService;
        this.extensionEnablementService = extensionEnablementService;
        this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.workbenchEnvironmentService = workbenchEnvironmentService;
        this.uriIdentityService = uriIdentityService;
        this.recommendedExtensions = [];
        this.recommendationSources = [];
        this.pendingNotificaitons = [];
    }
    hasToIgnoreRecommendationNotifications() {
        const config = this.configurationService.getValue('extensions');
        return config.ignoreRecommendations || !!config.showRecommendationsOnlyOnDemand;
    }
    async promptImportantExtensionsInstallNotification(extensionRecommendations) {
        const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.ignoredRecommendations];
        const extensions = extensionRecommendations.extensions.filter(id => !ignoredRecommendations.includes(id));
        if (!extensions.length) {
            return "ignored" /* RecommendationsNotificationResult.Ignored */;
        }
        return this.promptRecommendationsNotification({ ...extensionRecommendations, extensions }, {
            onDidInstallRecommendedExtensions: (extensions) => extensions.forEach(extension => this.telemetryService.publicLog2('extensionRecommendations:popup', { userReaction: 'install', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
            onDidShowRecommendedExtensions: (extensions) => extensions.forEach(extension => this.telemetryService.publicLog2('extensionRecommendations:popup', { userReaction: 'show', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
            onDidCancelRecommendedExtensions: (extensions) => extensions.forEach(extension => this.telemetryService.publicLog2('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) })),
            onDidNeverShowRecommendedExtensionsAgain: (extensions) => {
                for (const extension of extensions) {
                    this.addToImportantRecommendationsIgnore(extension.identifier.id);
                    this.telemetryService.publicLog2('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId: extension.identifier.id, source: RecommendationSourceToString(extensionRecommendations.source) });
                }
                this.notificationService.prompt(Severity.Info, localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations?"), [{
                        label: localize('ignoreAll', "Yes, Ignore All"),
                        run: () => this.setIgnoreRecommendationsConfig(true)
                    }, {
                        label: localize('no', "No"),
                        run: () => this.setIgnoreRecommendationsConfig(false)
                    }]);
            },
        });
    }
    async promptWorkspaceRecommendations(recommendations) {
        if (this.storageService.getBoolean(donotShowWorkspaceRecommendationsStorageKey, 1 /* StorageScope.WORKSPACE */, false)) {
            return;
        }
        let installed = await this.extensionManagementService.getInstalled();
        installed = installed.filter(l => this.extensionEnablementService.getEnablementState(l) !== 1 /* EnablementState.DisabledByExtensionKind */); // Filter extensions disabled by kind
        recommendations = recommendations.filter(recommendation => installed.every(local => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.location)));
        if (!recommendations.length) {
            return;
        }
        await this.promptRecommendationsNotification({ extensions: recommendations, source: 2 /* RecommendationSource.WORKSPACE */, name: localize({ key: 'this repository', comment: ['this repository means the current repository that is opened'] }, "this repository") }, {
            onDidInstallRecommendedExtensions: () => this.telemetryService.publicLog2('extensionWorkspaceRecommendations:popup', { userReaction: 'install' }),
            onDidShowRecommendedExtensions: () => this.telemetryService.publicLog2('extensionWorkspaceRecommendations:popup', { userReaction: 'show' }),
            onDidCancelRecommendedExtensions: () => this.telemetryService.publicLog2('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' }),
            onDidNeverShowRecommendedExtensionsAgain: () => {
                this.telemetryService.publicLog2('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
                this.storageService.store(donotShowWorkspaceRecommendationsStorageKey, true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            },
        });
    }
    async promptRecommendationsNotification({ extensions: extensionIds, source, name, searchValue }, recommendationsNotificationActions) {
        if (this.hasToIgnoreRecommendationNotifications()) {
            return "ignored" /* RecommendationsNotificationResult.Ignored */;
        }
        // Do not show exe based recommendations in remote window
        if (source === 3 /* RecommendationSource.EXE */ && this.workbenchEnvironmentService.remoteAuthority) {
            return "incompatibleWindow" /* RecommendationsNotificationResult.IncompatibleWindow */;
        }
        // Ignore exe recommendation if the window
        // 		=> has shown an exe based recommendation already
        // 		=> or has shown any two recommendations already
        if (source === 3 /* RecommendationSource.EXE */ && (this.recommendationSources.includes(3 /* RecommendationSource.EXE */) || this.recommendationSources.length >= 2)) {
            return "toomany" /* RecommendationsNotificationResult.TooMany */;
        }
        this.recommendationSources.push(source);
        // Ignore exe recommendation if recommendations are already shown
        if (source === 3 /* RecommendationSource.EXE */ && extensionIds.every(id => isString(id) && this.recommendedExtensions.includes(id))) {
            return "ignored" /* RecommendationsNotificationResult.Ignored */;
        }
        const extensions = await this.getInstallableExtensions(extensionIds);
        if (!extensions.length) {
            return "ignored" /* RecommendationsNotificationResult.Ignored */;
        }
        this.recommendedExtensions = distinct([...this.recommendedExtensions, ...extensionIds.filter(isString)]);
        let extensionsMessage = '';
        if (extensions.length === 1) {
            extensionsMessage = localize('extensionFromPublisher', "'{0}' extension from {1}", extensions[0].displayName, extensions[0].publisherDisplayName);
        }
        else {
            const publishers = [...extensions.reduce((result, extension) => result.add(extension.publisherDisplayName), new Set())];
            if (publishers.length > 2) {
                extensionsMessage = localize('extensionsFromMultiplePublishers', "extensions from {0}, {1} and others", publishers[0], publishers[1]);
            }
            else if (publishers.length === 2) {
                extensionsMessage = localize('extensionsFromPublishers', "extensions from {0} and {1}", publishers[0], publishers[1]);
            }
            else {
                extensionsMessage = localize('extensionsFromPublisher', "extensions from {0}", publishers[0]);
            }
        }
        let message = localize('recommended', "Do you want to install the recommended {0} for {1}?", extensionsMessage, name);
        if (source === 3 /* RecommendationSource.EXE */) {
            message = localize({ key: 'exeRecommended', comment: ['Placeholder string is the name of the software that is installed.'] }, "You have {0} installed on your system. Do you want to install the recommended {1} for it?", name, extensionsMessage);
        }
        if (!searchValue) {
            searchValue = source === 2 /* RecommendationSource.WORKSPACE */ ? '@recommended' : extensions.map(extensionId => `@id:${extensionId.identifier.id}`).join(' ');
        }
        const donotShowAgainLabel = source === 2 /* RecommendationSource.WORKSPACE */ ? localize('donotShowAgain', "Don't Show Again for this Repository")
            : extensions.length > 1 ? localize('donotShowAgainExtension', "Don't Show Again for these Extensions") : localize('donotShowAgainExtensionSingle', "Don't Show Again for this Extension");
        return raceCancellablePromises([
            this._registerP(this.showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, recommendationsNotificationActions)),
            this._registerP(this.waitUntilRecommendationsAreInstalled(extensions))
        ]);
    }
    showRecommendationsNotification(extensions, message, searchValue, donotShowAgainLabel, source, { onDidInstallRecommendedExtensions, onDidShowRecommendedExtensions, onDidCancelRecommendedExtensions, onDidNeverShowRecommendedExtensionsAgain }) {
        return createCancelablePromise(async (token) => {
            let accepted = false;
            const choices = [];
            const installExtensions = async (isMachineScoped) => {
                this.extensionsWorkbenchService.openSearch(searchValue);
                onDidInstallRecommendedExtensions(extensions);
                const galleryExtensions = [], resourceExtensions = [];
                for (const extension of extensions) {
                    if (extension.gallery) {
                        galleryExtensions.push(extension.gallery);
                    }
                    else if (extension.resourceExtension) {
                        resourceExtensions.push(extension);
                    }
                }
                await Promises.settled([
                    Promises.settled(extensions.map(extension => this.extensionsWorkbenchService.open(extension, { pinned: true }))),
                    galleryExtensions.length ? this.extensionManagementService.installGalleryExtensions(galleryExtensions.map(e => ({ extension: e, options: { isMachineScoped } }))) : Promise.resolve(),
                    resourceExtensions.length ? Promise.allSettled(resourceExtensions.map(r => this.extensionsWorkbenchService.install(r))) : Promise.resolve()
                ]);
            };
            choices.push({
                label: localize('install', "Install"),
                run: () => installExtensions(false),
                menu: this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled("extensions" /* SyncResource.Extensions */) ? [{
                        label: localize('install and do no sync', "Install (Do not sync)"),
                        run: () => installExtensions(true)
                    }] : undefined,
            });
            choices.push(...[{
                    label: localize('show recommendations', "Show Recommendations"),
                    run: async () => {
                        onDidShowRecommendedExtensions(extensions);
                        for (const extension of extensions) {
                            this.extensionsWorkbenchService.open(extension, { pinned: true });
                        }
                        this.extensionsWorkbenchService.openSearch(searchValue);
                    }
                }, {
                    label: donotShowAgainLabel,
                    isSecondary: true,
                    run: () => {
                        onDidNeverShowRecommendedExtensionsAgain(extensions);
                    }
                }]);
            try {
                accepted = await this.doShowRecommendationsNotification(Severity.Info, message, choices, source, token);
            }
            catch (error) {
                if (!isCancellationError(error)) {
                    throw error;
                }
            }
            if (accepted) {
                return "reacted" /* RecommendationsNotificationResult.Accepted */;
            }
            else {
                onDidCancelRecommendedExtensions(extensions);
                return "cancelled" /* RecommendationsNotificationResult.Cancelled */;
            }
        });
    }
    waitUntilRecommendationsAreInstalled(extensions) {
        const installedExtensions = [];
        const disposables = new DisposableStore();
        return createCancelablePromise(async (token) => {
            disposables.add(token.onCancellationRequested(e => disposables.dispose()));
            return new Promise((c, e) => {
                disposables.add(this.extensionManagementService.onInstallExtension(e => {
                    installedExtensions.push(e.identifier.id.toLowerCase());
                    if (extensions.every(e => installedExtensions.includes(e.identifier.id.toLowerCase()))) {
                        c("reacted" /* RecommendationsNotificationResult.Accepted */);
                    }
                }));
            });
        });
    }
    /**
     * Show recommendations in Queue
     * At any time only one recommendation is shown
     * If a new recommendation comes in
     * 		=> If no recommendation is visible, show it immediately
     *		=> Otherwise, add to the pending queue
     * 			=> If it is not exe based and has higher or same priority as current, hide the current notification after showing it for 3s.
     * 			=> Otherwise wait until the current notification is hidden.
     */
    async doShowRecommendationsNotification(severity, message, choices, source, token) {
        const disposables = new DisposableStore();
        try {
            const recommendationsNotification = disposables.add(new RecommendationsNotification(severity, message, choices, this.notificationService));
            disposables.add(Event.once(Event.filter(recommendationsNotification.onDidChangeVisibility, e => !e))(() => this.showNextNotification()));
            if (this.visibleNotification) {
                const index = this.pendingNotificaitons.length;
                disposables.add(token.onCancellationRequested(() => this.pendingNotificaitons.splice(index, 1)));
                this.pendingNotificaitons.push({ recommendationsNotification, source, token });
                if (source !== 3 /* RecommendationSource.EXE */ && source <= this.visibleNotification.source) {
                    this.hideVisibleNotification(3000);
                }
            }
            else {
                this.visibleNotification = { recommendationsNotification, source, from: Date.now() };
                recommendationsNotification.show();
            }
            await raceCancellation(new Promise(c => disposables.add(Event.once(recommendationsNotification.onDidClose)(c))), token);
            return !recommendationsNotification.isCancelled();
        }
        finally {
            disposables.dispose();
        }
    }
    showNextNotification() {
        const index = this.getNextPendingNotificationIndex();
        const [nextNotificaiton] = index > -1 ? this.pendingNotificaitons.splice(index, 1) : [];
        // Show the next notification after a delay of 500ms (after the current notification is dismissed)
        timeout(nextNotificaiton ? 500 : 0)
            .then(() => {
            this.unsetVisibileNotification();
            if (nextNotificaiton) {
                this.visibleNotification = { recommendationsNotification: nextNotificaiton.recommendationsNotification, source: nextNotificaiton.source, from: Date.now() };
                nextNotificaiton.recommendationsNotification.show();
            }
        });
    }
    /**
     * Return the recent high priroity pending notification
     */
    getNextPendingNotificationIndex() {
        let index = this.pendingNotificaitons.length - 1;
        if (this.pendingNotificaitons.length) {
            for (let i = 0; i < this.pendingNotificaitons.length; i++) {
                if (this.pendingNotificaitons[i].source <= this.pendingNotificaitons[index].source) {
                    index = i;
                }
            }
        }
        return index;
    }
    hideVisibleNotification(timeInMillis) {
        if (this.visibleNotification && !this.hideVisibleNotificationPromise) {
            const visibleNotification = this.visibleNotification;
            this.hideVisibleNotificationPromise = timeout(Math.max(timeInMillis - (Date.now() - visibleNotification.from), 0));
            this.hideVisibleNotificationPromise.then(() => visibleNotification.recommendationsNotification.hide());
        }
    }
    unsetVisibileNotification() {
        this.hideVisibleNotificationPromise?.cancel();
        this.hideVisibleNotificationPromise = undefined;
        this.visibleNotification = undefined;
    }
    async getInstallableExtensions(recommendations) {
        const result = [];
        if (recommendations.length) {
            const galleryExtensions = [];
            const resourceExtensions = [];
            for (const recommendation of recommendations) {
                if (typeof recommendation === 'string') {
                    galleryExtensions.push(recommendation);
                }
                else {
                    resourceExtensions.push(recommendation);
                }
            }
            if (galleryExtensions.length) {
                const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map(id => ({ id })), { source: 'install-recommendations' }, CancellationToken.None);
                for (const extension of extensions) {
                    if (extension.gallery && await this.extensionManagementService.canInstall(extension.gallery) === true) {
                        result.push(extension);
                    }
                }
            }
            if (resourceExtensions.length) {
                const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
                for (const extension of extensions) {
                    if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
                        result.push(extension);
                    }
                }
            }
        }
        return result;
    }
    addToImportantRecommendationsIgnore(id) {
        const importantRecommendationsIgnoreList = [...this.ignoredRecommendations];
        if (!importantRecommendationsIgnoreList.includes(id.toLowerCase())) {
            importantRecommendationsIgnoreList.push(id.toLowerCase());
            this.storageService.store(ignoreImportantExtensionRecommendationStorageKey, JSON.stringify(importantRecommendationsIgnoreList), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
    setIgnoreRecommendationsConfig(configVal) {
        this.configurationService.updateValue('extensions.ignoreRecommendations', configVal);
    }
    _registerP(o) {
        this._register(toDisposable(() => o.cancel()));
        return o;
    }
};
ExtensionRecommendationNotificationService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IStorageService),
    __param(2, INotificationService),
    __param(3, ITelemetryService),
    __param(4, IExtensionsWorkbenchService),
    __param(5, IWorkbenchExtensionManagementService),
    __param(6, IWorkbenchExtensionEnablementService),
    __param(7, IExtensionIgnoredRecommendationsService),
    __param(8, IUserDataSyncEnablementService),
    __param(9, IWorkbenchEnvironmentService),
    __param(10, IUriIdentityService)
], ExtensionRecommendationNotificationService);
export { ExtensionRecommendationNotificationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxRQUFRLEVBQUUsdUJBQXVCLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQy9HLE9BQU8sRUFBbUksNEJBQTRCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUNqUSxPQUFPLEVBQXVCLG9CQUFvQixFQUF3QyxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSww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