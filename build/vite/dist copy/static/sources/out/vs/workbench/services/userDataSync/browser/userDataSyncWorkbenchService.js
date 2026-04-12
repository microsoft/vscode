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
var UserDataSyncWorkbenchService_1;
import { IUserDataSyncService, isAuthenticationProvider, IUserDataAutoSyncService, IUserDataSyncStoreManagementService, IUserDataSyncEnablementService, USER_DATA_SYNC_SCHEME, USER_DATA_SYNC_LOG_ID, } from '../../../../platform/userDataSync/common/userDataSync.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncWorkbenchService, CONTEXT_SYNC_ENABLEMENT, CONTEXT_SYNC_STATE, CONTEXT_ACCOUNT_STATE, SHOW_SYNC_LOG_COMMAND_ID, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS, getSyncAreaLabel } from '../common/userDataSync.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { getCurrentAuthenticationSessionInfo } from '../../authentication/browser/authenticationService.js';
import { IAuthenticationService } from '../../authentication/common/authentication.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { URI } from '../../../../base/common/uri.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../views/common/viewsService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { UserDataSyncStoreClient } from '../../../../platform/userDataSync/common/userDataSyncStoreService.js';
import { UserDataSyncStoreTypeSynchronizer } from '../../../../platform/userDataSync/common/globalStateSync.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isDiffEditorInput } from '../../../common/editor.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { IUserDataSyncMachinesService } from '../../../../platform/userDataSync/common/userDataSyncMachines.js';
import { equals } from '../../../../base/common/arrays.js';
import { env } from '../../../../base/common/process.js';
class UserDataSyncAccount {
    constructor(authenticationProviderId, session) {
        this.authenticationProviderId = authenticationProviderId;
        this.session = session;
    }
    get sessionId() { return this.session.id; }
    get accountName() { return this.session.account.label; }
    get accountId() { return this.session.account.id; }
    get token() { return this.session.idToken || this.session.accessToken; }
}
export function isMergeEditorInput(editor) {
    const candidate = editor;
    return URI.isUri(candidate?.base) && URI.isUri(candidate?.input1?.uri) && URI.isUri(candidate?.input2?.uri) && URI.isUri(candidate?.result);
}
let UserDataSyncWorkbenchService = class UserDataSyncWorkbenchService extends Disposable {
    static { UserDataSyncWorkbenchService_1 = this; }
    static { this.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY = 'userDataSyncAccount.donotUseWorkbenchSession'; }
    static { this.CACHED_AUTHENTICATION_PROVIDER_KEY = 'userDataSyncAccountProvider'; }
    static { this.CACHED_SESSION_STORAGE_KEY = 'userDataSyncAccountPreference'; }
    get enabled() { return !!this.userDataSyncStoreManagementService.userDataSyncStore; }
    get authenticationProviders() { return this._authenticationProviders; }
    get accountStatus() { return this._accountStatus; }
    get current() { return this._current; }
    constructor(userDataSyncService, uriIdentityService, authenticationService, userDataSyncAccountService, quickInputService, storageService, userDataSyncEnablementService, userDataAutoSyncService, logService, productService, extensionService, environmentService, secretStorageService, notificationService, progressService, dialogService, contextKeyService, viewsService, viewDescriptorService, userDataSyncStoreManagementService, lifecycleService, instantiationService, editorService, userDataInitializationService, fileService, fileDialogService, userDataSyncMachinesService) {
        super();
        this.userDataSyncService = userDataSyncService;
        this.uriIdentityService = uriIdentityService;
        this.authenticationService = authenticationService;
        this.userDataSyncAccountService = userDataSyncAccountService;
        this.quickInputService = quickInputService;
        this.storageService = storageService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataAutoSyncService = userDataAutoSyncService;
        this.logService = logService;
        this.productService = productService;
        this.extensionService = extensionService;
        this.environmentService = environmentService;
        this.secretStorageService = secretStorageService;
        this.notificationService = notificationService;
        this.progressService = progressService;
        this.dialogService = dialogService;
        this.viewsService = viewsService;
        this.viewDescriptorService = viewDescriptorService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.lifecycleService = lifecycleService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.userDataInitializationService = userDataInitializationService;
        this.fileService = fileService;
        this.fileDialogService = fileDialogService;
        this.userDataSyncMachinesService = userDataSyncMachinesService;
        this._authenticationProviders = [];
        this._accountStatus = "uninitialized" /* AccountStatus.Uninitialized */;
        this._onDidChangeAccountStatus = this._register(new Emitter());
        this.onDidChangeAccountStatus = this._onDidChangeAccountStatus.event;
        this._onDidTurnOnSync = this._register(new Emitter());
        this.onDidTurnOnSync = this._onDidTurnOnSync.event;
        this.turnOnSyncCancellationToken = undefined;
        this._cachedCurrentAuthenticationProviderId = null;
        this._cachedCurrentSessionId = null;
        this.syncEnablementContext = CONTEXT_SYNC_ENABLEMENT.bindTo(contextKeyService);
        this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
        this.accountStatusContext = CONTEXT_ACCOUNT_STATE.bindTo(contextKeyService);
        this.activityViewsEnablementContext = CONTEXT_ENABLE_ACTIVITY_VIEWS.bindTo(contextKeyService);
        this.hasConflicts = CONTEXT_HAS_CONFLICTS.bindTo(contextKeyService);
        this.enableConflictsViewContext = CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW.bindTo(contextKeyService);
        if (this.userDataSyncStoreManagementService.userDataSyncStore) {
            this.syncStatusContext.set(this.userDataSyncService.status);
            this._register(userDataSyncService.onDidChangeStatus(status => this.syncStatusContext.set(status)));
            this.syncEnablementContext.set(userDataSyncEnablementService.isEnabled());
            this._register(userDataSyncEnablementService.onDidChangeEnablement(enabled => this.syncEnablementContext.set(enabled)));
            this.waitAndInitialize();
        }
    }
    updateAuthenticationProviders() {
        const oldValue = this._authenticationProviders;
        this._authenticationProviders = (this.userDataSyncStoreManagementService.userDataSyncStore?.authenticationProviders || []).filter(({ id }) => this.authenticationService.declaredProviders.some(provider => provider.id === id));
        this.logService.trace('Settings Sync: Authentication providers updated', this._authenticationProviders.map(({ id }) => id));
        return equals(oldValue, this._authenticationProviders, (a, b) => a.id === b.id);
    }
    isSupportedAuthenticationProviderId(authenticationProviderId) {
        return this.authenticationProviders.some(({ id }) => id === authenticationProviderId);
    }
    async waitAndInitialize() {
        try {
            /* wait */
            await Promise.all([this.extensionService.whenInstalledExtensionsRegistered(), this.userDataInitializationService.whenInitializationFinished()]);
            /* initialize */
            await this.initialize();
        }
        catch (error) {
            // Do not log if the current window is running extension tests
            if (!this.environmentService.extensionTestsLocationURI) {
                this.logService.error(error);
            }
        }
    }
    async initialize() {
        if (isWeb) {
            const authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
            if (this.currentSessionId === undefined && authenticationSession?.id) {
                if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && this.environmentService.options.settingsSyncOptions.enabled) {
                    this.currentSessionId = authenticationSession.id;
                }
                // Backward compatibility
                else if (this.useWorkbenchSessionId) {
                    this.currentSessionId = authenticationSession.id;
                }
                this.useWorkbenchSessionId = false;
            }
        }
        const initPromise = this.update('initialize');
        this._register(this.authenticationService.onDidChangeDeclaredProviders(() => {
            if (this.updateAuthenticationProviders()) {
                // Trigger update only after the initialization is done
                initPromise.finally(() => this.update('declared authentication providers changed'));
            }
        }));
        await initPromise;
        this._register(Event.filter(Event.any(this.authenticationService.onDidRegisterAuthenticationProvider, this.authenticationService.onDidUnregisterAuthenticationProvider), info => this.isSupportedAuthenticationProviderId(info.id))(() => this.update('authentication provider change')));
        this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, isSuccessive => !isSuccessive)(() => this.update('token failure')));
        this._register(Event.filter(this.authenticationService.onDidChangeSessions, e => this.isSupportedAuthenticationProviderId(e.providerId))(({ event }) => this.onDidChangeSessions(event)));
        this._register(this.storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, UserDataSyncWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
        this._register(Event.filter(this.userDataSyncAccountService.onTokenFailed, bailout => bailout)(() => this.onDidAuthFailure()));
        this.hasConflicts.set(this.userDataSyncService.conflicts.length > 0);
        this._register(this.userDataSyncService.onDidChangeConflicts(conflicts => {
            this.hasConflicts.set(conflicts.length > 0);
            if (!conflicts.length) {
                this.enableConflictsViewContext.reset();
            }
            // Close merge editors with no conflicts
            this.editorService.editors.filter(input => {
                const remoteResource = isDiffEditorInput(input) ? input.original.resource : isMergeEditorInput(input) ? input.input1.uri : undefined;
                if (remoteResource?.scheme !== USER_DATA_SYNC_SCHEME) {
                    return false;
                }
                return !this.userDataSyncService.conflicts.some(({ conflicts }) => conflicts.some(({ previewResource }) => this.uriIdentityService.extUri.isEqual(previewResource, input.resource)));
            }).forEach(input => input.dispose());
        }));
    }
    async update(reason) {
        this.logService.trace(`Settings Sync: Updating due to ${reason}`);
        this.updateAuthenticationProviders();
        await this.updateCurrentAccount();
        if (this._current) {
            this.currentAuthenticationProviderId = this._current.authenticationProviderId;
        }
        await this.updateToken(this._current);
        this.updateAccountStatus(this._current ? "available" /* AccountStatus.Available */ : "unavailable" /* AccountStatus.Unavailable */);
    }
    async updateCurrentAccount() {
        this.logService.trace('Settings Sync: Updating the current account');
        const currentSessionId = this.currentSessionId;
        const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
        if (currentSessionId) {
            const authenticationProviders = currentAuthenticationProviderId ? this.authenticationProviders.filter(({ id }) => id === currentAuthenticationProviderId) : this.authenticationProviders;
            for (const { id, scopes } of authenticationProviders) {
                const sessions = (await this.authenticationService.getSessions(id, scopes)) || [];
                for (const session of sessions) {
                    if (session.id === currentSessionId) {
                        this._current = new UserDataSyncAccount(id, session);
                        this.logService.trace('Settings Sync: Updated the current account', this._current.accountName);
                        return;
                    }
                }
            }
        }
        this._current = undefined;
    }
    async updateToken(current) {
        let value = undefined;
        if (current) {
            try {
                const token = current.token;
                value = { token, authenticationProviderId: current.authenticationProviderId };
            }
            catch (e) {
                this.logService.error(e);
            }
        }
        await this.userDataSyncAccountService.updateAccount(value);
    }
    updateAccountStatus(accountStatus) {
        this.logService.trace(`Settings Sync: Updating the account status to ${accountStatus}`);
        if (this._accountStatus !== accountStatus) {
            const previous = this._accountStatus;
            const logMsg = `Settings Sync: Account status changed from ${previous} to ${accountStatus}`;
            if (env.VSCODE_DEV) {
                this.logService.trace(logMsg);
            }
            else {
                this.logService.info(logMsg);
            }
            this._accountStatus = accountStatus;
            this.accountStatusContext.set(accountStatus);
            this._onDidChangeAccountStatus.fire(accountStatus);
        }
    }
    async turnOn() {
        if (!this.authenticationProviders.length) {
            throw new Error(localize('no authentication providers', "Settings sync cannot be turned on because there are no authentication providers available."));
        }
        if (this.userDataSyncEnablementService.isEnabled()) {
            return;
        }
        if (this.userDataSyncService.status !== "idle" /* SyncStatus.Idle */) {
            throw new Error('Cannot turn on sync while syncing');
        }
        const picked = await this.pick();
        if (!picked) {
            throw new CancellationError();
        }
        // User did not pick an account or login failed
        if (this.accountStatus !== "available" /* AccountStatus.Available */) {
            throw new Error(localize('no account', "No account available"));
        }
        const turnOnSyncCancellationToken = this.turnOnSyncCancellationToken = new CancellationTokenSource();
        const disposable = isWeb ? Disposable.None : this.lifecycleService.onBeforeShutdown(e => e.veto((async () => {
            const { confirmed } = await this.dialogService.confirm({
                type: 'warning',
                message: localize('sync in progress', "Settings Sync is being turned on. Would you like to cancel it?"),
                title: localize('settings sync', "Settings Sync"),
                primaryButton: localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
                cancelButton: localize('no', "No")
            });
            if (confirmed) {
                turnOnSyncCancellationToken.cancel();
            }
            return !confirmed;
        })(), 'veto.settingsSync'));
        try {
            await this.doTurnOnSync(turnOnSyncCancellationToken.token);
        }
        finally {
            disposable.dispose();
            this.turnOnSyncCancellationToken = undefined;
        }
        await this.userDataAutoSyncService.turnOn();
        if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
            await this.synchroniseUserDataSyncStoreType();
        }
        this.currentAuthenticationProviderId = this.current?.authenticationProviderId;
        if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
            this.environmentService.options.settingsSyncOptions.enablementHandler(true, this.currentAuthenticationProviderId);
        }
        this.notificationService.info(localize('sync turned on', "{0} is turned on", SYNC_TITLE.value));
        this._onDidTurnOnSync.fire();
    }
    async turnoff(everywhere) {
        if (this.userDataSyncEnablementService.isEnabled()) {
            await this.userDataAutoSyncService.turnOff(everywhere);
            if (this.environmentService.options?.settingsSyncOptions?.enablementHandler && this.currentAuthenticationProviderId) {
                this.environmentService.options.settingsSyncOptions.enablementHandler(false, this.currentAuthenticationProviderId);
            }
        }
        if (this.turnOnSyncCancellationToken) {
            this.turnOnSyncCancellationToken.cancel();
        }
    }
    async synchroniseUserDataSyncStoreType() {
        if (!this.userDataSyncAccountService.account) {
            throw new Error('Cannot update because you are signed out from settings sync. Please sign in and try again.');
        }
        if (!isWeb || !this.userDataSyncStoreManagementService.userDataSyncStore) {
            // Not supported
            return;
        }
        const userDataSyncStoreUrl = this.userDataSyncStoreManagementService.userDataSyncStore.type === 'insiders' ? this.userDataSyncStoreManagementService.userDataSyncStore.stableUrl : this.userDataSyncStoreManagementService.userDataSyncStore.insidersUrl;
        const userDataSyncStoreClient = this.instantiationService.createInstance(UserDataSyncStoreClient, userDataSyncStoreUrl);
        userDataSyncStoreClient.setAuthToken(this.userDataSyncAccountService.account.token, this.userDataSyncAccountService.account.authenticationProviderId);
        await this.instantiationService.createInstance(UserDataSyncStoreTypeSynchronizer, userDataSyncStoreClient).sync(this.userDataSyncStoreManagementService.userDataSyncStore.type);
    }
    syncNow() {
        return this.userDataAutoSyncService.triggerSync(['Sync Now'], { immediately: true, disableCache: true });
    }
    async doTurnOnSync(token) {
        const disposables = new DisposableStore();
        const manualSyncTask = await this.userDataSyncService.createManualSyncTask();
        try {
            await this.progressService.withProgress({
                location: 10 /* ProgressLocation.Window */,
                title: SYNC_TITLE.value,
                command: SHOW_SYNC_LOG_COMMAND_ID,
                delay: 500,
            }, async (progress) => {
                progress.report({ message: localize('turning on', "Turning on...") });
                disposables.add(this.userDataSyncService.onDidChangeStatus(status => {
                    if (status === "hasConflicts" /* SyncStatus.HasConflicts */) {
                        progress.report({ message: localize('resolving conflicts', "Resolving conflicts...") });
                    }
                    else {
                        progress.report({ message: localize('syncing...', "Turning on...") });
                    }
                }));
                await manualSyncTask.merge();
                if (this.userDataSyncService.status === "hasConflicts" /* SyncStatus.HasConflicts */) {
                    await this.handleConflictsWhileTurningOn(token);
                }
                await manualSyncTask.apply();
            });
        }
        catch (error) {
            await manualSyncTask.stop();
            throw error;
        }
        finally {
            disposables.dispose();
        }
    }
    async handleConflictsWhileTurningOn(token) {
        const conflicts = this.userDataSyncService.conflicts;
        const andSeparator = localize('and', ' and ');
        let conflictsText = '';
        for (let i = 0; i < conflicts.length; i++) {
            if (i === conflicts.length - 1 && i !== 0) {
                conflictsText += andSeparator;
            }
            else if (i !== 0) {
                conflictsText += ', ';
            }
            conflictsText += getSyncAreaLabel(conflicts[i].syncResource);
        }
        const singleConflictResource = conflicts.length === 1 ? getSyncAreaLabel(conflicts[0].syncResource) : undefined;
        await this.dialogService.prompt({
            type: Severity.Warning,
            message: localize('conflicts detected', "Conflicts Detected in {0}", conflictsText),
            detail: localize('resolve', "Please resolve conflicts to turn on..."),
            buttons: [
                {
                    label: localize({ key: 'show conflicts', comment: ['&& denotes a mnemonic'] }, "&&Show Conflicts"),
                    run: async () => {
                        const waitUntilConflictsAreResolvedPromise = raceCancellationError(Event.toPromise(Event.filter(this.userDataSyncService.onDidChangeConflicts, conficts => conficts.length === 0)), token);
                        await this.showConflicts(this.userDataSyncService.conflicts[0]?.conflicts[0]);
                        await waitUntilConflictsAreResolvedPromise;
                    }
                },
                {
                    label: singleConflictResource ? localize({ key: 'replace local single', comment: ['&& denotes a mnemonic'] }, "Accept &&Remote {0}", singleConflictResource) : localize({ key: 'replace local', comment: ['&& denotes a mnemonic'] }, "Accept &&Remote"),
                    run: async () => this.replace(true)
                },
                {
                    label: singleConflictResource ? localize({ key: 'replace remote single', comment: ['&& denotes a mnemonic'] }, "Accept &&Local {0}", singleConflictResource) : localize({ key: 'replace remote', comment: ['&& denotes a mnemonic'] }, "Accept &&Local"),
                    run: () => this.replace(false)
                },
            ],
            cancelButton: {
                run: () => {
                    throw new CancellationError();
                }
            }
        });
    }
    async replace(local) {
        for (const conflict of this.userDataSyncService.conflicts) {
            for (const preview of conflict.conflicts) {
                await this.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, local ? preview.remoteResource : preview.localResource, undefined, { force: true });
            }
        }
    }
    async accept(resource, conflictResource, content, apply) {
        return this.userDataSyncService.accept(resource, conflictResource, content, apply);
    }
    async showConflicts(conflictToOpen) {
        if (!this.userDataSyncService.conflicts.length) {
            return;
        }
        this.enableConflictsViewContext.set(true);
        const view = await this.viewsService.openView(SYNC_CONFLICTS_VIEW_ID);
        if (view && conflictToOpen) {
            await view.open(conflictToOpen);
        }
    }
    async resetSyncedData() {
        const { confirmed } = await this.dialogService.confirm({
            type: 'info',
            message: localize('reset', "This will clear your data in the cloud and stop sync on all your devices."),
            title: localize('reset title', "Clear"),
            primaryButton: localize({ key: 'resetButton', comment: ['&& denotes a mnemonic'] }, "&&Reset"),
        });
        if (confirmed) {
            await this.userDataSyncService.resetRemote();
        }
    }
    async getAllLogResources() {
        const logsFolders = [];
        const stat = await this.fileService.resolve(this.uriIdentityService.extUri.dirname(this.environmentService.logsHome));
        if (stat.children) {
            logsFolders.push(...stat.children
                .filter(stat => stat.isDirectory && /^\d{8}T\d{6}$/.test(stat.name))
                .sort()
                .reverse()
                .map(d => d.resource));
        }
        const result = [];
        for (const logFolder of logsFolders) {
            const folderStat = await this.fileService.resolve(logFolder);
            const childStat = folderStat.children?.find(stat => this.uriIdentityService.extUri.basename(stat.resource).startsWith(`${USER_DATA_SYNC_LOG_ID}.`));
            if (childStat) {
                result.push(childStat.resource);
            }
        }
        return result;
    }
    async showSyncActivity() {
        this.activityViewsEnablementContext.set(true);
        await this.waitForActiveSyncViews();
        await this.viewsService.openViewContainer(SYNC_VIEW_CONTAINER_ID);
    }
    async downloadSyncActivity() {
        const result = await this.fileDialogService.showOpenDialog({
            title: localize('download sync activity dialog title', "Select folder to download Settings Sync activity"),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: localize('download sync activity dialog open label', "Save"),
        });
        if (!result?.[0]) {
            return;
        }
        return this.progressService.withProgress({ location: 10 /* ProgressLocation.Window */ }, async () => {
            const machines = await this.userDataSyncMachinesService.getMachines();
            const currentMachine = machines.find(m => m.isCurrent);
            const name = (currentMachine ? currentMachine.name + ' - ' : '') + 'Settings Sync Activity';
            const stat = await this.fileService.resolve(result[0]);
            const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
            const indexes = [];
            for (const child of stat.children ?? []) {
                if (child.name === name) {
                    indexes.push(0);
                }
                else {
                    const matches = nameRegEx.exec(child.name);
                    if (matches) {
                        indexes.push(parseInt(matches[1]));
                    }
                }
            }
            indexes.sort((a, b) => a - b);
            const folder = this.uriIdentityService.extUri.joinPath(result[0], indexes[0] !== 0 ? name : `${name} ${indexes[indexes.length - 1] + 1}`);
            await Promise.all([
                this.userDataSyncService.saveRemoteActivityData(this.uriIdentityService.extUri.joinPath(folder, 'remoteActivity.json')),
                (async () => {
                    const logResources = await this.getAllLogResources();
                    await Promise.all(logResources.map(async (logResource) => this.fileService.copy(logResource, this.uriIdentityService.extUri.joinPath(folder, 'logs', `${this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(logResource))}.log`))));
                })(),
                this.fileService.copy(this.environmentService.userDataSyncHome, this.uriIdentityService.extUri.joinPath(folder, 'localActivity')),
            ]);
            return folder;
        });
    }
    async waitForActiveSyncViews() {
        const viewContainer = this.viewDescriptorService.getViewContainerById(SYNC_VIEW_CONTAINER_ID);
        if (viewContainer) {
            const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
            if (!model.activeViewDescriptors.length) {
                await Event.toPromise(Event.filter(model.onDidChangeActiveViewDescriptors, e => model.activeViewDescriptors.length > 0));
            }
        }
    }
    async signIn() {
        const currentAuthenticationProviderId = this.currentAuthenticationProviderId;
        const authenticationProvider = currentAuthenticationProviderId ? this.authenticationProviders.find(p => p.id === currentAuthenticationProviderId) : undefined;
        if (authenticationProvider) {
            await this.doSignIn(authenticationProvider);
        }
        else {
            if (!this.authenticationProviders.length) {
                throw new Error(localize('no authentication providers during signin', "Cannot sign in because there are no authentication providers available."));
            }
            await this.pick();
        }
    }
    async pick() {
        const result = await this.doPick();
        if (!result) {
            return false;
        }
        await this.doSignIn(result);
        return true;
    }
    async doPick() {
        if (this.authenticationProviders.length === 0) {
            return undefined;
        }
        const authenticationProviders = [...this.authenticationProviders].sort(({ id }) => id === this.currentAuthenticationProviderId ? -1 : 1);
        const allAccounts = new Map();
        if (authenticationProviders.length === 1) {
            const accounts = await this.getAccounts(authenticationProviders[0].id, authenticationProviders[0].scopes);
            if (accounts.length) {
                allAccounts.set(authenticationProviders[0].id, accounts);
            }
            else {
                // Single auth provider and no accounts
                return authenticationProviders[0];
            }
        }
        let result;
        const disposables = new DisposableStore();
        const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        const promise = new Promise(c => {
            disposables.add(quickPick.onDidHide(() => {
                disposables.dispose();
                c(result);
            }));
        });
        quickPick.title = SYNC_TITLE.value;
        quickPick.ok = false;
        quickPick.ignoreFocusOut = true;
        quickPick.placeholder = localize('choose account placeholder', "Select an account to sign in");
        quickPick.show();
        if (authenticationProviders.length > 1) {
            quickPick.busy = true;
            for (const { id, scopes } of authenticationProviders) {
                const accounts = await this.getAccounts(id, scopes);
                if (accounts.length) {
                    allAccounts.set(id, accounts);
                }
            }
            quickPick.busy = false;
        }
        quickPick.items = this.createQuickpickItems(authenticationProviders, allAccounts);
        disposables.add(quickPick.onDidAccept(() => {
            result = quickPick.selectedItems[0]?.account ? quickPick.selectedItems[0]?.account : quickPick.selectedItems[0]?.authenticationProvider;
            quickPick.hide();
        }));
        return promise;
    }
    async getAccounts(authenticationProviderId, scopes) {
        const accounts = new Map();
        let currentAccount = null;
        const sessions = await this.authenticationService.getSessions(authenticationProviderId, scopes) || [];
        for (const session of sessions) {
            const account = new UserDataSyncAccount(authenticationProviderId, session);
            accounts.set(account.accountId, account);
            if (account.sessionId === this.currentSessionId) {
                currentAccount = account;
            }
        }
        if (currentAccount) {
            // Always use current account if available
            accounts.set(currentAccount.accountId, currentAccount);
        }
        return currentAccount ? [...accounts.values()] : [...accounts.values()].sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
    }
    createQuickpickItems(authenticationProviders, allAccounts) {
        const quickPickItems = [];
        // Signed in Accounts
        if (allAccounts.size) {
            quickPickItems.push({ type: 'separator', label: localize('signed in', "Signed in") });
            for (const authenticationProvider of authenticationProviders) {
                const accounts = (allAccounts.get(authenticationProvider.id) || []).sort(({ sessionId }) => sessionId === this.currentSessionId ? -1 : 1);
                const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
                for (const account of accounts) {
                    quickPickItems.push({
                        label: `${account.accountName} (${providerName})`,
                        description: account.sessionId === this.current?.sessionId ? localize('last used', "Last Used with Sync") : undefined,
                        account,
                        authenticationProvider,
                    });
                }
            }
            quickPickItems.push({ type: 'separator', label: localize('others', "Others") });
        }
        // Account Providers
        for (const authenticationProvider of authenticationProviders) {
            const provider = this.authenticationService.getProvider(authenticationProvider.id);
            if (!allAccounts.has(authenticationProvider.id) || provider.supportsMultipleAccounts) {
                const providerName = provider.label;
                quickPickItems.push({ label: localize('sign in using account', "Sign in with {0}", providerName), authenticationProvider });
            }
        }
        return quickPickItems;
    }
    async doSignIn(accountOrAuthProvider) {
        let sessionId;
        if (isAuthenticationProvider(accountOrAuthProvider)) {
            if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.id) {
                sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
            }
            else {
                sessionId = (await this.authenticationService.createSession(accountOrAuthProvider.id, accountOrAuthProvider.scopes)).id;
            }
            this.currentAuthenticationProviderId = accountOrAuthProvider.id;
        }
        else {
            if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.id === accountOrAuthProvider.authenticationProviderId) {
                sessionId = await this.environmentService.options?.settingsSyncOptions?.authenticationProvider?.signIn();
            }
            else {
                sessionId = accountOrAuthProvider.sessionId;
            }
            this.currentAuthenticationProviderId = accountOrAuthProvider.authenticationProviderId;
        }
        this.currentSessionId = sessionId;
        await this.update('sign in');
    }
    async onDidAuthFailure() {
        this.currentSessionId = undefined;
        await this.update('auth failure');
    }
    onDidChangeSessions(e) {
        if (this.currentSessionId && e.removed?.find(session => session.id === this.currentSessionId)) {
            this.currentSessionId = undefined;
        }
        this.update('change in sessions');
    }
    onDidChangeStorage() {
        if (this.currentSessionId !== this.getStoredCachedSessionId() /* This checks if current window changed the value or not */) {
            this._cachedCurrentSessionId = null;
            this.update('change in storage');
        }
    }
    get currentAuthenticationProviderId() {
        if (this._cachedCurrentAuthenticationProviderId === null) {
            this._cachedCurrentAuthenticationProviderId = this.storageService.get(UserDataSyncWorkbenchService_1.CACHED_AUTHENTICATION_PROVIDER_KEY, -1 /* StorageScope.APPLICATION */);
        }
        return this._cachedCurrentAuthenticationProviderId;
    }
    set currentAuthenticationProviderId(currentAuthenticationProviderId) {
        if (this._cachedCurrentAuthenticationProviderId !== currentAuthenticationProviderId) {
            this._cachedCurrentAuthenticationProviderId = currentAuthenticationProviderId;
            if (currentAuthenticationProviderId === undefined) {
                this.storageService.remove(UserDataSyncWorkbenchService_1.CACHED_AUTHENTICATION_PROVIDER_KEY, -1 /* StorageScope.APPLICATION */);
            }
            else {
                this.storageService.store(UserDataSyncWorkbenchService_1.CACHED_AUTHENTICATION_PROVIDER_KEY, currentAuthenticationProviderId, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
        }
    }
    get currentSessionId() {
        if (this._cachedCurrentSessionId === null) {
            this._cachedCurrentSessionId = this.getStoredCachedSessionId();
        }
        return this._cachedCurrentSessionId;
    }
    set currentSessionId(cachedSessionId) {
        if (this._cachedCurrentSessionId !== cachedSessionId) {
            this._cachedCurrentSessionId = cachedSessionId;
            if (cachedSessionId === undefined) {
                this.logService.info('Settings Sync: Reset current session');
                this.storageService.remove(UserDataSyncWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            }
            else {
                this.logService.info('Settings Sync: Updated current session', cachedSessionId);
                this.storageService.store(UserDataSyncWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, cachedSessionId, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
        }
    }
    getStoredCachedSessionId() {
        return this.storageService.get(UserDataSyncWorkbenchService_1.CACHED_SESSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
    }
    get useWorkbenchSessionId() {
        return !this.storageService.getBoolean(UserDataSyncWorkbenchService_1.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, false);
    }
    set useWorkbenchSessionId(useWorkbenchSession) {
        this.storageService.store(UserDataSyncWorkbenchService_1.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, !useWorkbenchSession, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
};
UserDataSyncWorkbenchService = UserDataSyncWorkbenchService_1 = __decorate([
    __param(0, IUserDataSyncService),
    __param(1, IUriIdentityService),
    __param(2, IAuthenticationService),
    __param(3, IUserDataSyncAccountService),
    __param(4, IQuickInputService),
    __param(5, IStorageService),
    __param(6, IUserDataSyncEnablementService),
    __param(7, IUserDataAutoSyncService),
    __param(8, ILogService),
    __param(9, IProductService),
    __param(10, IExtensionService),
    __param(11, IBrowserWorkbenchEnvironmentService),
    __param(12, ISecretStorageService),
    __param(13, INotificationService),
    __param(14, IProgressService),
    __param(15, IDialogService),
    __param(16, IContextKeyService),
    __param(17, IViewsService),
    __param(18, IViewDescriptorService),
    __param(19, IUserDataSyncStoreManagementService),
    __param(20, ILifecycleService),
    __param(21, IInstantiationService),
    __param(22, IEditorService),
    __param(23, IUserDataInitializationService),
    __param(24, IFileService),
    __param(25, IFileDialogService),
    __param(26, IUserDataSyncMachinesService)
], UserDataSyncWorkbenchService);
export { UserDataSyncWorkbenchService };
registerSingleton(IUserDataSyncWorkbenchService, UserDataSyncWorkbenchService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvYnJvd3Nlci91c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQTJCLHdCQUF3QixFQUFFLHdCQUF3QixFQUFFLG1DQUFtQyxFQUFjLDhCQUE4QixFQUEyQyxxQkFBcUIsRUFBRSxxQkFBcUIsR0FBRyxNQUFNLDBEQUEwRCxDQUFDO0FBQ3RWLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsNkJBQTZCLEVBQXVDLHVCQUF1QixFQUFFLGtCQUFrQixFQUFFLHFCQUFxQixFQUFFLHdCQUF3QixFQUFFLDZCQUE2QixFQUFFLHNCQUFzQixFQUFFLFVBQVUsRUFBRSxzQkFBc0IsRUFBRSxrQ0FBa0MsRUFBRSxxQkFBcUIsRUFBOEIsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNqWixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUcsT0FBTyxFQUE0RCxzQkFBc0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pKLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsTUFBTSxzREFBc0QsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUEr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