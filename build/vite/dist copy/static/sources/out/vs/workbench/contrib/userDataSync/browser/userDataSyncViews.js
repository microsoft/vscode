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
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, TreeItemCollapsibleState } from '../../../common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { TreeView, TreeViewPane } from '../../../browser/parts/views/treeView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ALL_SYNC_RESOURCES, IUserDataSyncService, IUserDataSyncEnablementService, IUserDataAutoSyncService, UserDataSyncError, getLastSyncResourceUri, IUserDataSyncResourceProviderService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { FolderThemeIcon } from '../../../../platform/theme/common/themeService.js';
import { fromNow } from '../../../../base/common/date.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toAction } from '../../../../base/common/actions.js';
import { IUserDataSyncWorkbenchService, CONTEXT_SYNC_STATE, getSyncAreaLabel, CONTEXT_ACCOUNT_STATE, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS } from '../../../services/userDataSync/common/userDataSync.js';
import { IUserDataSyncMachinesService, isWebPlatform } from '../../../../platform/userDataSync/common/userDataSyncMachines.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { basename } from '../../../../base/common/resources.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataSyncConflictsViewPane } from './userDataSyncConflictsView.js';
let UserDataSyncDataViews = class UserDataSyncDataViews extends Disposable {
    constructor(container, instantiationService, userDataSyncEnablementService, userDataSyncMachinesService, userDataSyncService) {
        super();
        this.instantiationService = instantiationService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataSyncMachinesService = userDataSyncMachinesService;
        this.userDataSyncService = userDataSyncService;
        this.registerViews(container);
    }
    registerViews(container) {
        this.registerConflictsView(container);
        this.registerActivityView(container, true);
        this.registerMachinesView(container);
        this.registerActivityView(container, false);
        this.registerTroubleShootView(container);
        this.registerExternalActivityView(container);
    }
    registerConflictsView(container) {
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        const viewName = localize2('conflicts', "Conflicts");
        const viewDescriptor = {
            id: SYNC_CONFLICTS_VIEW_ID,
            name: viewName,
            ctorDescriptor: new SyncDescriptor(UserDataSyncConflictsViewPane),
            when: ContextKeyExpr.and(CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS),
            canToggleVisibility: false,
            canMoveView: false,
            treeView: this.instantiationService.createInstance(TreeView, SYNC_CONFLICTS_VIEW_ID, viewName.value),
            collapsed: false,
            order: 100,
        };
        viewsRegistry.registerViews([viewDescriptor], container);
    }
    registerMachinesView(container) {
        const id = `workbench.views.sync.machines`;
        const name = localize2('synced machines', "Synced Machines");
        const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
        const dataProvider = this.instantiationService.createInstance(UserDataSyncMachinesViewDataProvider, treeView);
        treeView.showRefreshAction = true;
        treeView.canSelectMany = true;
        treeView.dataProvider = dataProvider;
        this._register(Event.any(this.userDataSyncMachinesService.onDidChange, this.userDataSyncService.onDidResetRemote)(() => treeView.refresh()));
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        const viewDescriptor = {
            id,
            name,
            ctorDescriptor: new SyncDescriptor(TreeViewPane),
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_ACCOUNT_STATE.isEqualTo("available" /* AccountStatus.Available */), CONTEXT_ENABLE_ACTIVITY_VIEWS),
            canToggleVisibility: true,
            canMoveView: false,
            treeView,
            collapsed: false,
            order: 300,
        };
        viewsRegistry.registerViews([viewDescriptor], container);
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.editMachineName`,
                    title: localize('workbench.actions.sync.editMachineName', "Edit Name"),
                    icon: Codicon.edit,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', id)),
                        group: 'inline',
                    },
                });
            }
            async run(accessor, handle) {
                const changed = await dataProvider.rename(handle.$treeItemHandle);
                if (changed) {
                    await treeView.refresh();
                }
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.turnOffSyncOnMachine`,
                    title: localize('workbench.actions.sync.turnOffSyncOnMachine', "Turn off Settings Sync"),
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', id), ContextKeyExpr.equals('viewItem', 'sync-machine')),
                    },
                });
            }
            async run(accessor, handle, selected) {
                if (await dataProvider.disable((selected || [handle]).map(handle => handle.$treeItemHandle))) {
                    await treeView.refresh();
                }
            }
        }));
    }
    registerActivityView(container, remote) {
        const id = `workbench.views.sync.${remote ? 'remote' : 'local'}Activity`;
        const name = remote ? localize2('remote sync activity title', "Sync Activity (Remote)") : localize2('local sync activity title', "Sync Activity (Local)");
        const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
        treeView.showCollapseAllAction = true;
        treeView.showRefreshAction = true;
        treeView.dataProvider = remote ? this.instantiationService.createInstance(RemoteUserDataSyncActivityViewDataProvider)
            : this.instantiationService.createInstance(LocalUserDataSyncActivityViewDataProvider);
        this._register(Event.any(this.userDataSyncEnablementService.onDidChangeResourceEnablement, this.userDataSyncEnablementService.onDidChangeEnablement, this.userDataSyncService.onDidResetLocal, this.userDataSyncService.onDidResetRemote)(() => treeView.refresh()));
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        const viewDescriptor = {
            id,
            name,
            ctorDescriptor: new SyncDescriptor(TreeViewPane),
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */), CONTEXT_ACCOUNT_STATE.isEqualTo("available" /* AccountStatus.Available */), CONTEXT_ENABLE_ACTIVITY_VIEWS),
            canToggleVisibility: true,
            canMoveView: false,
            treeView,
            collapsed: false,
            order: remote ? 200 : 400,
            hideByDefault: !remote,
        };
        viewsRegistry.registerViews([viewDescriptor], container);
        this.registerDataViewActions(id);
    }
    registerExternalActivityView(container) {
        const id = `workbench.views.sync.externalActivity`;
        const name = localize2('downloaded sync activity title', "Sync Activity (Developer)");
        const dataProvider = this.instantiationService.createInstance(ExtractedUserDataSyncActivityViewDataProvider, undefined);
        const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
        treeView.showCollapseAllAction = false;
        treeView.showRefreshAction = false;
        treeView.dataProvider = dataProvider;
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        const viewDescriptor = {
            id,
            name,
            ctorDescriptor: new SyncDescriptor(TreeViewPane),
            when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
            canToggleVisibility: true,
            canMoveView: false,
            treeView,
            collapsed: false,
            hideByDefault: false,
        };
        viewsRegistry.registerViews([viewDescriptor], container);
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.loadActivity`,
                    title: localize('workbench.actions.sync.loadActivity', "Load Sync Activity"),
                    icon: Codicon.cloudUpload,
                    menu: {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.equals('view', id),
                        group: 'navigation',
                    },
                });
            }
            async run(accessor) {
                const fileDialogService = accessor.get(IFileDialogService);
                const result = await fileDialogService.showOpenDialog({
                    title: localize('select sync activity file', "Select Sync Activity File or Folder"),
                    canSelectFiles: true,
                    canSelectFolders: true,
                    canSelectMany: false,
                });
                if (!result?.[0]) {
                    return;
                }
                dataProvider.activityDataResource = result[0];
                await treeView.refresh();
            }
        }));
    }
    registerDataViewActions(viewId) {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.${viewId}.resolveResource`,
                    title: localize('workbench.actions.sync.resolveResourceRef', "Show raw JSON sync data"),
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.regex('viewItem', /sync-resource-.*/i))
                    },
                });
            }
            async run(accessor, handle) {
                const { resource } = JSON.parse(handle.$treeItemHandle);
                const editorService = accessor.get(IEditorService);
                await editorService.openEditor({ resource: URI.parse(resource), options: { pinned: true } });
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.${viewId}.compareWithLocal`,
                    title: localize('workbench.actions.sync.compareWithLocal', "Compare with Local"),
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.regex('viewItem', /sync-associatedResource-.*/i))
                    },
                });
            }
            async run(accessor, handle) {
                const commandService = accessor.get(ICommandService);
                const { resource, comparableResource } = JSON.parse(handle.$treeItemHandle);
                const remoteResource = URI.parse(resource);
                const localResource = URI.parse(comparableResource);
                return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, remoteResource, localResource, localize('remoteToLocalDiff', "{0} ↔ {1}", localize({ key: 'leftResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(remoteResource)), localize({ key: 'rightResourceName', comment: ['local as in file in disk'] }, "{0} (Local)", basename(localResource))), undefined);
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.${viewId}.replaceCurrent`,
                    title: localize('workbench.actions.sync.replaceCurrent', "Restore"),
                    icon: Codicon.discard,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.regex('viewItem', /sync-resource-.*/i), ContextKeyExpr.notEquals('viewItem', `sync-resource-${"profiles" /* SyncResource.Profiles */}`)),
                        group: 'inline',
                    },
                });
            }
            async run(accessor, handle) {
                const dialogService = accessor.get(IDialogService);
                const userDataSyncService = accessor.get(IUserDataSyncService);
                const { syncResourceHandle, syncResource } = JSON.parse(handle.$treeItemHandle);
                const result = await dialogService.confirm({
                    message: localize({ key: 'confirm replace', comment: ['A confirmation message to replace current user data (settings, extensions, keybindings, snippets) with selected version'] }, "Would you like to replace your current {0} with selected?", getSyncAreaLabel(syncResource)),
                    type: 'info',
                    title: SYNC_TITLE.value
                });
                if (result.confirmed) {
                    return userDataSyncService.replace({ created: syncResourceHandle.created, uri: URI.revive(syncResourceHandle.uri) });
                }
            }
        }));
    }
    registerTroubleShootView(container) {
        const id = `workbench.views.sync.troubleshoot`;
        const name = localize2('troubleshoot', "Troubleshoot");
        const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
        const dataProvider = this.instantiationService.createInstance(UserDataSyncTroubleshootViewDataProvider);
        treeView.showRefreshAction = true;
        treeView.dataProvider = dataProvider;
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        const viewDescriptor = {
            id,
            name,
            ctorDescriptor: new SyncDescriptor(TreeViewPane),
            when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
            canToggleVisibility: true,
            canMoveView: false,
            treeView,
            collapsed: false,
            order: 500,
            hideByDefault: true
        };
        viewsRegistry.registerViews([viewDescriptor], container);
    }
};
UserDataSyncDataViews = __decorate([
    __param(1, IInstantiationService),
    __param(2, IUserDataSyncEnablementService),
    __param(3, IUserDataSyncMachinesService),
    __param(4, IUserDataSyncService)
], UserDataSyncDataViews);
export { UserDataSyncDataViews };
let UserDataSyncActivityViewDataProvider = class UserDataSyncActivityViewDataProvider {
    constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
        this.userDataSyncService = userDataSyncService;
        this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
        this.userDataAutoSyncService = userDataAutoSyncService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
        this.notificationService = notificationService;
        this.userDataProfilesService = userDataProfilesService;
        this.syncResourceHandlesByProfile = new Map();
    }
    async getChildren(element) {
        try {
            if (!element) {
                return await this.getRoots();
            }
            if (element.profile || element.handle === this.userDataProfilesService.defaultProfile.id) {
                let promise = this.syncResourceHandlesByProfile.get(element.handle);
                if (!promise) {
                    this.syncResourceHandlesByProfile.set(element.handle, promise = this.getSyncResourceHandles(element.profile));
                }
                return await promise;
            }
            if (element.syncResourceHandle) {
                return await this.getChildrenForSyncResourceTreeItem(element);
            }
            return [];
        }
        catch (error) {
            if (!(error instanceof UserDataSyncError)) {
                error = UserDataSyncError.toUserDataSyncError(error);
            }
            if (error instanceof UserDataSyncError && error.code === "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */) {
                this.notificationService.notify({
                    severity: Severity.Error,
                    message: error.message,
                    actions: {
                        primary: [
                            toAction({
                                id: 'reset',
                                label: localize('reset', "Reset Synced Data"),
                                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
                            }),
                        ]
                    }
                });
            }
            else {
                this.notificationService.error(error);
            }
            throw error;
        }
    }
    async getRoots() {
        this.syncResourceHandlesByProfile.clear();
        const roots = [];
        const profiles = await this.getProfiles();
        if (profiles.length) {
            const profileTreeItem = {
                handle: this.userDataProfilesService.defaultProfile.id,
                label: { label: this.userDataProfilesService.defaultProfile.name },
                collapsibleState: TreeItemCollapsibleState.Expanded,
            };
            roots.push(profileTreeItem);
        }
        else {
            const defaultSyncResourceHandles = await this.getSyncResourceHandles();
            roots.push(...defaultSyncResourceHandles);
        }
        for (const profile of profiles) {
            const profileTreeItem = {
                handle: profile.id,
                label: { label: profile.name },
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                profile,
            };
            roots.push(profileTreeItem);
        }
        return roots;
    }
    async getChildrenForSyncResourceTreeItem(element) {
        const syncResourceHandle = element.syncResourceHandle;
        const associatedResources = await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle);
        const previousAssociatedResources = syncResourceHandle.previous ? await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle.previous) : [];
        return associatedResources.map(({ resource, comparableResource }) => {
            const handle = JSON.stringify({ resource: resource.toString(), comparableResource: comparableResource.toString() });
            const previousResource = previousAssociatedResources.find(previous => basename(previous.resource) === basename(resource))?.resource;
            return {
                handle,
                collapsibleState: TreeItemCollapsibleState.None,
                resourceUri: resource,
                command: previousResource ? {
                    id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
                    title: '',
                    arguments: [
                        previousResource,
                        resource,
                        localize('sideBySideLabels', "{0} ↔ {1}", `${basename(resource)} (${fromNow(syncResourceHandle.previous.created, true)})`, `${basename(resource)} (${fromNow(syncResourceHandle.created, true)})`),
                        undefined
                    ]
                } : {
                    id: API_OPEN_EDITOR_COMMAND_ID,
                    title: '',
                    arguments: [resource, undefined, undefined]
                },
                contextValue: `sync-associatedResource-${syncResourceHandle.syncResource}`
            };
        });
    }
    async getSyncResourceHandles(profile) {
        const treeItems = [];
        const result = await Promise.all(ALL_SYNC_RESOURCES.map(async (syncResource) => {
            const resourceHandles = await this.getResourceHandles(syncResource, profile);
            return resourceHandles.map((resourceHandle, index) => ({ ...resourceHandle, syncResource, previous: resourceHandles[index + 1] }));
        }));
        const syncResourceHandles = result.flat().sort((a, b) => b.created - a.created);
        for (const syncResourceHandle of syncResourceHandles) {
            const handle = JSON.stringify({ syncResourceHandle, syncResource: syncResourceHandle.syncResource });
            treeItems.push({
                handle,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: { label: getSyncAreaLabel(syncResourceHandle.syncResource) },
                description: fromNow(syncResourceHandle.created, true),
                tooltip: new Date(syncResourceHandle.created).toLocaleString(),
                themeIcon: FolderThemeIcon,
                syncResourceHandle,
                contextValue: `sync-resource-${syncResourceHandle.syncResource}`
            });
        }
        return treeItems;
    }
};
UserDataSyncActivityViewDataProvider = __decorate([
    __param(0, IUserDataSyncService),
    __param(1, IUserDataSyncResourceProviderService),
    __param(2, IUserDataAutoSyncService),
    __param(3, IUserDataSyncWorkbenchService),
    __param(4, INotificationService),
    __param(5, IUserDataProfilesService)
], UserDataSyncActivityViewDataProvider);
class LocalUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {
    getResourceHandles(syncResource, profile) {
        return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile);
    }
    async getProfiles() {
        return this.userDataProfilesService.profiles
            .filter(p => !p.isDefault)
            .map(p => ({
            id: p.id,
            collection: p.id,
            name: p.name,
        }));
    }
}
let RemoteUserDataSyncActivityViewDataProvider = class RemoteUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {
    constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncMachinesService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
        super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
        this.userDataSyncMachinesService = userDataSyncMachinesService;
    }
    async getChildren(element) {
        if (!element) {
            this.machinesPromise = undefined;
        }
        return super.getChildren(element);
    }
    getMachines() {
        if (this.machinesPromise === undefined) {
            this.machinesPromise = this.userDataSyncMachinesService.getMachines();
        }
        return this.machinesPromise;
    }
    getResourceHandles(syncResource, profile) {
        return this.userDataSyncResourceProviderService.getRemoteSyncResourceHandles(syncResource, profile);
    }
    getProfiles() {
        return this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
    }
    async getChildrenForSyncResourceTreeItem(element) {
        const children = await super.getChildrenForSyncResourceTreeItem(element);
        if (children.length) {
            const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
            if (machineId) {
                const machines = await this.getMachines();
                const machine = machines.find(({ id }) => id === machineId);
                children[0].description = machine?.isCurrent ? localize({ key: 'current', comment: ['Represents current machine'] }, "Current") : machine?.name;
            }
        }
        return children;
    }
};
RemoteUserDataSyncActivityViewDataProvider = __decorate([
    __param(0, IUserDataSyncService),
    __param(1, IUserDataSyncResourceProviderService),
    __param(2, IUserDataAutoSyncService),
    __param(3, IUserDataSyncMachinesService),
    __param(4, IUserDataSyncWorkbenchService),
    __param(5, INotificationService),
    __param(6, IUserDataProfilesService)
], RemoteUserDataSyncActivityViewDataProvider);
let ExtractedUserDataSyncActivityViewDataProvider = class ExtractedUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {
    constructor(activityDataResource, userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService, fileService, uriIdentityService) {
        super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
        this.activityDataResource = activityDataResource;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
    }
    async getChildren(element) {
        if (!element) {
            this.machinesPromise = undefined;
            if (!this.activityDataResource) {
                return [];
            }
            const stat = await this.fileService.resolve(this.activityDataResource);
            if (stat.isDirectory) {
                this.activityDataLocation = this.activityDataResource;
            }
            else {
                this.activityDataLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(this.activityDataResource), 'remoteActivity');
                try {
                    await this.fileService.del(this.activityDataLocation, { recursive: true });
                }
                catch (e) { /* ignore */ }
                await this.userDataSyncService.extractActivityData(this.activityDataResource, this.activityDataLocation);
            }
        }
        return super.getChildren(element);
    }
    getResourceHandles(syncResource, profile) {
        return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile, this.activityDataLocation);
    }
    async getProfiles() {
        return this.userDataSyncResourceProviderService.getLocalSyncedProfiles(this.activityDataLocation);
    }
    async getChildrenForSyncResourceTreeItem(element) {
        const children = await super.getChildrenForSyncResourceTreeItem(element);
        if (children.length) {
            const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
            if (machineId) {
                const machines = await this.getMachines();
                const machine = machines.find(({ id }) => id === machineId);
                children[0].description = machine?.isCurrent ? localize({ key: 'current', comment: ['Represents current machine'] }, "Current") : machine?.name;
            }
        }
        return children;
    }
    getMachines() {
        if (this.machinesPromise === undefined) {
            this.machinesPromise = this.userDataSyncResourceProviderService.getLocalSyncedMachines(this.activityDataLocation);
        }
        return this.machinesPromise;
    }
};
ExtractedUserDataSyncActivityViewDataProvider = __decorate([
    __param(1, IUserDataSyncService),
    __param(2, IUserDataSyncResourceProviderService),
    __param(3, IUserDataAutoSyncService),
    __param(4, IUserDataSyncWorkbenchService),
    __param(5, INotificationService),
    __param(6, IUserDataProfilesService),
    __param(7, IFileService),
    __param(8, IUriIdentityService)
], ExtractedUserDataSyncActivityViewDataProvider);
let UserDataSyncMachinesViewDataProvider = class UserDataSyncMachinesViewDataProvider {
    constructor(treeView, userDataSyncMachinesService, quickInputService, notificationService, dialogService, userDataSyncWorkbenchService) {
        this.treeView = treeView;
        this.userDataSyncMachinesService = userDataSyncMachinesService;
        this.quickInputService = quickInputService;
        this.notificationService = notificationService;
        this.dialogService = dialogService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    }
    async getChildren(element) {
        if (!element) {
            this.machinesPromise = undefined;
        }
        try {
            let machines = await this.getMachines();
            machines = machines.filter(m => !m.disabled).sort((m1, m2) => m1.isCurrent ? -1 : 1);
            this.treeView.message = machines.length ? undefined : localize('no machines', "No Machines");
            return machines.map(({ id, name, isCurrent, platform }) => ({
                handle: id,
                collapsibleState: TreeItemCollapsibleState.None,
                label: { label: name },
                description: isCurrent ? localize({ key: 'current', comment: ['Current machine'] }, "Current") : undefined,
                themeIcon: platform && isWebPlatform(platform) ? Codicon.globe : Codicon.vm,
                contextValue: 'sync-machine'
            }));
        }
        catch (error) {
            this.notificationService.error(error);
            return [];
        }
    }
    getMachines() {
        if (this.machinesPromise === undefined) {
            this.machinesPromise = this.userDataSyncMachinesService.getMachines();
        }
        return this.machinesPromise;
    }
    async disable(machineIds) {
        const machines = await this.getMachines();
        const machinesToDisable = machines.filter(({ id }) => machineIds.includes(id));
        if (!machinesToDisable.length) {
            throw new Error(localize('not found', "machine not found with id: {0}", machineIds.join(',')));
        }
        const result = await this.dialogService.confirm({
            type: 'info',
            message: machinesToDisable.length > 1 ? localize('turn off sync on multiple machines', "Are you sure you want to turn off sync on selected machines?")
                : localize('turn off sync on machine', "Are you sure you want to turn off sync on {0}?", machinesToDisable[0].name),
            primaryButton: localize({ key: 'turn off', comment: ['&& denotes a mnemonic'] }, "&&Turn off"),
        });
        if (!result.confirmed) {
            return false;
        }
        if (machinesToDisable.some(machine => machine.isCurrent)) {
            await this.userDataSyncWorkbenchService.turnoff(false);
        }
        const otherMachinesToDisable = machinesToDisable.filter(machine => !machine.isCurrent)
            .map(machine => ([machine.id, false]));
        if (otherMachinesToDisable.length) {
            await this.userDataSyncMachinesService.setEnablements(otherMachinesToDisable);
        }
        return true;
    }
    async rename(machineId) {
        const disposableStore = new DisposableStore();
        const inputBox = disposableStore.add(this.quickInputService.createInputBox());
        inputBox.placeholder = localize('placeholder', "Enter the name of the machine");
        inputBox.busy = true;
        inputBox.show();
        const machines = await this.getMachines();
        const machine = machines.find(({ id }) => id === machineId);
        const enabledMachines = machines.filter(({ disabled }) => !disabled);
        if (!machine) {
            inputBox.hide();
            disposableStore.dispose();
            throw new Error(localize('not found', "machine not found with id: {0}", machineId));
        }
        inputBox.busy = false;
        inputBox.value = machine.name;
        const validateMachineName = (machineName) => {
            machineName = machineName.trim();
            return machineName && !enabledMachines.some(m => m.id !== machineId && m.name === machineName) ? machineName : null;
        };
        disposableStore.add(inputBox.onDidChangeValue(() => inputBox.validationMessage = validateMachineName(inputBox.value) ? '' : localize('valid message', "Machine name should be unique and not empty")));
        return new Promise((c, e) => {
            disposableStore.add(inputBox.onDidAccept(async () => {
                const machineName = validateMachineName(inputBox.value);
                disposableStore.dispose();
                if (machineName && machineName !== machine.name) {
                    try {
                        await this.userDataSyncMachinesService.renameMachine(machineId, machineName);
                        c(true);
                    }
                    catch (error) {
                        e(error);
                    }
                }
                else {
                    c(false);
                }
            }));
        });
    }
};
UserDataSyncMachinesViewDataProvider = __decorate([
    __param(1, IUserDataSyncMachinesService),
    __param(2, IQuickInputService),
    __param(3, INotificationService),
    __param(4, IDialogService),
    __param(5, IUserDataSyncWorkbenchService)
], UserDataSyncMachinesViewDataProvider);
let UserDataSyncTroubleshootViewDataProvider = class UserDataSyncTroubleshootViewDataProvider {
    constructor(fileService, userDataSyncWorkbenchService, environmentService, uriIdentityService) {
        this.fileService = fileService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
        this.environmentService = environmentService;
        this.uriIdentityService = uriIdentityService;
    }
    async getChildren(element) {
        if (!element) {
            return [{
                    handle: 'SYNC_LOGS',
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                    label: { label: localize('sync logs', "Logs") },
                    themeIcon: Codicon.folder,
                }, {
                    handle: 'LAST_SYNC_STATES',
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                    label: { label: localize('last sync states', "Last Synced Remotes") },
                    themeIcon: Codicon.folder,
                }];
        }
        if (element.handle === 'LAST_SYNC_STATES') {
            return this.getLastSyncStates();
        }
        if (element.handle === 'SYNC_LOGS') {
            return this.getSyncLogs();
        }
        return [];
    }
    async getLastSyncStates() {
        const result = [];
        for (const syncResource of ALL_SYNC_RESOURCES) {
            const resource = getLastSyncResourceUri(undefined, syncResource, this.environmentService, this.uriIdentityService.extUri);
            if (await this.fileService.exists(resource)) {
                result.push({
                    handle: resource.toString(),
                    label: { label: getSyncAreaLabel(syncResource) },
                    collapsibleState: TreeItemCollapsibleState.None,
                    resourceUri: resource,
                    command: { id: API_OPEN_EDITOR_COMMAND_ID, title: '', arguments: [resource, undefined, undefined] },
                });
            }
        }
        return result;
    }
    async getSyncLogs() {
        const logResources = await this.userDataSyncWorkbenchService.getAllLogResources();
        const result = [];
        for (const syncLogResource of logResources) {
            const logFolder = this.uriIdentityService.extUri.dirname(syncLogResource);
            result.push({
                handle: syncLogResource.toString(),
                collapsibleState: TreeItemCollapsibleState.None,
                resourceUri: syncLogResource,
                label: { label: this.uriIdentityService.extUri.basename(logFolder) },
                description: this.uriIdentityService.extUri.isEqual(logFolder, this.environmentService.logsHome) ? localize({ key: 'current', comment: ['Represents current log file'] }, "Current") : undefined,
                command: { id: API_OPEN_EDITOR_COMMAND_ID, title: '', arguments: [syncLogResource, undefined, undefined] },
            });
        }
        return result;
    }
};
UserDataSyncTroubleshootViewDataProvider = __decorate([
    __param(0, IFileService),
    __param(1, IUserDataSyncWorkbenchService),
    __param(2, IEnvironmentService),
    __param(3, IUriIdentityService)
], UserDataSyncTroubleshootViewDataProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jVmlld3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91c2VyRGF0YVN5bmMvYnJvd3Nlci91c2VyRGF0YVN5bmNWaWV3cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFrQixVQUFVLEVBQXlELHdCQUF3QixFQUF3QyxNQUFNLDBCQUEwQixDQUFDO0FBQzdMLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBc0QsOEJBQThCLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQXlCLHNCQUFzQixFQUFzQyxvQ0FBb0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlXLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsR0FBRyxFQUFVLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1B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