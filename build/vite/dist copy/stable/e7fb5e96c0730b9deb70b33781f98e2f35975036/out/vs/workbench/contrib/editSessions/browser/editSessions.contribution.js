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
var EditSessionsContribution_1;
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { IEditSessionsStorageService, ChangeType, FileType, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_CONTAINER_ID, EditSessionSchemaVersion, IEditSessionsLogService, EDIT_SESSIONS_VIEW_ICON, EDIT_SESSIONS_TITLE, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_DATA_VIEW_ID, decodeEditSessionFileContent, hashedEditSessionId, editSessionsLogId, EDIT_SESSIONS_PENDING } from '../common/editSessions.js';
import { ISCMService } from '../../scm/common/scm.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { basename, joinPath, relativePath } from '../../../../base/common/resources.js';
import { encodeBase64 } from '../../../../base/common/buffer.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { EditSessionsWorkbenchService } from './editSessionsStorageService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { UserDataSyncStoreError } from '../../../../platform/userDataSync/common/userDataSync.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { getFileNamesMessage, IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getVirtualWorkspaceLocation } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { Schemas } from '../../../../base/common/network.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { EditSessionsLogService } from '../common/editSessionsLogService.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditSessionsDataViews } from './editSessionsViews.js';
import { EditSessionsFileSystemProvider } from './editSessionsFileSystemProvider.js';
import { isNative, isWeb } from '../../../../base/common/platform.js';
import { VirtualWorkspaceContext, WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { equals } from '../../../../base/common/objects.js';
import { EditSessionIdentityMatch, IEditSessionIdentityService } from '../../../../platform/workspace/common/editSessions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { WorkspaceStateSynchroniser } from '../common/workspaceStateSync.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { EditSessionsStoreClient } from '../common/editSessionsStorageClient.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceIdentityService } from '../../../services/workspaces/common/workspaceIdentityService.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { ResourceSet } from '../../../../base/common/map.js';
registerSingleton(IEditSessionsLogService, EditSessionsLogService, 1 /* InstantiationType.Delayed */);
registerSingleton(IEditSessionsStorageService, EditSessionsWorkbenchService, 1 /* InstantiationType.Delayed */);
const continueWorkingOnCommand = {
    id: '_workbench.editSessions.actions.continueEditSession',
    title: localize2('continue working on', 'Continue Working On...'),
    precondition: WorkspaceFolderCountContext.notEqualsTo('0'),
    f1: true
};
const openLocalFolderCommand = {
    id: '_workbench.editSessions.actions.continueEditSession.openLocalFolder',
    title: localize2('continue edit session in local folder', 'Open In Local Folder'),
    category: EDIT_SESSION_SYNC_CATEGORY,
    precondition: ContextKeyExpr.and(IsWebContext.toNegated(), VirtualWorkspaceContext)
};
const showOutputChannelCommand = {
    id: 'workbench.editSessions.actions.showOutputChannel',
    title: localize2('show log', "Show Log"),
    category: EDIT_SESSION_SYNC_CATEGORY
};
const installAdditionalContinueOnOptionsCommand = {
    id: 'workbench.action.continueOn.extensions',
    title: localize('continueOn.installAdditional', 'Install additional development environment options'),
};
registerAction2(class extends Action2 {
    constructor() {
        super({ ...installAdditionalContinueOnOptionsCommand, f1: false });
    }
    async run(accessor) {
        return accessor.get(IExtensionsWorkbenchService).openSearch('@tag:continueOn');
    }
});
const resumeProgressOptionsTitle = `[${localize('resuming working changes window', 'Resuming working changes...')}](command:${showOutputChannelCommand.id})`;
const resumeProgressOptions = {
    location: 10 /* ProgressLocation.Window */,
    type: 'syncing',
};
const queryParamName = 'editSessionId';
const useEditSessionsWithContinueOn = 'workbench.editSessions.continueOn';
let EditSessionsContribution = class EditSessionsContribution extends Disposable {
    static { EditSessionsContribution_1 = this; }
    static { this.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY = 'applicationLaunchedViaContinueOn'; }
    constructor(editSessionsStorageService, fileService, progressService, openerService, telemetryService, scmService, notificationService, dialogService, logService, environmentService, instantiationService, productService, configurationService, contextService, editSessionIdentityService, quickInputService, commandService, contextKeyService, fileDialogService, lifecycleService, storageService, activityService, editorService, remoteAgentService, extensionService, requestService, userDataProfilesService, uriIdentityService, workspaceIdentityService) {
        super();
        this.editSessionsStorageService = editSessionsStorageService;
        this.fileService = fileService;
        this.progressService = progressService;
        this.openerService = openerService;
        this.telemetryService = telemetryService;
        this.scmService = scmService;
        this.notificationService = notificationService;
        this.dialogService = dialogService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.instantiationService = instantiationService;
        this.productService = productService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.editSessionIdentityService = editSessionIdentityService;
        this.quickInputService = quickInputService;
        this.commandService = commandService;
        this.contextKeyService = contextKeyService;
        this.fileDialogService = fileDialogService;
        this.lifecycleService = lifecycleService;
        this.storageService = storageService;
        this.activityService = activityService;
        this.editorService = editorService;
        this.remoteAgentService = remoteAgentService;
        this.extensionService = extensionService;
        this.requestService = requestService;
        this.userDataProfilesService = userDataProfilesService;
        this.uriIdentityService = uriIdentityService;
        this.workspaceIdentityService = workspaceIdentityService;
        this.continueEditSessionOptions = [];
        this.accountsMenuBadgeDisposable = this._register(new MutableDisposable());
        this.registeredCommands = new Set();
        this.shouldShowViewsContext = EDIT_SESSIONS_SHOW_VIEW.bindTo(this.contextKeyService);
        this.pendingEditSessionsContext = EDIT_SESSIONS_PENDING.bindTo(this.contextKeyService);
        this.pendingEditSessionsContext.set(false);
        if (!this.productService['editSessions.store']?.url) {
            return;
        }
        this.editSessionsStorageClient = new EditSessionsStoreClient(URI.parse(this.productService['editSessions.store'].url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
        this.editSessionsStorageService.storeClient = this.editSessionsStorageClient;
        this.workspaceStateSynchronizer = new WorkspaceStateSynchroniser(this.userDataProfilesService.defaultProfile, undefined, this.editSessionsStorageClient, this.logService, this.fileService, this.environmentService, this.telemetryService, this.configurationService, this.storageService, this.uriIdentityService, this.workspaceIdentityService, this.editSessionsStorageService);
        this.autoResumeEditSession();
        this.registerActions();
        this.registerViews();
        this.registerContributedEditSessionOptions();
        this._register(this.fileService.registerProvider(EditSessionsFileSystemProvider.SCHEMA, new EditSessionsFileSystemProvider(this.editSessionsStorageService)));
        this._register(this.lifecycleService.onWillShutdown((e) => {
            if (e.reason !== 3 /* ShutdownReason.RELOAD */ && this.editSessionsStorageService.isSignedIn && this.configurationService.getValue('workbench.experimental.cloudChanges.autoStore') === 'onShutdown' && !isWeb) {
                e.join(this.autoStoreEditSession(), { id: 'autoStoreWorkingChanges', label: localize('autoStoreWorkingChanges', 'Storing current working changes...') });
            }
        }));
        this._register(this.editSessionsStorageService.onDidSignIn(() => this.updateAccountsMenuBadge()));
        this._register(this.editSessionsStorageService.onDidSignOut(() => this.updateAccountsMenuBadge()));
    }
    async autoResumeEditSession() {
        const shouldAutoResumeOnReload = this.configurationService.getValue('workbench.cloudChanges.autoResume') === 'onReload';
        if (this.environmentService.editSessionId !== undefined) {
            this.logService.info(`Resuming cloud changes, reason: found editSessionId ${this.environmentService.editSessionId} in environment service...`);
            await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(this.environmentService.editSessionId, undefined, undefined, undefined, progress).finally(() => this.environmentService.editSessionId = undefined));
        }
        else if (shouldAutoResumeOnReload && this.editSessionsStorageService.isSignedIn) {
            this.logService.info('Resuming cloud changes, reason: cloud changes enabled...');
            // Attempt to resume edit session based on edit workspace identifier
            // Note: at this point if the user is not signed into edit sessions,
            // we don't want them to be prompted to sign in and should just return early
            await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
        }
        else if (shouldAutoResumeOnReload) {
            // The application has previously launched via a protocol URL Continue On flow
            const hasApplicationLaunchedFromContinueOnFlow = this.storageService.getBoolean(EditSessionsContribution_1.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, false);
            this.logService.info(`Prompting to enable cloud changes, has application previously launched from Continue On flow: ${hasApplicationLaunchedFromContinueOnFlow}`);
            const handlePendingEditSessions = () => {
                // display a badge in the accounts menu but do not prompt the user to sign in again
                this.logService.info('Showing badge to enable cloud changes in accounts menu...');
                this.updateAccountsMenuBadge();
                this.pendingEditSessionsContext.set(true);
                // attempt a resume if we are in a pending state and the user just signed in
                const disposable = this.editSessionsStorageService.onDidSignIn(async () => {
                    disposable.dispose();
                    this.logService.info('Showing badge to enable cloud changes in accounts menu succeeded, resuming cloud changes...');
                    await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
                    this.storageService.remove(EditSessionsContribution_1.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
                    this.environmentService.continueOn = undefined;
                });
            };
            if ((this.environmentService.continueOn !== undefined) &&
                !this.editSessionsStorageService.isSignedIn &&
                // and user has not yet been prompted to sign in on this machine
                hasApplicationLaunchedFromContinueOnFlow === false) {
                // store the fact that we prompted the user
                this.storageService.store(EditSessionsContribution_1.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                this.logService.info('Prompting to enable cloud changes...');
                await this.editSessionsStorageService.initialize('read');
                if (this.editSessionsStorageService.isSignedIn) {
                    this.logService.info('Prompting to enable cloud changes succeeded, resuming cloud changes...');
                    await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(undefined, true, undefined, undefined, progress));
                }
                else {
                    handlePendingEditSessions();
                }
            }
            else if (!this.editSessionsStorageService.isSignedIn &&
                // and user has been prompted to sign in on this machine
                hasApplicationLaunchedFromContinueOnFlow === true) {
                handlePendingEditSessions();
            }
        }
        else {
            this.logService.debug('Auto resuming cloud changes disabled.');
        }
    }
    updateAccountsMenuBadge() {
        if (this.editSessionsStorageService.isSignedIn) {
            return this.accountsMenuBadgeDisposable.clear();
        }
        const badge = new NumberBadge(1, () => localize('check for pending cloud changes', 'Check for pending cloud changes'));
        this.accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
    }
    async autoStoreEditSession() {
        const cancellationTokenSource = new CancellationTokenSource();
        await this.progressService.withProgress({
            location: 10 /* ProgressLocation.Window */,
            type: 'syncing',
            title: localize('store working changes', 'Storing working changes...')
        }, async () => this.storeEditSession(false, cancellationTokenSource.token), () => {
            cancellationTokenSource.cancel();
            cancellationTokenSource.dispose();
        });
    }
    registerViews() {
        const container = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
            id: EDIT_SESSIONS_CONTAINER_ID,
            title: EDIT_SESSIONS_TITLE,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [EDIT_SESSIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            icon: EDIT_SESSIONS_VIEW_ICON,
            hideIfEmpty: true
        }, 0 /* ViewContainerLocation.Sidebar */, { doNotRegisterOpenCommand: true });
        this._register(this.instantiationService.createInstance(EditSessionsDataViews, container));
    }
    registerActions() {
        this.registerContinueEditSessionAction();
        this.registerResumeLatestEditSessionAction();
        this.registerStoreLatestEditSessionAction();
        this.registerContinueInLocalFolderAction();
        this.registerShowEditSessionViewAction();
        this.registerShowEditSessionOutputChannelAction();
    }
    registerShowEditSessionOutputChannelAction() {
        this._register(registerAction2(class ShowEditSessionOutput extends Action2 {
            constructor() {
                super(showOutputChannelCommand);
            }
            run(accessor, ...args) {
                const outputChannel = accessor.get(IOutputService);
                void outputChannel.showChannel(editSessionsLogId);
            }
        }));
    }
    registerShowEditSessionViewAction() {
        const that = this;
        this._register(registerAction2(class ShowEditSessionView extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.showEditSessions',
                    title: localize2('show cloud changes', 'Show Cloud Changes'),
                    category: EDIT_SESSION_SYNC_CATEGORY,
                    f1: true
                });
            }
            async run(accessor) {
                that.shouldShowViewsContext.set(true);
                const viewsService = accessor.get(IViewsService);
                await viewsService.openView(EDIT_SESSIONS_DATA_VIEW_ID);
            }
        }));
    }
    registerContinueEditSessionAction() {
        const that = this;
        this._register(registerAction2(class ContinueEditSessionAction extends Action2 {
            constructor() {
                super(continueWorkingOnCommand);
            }
            async run(accessor, workspaceUri, destination) {
                // First ask the user to pick a destination, if necessary
                let uri = workspaceUri;
                if (!destination && !uri) {
                    destination = await that.pickContinueEditSessionDestination();
                    if (!destination) {
                        that.telemetryService.publicLog2('continueOn.editSessions.pick.outcome', { outcome: 'noSelection' });
                        return;
                    }
                }
                // Determine if we need to store an edit session, asking for edit session auth if necessary
                const shouldStoreEditSession = await that.shouldContinueOnWithEditSession();
                // Run the store action to get back a ref
                let ref;
                if (shouldStoreEditSession) {
                    that.telemetryService.publicLog2('continueOn.editSessions.store');
                    const cancellationTokenSource = new CancellationTokenSource();
                    try {
                        ref = await that.progressService.withProgress({
                            location: 15 /* ProgressLocation.Notification */,
                            cancellable: true,
                            type: 'syncing',
                            title: localize('store your working changes', 'Storing your working changes...')
                        }, async () => {
                            const ref = await that.storeEditSession(false, cancellationTokenSource.token);
                            if (ref !== undefined) {
                                that.telemetryService.publicLog2('continueOn.editSessions.store.outcome', { outcome: 'storeSucceeded', hashedId: hashedEditSessionId(ref) });
                            }
                            else {
                                that.telemetryService.publicLog2('continueOn.editSessions.store.outcome', { outcome: 'storeSkipped' });
                            }
                            return ref;
                        }, () => {
                            cancellationTokenSource.cancel();
                            cancellationTokenSource.dispose();
                            that.telemetryService.publicLog2('continueOn.editSessions.store.outcome', { outcome: 'storeCancelledByUser' });
                        });
                    }
                    catch (ex) {
                        that.telemetryService.publicLog2('continueOn.editSessions.store.outcome', { outcome: 'storeFailed' });
                        throw ex;
                    }
                }
                // Append the ref to the URI
                uri = destination ? await that.resolveDestination(destination) : uri;
                if (uri === undefined) {
                    return;
                }
                if (ref !== undefined && uri !== 'noDestinationUri') {
                    const encodedRef = encodeURIComponent(ref);
                    uri = uri.with({
                        query: uri.query.length > 0 ? (uri.query + `&${queryParamName}=${encodedRef}&continueOn=1`) : `${queryParamName}=${encodedRef}&continueOn=1`
                    });
                    // Open the URI
                    that.logService.info(`Opening ${uri.toString()}`);
                    await that.openerService.open(uri, { openExternal: true });
                }
                else if ((!shouldStoreEditSession || ref === undefined) && uri !== 'noDestinationUri') {
                    // Open the URI without an edit session ref
                    that.logService.info(`Opening ${uri.toString()}`);
                    await that.openerService.open(uri, { openExternal: true });
                }
                else if (ref === undefined && shouldStoreEditSession) {
                    that.logService.warn(`Failed to store working changes when invoking ${continueWorkingOnCommand.id}.`);
                }
            }
        }));
    }
    registerResumeLatestEditSessionAction() {
        const that = this;
        this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.resumeLatest',
                    title: localize2('resume latest cloud changes', 'Resume Latest Changes from Cloud'),
                    category: EDIT_SESSION_SYNC_CATEGORY,
                    f1: true,
                });
            }
            async run(accessor, editSessionId, forceApplyUnrelatedChange) {
                await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, undefined, forceApplyUnrelatedChange));
            }
        }));
        this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.resumeFromSerializedPayload',
                    title: localize2('resume cloud changes', 'Resume Changes from Serialized Data'),
                    category: 'Developer',
                    f1: true,
                });
            }
            async run(accessor, editSessionId) {
                const data = await that.quickInputService.input({ prompt: 'Enter serialized data' });
                if (data) {
                    that.editSessionsStorageService.lastReadResources.set('editSessions', { content: data, ref: '' });
                }
                await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, undefined, undefined, undefined, undefined, data));
            }
        }));
    }
    registerStoreLatestEditSessionAction() {
        const that = this;
        this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.storeCurrent',
                    title: localize2('store working changes in cloud', 'Store Working Changes in Cloud'),
                    category: EDIT_SESSION_SYNC_CATEGORY,
                    f1: true,
                });
            }
            async run(accessor) {
                const cancellationTokenSource = new CancellationTokenSource();
                await that.progressService.withProgress({
                    location: 15 /* ProgressLocation.Notification */,
                    title: localize('storing working changes', 'Storing working changes...')
                }, async () => {
                    that.telemetryService.publicLog2('editSessions.store');
                    await that.storeEditSession(true, cancellationTokenSource.token);
                }, () => {
                    cancellationTokenSource.cancel();
                    cancellationTokenSource.dispose();
                });
            }
        }));
    }
    async resumeEditSession(ref, silent, forceApplyUnrelatedChange, applyPartialMatch, progress, serializedData) {
        // Wait for the remote environment to become available, if any
        await this.remoteAgentService.getEnvironment();
        // Edit sessions are not currently supported in empty workspaces
        // https://github.com/microsoft/vscode/issues/159220
        if (this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return;
        }
        this.logService.info(ref !== undefined ? `Resuming changes from cloud with ref ${ref}...` : 'Checking for pending cloud changes...');
        if (silent && !(await this.editSessionsStorageService.initialize('read', true))) {
            return;
        }
        this.telemetryService.publicLog2('editSessions.resume');
        performance.mark('code/willResumeEditSessionFromIdentifier');
        progress?.report({ message: localize('checkingForWorkingChanges', 'Checking for pending cloud changes...') });
        const data = serializedData ? { content: serializedData, ref: '' } : await this.editSessionsStorageService.read('editSessions', ref);
        if (!data) {
            if (ref === undefined && !silent) {
                this.notificationService.info(localize('no cloud changes', 'There are no changes to resume from the cloud.'));
            }
            else if (ref !== undefined) {
                this.notificationService.warn(localize('no cloud changes for ref', 'Could not resume changes from the cloud for ID {0}.', ref));
            }
            this.logService.info(ref !== undefined ? `Aborting resuming changes from cloud as no edit session content is available to be applied from ref ${ref}.` : `Aborting resuming edit session as no edit session content is available to be applied`);
            return;
        }
        progress?.report({ message: resumeProgressOptionsTitle });
        const editSession = JSON.parse(data.content);
        ref = data.ref;
        if (editSession.version > EditSessionSchemaVersion) {
            this.notificationService.error(localize('client too old', "Please upgrade to a newer version of {0} to resume your working changes from the cloud.", this.productService.nameLong));
            this.telemetryService.publicLog2('editSessions.resume.outcome', { hashedId: hashedEditSessionId(ref), outcome: 'clientUpdateNeeded' });
            return;
        }
        try {
            const { changes, conflictingChanges } = await this.generateChanges(editSession, ref, forceApplyUnrelatedChange, applyPartialMatch);
            if (changes.length === 0) {
                return;
            }
            // TODO@joyceerhl Provide the option to diff files which would be overwritten by edit session contents
            if (conflictingChanges.length > 0) {
                // Allow to show edit sessions
                const { confirmed } = await this.dialogService.confirm({
                    type: Severity.Warning,
                    message: conflictingChanges.length > 1 ?
                        localize('resume edit session warning many', 'Resuming your working changes from the cloud will overwrite the following {0} files. Do you want to proceed?', conflictingChanges.length) :
                        localize('resume edit session warning 1', 'Resuming your working changes from the cloud will overwrite {0}. Do you want to proceed?', basename(conflictingChanges[0].uri)),
                    detail: conflictingChanges.length > 1 ? getFileNamesMessage(conflictingChanges.map((c) => c.uri)) : undefined
                });
                if (!confirmed) {
                    return;
                }
            }
            for (const { uri, type, contents } of changes) {
                if (type === ChangeType.Addition) {
                    await this.fileService.writeFile(uri, decodeEditSessionFileContent(editSession.version, contents));
                }
                else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
                    await this.fileService.del(uri);
                }
            }
            await this.workspaceStateSynchronizer?.apply();
            this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
            await this.editSessionsStorageService.delete('editSessions', ref);
            this.logService.info(`Deleted edit session with ref ${ref}.`);
            this.telemetryService.publicLog2('editSessions.resume.outcome', { hashedId: hashedEditSessionId(ref), outcome: 'resumeSucceeded' });
        }
        catch (ex) {
            this.logService.error('Failed to resume edit session, reason: ', ex.toString());
            this.notificationService.error(localize('resume failed', "Failed to resume your working changes from the cloud."));
        }
        performance.mark('code/didResumeEditSessionFromIdentifier');
    }
    async generateChanges(editSession, ref, forceApplyUnrelatedChange = false, applyPartialMatch = false) {
        const changes = [];
        const conflictingChanges = [];
        const workspaceFolders = this.contextService.getWorkspace().folders;
        const cancellationTokenSource = new CancellationTokenSource();
        for (const folder of editSession.folders) {
            let folderRoot;
            if (folder.canonicalIdentity) {
                // Look for an edit session identifier that we can use
                for (const f of workspaceFolders) {
                    const identity = await this.editSessionIdentityService.getEditSessionIdentifier(f, cancellationTokenSource.token);
                    this.logService.info(`Matching identity ${identity} against edit session folder identity ${folder.canonicalIdentity}...`);
                    if (equals(identity, folder.canonicalIdentity) || forceApplyUnrelatedChange) {
                        folderRoot = f;
                        break;
                    }
                    if (identity !== undefined) {
                        const match = await this.editSessionIdentityService.provideEditSessionIdentityMatch(f, identity, folder.canonicalIdentity, cancellationTokenSource.token);
                        if (match === EditSessionIdentityMatch.Complete) {
                            folderRoot = f;
                            break;
                        }
                        else if (match === EditSessionIdentityMatch.Partial &&
                            this.configurationService.getValue('workbench.experimental.cloudChanges.partialMatches.enabled') === true) {
                            if (!applyPartialMatch) {
                                // Surface partially matching edit session
                                this.notificationService.prompt(Severity.Info, localize('editSessionPartialMatch', 'You have pending working changes in the cloud for this workspace. Would you like to resume them?'), [{ label: localize('resume', 'Resume'), run: () => this.resumeEditSession(ref, false, undefined, true) }]);
                            }
                            else {
                                folderRoot = f;
                                break;
                            }
                        }
                    }
                }
            }
            else {
                folderRoot = workspaceFolders.find((f) => f.name === folder.name);
            }
            if (!folderRoot) {
                this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no matching workspace folder was found.`);
                return { changes: [], conflictingChanges: [], contributedStateHandlers: [] };
            }
            const localChanges = new Set();
            for (const repository of this.scmService.repositories) {
                if (repository.provider.rootUri !== undefined &&
                    this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name === folder.name) {
                    const repositoryChanges = this.getChangedResources(repository);
                    repositoryChanges.forEach((change) => localChanges.add(change.toString()));
                }
            }
            for (const change of folder.workingChanges) {
                const uri = joinPath(folderRoot.uri, change.relativeFilePath);
                changes.push({ uri, type: change.type, contents: change.contents });
                if (await this.willChangeLocalContents(localChanges, uri, change)) {
                    conflictingChanges.push({ uri, type: change.type, contents: change.contents });
                }
            }
        }
        return { changes, conflictingChanges };
    }
    async willChangeLocalContents(localChanges, uriWithIncomingChanges, incomingChange) {
        if (!localChanges.has(uriWithIncomingChanges.toString())) {
            return false;
        }
        const { contents, type } = incomingChange;
        switch (type) {
            case (ChangeType.Addition): {
                const [originalContents, incomingContents] = await Promise.all([
                    hashAsync(contents),
                    hashAsync(encodeBase64((await this.fileService.readFile(uriWithIncomingChanges)).value))
                ]);
                return originalContents !== incomingContents;
            }
            case (ChangeType.Deletion): {
                return await this.fileService.exists(uriWithIncomingChanges);
            }
            default:
                throw new Error('Unhandled change type.');
        }
    }
    async storeEditSession(fromStoreCommand, cancellationToken) {
        const folders = [];
        let editSessionSize = 0;
        let hasEdits = false;
        // Save all saveable editors before building edit session contents
        await this.editorService.saveAll();
        // Do a first pass over all repositories to ensure that the edit session identity is created for each.
        // This may change the working changes that need to be stored later
        const createdEditSessionIdentities = new ResourceSet();
        for (const repository of this.scmService.repositories) {
            const changedResources = this.getChangedResources(repository);
            if (!changedResources.size) {
                continue;
            }
            for (const uri of changedResources) {
                const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
                if (!workspaceFolder || createdEditSessionIdentities.has(uri)) {
                    continue;
                }
                createdEditSessionIdentities.add(uri);
                await this.editSessionIdentityService.onWillCreateEditSessionIdentity(workspaceFolder, cancellationToken);
            }
        }
        for (const repository of this.scmService.repositories) {
            // Look through all resource groups and compute which files were added/modified/deleted
            const trackedUris = this.getChangedResources(repository); // A URI might appear in more than one resource group
            const workingChanges = [];
            const { rootUri } = repository.provider;
            const workspaceFolder = rootUri ? this.contextService.getWorkspaceFolder(rootUri) : undefined;
            let name = workspaceFolder?.name;
            for (const uri of trackedUris) {
                const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
                if (!workspaceFolder) {
                    this.logService.info(`Skipping working change ${uri.toString()} as no associated workspace folder was found.`);
                    continue;
                }
                name = name ?? workspaceFolder.name;
                const relativeFilePath = relativePath(workspaceFolder.uri, uri) ?? uri.path;
                // Only deal with file contents for now
                try {
                    if (!(await this.fileService.stat(uri)).isFile) {
                        continue;
                    }
                }
                catch { }
                hasEdits = true;
                if (await this.fileService.exists(uri)) {
                    const contents = encodeBase64((await this.fileService.readFile(uri)).value);
                    editSessionSize += contents.length;
                    if (editSessionSize > this.editSessionsStorageService.SIZE_LIMIT) {
                        this.notificationService.error(localize('payload too large', 'Your working changes exceed the size limit and cannot be stored.'));
                        return undefined;
                    }
                    workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents: contents, relativeFilePath: relativeFilePath });
                }
                else {
                    // Assume it's a deletion
                    workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: undefined, relativeFilePath: relativeFilePath });
                }
            }
            let canonicalIdentity = undefined;
            if (workspaceFolder !== null && workspaceFolder !== undefined) {
                canonicalIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
            }
            // TODO@joyceerhl debt: don't store working changes as a child of the folder
            folders.push({ workingChanges, name: name ?? '', canonicalIdentity: canonicalIdentity ?? undefined, absoluteUri: workspaceFolder?.uri.toString() });
        }
        // Store contributed workspace state
        await this.workspaceStateSynchronizer?.sync();
        if (!hasEdits) {
            this.logService.info('Skipped storing working changes in the cloud as there are no edits to store.');
            if (fromStoreCommand) {
                this.notificationService.info(localize('no working changes to store', 'Skipped storing working changes in the cloud as there are no edits to store.'));
            }
            return undefined;
        }
        const data = { folders, version: 2, workspaceStateId: this.editSessionsStorageService.lastWrittenResources.get('workspaceState')?.ref };
        try {
            this.logService.info(`Storing edit session...`);
            const ref = await this.editSessionsStorageService.write('editSessions', data);
            this.logService.info(`Stored edit session with ref ${ref}.`);
            return ref;
        }
        catch (ex) {
            this.logService.error(`Failed to store edit session, reason: `, ex.toString());
            if (ex instanceof UserDataSyncStoreError) {
                switch (ex.code) {
                    case "TooLarge" /* UserDataSyncErrorCode.TooLarge */:
                        // Uploading a payload can fail due to server size limits
                        this.telemetryService.publicLog2('editSessions.upload.failed', { reason: 'TooLarge' });
                        this.notificationService.error(localize('payload too large', 'Your working changes exceed the size limit and cannot be stored.'));
                        break;
                    default:
                        this.telemetryService.publicLog2('editSessions.upload.failed', { reason: 'unknown' });
                        this.notificationService.error(localize('payload failed', 'Your working changes cannot be stored.'));
                        break;
                }
            }
        }
        return undefined;
    }
    getChangedResources(repository) {
        return repository.provider.groups.reduce((resources, resourceGroups) => {
            resourceGroups.resources.forEach((resource) => resources.add(resource.sourceUri));
            return resources;
        }, new Set()); // A URI might appear in more than one resource group
    }
    hasEditSession() {
        for (const repository of this.scmService.repositories) {
            if (this.getChangedResources(repository).size > 0) {
                return true;
            }
        }
        return false;
    }
    async shouldContinueOnWithEditSession() {
        // If the user is already signed in, we should store edit session
        if (this.editSessionsStorageService.isSignedIn) {
            return this.hasEditSession();
        }
        // If the user has been asked before and said no, don't use edit sessions
        if (this.configurationService.getValue(useEditSessionsWithContinueOn) === 'off') {
            this.telemetryService.publicLog2('continueOn.editSessions.canStore.outcome', { outcome: 'disabledEditSessionsViaSetting' });
            return false;
        }
        // Prompt the user to use edit sessions if they currently could benefit from using it
        if (this.hasEditSession()) {
            const disposables = new DisposableStore();
            const quickpick = disposables.add(this.quickInputService.createQuickPick());
            quickpick.placeholder = localize('continue with cloud changes', "Select whether to bring your working changes with you");
            quickpick.ok = false;
            quickpick.ignoreFocusOut = true;
            const withCloudChanges = { label: localize('with cloud changes', "Yes, continue with my working changes") };
            const withoutCloudChanges = { label: localize('without cloud changes', "No, continue without my working changes") };
            quickpick.items = [withCloudChanges, withoutCloudChanges];
            const continueWithCloudChanges = await new Promise((resolve, reject) => {
                disposables.add(quickpick.onDidAccept(() => {
                    resolve(quickpick.selectedItems[0] === withCloudChanges);
                    disposables.dispose();
                }));
                disposables.add(quickpick.onDidHide(() => {
                    reject(new CancellationError());
                    disposables.dispose();
                }));
                quickpick.show();
            });
            if (!continueWithCloudChanges) {
                this.telemetryService.publicLog2('continueOn.editSessions.canStore.outcome', { outcome: 'didNotEnableEditSessionsWhenPrompted' });
                return continueWithCloudChanges;
            }
            const initialized = await this.editSessionsStorageService.initialize('write');
            if (!initialized) {
                this.telemetryService.publicLog2('continueOn.editSessions.canStore.outcome', { outcome: 'didNotEnableEditSessionsWhenPrompted' });
            }
            return initialized;
        }
        return false;
    }
    //#region Continue Edit Session extension contribution point
    registerContributedEditSessionOptions() {
        continueEditSessionExtPoint.setHandler(extensions => {
            const continueEditSessionOptions = [];
            for (const extension of extensions) {
                if (!isProposedApiEnabled(extension.description, 'contribEditSessions')) {
                    continue;
                }
                if (!Array.isArray(extension.value)) {
                    continue;
                }
                for (const contribution of extension.value) {
                    const command = MenuRegistry.getCommand(contribution.command);
                    if (!command) {
                        return;
                    }
                    const icon = command.icon;
                    const title = typeof command.title === 'string' ? command.title : command.title.value;
                    const when = ContextKeyExpr.deserialize(contribution.when);
                    continueEditSessionOptions.push(new ContinueEditSessionItem(ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title, command.id, command.source?.title, when, contribution.documentation));
                    if (contribution.qualifiedName) {
                        this.generateStandaloneOptionCommand(command.id, contribution.qualifiedName, contribution.category ?? command.category, when, contribution.remoteGroup);
                    }
                }
            }
            this.continueEditSessionOptions = continueEditSessionOptions;
        });
    }
    generateStandaloneOptionCommand(commandId, qualifiedName, category, when, remoteGroup) {
        const command = {
            id: `${continueWorkingOnCommand.id}.${commandId}`,
            title: { original: qualifiedName, value: qualifiedName },
            category: typeof category === 'string' ? { original: category, value: category } : category,
            precondition: when,
            f1: true
        };
        if (!this.registeredCommands.has(command.id)) {
            this.registeredCommands.add(command.id);
            this._register(registerAction2(class StandaloneContinueOnOption extends Action2 {
                constructor() {
                    super(command);
                }
                async run(accessor) {
                    return accessor.get(ICommandService).executeCommand(continueWorkingOnCommand.id, undefined, commandId);
                }
            }));
            if (remoteGroup !== undefined) {
                MenuRegistry.appendMenuItem(MenuId.StatusBarRemoteIndicatorMenu, {
                    group: remoteGroup,
                    command: command,
                    when: command.precondition
                });
            }
        }
    }
    registerContinueInLocalFolderAction() {
        const that = this;
        this._register(registerAction2(class ContinueInLocalFolderAction extends Action2 {
            constructor() {
                super(openLocalFolderCommand);
            }
            async run(accessor) {
                const selection = await that.fileDialogService.showOpenDialog({
                    title: localize('continueEditSession.openLocalFolder.title.v2', 'Select a local folder to continue working in'),
                    canSelectFolders: true,
                    canSelectMany: false,
                    canSelectFiles: false,
                    availableFileSystems: [Schemas.file]
                });
                return selection?.length !== 1 ? undefined : URI.from({
                    scheme: that.productService.urlProtocol,
                    authority: Schemas.file,
                    path: selection[0].path
                });
            }
        }));
        if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined && isNative) {
            this.generateStandaloneOptionCommand(openLocalFolderCommand.id, localize('continueWorkingOn.existingLocalFolder', 'Continue Working in Existing Local Folder'), undefined, openLocalFolderCommand.precondition, undefined);
        }
    }
    async pickContinueEditSessionDestination() {
        const disposables = new DisposableStore();
        const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        const workspaceContext = this.contextService.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */
            ? this.contextService.getWorkspace().folders[0].name
            : this.contextService.getWorkspace().folders.map((folder) => folder.name).join(', ');
        quickPick.placeholder = localize('continueEditSessionPick.title.v2', "Select a development environment to continue working on {0} in", `'${workspaceContext}'`);
        quickPick.items = this.createPickItems();
        disposables.add(this.extensionService.onDidChangeExtensions(() => {
            quickPick.items = this.createPickItems();
        }));
        const command = await new Promise((resolve, reject) => {
            disposables.add(quickPick.onDidHide(() => {
                disposables.dispose();
                resolve(undefined);
            }));
            disposables.add(quickPick.onDidAccept((e) => {
                const selection = quickPick.activeItems[0].command;
                if (selection === installAdditionalContinueOnOptionsCommand.id) {
                    void this.commandService.executeCommand(installAdditionalContinueOnOptionsCommand.id);
                }
                else {
                    resolve(selection);
                    quickPick.hide();
                }
            }));
            quickPick.show();
            disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
                if (e.item.documentation !== undefined) {
                    const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this.commandService.executeCommand(e.item.documentation);
                    if (uri) {
                        void this.openerService.open(uri, { openExternal: true });
                    }
                }
            }));
        });
        quickPick.dispose();
        return command;
    }
    async resolveDestination(command) {
        try {
            const uri = await this.commandService.executeCommand(command);
            // Some continue on commands do not return a URI
            // to support extensions which want to be in control
            // of how the destination is opened
            if (uri === undefined) {
                this.telemetryService.publicLog2('continueOn.openDestination.outcome', { selection: command, outcome: 'noDestinationUri' });
                return 'noDestinationUri';
            }
            if (URI.isUri(uri)) {
                this.telemetryService.publicLog2('continueOn.openDestination.outcome', { selection: command, outcome: 'resolvedUri' });
                return uri;
            }
            this.telemetryService.publicLog2('continueOn.openDestination.outcome', { selection: command, outcome: 'invalidDestination' });
            return undefined;
        }
        catch (ex) {
            if (ex instanceof CancellationError) {
                this.telemetryService.publicLog2('continueOn.openDestination.outcome', { selection: command, outcome: 'cancelled' });
            }
            else {
                this.telemetryService.publicLog2('continueOn.openDestination.outcome', { selection: command, outcome: 'unknownError' });
            }
            return undefined;
        }
    }
    createPickItems() {
        const items = [...this.continueEditSessionOptions].filter((option) => option.when === undefined || this.contextKeyService.contextMatchesRules(option.when));
        if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== undefined && isNative) {
            items.push(new ContinueEditSessionItem('$(folder) ' + localize('continueEditSessionItem.openInLocalFolder.v2', 'Open in Local Folder'), openLocalFolderCommand.id, localize('continueEditSessionItem.builtin', 'Built-in')));
        }
        const sortedItems = items.sort((item1, item2) => item1.label.localeCompare(item2.label));
        return sortedItems.concat({ type: 'separator' }, new ContinueEditSessionItem(installAdditionalContinueOnOptionsCommand.title, installAdditionalContinueOnOptionsCommand.id));
    }
};
EditSessionsContribution = EditSessionsContribution_1 = __decorate([
    __param(0, IEditSessionsStorageService),
    __param(1, IFileService),
    __param(2, IProgressService),
    __param(3, IOpenerService),
    __param(4, ITelemetryService),
    __param(5, ISCMService),
    __param(6, INotificationService),
    __param(7, IDialogService),
    __param(8, IEditSessionsLogService),
    __param(9, IEnvironmentService),
    __param(10, IInstantiationService),
    __param(11, IProductService),
    __param(12, IConfigurationService),
    __param(13, IWorkspaceContextService),
    __param(14, IEditSessionIdentityService),
    __param(15, IQuickInputService),
    __param(16, ICommandService),
    __param(17, IContextKeyService),
    __param(18, IFileDialogService),
    __param(19, ILifecycleService),
    __param(20, IStorageService),
    __param(21, IActivityService),
    __param(22, IEditorService),
    __param(23, IRemoteAgentService),
    __param(24, IExtensionService),
    __param(25, IRequestService),
    __param(26, IUserDataProfilesService),
    __param(27, IUriIdentityService),
    __param(28, IWorkspaceIdentityService)
], EditSessionsContribution);
export { EditSessionsContribution };
const infoButtonClass = ThemeIcon.asClassName(Codicon.info);
class ContinueEditSessionItem {
    constructor(label, command, description, when, documentation) {
        this.label = label;
        this.command = command;
        this.description = description;
        this.when = when;
        this.documentation = documentation;
        if (documentation !== undefined) {
            this.buttons = [{
                    iconClass: infoButtonClass,
                    tooltip: localize('learnMoreTooltip', 'Learn More'),
                }];
        }
    }
}
const continueEditSessionExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'continueEditSession',
    jsonSchema: {
        description: localize('continueEditSessionExtPoint', 'Contributes options for continuing the current edit session in a different environment'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                command: {
                    description: localize('continueEditSessionExtPoint.command', 'Identifier of the command to execute. The command must be declared in the \'commands\'-section and return a URI representing a different environment where the current edit session can be continued.'),
                    type: 'string'
                },
                group: {
                    description: localize('continueEditSessionExtPoint.group', 'Group into which this item belongs.'),
                    type: 'string'
                },
                qualifiedName: {
                    description: localize('continueEditSessionExtPoint.qualifiedName', 'A fully qualified name for this item which is used for display in menus.'),
                    type: 'string'
                },
                description: {
                    description: localize('continueEditSessionExtPoint.description', "The url, or a command that returns the url, to the option's documentation page."),
                    type: 'string'
                },
                remoteGroup: {
                    description: localize('continueEditSessionExtPoint.remoteGroup', 'Group into which this item belongs in the remote indicator.'),
                    type: 'string'
                },
                when: {
                    description: localize('continueEditSessionExtPoint.when', 'Condition which must be true to show this item.'),
                    type: 'string'
                }
            },
            required: ['command']
        }
    }
});
//#endregion
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, 3 /* LifecyclePhase.Restored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...workbenchConfigurationNodeBase,
    'properties': {
        'workbench.experimental.cloudChanges.autoStore': {
            enum: ['onShutdown', 'off'],
            enumDescriptions: [
                localize('autoStoreWorkingChanges.onShutdown', "Automatically store current working changes in the cloud on window close."),
                localize('autoStoreWorkingChanges.off', "Never attempt to automatically store working changes in the cloud.")
            ],
            'type': 'string',
            'tags': ['experimental', 'usesOnlineServices'],
            'default': 'off',
            'markdownDescription': localize('autoStoreWorkingChangesDescription', "Controls whether to automatically store available working changes in the cloud for the current workspace. This setting has no effect in the web."),
        },
        'workbench.cloudChanges.autoResume': {
            enum: ['onReload', 'off'],
            enumDescriptions: [
                localize('autoResumeWorkingChanges.onReload', "Automatically resume available working changes from the cloud on window reload."),
                localize('autoResumeWorkingChanges.off', "Never attempt to resume working changes from the cloud.")
            ],
            'type': 'string',
            'tags': ['usesOnlineServices'],
            'default': 'onReload',
            'markdownDescription': localize('autoResumeWorkingChanges', "Controls whether to automatically resume available working changes stored in the cloud for the current workspace."),
        },
        'workbench.cloudChanges.continueOn': {
            enum: ['prompt', 'off'],
            enumDescriptions: [
                localize('continueOnCloudChanges.promptForAuth', 'Prompt the user to sign in to store working changes in the cloud with Continue Working On.'),
                localize('continueOnCloudChanges.off', 'Do not store working changes in the cloud with Continue Working On unless the user has already turned on Cloud Changes.')
            ],
            type: 'string',
            tags: ['usesOnlineServices'],
            default: 'prompt',
            markdownDescription: localize('continueOnCloudChanges', 'Controls whether to prompt the user to store working changes in the cloud when using Continue Working On.')
        },
        'workbench.experimental.cloudChanges.partialMatches.enabled': {
            'type': 'boolean',
            'tags': ['experimental', 'usesOnlineServices'],
            'default': false,
            'markdownDescription': localize('cloudChangesPartialMatchesEnabled', "Controls whether to surface cloud changes which partially match the current session.")
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRTZXNzaW9ucy9icm93c2VyL2VkaXRTZXNzaW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFtQyxVQUFVLElBQUksbUJBQW1CLEVBQTBCLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0MsTUFBTSxpREFBaUQsQ0FBQztBQUNwSCxPQUFPLEVBQUUsT0FBTyxFQUFtQixNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWpJLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLDJCQUEyQixFQUFVLFVBQVUsRUFBdUIsUUFBUSxFQUFFLDBCQUEwQixFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLDBCQUEwQixFQUFFLDRCQUE0QixFQUFFLG1CQUFtQixFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDdGEsT0FBTyxFQUFrQixXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHdCQUF3QixFQUFv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