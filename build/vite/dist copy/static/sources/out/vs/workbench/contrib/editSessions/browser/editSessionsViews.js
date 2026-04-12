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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { TreeView, TreeViewPane } from '../../../browser/parts/views/treeView.js';
import { Extensions, TreeItemCollapsibleState } from '../../../common/views.js';
import { ChangeType, EDIT_SESSIONS_DATA_VIEW_ID, EDIT_SESSIONS_SCHEME, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_TITLE, IEditSessionsStorageService } from '../common/editSessions.js';
import { URI } from '../../../../base/common/uri.js';
import { fromNow } from '../../../../base/common/date.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename } from '../../../../base/common/path.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
const EDIT_SESSIONS_COUNT_KEY = 'editSessionsCount';
const EDIT_SESSIONS_COUNT_CONTEXT_KEY = new RawContextKey(EDIT_SESSIONS_COUNT_KEY, 0);
let EditSessionsDataViews = class EditSessionsDataViews extends Disposable {
    constructor(container, instantiationService) {
        super();
        this.instantiationService = instantiationService;
        this.registerViews(container);
    }
    registerViews(container) {
        const viewId = EDIT_SESSIONS_DATA_VIEW_ID;
        const treeView = this.instantiationService.createInstance(TreeView, viewId, EDIT_SESSIONS_TITLE.value);
        treeView.showCollapseAllAction = true;
        treeView.showRefreshAction = true;
        treeView.dataProvider = this.instantiationService.createInstance(EditSessionDataViewDataProvider);
        const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        viewsRegistry.registerViews([{
                id: viewId,
                name: EDIT_SESSIONS_TITLE,
                ctorDescriptor: new SyncDescriptor(TreeViewPane),
                canToggleVisibility: true,
                canMoveView: false,
                treeView,
                collapsed: false,
                when: ContextKeyExpr.and(EDIT_SESSIONS_SHOW_VIEW),
                order: 100,
                hideByDefault: true,
            }], container);
        viewsRegistry.registerViewWelcomeContent(viewId, {
            content: localize('noStoredChanges', 'You have no stored changes in the cloud to display.\n{0}', `[${localize('storeWorkingChangesTitle', 'Store Working Changes')}](${createCommandUri('workbench.editSessions.actions.store')})`),
            when: ContextKeyExpr.equals(EDIT_SESSIONS_COUNT_KEY, 0),
            order: 1
        });
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.resume',
                    title: localize('workbench.editSessions.actions.resume.v2', "Resume Working Changes"),
                    icon: Codicon.desktopDownload,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.regex('viewItem', /edit-session/i)),
                        group: 'inline'
                    }
                });
            }
            async run(accessor, handle) {
                const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
                const commandService = accessor.get(ICommandService);
                await commandService.executeCommand('workbench.editSessions.actions.resumeLatest', editSessionId, true);
                await treeView.refresh();
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.store',
                    title: localize('workbench.editSessions.actions.store.v2', "Store Working Changes"),
                    icon: Codicon.cloudUpload,
                });
            }
            async run(accessor, handle) {
                const commandService = accessor.get(ICommandService);
                await commandService.executeCommand('workbench.editSessions.actions.storeCurrent');
                await treeView.refresh();
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.delete',
                    title: localize('workbench.editSessions.actions.delete.v2', "Delete Working Changes"),
                    icon: Codicon.trash,
                    menu: {
                        id: MenuId.ViewItemContext,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.regex('viewItem', /edit-session/i)),
                        group: 'inline'
                    }
                });
            }
            async run(accessor, handle) {
                const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
                const dialogService = accessor.get(IDialogService);
                const editSessionStorageService = accessor.get(IEditSessionsStorageService);
                const result = await dialogService.confirm({
                    message: localize('confirm delete.v2', 'Are you sure you want to permanently delete your working changes with ref {0}?', editSessionId),
                    detail: localize('confirm delete detail.v2', ' You cannot undo this action.'),
                    type: 'warning',
                    title: EDIT_SESSIONS_TITLE.value
                });
                if (result.confirmed) {
                    await editSessionStorageService.delete('editSessions', editSessionId);
                    await treeView.refresh();
                }
            }
        }));
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.editSessions.actions.deleteAll',
                    title: localize('workbench.editSessions.actions.deleteAll', "Delete All Working Changes from Cloud"),
                    icon: Codicon.trash,
                    menu: {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.greater(EDIT_SESSIONS_COUNT_KEY, 0)),
                    }
                });
            }
            async run(accessor) {
                const dialogService = accessor.get(IDialogService);
                const editSessionStorageService = accessor.get(IEditSessionsStorageService);
                const result = await dialogService.confirm({
                    message: localize('confirm delete all', 'Are you sure you want to permanently delete all stored changes from the cloud?'),
                    detail: localize('confirm delete all detail', ' You cannot undo this action.'),
                    type: 'warning',
                    title: EDIT_SESSIONS_TITLE.value
                });
                if (result.confirmed) {
                    await editSessionStorageService.delete('editSessions', null);
                    await treeView.refresh();
                }
            }
        }));
    }
};
EditSessionsDataViews = __decorate([
    __param(1, IInstantiationService)
], EditSessionsDataViews);
export { EditSessionsDataViews };
let EditSessionDataViewDataProvider = class EditSessionDataViewDataProvider {
    constructor(editSessionsStorageService, contextKeyService, workspaceContextService, fileService) {
        this.editSessionsStorageService = editSessionsStorageService;
        this.contextKeyService = contextKeyService;
        this.workspaceContextService = workspaceContextService;
        this.fileService = fileService;
        this.editSessionsCount = EDIT_SESSIONS_COUNT_CONTEXT_KEY.bindTo(this.contextKeyService);
    }
    async getChildren(element) {
        if (!element) {
            return this.getAllEditSessions();
        }
        const [ref, folderName, filePath] = URI.parse(element.handle).path.substring(1).split('/');
        if (ref && !folderName) {
            return this.getEditSession(ref);
        }
        else if (ref && folderName && !filePath) {
            return this.getEditSessionFolderContents(ref, folderName);
        }
        return [];
    }
    async getAllEditSessions() {
        const allEditSessions = await this.editSessionsStorageService.list('editSessions');
        this.editSessionsCount.set(allEditSessions.length);
        const editSessions = [];
        for (const session of allEditSessions) {
            const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: 'remote-session-content', path: `/${session.ref}` });
            const sessionData = await this.editSessionsStorageService.read('editSessions', session.ref);
            if (!sessionData) {
                continue;
            }
            const content = JSON.parse(sessionData.content);
            const label = content.folders.map((folder) => folder.name).join(', ') ?? session.ref;
            const machineId = content.machine;
            const machineName = machineId ? await this.editSessionsStorageService.getMachineById(machineId) : undefined;
            const description = machineName === undefined ? fromNow(session.created, true) : `${fromNow(session.created, true)}\u00a0\u00a0\u2022\u00a0\u00a0${machineName}`;
            editSessions.push({
                handle: resource.toString(),
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: { label },
                description: description,
                themeIcon: Codicon.repo,
                contextValue: `edit-session`
            });
        }
        return editSessions;
    }
    async getEditSession(ref) {
        const data = await this.editSessionsStorageService.read('editSessions', ref);
        if (!data) {
            return [];
        }
        const content = JSON.parse(data.content);
        if (content.folders.length === 1) {
            const folder = content.folders[0];
            return this.getEditSessionFolderContents(ref, folder.name);
        }
        return content.folders.map((folder) => {
            const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: 'remote-session-content', path: `/${data.ref}/${folder.name}` });
            return {
                handle: resource.toString(),
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: { label: folder.name },
                themeIcon: Codicon.folder
            };
        });
    }
    async getEditSessionFolderContents(ref, folderName) {
        const data = await this.editSessionsStorageService.read('editSessions', ref);
        if (!data) {
            return [];
        }
        const content = JSON.parse(data.content);
        const currentWorkspaceFolder = this.workspaceContextService.getWorkspace().folders.find((folder) => folder.name === folderName);
        const editSessionFolder = content.folders.find((folder) => folder.name === folderName);
        if (!editSessionFolder) {
            return [];
        }
        return Promise.all(editSessionFolder.workingChanges.map(async (change) => {
            const cloudChangeUri = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: 'remote-session-content', path: `/${data.ref}/${folderName}/${change.relativeFilePath}` });
            if (currentWorkspaceFolder?.uri) {
                // find the corresponding file in the workspace
                const localCopy = joinPath(currentWorkspaceFolder.uri, change.relativeFilePath);
                if (change.type === ChangeType.Addition && await this.fileService.exists(localCopy)) {
                    return {
                        handle: cloudChangeUri.toString(),
                        resourceUri: cloudChangeUri,
                        collapsibleState: TreeItemCollapsibleState.None,
                        label: { label: change.relativeFilePath },
                        themeIcon: Codicon.file,
                        command: {
                            id: 'vscode.diff',
                            title: localize('compare changes', 'Compare Changes'),
                            arguments: [
                                localCopy,
                                cloudChangeUri,
                                `${basename(change.relativeFilePath)} (${localize('local copy', 'Local Copy')} \u2194 ${localize('cloud changes', 'Cloud Changes')})`,
                                undefined
                            ]
                        }
                    };
                }
            }
            return {
                handle: cloudChangeUri.toString(),
                resourceUri: cloudChangeUri,
                collapsibleState: TreeItemCollapsibleState.None,
                label: { label: change.relativeFilePath },
                themeIcon: Codicon.file,
                command: {
                    id: API_OPEN_EDITOR_COMMAND_ID,
                    title: localize('open file', 'Open File'),
                    arguments: [cloudChangeUri, undefined, undefined]
                }
            };
        }));
    }
};
EditSessionDataViewDataProvider = __decorate([
    __param(0, IEditSessionsStorageService),
    __param(1, IContextKeyService),
    __param(2, IWorkspaceContextService),
    __param(3, IFileService)
], EditSessionDataViewDataProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zVmlld3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0U2Vzc2lvbnMvYnJvd3Nlci9lZGl0U2Vzc2lvbnNWaWV3cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBeUUsd0JBQXdCLEVBQXdDLE1BQU0sMEJBQTBCLENBQUM7QUFDN0wsT0FBTyxFQUFFLFVBQVUsRUFBRSwwQkFBMEIsRUFBRSxvQkFBb0IsRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBZSwyQkFBMkIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2pNLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8s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