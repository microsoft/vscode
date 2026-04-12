/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import { IWorkspaceContextService, hasWorkspaceFileExtension } from '../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../services/workspaces/common/workspaceEditing.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID, SET_ROOT_FOLDER_COMMAND_ID } from './workspaceCommands.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { MenuRegistry, MenuId, Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext, OpenFolderWorkspaceSupportContext, WorkbenchStateContext, WorkspaceFolderCountContext } from '../../common/contextkeys.js';
import { IHostService } from '../../services/host/browser/host.js';
import { KeyChord } from '../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IWorkspacesService } from '../../../platform/workspaces/common/workspaces.js';
import { IsMacNativeContext } from '../../../platform/contextkey/common/contextkeys.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
const workspacesCategory = localize2('workspaces', 'Workspaces');
export class OpenFileAction extends Action2 {
    static { this.ID = 'workbench.action.files.openFile'; }
    constructor() {
        super({
            id: OpenFileAction.ID,
            title: localize2('openFile', 'Open File...'),
            category: Categories.File,
            f1: true,
            keybinding: {
                when: IsMacNativeContext.toNegated(),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */
            }
        });
    }
    async run(accessor, data) {
        const fileDialogService = accessor.get(IFileDialogService);
        return fileDialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
    }
}
export class OpenFolderAction extends Action2 {
    static { this.ID = 'workbench.action.files.openFolder'; }
    constructor() {
        super({
            id: OpenFolderAction.ID,
            title: localize2('openFolder', 'Open Folder...'),
            category: Categories.File,
            f1: true,
            precondition: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext, IsSessionsWindowContext.negate()),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: undefined,
                linux: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */)
                },
                win: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */)
                }
            }
        });
    }
    async run(accessor, data) {
        const fileDialogService = accessor.get(IFileDialogService);
        return fileDialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
    }
}
export class OpenFolderViaWorkspaceAction extends Action2 {
    // This action swaps the folders of a workspace with
    // the selected folder and is a workaround for providing
    // "Open Folder..." in environments that do not support
    // this without having a workspace open (e.g. web serverless)
    static { this.ID = 'workbench.action.files.openFolderViaWorkspace'; }
    constructor() {
        super({
            id: OpenFolderViaWorkspaceAction.ID,
            title: localize2('openFolder', 'Open Folder...'),
            category: Categories.File,
            f1: true,
            precondition: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo('workspace'), IsSessionsWindowContext.negate()),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */
            }
        });
    }
    run(accessor) {
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(SET_ROOT_FOLDER_COMMAND_ID);
    }
}
export class OpenFileFolderAction extends Action2 {
    static { this.ID = 'workbench.action.files.openFileFolder'; }
    static { this.LABEL = localize2('openFileFolder', 'Open...'); }
    constructor() {
        super({
            id: OpenFileFolderAction.ID,
            title: OpenFileFolderAction.LABEL,
            category: Categories.File,
            f1: true,
            precondition: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext, IsSessionsWindowContext.negate()),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */
            }
        });
    }
    async run(accessor, data) {
        const fileDialogService = accessor.get(IFileDialogService);
        return fileDialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
    }
}
class OpenWorkspaceAction extends Action2 {
    static { this.ID = 'workbench.action.openWorkspace'; }
    constructor() {
        super({
            id: OpenWorkspaceAction.ID,
            title: localize2('openWorkspaceAction', 'Open Workspace from File...'),
            category: Categories.File,
            f1: true,
            precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
        });
    }
    async run(accessor, data) {
        const fileDialogService = accessor.get(IFileDialogService);
        return fileDialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
    }
}
class CloseWorkspaceAction extends Action2 {
    static { this.ID = 'workbench.action.closeFolder'; }
    constructor() {
        super({
            id: CloseWorkspaceAction.ID,
            title: localize2('closeWorkspace', 'Close Workspace'),
            category: workspacesCategory,
            f1: true,
            precondition: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('empty'), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate()),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 36 /* KeyCode.KeyF */)
            }
        });
    }
    async run(accessor) {
        const hostService = accessor.get(IHostService);
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        return hostService.openWindow({ forceReuseWindow: true, remoteAuthority: environmentService.remoteAuthority });
    }
}
class OpenWorkspaceConfigFileAction extends Action2 {
    static { this.ID = 'workbench.action.openWorkspaceConfigFile'; }
    constructor() {
        super({
            id: OpenWorkspaceConfigFileAction.ID,
            title: localize2('openWorkspaceConfigFile', 'Open Workspace Configuration File'),
            category: workspacesCategory,
            f1: true,
            precondition: WorkbenchStateContext.isEqualTo('workspace')
        });
    }
    async run(accessor) {
        const contextService = accessor.get(IWorkspaceContextService);
        const editorService = accessor.get(IEditorService);
        const configuration = contextService.getWorkspace().configuration;
        if (configuration) {
            await editorService.openEditor({ resource: configuration, options: { pinned: true } });
        }
    }
}
export class AddRootFolderAction extends Action2 {
    static { this.ID = 'workbench.action.addRootFolder'; }
    constructor() {
        super({
            id: AddRootFolderAction.ID,
            title: ADD_ROOT_FOLDER_LABEL,
            category: workspacesCategory,
            f1: true,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')), IsSessionsWindowContext.negate())
        });
    }
    run(accessor) {
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
    }
}
export class RemoveRootFolderAction extends Action2 {
    static { this.ID = 'workbench.action.removeRootFolder'; }
    constructor() {
        super({
            id: RemoveRootFolderAction.ID,
            title: localize2('globalRemoveFolderFromWorkspace', 'Remove Folder from Workspace...'),
            category: workspacesCategory,
            f1: true,
            precondition: ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo('0'), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')))
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        const folder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (folder) {
            await workspaceEditingService.removeFolders([folder.uri]);
        }
    }
}
class SaveWorkspaceAsAction extends Action2 {
    static { this.ID = 'workbench.action.saveWorkspaceAs'; }
    constructor() {
        super({
            id: SaveWorkspaceAsAction.ID,
            title: localize2('saveWorkspaceAsAction', 'Save Workspace As...'),
            category: workspacesCategory,
            f1: true,
            precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
        });
    }
    async run(accessor) {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        const contextService = accessor.get(IWorkspaceContextService);
        const configPathUri = await workspaceEditingService.pickNewWorkspacePath();
        if (configPathUri && hasWorkspaceFileExtension(configPathUri)) {
            switch (contextService.getWorkbenchState()) {
                case 1 /* WorkbenchState.EMPTY */:
                case 2 /* WorkbenchState.FOLDER */: {
                    const folders = contextService.getWorkspace().folders.map(folder => ({ uri: folder.uri }));
                    return workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
                }
                case 3 /* WorkbenchState.WORKSPACE */:
                    return workspaceEditingService.saveAndEnterWorkspace(configPathUri);
            }
        }
    }
}
class DuplicateWorkspaceInNewWindowAction extends Action2 {
    static { this.ID = 'workbench.action.duplicateWorkspaceInNewWindow'; }
    constructor() {
        super({
            id: DuplicateWorkspaceInNewWindowAction.ID,
            title: localize2('duplicateWorkspaceInNewWindow', 'Duplicate As Workspace in New Window'),
            category: workspacesCategory,
            f1: true,
            precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
        });
    }
    async run(accessor) {
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        const hostService = accessor.get(IHostService);
        const workspacesService = accessor.get(IWorkspacesService);
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        const folders = workspaceContextService.getWorkspace().folders;
        const remoteAuthority = environmentService.remoteAuthority;
        const newWorkspace = await workspacesService.createUntitledWorkspace(folders, remoteAuthority);
        await workspaceEditingService.copyWorkspaceSettings(newWorkspace);
        return hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true, remoteAuthority });
    }
}
// --- Actions Registration
registerAction2(AddRootFolderAction);
registerAction2(RemoveRootFolderAction);
registerAction2(OpenFileAction);
registerAction2(OpenFolderAction);
registerAction2(OpenFolderViaWorkspaceAction);
registerAction2(OpenFileFolderAction);
registerAction2(OpenWorkspaceAction);
registerAction2(OpenWorkspaceConfigFileAction);
registerAction2(CloseWorkspaceAction);
registerAction2(SaveWorkspaceAsAction);
registerAction2(DuplicateWorkspaceInNewWindowAction);
// --- Menu Registration
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '2_open',
    command: {
        id: OpenFileAction.ID,
        title: localize({ key: 'miOpenFile', comment: ['&& denotes a mnemonic'] }, "&&Open File...")
    },
    order: 1,
    when: IsMacNativeContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '2_open',
    command: {
        id: OpenFolderAction.ID,
        title: localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")
    },
    order: 2,
    when: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '2_open',
    command: {
        id: OpenFolderViaWorkspaceAction.ID,
        title: localize({ key: 'miOpenFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...")
    },
    order: 2,
    when: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo('workspace'), IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '2_open',
    command: {
        id: OpenFileFolderAction.ID,
        title: localize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")
    },
    order: 1,
    when: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '2_open',
    command: {
        id: OpenWorkspaceAction.ID,
        title: localize({ key: 'miOpenWorkspace', comment: ['&& denotes a mnemonic'] }, "Open Wor&&kspace from File...")
    },
    order: 3,
    when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '3_workspace',
    command: {
        id: ADD_ROOT_FOLDER_COMMAND_ID,
        title: localize({ key: 'miAddFolderToWorkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Folder to Workspace...")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo('workspace')), IsSessionsWindowContext.negate()),
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '3_workspace',
    command: {
        id: SaveWorkspaceAsAction.ID,
        title: localize('miSaveWorkspaceAs', "Save Workspace As...")
    },
    order: 2,
    when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '3_workspace',
    command: {
        id: DuplicateWorkspaceInNewWindowAction.ID,
        title: localize('duplicateWorkspace', "Duplicate Workspace")
    },
    order: 3,
    when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '6_close',
    command: {
        id: CloseWorkspaceAction.ID,
        title: localize({ key: 'miCloseFolder', comment: ['&& denotes a mnemonic'] }, "Close &&Folder")
    },
    order: 3,
    when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('folder'), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    group: '6_close',
    command: {
        id: CloseWorkspaceAction.ID,
        title: localize({ key: 'miCloseWorkspace', comment: ['&& denotes a mnemonic'] }, "Close &&Workspace")
    },
    order: 3,
    when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace'), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRXRELE9BQU8sRUFBRSx3QkFBd0IsRUFBb0MseUJBQXlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4SixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxxQkFBcUIsRUFBRSxnQ0FBZ0MsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3pKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM3RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUscUNBQXFDLEVBQUUsdUJBQXVCLEVBQUUsaUNBQWlDLEVBQUUscUJBQXFCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsTyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkYsT0FBTyxFQUFFLDRCQUE0QixFQUFF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