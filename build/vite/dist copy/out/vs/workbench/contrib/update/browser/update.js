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
var ProductContribution_1, DefaultAccountUpdateContribution_1;
import * as nls from '../../../../nls.js';
import severity from '../../../../base/common/severity.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IActivityService, NumberBadge, ProgressBadge } from '../../../services/activity/common/activity.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ReleaseNotesManager } from './releaseNotesEditor.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuRegistry, MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { Promises, Throttler } from '../../../../base/common/async.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';
import { Event } from '../../../../base/common/event.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { getInternalOrg } from '../../../../platform/assignment/common/assignment.js';
import { tryParseVersion } from '../common/updateUtils.js';
export const CONTEXT_UPDATE_STATE = new RawContextKey('updateState', "uninitialized" /* StateType.Uninitialized */);
export const MAJOR_MINOR_UPDATE_AVAILABLE = new RawContextKey('majorMinorUpdateAvailable', false);
let releaseNotesManager = undefined;
export function showReleaseNotesInEditor(instantiationService, version, useCurrentFile) {
    if (!releaseNotesManager) {
        releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
    }
    return releaseNotesManager.show(version, useCurrentFile);
}
async function openLatestReleaseNotesInBrowser(accessor) {
    const openerService = accessor.get(IOpenerService);
    const productService = accessor.get(IProductService);
    if (productService.releaseNotesUrl) {
        const uri = URI.parse(productService.releaseNotesUrl);
        await openerService.open(uri);
    }
    else {
        throw new Error(nls.localize('update.noReleaseNotesOnline', "This version of {0} does not have release notes online", productService.nameLong));
    }
}
async function showReleaseNotes(accessor, version) {
    const instantiationService = accessor.get(IInstantiationService);
    try {
        await showReleaseNotesInEditor(instantiationService, version, false);
    }
    catch (err) {
        try {
            await instantiationService.invokeFunction(openLatestReleaseNotesInBrowser);
        }
        catch (err2) {
            throw new Error(`${err.message} and ${err2.message}`);
        }
    }
}
/**
 * Appends update-related menu items to the given menu. This registers menu items
 * for all update states (idle, checking, downloading, etc.) that show the current
 * update status. The underlying commands (`update.check`, `update.restart`, etc.)
 * must be registered separately.
 */
export function appendUpdateMenuItems(menuId, group) {
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.check',
            title: nls.localize('checkForUpdates', "Check for Updates...")
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("idle" /* StateType.Idle */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.checking',
            title: nls.localize('checkingForUpdates2', "Checking for Updates..."),
            precondition: ContextKeyExpr.false()
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("checking for updates" /* StateType.CheckingForUpdates */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.downloadNow',
            title: nls.localize('download update_1', "Download Update (1)")
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("available for download" /* StateType.AvailableForDownload */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.downloading',
            title: nls.localize('DownloadingUpdate', "Downloading Update..."),
            precondition: ContextKeyExpr.false()
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("downloading" /* StateType.Downloading */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.install',
            title: nls.localize('installUpdate...', "Install Update... (1)")
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("downloaded" /* StateType.Downloaded */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        command: {
            id: 'update.updating',
            title: nls.localize('installingUpdate', "Installing Update..."),
            precondition: ContextKeyExpr.false()
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("updating" /* StateType.Updating */)
    });
    MenuRegistry.appendMenuItem(menuId, {
        group,
        order: 2,
        command: {
            id: 'update.restart',
            title: nls.localize('restartToUpdate', "Restart to Update (1)")
        },
        when: CONTEXT_UPDATE_STATE.isEqualTo("ready" /* StateType.Ready */)
    });
}
function isMajorMinorUpdate(before, after) {
    return before.major < after.major || before.minor < after.minor;
}
let ProductContribution = class ProductContribution {
    static { ProductContribution_1 = this; }
    static { this.KEY = 'releaseNotes/lastVersion'; }
    constructor(storageService, instantiationService, notificationService, environmentService, openerService, configurationService, hostService, productService) {
        if (isWeb) {
            return;
        }
        hostService.hadLastFocus().then(async (hadLastFocus) => {
            if (!hadLastFocus) {
                return;
            }
            const lastVersion = tryParseVersion(storageService.get(ProductContribution_1.KEY, -1 /* StorageScope.APPLICATION */, ''));
            const currentVersion = tryParseVersion(productService.version);
            const shouldShowReleaseNotes = configurationService.getValue('update.showReleaseNotes');
            const releaseNotesUrl = productService.releaseNotesUrl;
            // was there a major/minor update? if so, open release notes
            if (shouldShowReleaseNotes && !environmentService.skipReleaseNotes && releaseNotesUrl && lastVersion && currentVersion && isMajorMinorUpdate(lastVersion, currentVersion)) {
                showReleaseNotesInEditor(instantiationService, productService.version, false)
                    .then(undefined, () => {
                    notificationService.prompt(severity.Info, nls.localize('read the release notes', "Welcome to {0} v{1}! Would you like to read the Release Notes?", productService.nameLong, productService.version), [{
                            label: nls.localize('releaseNotes', "Release Notes"),
                            run: () => {
                                const uri = URI.parse(releaseNotesUrl);
                                openerService.open(uri);
                            }
                        }], { priority: NotificationPriority.OPTIONAL });
                });
            }
            storageService.store(ProductContribution_1.KEY, productService.version, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        });
    }
};
ProductContribution = ProductContribution_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IInstantiationService),
    __param(2, INotificationService),
    __param(3, IBrowserWorkbenchEnvironmentService),
    __param(4, IOpenerService),
    __param(5, IConfigurationService),
    __param(6, IHostService),
    __param(7, IProductService)
], ProductContribution);
export { ProductContribution };
let UpdateContribution = class UpdateContribution extends Disposable {
    constructor(storageService, instantiationService, dialogService, updateService, activityService, contextKeyService, productService, hostService) {
        super();
        this.instantiationService = instantiationService;
        this.dialogService = dialogService;
        this.updateService = updateService;
        this.activityService = activityService;
        this.productService = productService;
        this.hostService = hostService;
        this.badgeDisposable = this._register(new MutableDisposable());
        this.state = updateService.state;
        this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(contextKeyService);
        this.majorMinorUpdateAvailableContextKey = MAJOR_MINOR_UPDATE_AVAILABLE.bindTo(contextKeyService);
        this._register(updateService.onStateChange(this.onUpdateStateChange, this));
        this.onUpdateStateChange(this.updateService.state);
        /*
        The `update/lastKnownVersion` and `update/updateNotificationTime` storage keys are used in
        combination to figure out when to show a message to the user that he should update.

        This message should appear if the user has received an update notification but hasn't
        updated since 5 days.
        */
        const currentVersion = this.productService.commit;
        const lastKnownVersion = storageService.get('update/lastKnownVersion', -1 /* StorageScope.APPLICATION */);
        // if current version != stored version, clear both fields
        if (currentVersion !== lastKnownVersion) {
            storageService.remove('update/lastKnownVersion', -1 /* StorageScope.APPLICATION */);
            storageService.remove('update/updateNotificationTime', -1 /* StorageScope.APPLICATION */);
        }
        this.registerGlobalActivityActions();
    }
    async onUpdateStateChange(state) {
        this.updateStateContextKey.set(state.type);
        switch (state.type) {
            case "idle" /* StateType.Idle */:
                if (this.state.type === "checking for updates" /* StateType.CheckingForUpdates */ && this.state.explicit && !state.error && await this.hostService.hadLastFocus()) {
                    this.onUpdateNotAvailable();
                }
                break;
            case "ready" /* StateType.Ready */: {
                const productVersion = state.update.productVersion;
                if (productVersion) {
                    const currentVersion = tryParseVersion(this.productService.version);
                    const nextVersion = tryParseVersion(productVersion);
                    this.majorMinorUpdateAvailableContextKey.set(Boolean(currentVersion && nextVersion && isMajorMinorUpdate(currentVersion, nextVersion)));
                }
                break;
            }
        }
        let badge = undefined;
        if (state.type === "available for download" /* StateType.AvailableForDownload */ || state.type === "downloaded" /* StateType.Downloaded */ || state.type === "ready" /* StateType.Ready */) {
            badge = new NumberBadge(1, () => nls.localize('updateIsReady', "New {0} update available.", this.productService.nameShort));
        }
        else if (state.type === "checking for updates" /* StateType.CheckingForUpdates */) {
            badge = new ProgressBadge(() => nls.localize('checkingForUpdates', "Checking for {0} updates...", this.productService.nameShort));
        }
        else if (state.type === "downloading" /* StateType.Downloading */ || state.type === "overwriting" /* StateType.Overwriting */) {
            badge = new ProgressBadge(() => nls.localize('downloading', "Downloading {0} update...", this.productService.nameShort));
        }
        else if (state.type === "updating" /* StateType.Updating */) {
            badge = new ProgressBadge(() => nls.localize('updating', "Updating {0}...", this.productService.nameShort));
        }
        this.badgeDisposable.clear();
        if (badge) {
            this.badgeDisposable.value = this.activityService.showGlobalActivity({ badge });
        }
        this.state = state;
    }
    onUpdateNotAvailable() {
        this.dialogService.info(nls.localize('noUpdatesAvailable', "There are currently no updates available."));
    }
    registerGlobalActivityActions() {
        CommandsRegistry.registerCommand('update.check', () => this.updateService.checkForUpdates(true));
        CommandsRegistry.registerCommand('update.checking', () => { });
        CommandsRegistry.registerCommand('update.downloadNow', () => this.updateService.downloadUpdate(true));
        CommandsRegistry.registerCommand('update.downloading', () => { });
        CommandsRegistry.registerCommand('update.install', () => this.updateService.applyUpdate());
        CommandsRegistry.registerCommand('update.updating', () => { });
        CommandsRegistry.registerCommand('update.restart', () => this.updateService.quitAndInstall());
        CommandsRegistry.registerCommand('_update.state', () => {
            return this.state;
        });
        appendUpdateMenuItems(MenuId.GlobalActivity, '7_update');
        if (this.productService.quality === 'stable') {
            CommandsRegistry.registerCommand('update.showUpdateReleaseNotes', () => {
                if (this.updateService.state.type !== "ready" /* StateType.Ready */) {
                    return;
                }
                const productVersion = this.updateService.state.update.productVersion;
                if (productVersion) {
                    this.instantiationService.invokeFunction(accessor => showReleaseNotes(accessor, productVersion));
                }
            });
            MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
                group: '7_update',
                order: 1,
                command: {
                    id: 'update.showUpdateReleaseNotes',
                    title: nls.localize('showUpdateReleaseNotes', "Show Update Release Notes")
                },
                when: ContextKeyExpr.and(CONTEXT_UPDATE_STATE.isEqualTo("ready" /* StateType.Ready */), MAJOR_MINOR_UPDATE_AVAILABLE)
            });
        }
    }
};
UpdateContribution = __decorate([
    __param(0, IStorageService),
    __param(1, IInstantiationService),
    __param(2, IDialogService),
    __param(3, IUpdateService),
    __param(4, IActivityService),
    __param(5, IContextKeyService),
    __param(6, IProductService),
    __param(7, IHostService)
], UpdateContribution);
export { UpdateContribution };
let SwitchProductQualityContribution = class SwitchProductQualityContribution extends Disposable {
    constructor(productService, environmentService) {
        super();
        this.productService = productService;
        this.environmentService = environmentService;
        this.registerGlobalActivityActions();
    }
    registerGlobalActivityActions() {
        const quality = this.productService.quality;
        const productQualityChangeHandler = this.environmentService.options?.productQualityChangeHandler;
        if (productQualityChangeHandler && (quality === 'stable' || quality === 'insider')) {
            const newQuality = quality === 'stable' ? 'insider' : 'stable';
            const commandId = `update.switchQuality.${newQuality}`;
            const isSwitchingToInsiders = newQuality === 'insider';
            this._register(registerAction2(class SwitchQuality extends Action2 {
                constructor() {
                    super({
                        id: commandId,
                        title: isSwitchingToInsiders ? nls.localize('switchToInsiders', "Switch to Insiders Version...") : nls.localize('switchToStable', "Switch to Stable Version..."),
                        precondition: IsWebContext,
                        menu: {
                            id: MenuId.GlobalActivity,
                            when: IsWebContext,
                            group: '7_update',
                        }
                    });
                }
                async run(accessor) {
                    const dialogService = accessor.get(IDialogService);
                    const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
                    const userDataSyncStoreManagementService = accessor.get(IUserDataSyncStoreManagementService);
                    const storageService = accessor.get(IStorageService);
                    const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
                    const userDataSyncService = accessor.get(IUserDataSyncService);
                    const notificationService = accessor.get(INotificationService);
                    try {
                        const selectSettingsSyncServiceDialogShownKey = 'switchQuality.selectSettingsSyncServiceDialogShown';
                        const userDataSyncStore = userDataSyncStoreManagementService.userDataSyncStore;
                        let userDataSyncStoreType;
                        if (userDataSyncStore && isSwitchingToInsiders && userDataSyncEnablementService.isEnabled()
                            && !storageService.getBoolean(selectSettingsSyncServiceDialogShownKey, -1 /* StorageScope.APPLICATION */, false)) {
                            userDataSyncStoreType = await this.selectSettingsSyncService(dialogService);
                            if (!userDataSyncStoreType) {
                                return;
                            }
                            storageService.store(selectSettingsSyncServiceDialogShownKey, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                            if (userDataSyncStoreType === 'stable') {
                                // Update the stable service type in the current window, so that it uses stable service after switched to insiders version (after reload).
                                await userDataSyncStoreManagementService.switch(userDataSyncStoreType);
                            }
                        }
                        const res = await dialogService.confirm({
                            type: 'info',
                            message: nls.localize('relaunchMessage', "Changing the version requires a reload to take effect"),
                            detail: newQuality === 'insider' ?
                                nls.localize('relaunchDetailInsiders', "Press the reload button to switch to the Insiders version of VS Code.") :
                                nls.localize('relaunchDetailStable', "Press the reload button to switch to the Stable version of VS Code."),
                            primaryButton: nls.localize({ key: 'reload', comment: ['&& denotes a mnemonic'] }, "&&Reload")
                        });
                        if (res.confirmed) {
                            const promises = [];
                            // If sync is happening wait until it is finished before reload
                            if (userDataSyncService.status === "syncing" /* SyncStatus.Syncing */) {
                                promises.push(Event.toPromise(Event.filter(userDataSyncService.onDidChangeStatus, status => status !== "syncing" /* SyncStatus.Syncing */)));
                            }
                            // If user chose the sync service then synchronise the store type option in insiders service, so that other clients using insiders service are also updated.
                            if (isSwitchingToInsiders && userDataSyncStoreType) {
                                promises.push(userDataSyncWorkbenchService.synchroniseUserDataSyncStoreType());
                            }
                            await Promises.settled(promises);
                            productQualityChangeHandler(newQuality);
                        }
                        else {
                            // Reset
                            if (userDataSyncStoreType) {
                                storageService.remove(selectSettingsSyncServiceDialogShownKey, -1 /* StorageScope.APPLICATION */);
                            }
                        }
                    }
                    catch (error) {
                        notificationService.error(error);
                    }
                }
                async selectSettingsSyncService(dialogService) {
                    const { result } = await dialogService.prompt({
                        type: Severity.Info,
                        message: nls.localize('selectSyncService.message', "Choose the settings sync service to use after changing the version"),
                        detail: nls.localize('selectSyncService.detail', "The Insiders version of VS Code will synchronize your settings, keybindings, extensions, snippets and UI State using separate insiders settings sync service by default."),
                        buttons: [
                            {
                                label: nls.localize({ key: 'use insiders', comment: ['&& denotes a mnemonic'] }, "&&Insiders"),
                                run: () => 'insiders'
                            },
                            {
                                label: nls.localize({ key: 'use stable', comment: ['&& denotes a mnemonic'] }, "&&Stable (current)"),
                                run: () => 'stable'
                            }
                        ],
                        cancelButton: true
                    });
                    return result;
                }
            }));
        }
    }
};
SwitchProductQualityContribution = __decorate([
    __param(0, IProductService),
    __param(1, IBrowserWorkbenchEnvironmentService)
], SwitchProductQualityContribution);
export { SwitchProductQualityContribution };
let DefaultAccountUpdateContribution = class DefaultAccountUpdateContribution extends Disposable {
    static { DefaultAccountUpdateContribution_1 = this; }
    static { this.STORAGE_KEY = 'update/internalOrg'; }
    #internalOrg;
    constructor(updateService, defaultAccountService, storageService) {
        super();
        this.updateService = updateService;
        this.defaultAccountService = defaultAccountService;
        this.storageService = storageService;
        this.#internalOrg = undefined;
        this.throttler = this._register(new Throttler());
        if (isWeb) {
            return; // Electron only
        }
        this.#internalOrg = this.storageService.get(DefaultAccountUpdateContribution_1.STORAGE_KEY, -1 /* StorageScope.APPLICATION */, undefined);
        this.throttler.queue(() => this.updateService.setInternalOrg(this.#internalOrg));
        // Check on startup
        this.refresh();
        // Listen for account changes
        this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refresh()));
    }
    refresh() {
        this.throttler.queue(() => this.doRefresh());
    }
    async doRefresh() {
        try {
            const defaultAccount = await this.defaultAccountService.getDefaultAccount();
            const internalOrg = getInternalOrg(defaultAccount?.entitlementsData?.organization_login_list);
            if (internalOrg === this.#internalOrg) {
                return;
            }
            this.#internalOrg = internalOrg;
            await this.updateService.setInternalOrg(this.#internalOrg);
            if (this.#internalOrg) {
                this.storageService.store(DefaultAccountUpdateContribution_1.STORAGE_KEY, internalOrg, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
            else {
                this.storageService.remove(DefaultAccountUpdateContribution_1.STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            }
        }
        catch (error) {
            // Silently ignore errors - if we can't get the account, we don't disable background updates
        }
    }
};
DefaultAccountUpdateContribution = DefaultAccountUpdateContribution_1 = __decorate([
    __param(0, IUpdateService),
    __param(1, IDefaultAccountService),
    __param(2, IStorageService)
], DefaultAccountUpdateContribution);
export { DefaultAccountUpdateContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXBkYXRlL2Jyb3dzZXIvdXBkYXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBVSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNySCxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGNBQWMsRUFBbUMsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxP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