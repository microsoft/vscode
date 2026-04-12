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
import { TreeItemCollapsibleState, IViewDescriptorService } from '../../../common/views.js';
import { localize } from '../../../../nls.js';
import { TreeViewPane } from '../../../browser/parts/views/treeView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataSyncService, IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { getSyncAreaLabel, IUserDataSyncWorkbenchService, SYNC_CONFLICTS_VIEW_ID } from '../../../services/userDataSync/common/userDataSync.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IUserDataProfilesService, reviveProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
let UserDataSyncConflictsViewPane = class UserDataSyncConflictsViewPane extends TreeViewPane {
    constructor(options, editorService, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, notificationService, hoverService, userDataSyncService, userDataSyncWorkbenchService, userDataSyncEnablementService, userDataProfilesService, accessibleViewVisibilityService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, notificationService, hoverService, accessibleViewVisibilityService);
        this.editorService = editorService;
        this.userDataSyncService = userDataSyncService;
        this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataProfilesService = userDataProfilesService;
        this._register(this.userDataSyncService.onDidChangeConflicts(() => this.treeView.refresh()));
        this.registerActions();
    }
    renderTreeView(container) {
        super.renderTreeView(DOM.append(container, DOM.$('')));
        const that = this;
        this.treeView.message = localize('explanation', "Please go through each entry and merge to resolve conflicts.");
        this.treeView.dataProvider = { getChildren() { return that.getTreeItems(); } };
    }
    async getTreeItems() {
        const roots = [];
        const conflictResources = this.userDataSyncService.conflicts
            .map(conflict => conflict.conflicts.map(resourcePreview => ({ ...resourcePreview, syncResource: conflict.syncResource, profile: conflict.profile })))
            .flat()
            .sort((a, b) => a.profile.id === b.profile.id ? 0 : a.profile.isDefault ? -1 : b.profile.isDefault ? 1 : a.profile.name.localeCompare(b.profile.name));
        const conflictResourcesByProfile = [];
        for (const previewResource of conflictResources) {
            let result = conflictResourcesByProfile[conflictResourcesByProfile.length - 1]?.[0].id === previewResource.profile.id ? conflictResourcesByProfile[conflictResourcesByProfile.length - 1][1] : undefined;
            if (!result) {
                conflictResourcesByProfile.push([previewResource.profile, result = []]);
            }
            result.push(previewResource);
        }
        for (const [profile, resources] of conflictResourcesByProfile) {
            const children = [];
            for (const resource of resources) {
                const handle = JSON.stringify(resource);
                const treeItem = {
                    handle,
                    resourceUri: resource.remoteResource,
                    label: { label: basename(resource.remoteResource), strikethrough: resource.mergeState === "accepted" /* MergeState.Accepted */ && (resource.localChange === 3 /* Change.Deleted */ || resource.remoteChange === 3 /* Change.Deleted */) },
                    description: getSyncAreaLabel(resource.syncResource),
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: { id: `workbench.actions.sync.openConflicts`, title: '', arguments: [{ $treeViewId: '', $treeItemHandle: handle }] },
                    contextValue: `sync-conflict-resource`
                };
                children.push(treeItem);
            }
            roots.push({
                handle: profile.id,
                label: { label: profile.name },
                collapsibleState: TreeItemCollapsibleState.Expanded,
                children
            });
        }
        return conflictResourcesByProfile.length === 1 && conflictResourcesByProfile[0][0].isDefault ? roots[0].children ?? [] : roots;
    }
    parseHandle(handle) {
        const parsed = JSON.parse(handle);
        return {
            syncResource: parsed.syncResource,
            profile: reviveProfile(parsed.profile, this.userDataProfilesService.profilesHome.scheme),
            localResource: URI.revive(parsed.localResource),
            remoteResource: URI.revive(parsed.remoteResource),
            baseResource: URI.revive(parsed.baseResource),
            previewResource: URI.revive(parsed.previewResource),
            acceptedResource: URI.revive(parsed.acceptedResource),
            localChange: parsed.localChange,
            remoteChange: parsed.remoteChange,
            mergeState: parsed.mergeState,
        };
    }
    registerActions() {
        const that = this;
        this._register(registerAction2(class OpenConflictsAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.openConflicts`,
                    title: localize({ key: 'workbench.actions.sync.openConflicts', comment: ['This is an action title to show the conflicts between local and remote version of resources'] }, "Show Conflicts"),
                });
            }
            async run(accessor, handle) {
                const conflict = that.parseHandle(handle.$treeItemHandle);
                return that.open(conflict);
            }
        }));
        this._register(registerAction2(class AcceptRemoteAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.acceptRemote`,
                    title: localize('workbench.actions.sync.acceptRemote', "Accept Remote"),
                    icon: Codicon.cloudDownload,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SYNC_CONFLICTS_VIEW_ID), ContextKeyExpr.equals('viewItem', 'sync-conflict-resource')),
                        group: 'inline',
                        order: 1,
                    },
                });
            }
            async run(accessor, handle) {
                const conflict = that.parseHandle(handle.$treeItemHandle);
                await that.userDataSyncWorkbenchService.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, conflict.remoteResource, undefined, that.userDataSyncEnablementService.isEnabled());
            }
        }));
        this._register(registerAction2(class AcceptLocalAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.actions.sync.acceptLocal`,
                    title: localize('workbench.actions.sync.acceptLocal', "Accept Local"),
                    icon: Codicon.cloudUpload,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', SYNC_CONFLICTS_VIEW_ID), ContextKeyExpr.equals('viewItem', 'sync-conflict-resource')),
                        group: 'inline',
                        order: 2,
                    },
                });
            }
            async run(accessor, handle) {
                const conflict = that.parseHandle(handle.$treeItemHandle);
                await that.userDataSyncWorkbenchService.accept({ syncResource: conflict.syncResource, profile: conflict.profile }, conflict.localResource, undefined, that.userDataSyncEnablementService.isEnabled());
            }
        }));
    }
    async open(conflictToOpen) {
        if (!this.userDataSyncService.conflicts.some(({ conflicts }) => conflicts.some(({ localResource }) => isEqual(localResource, conflictToOpen.localResource)))) {
            return;
        }
        const remoteResourceName = localize({ key: 'remoteResourceName', comment: ['remote as in file in cloud'] }, "{0} (Remote)", basename(conflictToOpen.remoteResource));
        const localResourceName = localize('localResourceName', "{0} (Local)", basename(conflictToOpen.remoteResource));
        await this.editorService.openEditor({
            input1: { resource: conflictToOpen.remoteResource, label: localize('Theirs', 'Theirs'), description: remoteResourceName },
            input2: { resource: conflictToOpen.localResource, label: localize('Yours', 'Yours'), description: localResourceName },
            base: { resource: conflictToOpen.baseResource },
            result: { resource: conflictToOpen.previewResource },
            options: {
                preserveFocus: true,
                revealIfVisible: true,
                pinned: true,
                override: DEFAULT_EDITOR_ASSOCIATION.id
            }
        });
        return;
    }
};
UserDataSyncConflictsViewPane = __decorate([
    __param(1, IEditorService),
    __param(2, IKeybindingService),
    __param(3, IContextMenuService),
    __param(4, IConfigurationService),
    __param(5, IContextKeyService),
    __param(6, IViewDescriptorService),
    __param(7, IInstantiationService),
    __param(8, IOpenerService),
    __param(9, IThemeService),
    __param(10, INotificationService),
    __param(11, IHoverService),
    __param(12, IUserDataSyncService),
    __param(13, IUserDataSyncWorkbenchService),
    __param(14, IUserDataSyncEnablementService),
    __param(15, IUserDataProfilesService),
    __param(16, IAccessibleViewInformationService)
], UserDataSyncConflictsViewPane);
export { UserDataSyncConflictsViewPane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jQ29uZmxpY3RzVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luY0NvbmZsaWN0c1ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFhLHdCQUF3QixFQUF5QixzQkFBc0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzlILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxvQkFBb0IsRUFBK0QsOEJBQThCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3TCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQThCLDZCQUE2QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUssT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFG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