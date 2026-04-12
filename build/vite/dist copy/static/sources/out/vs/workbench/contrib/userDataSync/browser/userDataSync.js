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
import { toAction } from '../../../../base/common/actions.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyTrueExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUserDataAutoSyncService, IUserDataSyncService, registerConfiguration, UserDataSyncError, USER_DATA_SYNC_SCHEME, IUserDataSyncEnablementService, IUserDataSyncStoreManagementService, USER_DATA_SYNC_LOG_ID } from '../../../../platform/userDataSync/common/userDataSync.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IActivityService, NumberBadge, ProgressBadge } from '../../../services/activity/common/activity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { fromNow } from '../../../../base/common/date.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Extensions } from '../../../common/views.js';
import { UserDataSyncDataViews } from './userDataSyncViews.js';
import { IUserDataSyncWorkbenchService, getSyncAreaLabel, CONTEXT_SYNC_STATE, CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE, CONFIGURE_SYNC_COMMAND_ID, SHOW_SYNC_LOG_COMMAND_ID, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_VIEW_ICON, CONTEXT_HAS_CONFLICTS, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR } from '../../../services/userDataSync/common/userDataSync.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ctxIsMergeResultEditor, ctxMergeBaseUri } from '../../mergeEditor/common/mergeEditor.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { isWeb } from '../../../../base/common/platform.js';
const turnOffSyncCommand = { id: 'workbench.userDataSync.actions.turnOff', title: localize2('stop sync', 'Turn Off') };
const configureSyncCommand = { id: CONFIGURE_SYNC_COMMAND_ID, title: localize2('configure sync', 'Configure...') };
const showConflictsCommandId = 'workbench.userDataSync.actions.showConflicts';
const syncNowCommand = {
    id: 'workbench.userDataSync.actions.syncNow',
    title: localize2('sync now', 'Sync Now'),
    description(userDataSyncService) {
        if (userDataSyncService.status === "syncing" /* SyncStatus.Syncing */) {
            return localize('syncing', "syncing");
        }
        if (userDataSyncService.lastSyncTime) {
            return localize('synced with time', "synced {0}", fromNow(userDataSyncService.lastSyncTime, true));
        }
        return undefined;
    }
};
const showSyncSettingsCommand = { id: 'workbench.userDataSync.actions.settings', title: localize2('sync settings', 'Show Settings'), };
const showSyncedDataCommand = { id: 'workbench.userDataSync.actions.showSyncedData', title: localize2('show synced data', 'Show Synced Data'), };
const CONTEXT_TURNING_ON_STATE = new RawContextKey('userDataSyncTurningOn', false);
let UserDataSyncWorkbenchContribution = class UserDataSyncWorkbenchContribution extends Disposable {
    constructor(userDataSyncEnablementService, userDataSyncService, userDataSyncWorkbenchService, contextKeyService, activityService, notificationService, editorService, userDataProfileService, dialogService, quickInputService, instantiationService, outputService, userDataAutoSyncService, textModelResolverService, preferencesService, telemetryService, productService, openerService, authenticationService, userDataSyncStoreManagementService, hostService, commandService, workbenchIssueService) {
        super();
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataSyncService = userDataSyncService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
        this.activityService = activityService;
        this.notificationService = notificationService;
        this.editorService = editorService;
        this.userDataProfileService = userDataProfileService;
        this.dialogService = dialogService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.outputService = outputService;
        this.preferencesService = preferencesService;
        this.telemetryService = telemetryService;
        this.productService = productService;
        this.openerService = openerService;
        this.authenticationService = authenticationService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.hostService = hostService;
        this.commandService = commandService;
        this.workbenchIssueService = workbenchIssueService;
        this.globalActivityBadgeDisposable = this._register(new MutableDisposable());
        this.accountBadgeDisposable = this._register(new MutableDisposable());
        this.conflictsDisposables = new Map();
        this.invalidContentErrorDisposables = new Map();
        this.conflictsActionDisposable = this._register(new MutableDisposable());
        this.turningOnSyncContext = CONTEXT_TURNING_ON_STATE.bindTo(contextKeyService);
        if (userDataSyncWorkbenchService.enabled) {
            registerConfiguration();
            this.updateAccountBadge();
            this.updateGlobalActivityBadge();
            this.onDidChangeConflicts(this.userDataSyncService.conflicts);
            this._register(Event.any(Event.debounce(userDataSyncService.onDidChangeStatus, () => undefined, 500), this.userDataSyncEnablementService.onDidChangeEnablement, this.userDataSyncWorkbenchService.onDidChangeAccountStatus)(() => {
                this.updateAccountBadge();
                this.updateGlobalActivityBadge();
            }));
            this._register(userDataSyncService.onDidChangeConflicts(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
            this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
            this._register(userDataSyncService.onSyncErrors(errors => this.onSynchronizerErrors(errors)));
            this._register(userDataAutoSyncService.onError(error => this.onAutoSyncError(error)));
            this.registerActions();
            this.registerViews();
            textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));
            this._register(Event.any(userDataSyncService.onDidChangeStatus, userDataSyncEnablementService.onDidChangeEnablement)(() => this.turningOnSync = !userDataSyncEnablementService.isEnabled() && userDataSyncService.status !== "idle" /* SyncStatus.Idle */));
        }
    }
    get turningOnSync() {
        return !!this.turningOnSyncContext.get();
    }
    set turningOnSync(turningOn) {
        this.turningOnSyncContext.set(turningOn);
        this.updateGlobalActivityBadge();
    }
    toKey({ syncResource: resource, profile }) {
        return `${profile.id}:${resource}`;
    }
    onDidChangeConflicts(conflicts) {
        this.updateGlobalActivityBadge();
        this.registerShowConflictsAction();
        if (!this.userDataSyncEnablementService.isEnabled()) {
            return;
        }
        if (conflicts.length) {
            // Clear and dispose conflicts those were cleared
            for (const [key, disposable] of this.conflictsDisposables.entries()) {
                if (!conflicts.some(conflict => this.toKey(conflict) === key)) {
                    disposable.dispose();
                    this.conflictsDisposables.delete(key);
                }
            }
            for (const conflict of this.userDataSyncService.conflicts) {
                const key = this.toKey(conflict);
                // Show conflicts notification if not shown before
                if (!this.conflictsDisposables.has(key)) {
                    const conflictsArea = getSyncAreaLabel(conflict.syncResource);
                    const handle = this.notificationService.prompt(Severity.Warning, localize('conflicts detected', "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea.toLowerCase()), [
                        {
                            label: localize('replace remote', "Replace Remote"),
                            run: () => {
                                this.acceptLocal(conflict, conflict.conflicts[0]);
                            }
                        },
                        {
                            label: localize('replace local', "Replace Local"),
                            run: () => {
                                this.acceptRemote(conflict, conflict.conflicts[0]);
                            }
                        },
                        {
                            label: localize('show conflicts', "Show Conflicts"),
                            run: () => {
                                this.telemetryService.publicLog2('sync/showConflicts', { source: conflict.syncResource });
                                this.userDataSyncWorkbenchService.showConflicts(conflict.conflicts[0]);
                            }
                        }
                    ], {
                        sticky: true
                    });
                    this.conflictsDisposables.set(key, toDisposable(() => {
                        // close the conflicts warning notification
                        handle.close();
                        this.conflictsDisposables.delete(key);
                    }));
                }
            }
        }
        else {
            this.conflictsDisposables.forEach(disposable => disposable.dispose());
            this.conflictsDisposables.clear();
        }
    }
    async acceptRemote(syncResource, conflict) {
        try {
            await this.userDataSyncService.accept(syncResource, conflict.remoteResource, undefined, this.userDataSyncEnablementService.isEnabled());
        }
        catch (e) {
            this.notificationService.error(localize('accept failed', "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
        }
    }
    async acceptLocal(syncResource, conflict) {
        try {
            await this.userDataSyncService.accept(syncResource, conflict.localResource, undefined, this.userDataSyncEnablementService.isEnabled());
        }
        catch (e) {
            this.notificationService.error(localize('accept failed', "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
        }
    }
    onAutoSyncError(error) {
        switch (error.code) {
            case "SessionExpired" /* UserDataSyncErrorCode.SessionExpired */:
                this.notificationService.notify({
                    severity: Severity.Info,
                    message: localize('session expired', "Settings sync was turned off because current session is expired, please sign in again to turn on sync."),
                    actions: {
                        primary: [toAction({
                                id: 'turn on sync',
                                label: localize('turn on sync', "Turn on Settings Sync..."),
                                run: () => this.turnOn()
                            })]
                    }
                });
                break;
            case "TurnedOff" /* UserDataSyncErrorCode.TurnedOff */:
                this.notificationService.notify({
                    severity: Severity.Info,
                    message: localize('turned off', "Settings sync was turned off from another device, please turn on sync again."),
                    actions: {
                        primary: [toAction({
                                id: 'turn on sync',
                                label: localize('turn on sync', "Turn on Settings Sync..."),
                                run: () => this.turnOn()
                            })]
                    }
                });
                break;
            case "TooLarge" /* UserDataSyncErrorCode.TooLarge */:
                if (error.resource === "keybindings" /* SyncResource.Keybindings */ || error.resource === "settings" /* SyncResource.Settings */ || error.resource === "tasks" /* SyncResource.Tasks */) {
                    this.disableSync(error.resource);
                    const sourceArea = getSyncAreaLabel(error.resource);
                    this.handleTooLargeError(error.resource, localize('too large', "Disabled syncing {0} because size of the {1} file to sync is larger than {2}. Please open the file and reduce the size and enable sync", sourceArea.toLowerCase(), sourceArea.toLowerCase(), '100kb'), error);
                }
                break;
            case "LocalTooManyProfiles" /* UserDataSyncErrorCode.LocalTooManyProfiles */:
                this.disableSync("profiles" /* SyncResource.Profiles */);
                this.notificationService.error(localize('too many profiles', "Disabled syncing profiles because there are too many profiles to sync. Settings Sync supports syncing maximum 20 profiles. Please reduce the number of profiles and enable sync"));
                break;
            case "IncompatibleLocalContent" /* UserDataSyncErrorCode.IncompatibleLocalContent */:
            case "Gone" /* UserDataSyncErrorCode.Gone */:
            case "UpgradeRequired" /* UserDataSyncErrorCode.UpgradeRequired */: {
                const message = localize('error upgrade required', "Settings sync is disabled because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
                const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
                this.notificationService.notify({
                    severity: Severity.Error,
                    message: operationId ? `${message} ${operationId}` : message,
                });
                break;
            }
            case "MethodNotFound" /* UserDataSyncErrorCode.MethodNotFound */: {
                const message = localize('method not found', "Settings sync is disabled because the client is making invalid requests. Please report an issue with the logs.");
                const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
                this.notificationService.notify({
                    severity: Severity.Error,
                    message: operationId ? `${message} ${operationId}` : message,
                    actions: {
                        primary: [
                            toAction({
                                id: 'Show Sync Logs',
                                label: localize('show sync logs', "Show Log"),
                                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
                            }),
                            toAction({
                                id: 'Report Issue',
                                label: localize('report issue', "Report Issue"),
                                run: () => this.workbenchIssueService.openReporter()
                            })
                        ]
                    }
                });
                break;
            }
            case "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */:
                this.notificationService.notify({
                    severity: Severity.Error,
                    message: localize('error reset required', "Settings sync is disabled because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
                    actions: {
                        primary: [
                            toAction({
                                id: 'reset',
                                label: localize('reset', "Clear Data in Cloud..."),
                                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
                            }),
                            toAction({
                                id: 'show synced data',
                                label: localize('show synced data action', "Show Synced Data"),
                                run: () => this.userDataSyncWorkbenchService.showSyncActivity()
                            })
                        ]
                    }
                });
                return;
            case "ServiceChanged" /* UserDataSyncErrorCode.ServiceChanged */:
                this.notificationService.notify({
                    severity: Severity.Info,
                    message: this.userDataSyncStoreManagementService.userDataSyncStore?.type === 'insiders' ?
                        localize('service switched to insiders', "Settings Sync has been switched to insiders service") :
                        localize('service switched to stable', "Settings Sync has been switched to stable service"),
                });
                return;
            case "DefaultServiceChanged" /* UserDataSyncErrorCode.DefaultServiceChanged */:
                // Settings sync is using separate service
                if (this.userDataSyncEnablementService.isEnabled()) {
                    this.notificationService.notify({
                        severity: Severity.Info,
                        message: localize('using separate service', "Settings sync now uses a separate service, more information is available in the [Settings Sync Documentation](https://aka.ms/vscode-settings-sync-help#_syncing-stable-versus-insiders)."),
                    });
                }
                // If settings sync got turned off then ask user to turn on sync again.
                else {
                    this.notificationService.notify({
                        severity: Severity.Info,
                        message: localize('service changed and turned off', "Settings sync was turned off because {0} now uses a separate service. Please turn on sync again.", this.productService.nameLong),
                        actions: {
                            primary: [toAction({
                                    id: 'turn on sync',
                                    label: localize('turn on sync', "Turn on Settings Sync..."),
                                    run: () => this.turnOn()
                                })]
                        }
                    });
                }
                return;
        }
    }
    handleTooLargeError(resource, message, error) {
        const operationId = error.operationId ? localize('operationId', "Operation Id: {0}", error.operationId) : undefined;
        this.notificationService.notify({
            severity: Severity.Error,
            message: operationId ? `${message} ${operationId}` : message,
            actions: {
                primary: [toAction({
                        id: 'open sync file',
                        label: localize('open file', "Open {0} File", getSyncAreaLabel(resource)),
                        run: () => resource === "settings" /* SyncResource.Settings */ ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
                    })]
            }
        });
    }
    onSynchronizerErrors(errors) {
        if (errors.length) {
            for (const { profile, syncResource: resource, error } of errors) {
                switch (error.code) {
                    case "LocalInvalidContent" /* UserDataSyncErrorCode.LocalInvalidContent */:
                        this.handleInvalidContentError({ profile, syncResource: resource });
                        break;
                    default: {
                        const key = `${profile.id}:${resource}`;
                        const disposable = this.invalidContentErrorDisposables.get(key);
                        if (disposable) {
                            disposable.dispose();
                            this.invalidContentErrorDisposables.delete(key);
                        }
                    }
                }
            }
        }
        else {
            this.invalidContentErrorDisposables.forEach(disposable => disposable.dispose());
            this.invalidContentErrorDisposables.clear();
        }
    }
    handleInvalidContentError({ profile, syncResource: source }) {
        if (this.userDataProfileService.currentProfile.id !== profile.id) {
            return;
        }
        const key = `${profile.id}:${source}`;
        if (this.invalidContentErrorDisposables.has(key)) {
            return;
        }
        if (source !== "settings" /* SyncResource.Settings */ && source !== "keybindings" /* SyncResource.Keybindings */ && source !== "tasks" /* SyncResource.Tasks */) {
            return;
        }
        if (!this.hostService.hasFocus) {
            return;
        }
        const resource = source === "settings" /* SyncResource.Settings */ ? this.userDataProfileService.currentProfile.settingsResource
            : source === "keybindings" /* SyncResource.Keybindings */ ? this.userDataProfileService.currentProfile.keybindingsResource
                : this.userDataProfileService.currentProfile.tasksResource;
        const editorUri = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (isEqual(resource, editorUri)) {
            // Do not show notification if the file in error is active
            return;
        }
        const errorArea = getSyncAreaLabel(source);
        const handle = this.notificationService.notify({
            severity: Severity.Error,
            message: localize('errorInvalidConfiguration', "Unable to sync {0} because the content in the file is not valid. Please open the file and correct it.", errorArea.toLowerCase()),
            actions: {
                primary: [toAction({
                        id: 'open sync file',
                        label: localize('open file', "Open {0} File", errorArea),
                        run: () => source === "settings" /* SyncResource.Settings */ ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
                    })]
            }
        });
        this.invalidContentErrorDisposables.set(key, toDisposable(() => {
            // close the error warning notification
            handle.close();
            this.invalidContentErrorDisposables.delete(key);
        }));
    }
    getConflictsCount() {
        return this.userDataSyncService.conflicts.reduce((result, { conflicts }) => { return result + conflicts.length; }, 0);
    }
    async updateGlobalActivityBadge() {
        this.globalActivityBadgeDisposable.clear();
        let badge = undefined;
        if (this.userDataSyncService.conflicts.length && this.userDataSyncEnablementService.isEnabled()) {
            badge = new NumberBadge(this.getConflictsCount(), () => localize('has conflicts', "{0}: Conflicts Detected", SYNC_TITLE.value));
        }
        else if (this.turningOnSync) {
            badge = new ProgressBadge(() => localize('turning on syncing', "Turning on Settings Sync..."));
        }
        if (badge) {
            this.globalActivityBadgeDisposable.value = this.activityService.showGlobalActivity({ badge });
        }
    }
    async updateAccountBadge() {
        this.accountBadgeDisposable.clear();
        let badge = undefined;
        if (this.userDataSyncService.status !== "uninitialized" /* SyncStatus.Uninitialized */ && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncWorkbenchService.accountStatus === "unavailable" /* AccountStatus.Unavailable */) {
            badge = new NumberBadge(1, () => localize('sign in to sync', "Sign in to Sync Settings"));
        }
        if (badge) {
            this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
        }
    }
    async turnOn() {
        try {
            if (!this.userDataSyncWorkbenchService.authenticationProviders.length) {
                throw new Error(localize('no authentication providers', "No authentication providers are available."));
            }
            const turnOn = await this.askToConfigure();
            if (!turnOn) {
                return;
            }
            if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
                await this.selectSettingsSyncService(this.userDataSyncStoreManagementService.userDataSyncStore);
            }
            await this.userDataSyncWorkbenchService.turnOn();
        }
        catch (e) {
            if (isCancellationError(e)) {
                return;
            }
            if (e instanceof UserDataSyncError) {
                switch (e.code) {
                    case "TooLarge" /* UserDataSyncErrorCode.TooLarge */:
                        if (e.resource === "keybindings" /* SyncResource.Keybindings */ || e.resource === "settings" /* SyncResource.Settings */ || e.resource === "tasks" /* SyncResource.Tasks */) {
                            this.handleTooLargeError(e.resource, localize('too large while starting sync', "Settings sync cannot be turned on because size of the {0} file to sync is larger than {1}. Please open the file and reduce the size and turn on sync", getSyncAreaLabel(e.resource).toLowerCase(), '100kb'), e);
                            return;
                        }
                        break;
                    case "IncompatibleLocalContent" /* UserDataSyncErrorCode.IncompatibleLocalContent */:
                    case "Gone" /* UserDataSyncErrorCode.Gone */:
                    case "UpgradeRequired" /* UserDataSyncErrorCode.UpgradeRequired */: {
                        const message = localize('error upgrade required while starting sync', "Settings sync cannot be turned on because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
                        const operationId = e.operationId ? localize('operationId', "Operation Id: {0}", e.operationId) : undefined;
                        this.notificationService.notify({
                            severity: Severity.Error,
                            message: operationId ? `${message} ${operationId}` : message,
                        });
                        return;
                    }
                    case "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */:
                        this.notificationService.notify({
                            severity: Severity.Error,
                            message: localize('error reset required while starting sync', "Settings sync cannot be turned on because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
                            actions: {
                                primary: [
                                    toAction({
                                        id: 'reset',
                                        label: localize('reset', "Clear Data in Cloud..."),
                                        run: () => this.userDataSyncWorkbenchService.resetSyncedData()
                                    }),
                                    toAction({
                                        id: 'show synced data',
                                        label: localize('show synced data action', "Show Synced Data"),
                                        run: () => this.userDataSyncWorkbenchService.showSyncActivity()
                                    })
                                ]
                            }
                        });
                        return;
                    case "Unauthorized" /* UserDataSyncErrorCode.Unauthorized */:
                    case "Forbidden" /* UserDataSyncErrorCode.Forbidden */:
                        this.notificationService.error(localize('auth failed', "Error while turning on Settings Sync: Authentication failed."));
                        return;
                }
                this.notificationService.error(localize('turn on failed with user data sync error', "Error while turning on Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
            }
            else {
                this.notificationService.error(localize({ key: 'turn on failed', comment: ['Substitution is for error reason'] }, "Error while turning on Settings Sync. {0}", getErrorMessage(e)));
            }
        }
    }
    async askToConfigure() {
        return new Promise((c, e) => {
            const disposables = new DisposableStore();
            const quickPick = this.quickInputService.createQuickPick();
            disposables.add(quickPick);
            quickPick.title = SYNC_TITLE.value;
            quickPick.ok = false;
            quickPick.customButton = true;
            quickPick.customLabel = localize('sign in and turn on', "Sign in");
            quickPick.description = localize('configure and turn on sync detail', "Please sign in to backup and sync your data across devices.");
            quickPick.canSelectMany = true;
            quickPick.ignoreFocusOut = true;
            quickPick.hideInput = true;
            quickPick.hideCheckAll = true;
            const items = this.getConfigureSyncQuickPickItems();
            quickPick.items = items;
            quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id, true));
            let accepted = false;
            disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
                accepted = true;
                quickPick.hide();
            }));
            disposables.add(quickPick.onDidHide(() => {
                try {
                    if (accepted) {
                        this.updateConfiguration(items, quickPick.selectedItems);
                    }
                    c(accepted);
                }
                catch (error) {
                    e(error);
                }
                finally {
                    disposables.dispose();
                }
            }));
            quickPick.show();
        });
    }
    getConfigureSyncQuickPickItems() {
        const result = [{
                id: "settings" /* SyncResource.Settings */,
                label: getSyncAreaLabel("settings" /* SyncResource.Settings */)
            }, {
                id: "keybindings" /* SyncResource.Keybindings */,
                label: getSyncAreaLabel("keybindings" /* SyncResource.Keybindings */),
            }, {
                id: "snippets" /* SyncResource.Snippets */,
                label: getSyncAreaLabel("snippets" /* SyncResource.Snippets */)
            }, {
                id: "tasks" /* SyncResource.Tasks */,
                label: getSyncAreaLabel("tasks" /* SyncResource.Tasks */)
            }, {
                id: "mcp" /* SyncResource.Mcp */,
                label: getSyncAreaLabel("mcp" /* SyncResource.Mcp */)
            }, {
                id: "globalState" /* SyncResource.GlobalState */,
                label: getSyncAreaLabel("globalState" /* SyncResource.GlobalState */),
            }, {
                id: "extensions" /* SyncResource.Extensions */,
                label: getSyncAreaLabel("extensions" /* SyncResource.Extensions */)
            }, {
                id: "profiles" /* SyncResource.Profiles */,
                label: getSyncAreaLabel("profiles" /* SyncResource.Profiles */),
            }, {
                id: "prompts" /* SyncResource.Prompts */,
                label: getSyncAreaLabel("prompts" /* SyncResource.Prompts */)
            }];
        return result;
    }
    updateConfiguration(items, selectedItems) {
        for (const item of items) {
            const wasEnabled = this.userDataSyncEnablementService.isResourceEnabled(item.id);
            const isEnabled = !!selectedItems.filter(selected => selected.id === item.id)[0];
            if (wasEnabled !== isEnabled) {
                this.userDataSyncEnablementService.setResourceEnablement(item.id, isEnabled);
            }
        }
    }
    async configureSyncOptions() {
        return new Promise((c, e) => {
            const disposables = new DisposableStore();
            const quickPick = this.quickInputService.createQuickPick();
            disposables.add(quickPick);
            quickPick.title = localize('configure sync title', "{0}: Configure...", SYNC_TITLE.value);
            quickPick.placeholder = localize('configure sync placeholder', "Choose what to sync");
            quickPick.canSelectMany = true;
            quickPick.ignoreFocusOut = true;
            quickPick.ok = true;
            const items = this.getConfigureSyncQuickPickItems();
            quickPick.items = items;
            quickPick.selectedItems = items.filter(item => this.userDataSyncEnablementService.isResourceEnabled(item.id));
            disposables.add(quickPick.onDidAccept(async () => {
                if (quickPick.selectedItems.length) {
                    this.updateConfiguration(items, quickPick.selectedItems);
                    quickPick.hide();
                }
            }));
            disposables.add(quickPick.onDidHide(() => {
                disposables.dispose();
                c();
            }));
            quickPick.show();
        });
    }
    async turnOff() {
        const result = await this.dialogService.confirm({
            message: localize('turn off sync confirmation', "Do you want to turn off sync?"),
            detail: localize('turn off sync detail', "Your settings, keybindings, extensions, snippets and UI State will no longer be synced."),
            primaryButton: localize({ key: 'turn off', comment: ['&& denotes a mnemonic'] }, "&&Turn off"),
            checkbox: this.userDataSyncWorkbenchService.accountStatus === "available" /* AccountStatus.Available */ ? {
                label: localize('turn off sync everywhere', "Turn off sync on all your devices and clear the data from the cloud.")
            } : undefined
        });
        if (result.confirmed) {
            return this.userDataSyncWorkbenchService.turnoff(!!result.checkboxChecked);
        }
    }
    disableSync(source) {
        switch (source) {
            case "settings" /* SyncResource.Settings */: return this.userDataSyncEnablementService.setResourceEnablement("settings" /* SyncResource.Settings */, false);
            case "keybindings" /* SyncResource.Keybindings */: return this.userDataSyncEnablementService.setResourceEnablement("keybindings" /* SyncResource.Keybindings */, false);
            case "snippets" /* SyncResource.Snippets */: return this.userDataSyncEnablementService.setResourceEnablement("snippets" /* SyncResource.Snippets */, false);
            case "tasks" /* SyncResource.Tasks */: return this.userDataSyncEnablementService.setResourceEnablement("tasks" /* SyncResource.Tasks */, false);
            case "extensions" /* SyncResource.Extensions */: return this.userDataSyncEnablementService.setResourceEnablement("extensions" /* SyncResource.Extensions */, false);
            case "globalState" /* SyncResource.GlobalState */: return this.userDataSyncEnablementService.setResourceEnablement("globalState" /* SyncResource.GlobalState */, false);
            case "profiles" /* SyncResource.Profiles */: return this.userDataSyncEnablementService.setResourceEnablement("profiles" /* SyncResource.Profiles */, false);
        }
    }
    showSyncActivity() {
        return this.outputService.showChannel(USER_DATA_SYNC_LOG_ID);
    }
    async selectSettingsSyncService(userDataSyncStore) {
        return new Promise((c, e) => {
            const disposables = new DisposableStore();
            const quickPick = disposables.add(this.quickInputService.createQuickPick());
            quickPick.title = localize('switchSyncService.title', "{0}: Select Service", SYNC_TITLE.value);
            quickPick.description = localize('switchSyncService.description', "Ensure you are using the same settings sync service when syncing with multiple environments");
            quickPick.hideInput = true;
            quickPick.ignoreFocusOut = true;
            const getDescription = (url) => {
                const isDefault = isEqual(url, userDataSyncStore.defaultUrl);
                if (isDefault) {
                    return localize('default', "Default");
                }
                return undefined;
            };
            quickPick.items = [
                {
                    id: 'insiders',
                    label: localize('insiders', "Insiders"),
                    description: getDescription(userDataSyncStore.insidersUrl)
                },
                {
                    id: 'stable',
                    label: localize('stable', "Stable"),
                    description: getDescription(userDataSyncStore.stableUrl)
                }
            ];
            disposables.add(quickPick.onDidAccept(async () => {
                try {
                    await this.userDataSyncStoreManagementService.switch(quickPick.selectedItems[0].id);
                    c();
                }
                catch (error) {
                    e(error);
                }
                finally {
                    quickPick.hide();
                }
            }));
            disposables.add(quickPick.onDidHide(() => disposables.dispose()));
            quickPick.show();
        });
    }
    registerActions() {
        if (this.userDataSyncEnablementService.canToggleEnablement()) {
            this.registerTurnOnSyncAction();
            this.registerTurnOffSyncAction();
        }
        this.registerTurningOnSyncAction();
        this.registerCancelTurnOnSyncAction();
        this.registerSignInAction(); // When Sync is turned on from CLI
        this.registerShowConflictsAction();
        this.registerEnableSyncViewsAction();
        this.registerManageSyncAction();
        this.registerSyncNowAction();
        this.registerConfigureSyncAction();
        this.registerShowSettingsAction();
        this.registerHelpAction();
        this.registerShowLogAction();
        this.registerResetSyncDataAction();
        this.registerAcceptMergesAction();
        if (isWeb) {
            this.registerDownloadSyncActivityAction();
        }
    }
    registerTurnOnSyncAction() {
        const that = this;
        const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE.negate());
        this._register(registerAction2(class TurningOnSyncAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userDataSync.actions.turnOn',
                    title: localize2('global activity turn on sync', 'Backup and Sync Settings...'),
                    category: SYNC_TITLE,
                    f1: true,
                    precondition: when,
                    menu: [{
                            group: '3_configuration',
                            id: MenuId.GlobalActivity,
                            when,
                            order: 2
                        }, {
                            group: '3_configuration',
                            id: MenuId.MenubarPreferencesMenu,
                            when,
                            order: 2
                        }, {
                            group: '1_settings',
                            id: MenuId.AccountsContext,
                            when,
                            order: 2
                        }]
                });
            }
            async run() {
                return that.turnOn();
            }
        }));
    }
    registerTurningOnSyncAction() {
        const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE);
        this._register(registerAction2(class TurningOnSyncAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userData.actions.turningOn',
                    title: localize('turning on sync', "Turning on Settings Sync..."),
                    precondition: ContextKeyExpr.false(),
                    menu: [{
                            group: '3_configuration',
                            id: MenuId.GlobalActivity,
                            when,
                            order: 2
                        }, {
                            group: '1_settings',
                            id: MenuId.AccountsContext,
                            when,
                        }]
                });
            }
            async run() { }
        }));
    }
    registerCancelTurnOnSyncAction() {
        const that = this;
        this._register(registerAction2(class TurningOnSyncAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userData.actions.cancelTurnOn',
                    title: localize('cancel turning on sync', "Cancel"),
                    icon: Codicon.stopCircle,
                    menu: {
                        id: MenuId.ViewContainerTitle,
                        when: ContextKeyExpr.and(CONTEXT_TURNING_ON_STATE, ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID)),
                        group: 'navigation',
                        order: 1
                    }
                });
            }
            async run() {
                return that.userDataSyncWorkbenchService.turnoff(false);
            }
        }));
    }
    registerSignInAction() {
        const that = this;
        const id = 'workbench.userData.actions.signin';
        const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo("unavailable" /* AccountStatus.Unavailable */));
        this._register(registerAction2(class StopSyncAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userData.actions.signin',
                    title: localize('sign in global', "Sign in to Sync Settings"),
                    menu: {
                        group: '3_configuration',
                        id: MenuId.GlobalActivity,
                        when,
                        order: 2
                    }
                });
            }
            async run() {
                try {
                    await that.userDataSyncWorkbenchService.signIn();
                }
                catch (e) {
                    that.notificationService.error(e);
                }
            }
        }));
        this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
            group: '1_settings',
            command: {
                id,
                title: localize('sign in accounts', "Sign in to Sync Settings (1)"),
            },
            when
        }));
    }
    getShowConflictsTitle() {
        return localize2('resolveConflicts_global', "Show Conflicts ({0})", this.getConflictsCount());
    }
    registerShowConflictsAction() {
        this.conflictsActionDisposable.value = undefined;
        const that = this;
        this.conflictsActionDisposable.value = registerAction2(class TurningOnSyncAction extends Action2 {
            constructor() {
                super({
                    id: showConflictsCommandId,
                    get title() { return that.getShowConflictsTitle(); },
                    category: SYNC_TITLE,
                    f1: true,
                    precondition: CONTEXT_HAS_CONFLICTS,
                    menu: [{
                            group: '3_configuration',
                            id: MenuId.GlobalActivity,
                            when: CONTEXT_HAS_CONFLICTS,
                            order: 2
                        }, {
                            group: '3_configuration',
                            id: MenuId.MenubarPreferencesMenu,
                            when: CONTEXT_HAS_CONFLICTS,
                            order: 2
                        }]
                });
            }
            async run() {
                return that.userDataSyncWorkbenchService.showConflicts();
            }
        });
    }
    registerManageSyncAction() {
        const that = this;
        const when = ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.notEqualsTo("unavailable" /* AccountStatus.Unavailable */), CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */));
        this._register(registerAction2(class SyncStatusAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userDataSync.actions.manage',
                    title: localize('sync is on', "Settings Sync is On"),
                    toggled: ContextKeyTrueExpr.INSTANCE,
                    menu: [
                        {
                            id: MenuId.GlobalActivity,
                            group: '3_configuration',
                            when,
                            order: 2
                        },
                        {
                            id: MenuId.MenubarPreferencesMenu,
                            group: '3_configuration',
                            when,
                            order: 2,
                        },
                        {
                            id: MenuId.AccountsContext,
                            group: '1_settings',
                            when,
                        }
                    ],
                });
            }
            run(accessor) {
                return new Promise((c, e) => {
                    const quickInputService = accessor.get(IQuickInputService);
                    const commandService = accessor.get(ICommandService);
                    const disposables = new DisposableStore();
                    const quickPick = quickInputService.createQuickPick({ useSeparators: true });
                    disposables.add(quickPick);
                    const items = [];
                    if (that.userDataSyncService.conflicts.length) {
                        items.push({ id: showConflictsCommandId, label: `${SYNC_TITLE.value}: ${that.getShowConflictsTitle().original}` });
                        items.push({ type: 'separator' });
                    }
                    items.push({ id: configureSyncCommand.id, label: `${SYNC_TITLE.value}: ${configureSyncCommand.title.original}` });
                    items.push({ id: showSyncSettingsCommand.id, label: `${SYNC_TITLE.value}: ${showSyncSettingsCommand.title.original}` });
                    items.push({ id: showSyncedDataCommand.id, label: `${SYNC_TITLE.value}: ${showSyncedDataCommand.title.original}` });
                    items.push({ type: 'separator' });
                    items.push({ id: syncNowCommand.id, label: `${SYNC_TITLE.value}: ${syncNowCommand.title.original}`, description: syncNowCommand.description(that.userDataSyncService) });
                    if (that.userDataSyncEnablementService.canToggleEnablement()) {
                        const account = that.userDataSyncWorkbenchService.current;
                        items.push({ id: turnOffSyncCommand.id, label: `${SYNC_TITLE.value}: ${turnOffSyncCommand.title.original}`, description: account ? `${account.accountName} (${that.authenticationService.getProvider(account.authenticationProviderId).label})` : undefined });
                    }
                    quickPick.items = items;
                    disposables.add(quickPick.onDidAccept(() => {
                        if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
                            commandService.executeCommand(quickPick.selectedItems[0].id);
                        }
                        quickPick.hide();
                    }));
                    disposables.add(quickPick.onDidHide(() => {
                        disposables.dispose();
                        c();
                    }));
                    quickPick.show();
                });
            }
        }));
    }
    registerEnableSyncViewsAction() {
        const that = this;
        const when = ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo("available" /* AccountStatus.Available */), CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */));
        this._register(registerAction2(class SyncStatusAction extends Action2 {
            constructor() {
                super({
                    id: showSyncedDataCommand.id,
                    title: showSyncedDataCommand.title,
                    category: SYNC_TITLE,
                    precondition: when,
                    menu: {
                        id: MenuId.CommandPalette,
                        when
                    }
                });
            }
            run(accessor) {
                return that.userDataSyncWorkbenchService.showSyncActivity();
            }
        }));
    }
    registerSyncNowAction() {
        const that = this;
        this._register(registerAction2(class SyncNowAction extends Action2 {
            constructor() {
                super({
                    id: syncNowCommand.id,
                    title: syncNowCommand.title,
                    category: SYNC_TITLE,
                    menu: {
                        id: MenuId.CommandPalette,
                        when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo("available" /* AccountStatus.Available */), CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */))
                    }
                });
            }
            run(accessor) {
                return that.userDataSyncWorkbenchService.syncNow();
            }
        }));
    }
    registerTurnOffSyncAction() {
        const that = this;
        this._register(registerAction2(class StopSyncAction extends Action2 {
            constructor() {
                super({
                    id: turnOffSyncCommand.id,
                    title: turnOffSyncCommand.title,
                    category: SYNC_TITLE,
                    menu: {
                        id: MenuId.CommandPalette,
                        when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_SYNC_ENABLEMENT),
                    },
                });
            }
            async run() {
                try {
                    await that.turnOff();
                }
                catch (e) {
                    if (!isCancellationError(e)) {
                        that.notificationService.error(localize('turn off failed', "Error while turning off Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
                    }
                }
            }
        }));
    }
    registerConfigureSyncAction() {
        const that = this;
        const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_SYNC_ENABLEMENT);
        this._register(registerAction2(class ConfigureSyncAction extends Action2 {
            constructor() {
                super({
                    id: configureSyncCommand.id,
                    title: configureSyncCommand.title,
                    category: SYNC_TITLE,
                    icon: Codicon.settingsGear,
                    tooltip: localize('configure', "Configure..."),
                    menu: [{
                            id: MenuId.CommandPalette,
                            when
                        }, {
                            id: MenuId.ViewContainerTitle,
                            when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID)),
                            group: 'navigation',
                            order: 2
                        }]
                });
            }
            run() { return that.configureSyncOptions(); }
        }));
    }
    registerShowLogAction() {
        const that = this;
        this._register(registerAction2(class ShowSyncActivityAction extends Action2 {
            constructor() {
                super({
                    id: SHOW_SYNC_LOG_COMMAND_ID,
                    title: localize('show sync log title', "{0}: Show Log", SYNC_TITLE.value),
                    tooltip: localize('show sync log toolrip', "Show Log"),
                    icon: Codicon.output,
                    menu: [{
                            id: MenuId.CommandPalette,
                            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */)),
                        }, {
                            id: MenuId.ViewContainerTitle,
                            when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
                            group: 'navigation',
                            order: 1
                        }],
                });
            }
            run() { return that.showSyncActivity(); }
        }));
    }
    registerShowSettingsAction() {
        this._register(registerAction2(class ShowSyncSettingsAction extends Action2 {
            constructor() {
                super({
                    id: showSyncSettingsCommand.id,
                    title: showSyncSettingsCommand.title,
                    category: SYNC_TITLE,
                    menu: {
                        id: MenuId.CommandPalette,
                        when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */)),
                    },
                });
            }
            run(accessor) {
                accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: '@tag:sync' });
            }
        }));
    }
    registerHelpAction() {
        const that = this;
        this._register(registerAction2(class HelpAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userDataSync.actions.help',
                    title: SYNC_TITLE,
                    category: Categories.Help,
                    menu: [{
                            id: MenuId.CommandPalette,
                            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */)),
                        }],
                });
            }
            run() { return that.openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help')); }
        }));
        MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
            command: {
                id: 'workbench.userDataSync.actions.help',
                title: Categories.Help.value
            },
            when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
            group: '1_help',
        });
    }
    registerAcceptMergesAction() {
        const that = this;
        this._register(registerAction2(class AcceptMergesAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.userDataSync.actions.acceptMerges',
                    title: localize('complete merges title', "Complete Merge"),
                    menu: [{
                            id: MenuId.EditorContent,
                            when: ContextKeyExpr.and(ctxIsMergeResultEditor, ContextKeyExpr.regex(ctxMergeBaseUri.key, new RegExp(`^${USER_DATA_SYNC_SCHEME}:`))),
                        }],
                });
            }
            async run(accessor, previewResource) {
                const textFileService = accessor.get(ITextFileService);
                await textFileService.save(previewResource);
                const content = await textFileService.read(previewResource);
                await that.userDataSyncService.accept(this.getSyncResource(previewResource), previewResource, content.value, true);
            }
            getSyncResource(previewResource) {
                const conflict = that.userDataSyncService.conflicts.find(({ conflicts }) => conflicts.some(conflict => isEqual(conflict.previewResource, previewResource)));
                if (conflict) {
                    return conflict;
                }
                throw new Error(`Unknown resource: ${previewResource.toString()}`);
            }
        }));
    }
    registerDownloadSyncActivityAction() {
        this._register(registerAction2(class DownloadSyncActivityAction extends Action2 {
            constructor() {
                super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
            }
            async run(accessor) {
                const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
                const notificationService = accessor.get(INotificationService);
                const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
                if (folder) {
                    notificationService.info(localize('download sync activity complete', "Successfully downloaded Settings Sync activity."));
                }
            }
        }));
    }
    registerViews() {
        const container = this.registerViewContainer();
        this.registerDataViews(container);
    }
    registerViewContainer() {
        return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer({
            id: SYNC_VIEW_CONTAINER_ID,
            title: SYNC_TITLE,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SYNC_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            icon: SYNC_VIEW_ICON,
            hideIfEmpty: true,
        }, 0 /* ViewContainerLocation.Sidebar */);
    }
    registerResetSyncDataAction() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.actions.syncData.reset',
                    title: localize('workbench.actions.syncData.reset', "Clear Data in Cloud..."),
                    menu: [{
                            id: MenuId.ViewContainerTitle,
                            when: ContextKeyExpr.equals('viewContainer', SYNC_VIEW_CONTAINER_ID),
                            group: '0_configure',
                        }],
                });
            }
            run() { return that.userDataSyncWorkbenchService.resetSyncedData(); }
        }));
    }
    registerDataViews(container) {
        this._register(this.instantiationService.createInstance(UserDataSyncDataViews, container));
    }
};
UserDataSyncWorkbenchContribution = __decorate([
    __param(0, IUserDataSyncEnablementService),
    __param(1, IUserDataSyncService),
    __param(2, IUserDataSyncWorkbenchService),
    __param(3, IContextKeyService),
    __param(4, IActivityService),
    __param(5, INotificationService),
    __param(6, IEditorService),
    __param(7, IUserDataProfileService),
    __param(8, IDialogService),
    __param(9, IQuickInputService),
    __param(10, IInstantiationService),
    __param(11, IOutputService),
    __param(12, IUserDataAutoSyncService),
    __param(13, ITextModelService),
    __param(14, IPreferencesService),
    __param(15, ITelemetryService),
    __param(16, IProductService),
    __param(17, IOpenerService),
    __param(18, IAuthenticationService),
    __param(19, IUserDataSyncStoreManagementService),
    __param(20, IHostService),
    __param(21, ICommandService),
    __param(22, IWorkbenchIssueService)
], UserDataSyncWorkbenchContribution);
export { UserDataSyncWorkbenchContribution };
let UserDataRemoteContentProvider = class UserDataRemoteContentProvider {
    constructor(userDataSyncService, modelService, languageService) {
        this.userDataSyncService = userDataSyncService;
        this.modelService = modelService;
        this.languageService = languageService;
    }
    provideTextContent(uri) {
        if (uri.scheme === USER_DATA_SYNC_SCHEME) {
            return this.userDataSyncService.resolveContent(uri).then(content => this.modelService.createModel(content || '', this.languageService.createById('jsonc'), uri));
        }
        return null;
    }
};
UserDataRemoteContentProvider = __decorate([
    __param(0, IUserDataSyncService),
    __param(1, IModelService),
    __param(2, ILanguageService)
], UserDataRemoteContentProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXNlckRhdGFTeW5jL2Jyb3dzZXIvdXNlckRhdGFTeW5jLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHckQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBNkIsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxSixP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