/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import { hasWorkspaceFileExtension, IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../services/workspaces/common/workspaceEditing.js';
import { dirname } from '../../../base/common/resources.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { mnemonicButtonLabel } from '../../../base/common/labels.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { FileKind } from '../../../platform/files/common/files.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { IWorkspacesService } from '../../../platform/workspaces/common/workspaces.js';
import { IPathService } from '../../services/path/common/pathService.js';
export const ADD_ROOT_FOLDER_COMMAND_ID = 'addRootFolder';
export const ADD_ROOT_FOLDER_LABEL = localize2('addFolderToWorkspace', 'Add Folder to Workspace...');
export const SET_ROOT_FOLDER_COMMAND_ID = 'setRootFolder';
export const PICK_WORKSPACE_FOLDER_COMMAND_ID = '_workbench.pickWorkspaceFolder';
// Command registration
CommandsRegistry.registerCommand({
    id: 'workbench.action.files.openFileFolderInNewWindow',
    handler: (accessor) => accessor.get(IFileDialogService).pickFileFolderAndOpen({ forceNewWindow: true })
});
CommandsRegistry.registerCommand({
    id: '_files.pickFolderAndOpen',
    handler: (accessor, options) => accessor.get(IFileDialogService).pickFolderAndOpen(options)
});
CommandsRegistry.registerCommand({
    id: 'workbench.action.files.openFolderInNewWindow',
    handler: (accessor) => accessor.get(IFileDialogService).pickFolderAndOpen({ forceNewWindow: true })
});
CommandsRegistry.registerCommand({
    id: 'workbench.action.files.openFileInNewWindow',
    handler: (accessor) => accessor.get(IFileDialogService).pickFileAndOpen({ forceNewWindow: true })
});
CommandsRegistry.registerCommand({
    id: 'workbench.action.openWorkspaceInNewWindow',
    handler: (accessor) => accessor.get(IFileDialogService).pickWorkspaceAndOpen({ forceNewWindow: true })
});
CommandsRegistry.registerCommand({
    id: ADD_ROOT_FOLDER_COMMAND_ID,
    handler: async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        const folders = await selectWorkspaceFolders(accessor);
        if (!folders?.length) {
            return;
        }
        await workspaceEditingService.addFolders(folders.map(folder => ({ uri: folder })));
    }
});
CommandsRegistry.registerCommand({
    id: SET_ROOT_FOLDER_COMMAND_ID,
    handler: async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        const contextService = accessor.get(IWorkspaceContextService);
        const folders = await selectWorkspaceFolders(accessor);
        if (!folders?.length) {
            return;
        }
        await workspaceEditingService.updateFolders(0, contextService.getWorkspace().folders.length, folders.map(folder => ({ uri: folder })));
    }
});
async function selectWorkspaceFolders(accessor) {
    const dialogsService = accessor.get(IFileDialogService);
    const pathService = accessor.get(IPathService);
    const folders = await dialogsService.showOpenDialog({
        openLabel: mnemonicButtonLabel(localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")),
        title: localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"),
        canSelectFolders: true,
        canSelectMany: true,
        defaultUri: await dialogsService.defaultFolderPath(),
        availableFileSystems: [pathService.defaultUriScheme]
    });
    return folders;
}
CommandsRegistry.registerCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, async function (accessor, args) {
    const quickInputService = accessor.get(IQuickInputService);
    const labelService = accessor.get(ILabelService);
    const contextService = accessor.get(IWorkspaceContextService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const folders = contextService.getWorkspace().folders;
    if (!folders.length) {
        return;
    }
    const folderPicks = folders.map(folder => {
        const label = folder.name;
        const description = labelService.getUriLabel(dirname(folder.uri), { relative: true });
        return {
            label,
            description: description !== label ? description : undefined, // https://github.com/microsoft/vscode/issues/183418
            folder,
            iconClasses: getIconClasses(modelService, languageService, folder.uri, FileKind.ROOT_FOLDER)
        };
    });
    const options = (args ? args[0] : undefined) || Object.create(null);
    if (!options.activeItem) {
        options.activeItem = folderPicks[0];
    }
    if (!options.placeHolder) {
        options.placeHolder = localize('workspaceFolderPickerPlaceholder', "Select workspace folder");
    }
    if (typeof options.matchOnDescription !== 'boolean') {
        options.matchOnDescription = true;
    }
    const token = (args ? args[1] : undefined) || CancellationToken.None;
    const pick = await quickInputService.pick(folderPicks, options, token);
    if (pick) {
        return folders[folderPicks.indexOf(pick)];
    }
    return;
});
CommandsRegistry.registerCommand({
    id: 'vscode.openFolder',
    handler: (accessor, uriComponents, arg) => {
        const commandService = accessor.get(ICommandService);
        // Be compatible to previous args by converting to options
        if (typeof arg === 'boolean') {
            arg = { forceNewWindow: arg };
        }
        // Without URI, ask to pick a folder or workspace to open
        if (!uriComponents) {
            const options = {
                forceNewWindow: arg?.forceNewWindow
            };
            if (arg?.forceLocalWindow) {
                options.remoteAuthority = null;
                options.availableFileSystems = ['file'];
            }
            return commandService.executeCommand('_files.pickFolderAndOpen', options);
        }
        const uri = URI.from(uriComponents, true);
        const options = {
            forceNewWindow: arg?.forceNewWindow,
            forceReuseWindow: arg?.forceReuseWindow,
            noRecentEntry: arg?.noRecentEntry,
            remoteAuthority: arg?.forceLocalWindow ? null : undefined,
            forceProfile: arg?.forceProfile,
            forceTempProfile: arg?.forceTempProfile,
        };
        const workspaceToOpen = (hasWorkspaceFileExtension(uri) || uri.scheme === Schemas.untitled) ? { workspaceUri: uri } : { folderUri: uri };
        const filesToOpen = arg?.filesToOpen?.map(file => ({ fileUri: URI.from(file, true) })) ?? [];
        return commandService.executeCommand('_files.windowOpen', [workspaceToOpen, ...filesToOpen], options);
    },
    metadata: {
        description: 'Open a folder or workspace in the current window or new window depending on the newWindow argument. Note that opening in the same window will shutdown the current extension host process and start a new one on the given folder/workspace unless the newWindow parameter is set to true.',
        args: [
            {
                name: 'uri', description: '(optional) Uri of the folder or workspace file to open. If not provided, a native dialog will ask the user for the folder',
                constraint: (value) => value === undefined || value === null || value instanceof URI
            },
            {
                name: 'options',
                description: '(optional) Options. Object with the following properties: ' +
                    '`forceNewWindow`: Whether to open the folder/workspace in a new window or the same. Defaults to opening in the same window. ' +
                    '`forceReuseWindow`: Whether to force opening the folder/workspace in the same window.  Defaults to false. ' +
                    '`noRecentEntry`: Whether the opened URI will appear in the \'Open Recent\' list. Defaults to false. ' +
                    '`forceLocalWindow`: Whether to force opening the folder/workspace in a local window. Defaults to false. ' +
                    '`forceProfile`: The profile to use when opening the folder/workspace. Defaults to the current profile. ' +
                    '`forceTempProfile`: Whether to use a temporary profile when opening the folder/workspace. Defaults to false. ' +
                    '`filesToOpen`: An array of files to open in the new window. Defaults to an empty array. ' +
                    'Note, for backward compatibility, options can also be of type boolean, representing the `forceNewWindow` setting.',
                constraint: (value) => value === undefined || typeof value === 'object' || typeof value === 'boolean'
            }
        ]
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.newWindow',
    handler: (accessor, options) => {
        const commandService = accessor.get(ICommandService);
        const commandOptions = {
            forceReuseWindow: options?.reuseWindow,
            remoteAuthority: options?.remoteAuthority
        };
        return commandService.executeCommand('_files.newWindow', commandOptions);
    },
    metadata: {
        description: 'Opens an new window depending on the newWindow argument.',
        args: [
            {
                name: 'options',
                description: '(optional) Options. Object with the following properties: ' +
                    '`reuseWindow`: Whether to open a new window or the same. Defaults to opening in a new window. ',
                constraint: (value) => value === undefined || typeof value === 'object'
            }
        ]
    }
});
// recent history commands
CommandsRegistry.registerCommand('_workbench.removeFromRecentlyOpened', function (accessor, uri) {
    const workspacesService = accessor.get(IWorkspacesService);
    return workspacesService.removeRecentlyOpened([uri]);
});
CommandsRegistry.registerCommand({
    id: 'vscode.removeFromRecentlyOpened',
    handler: (accessor, path) => {
        const workspacesService = accessor.get(IWorkspacesService);
        if (typeof path === 'string') {
            path = path.match(/^[^:/?#]+:\/\//) ? URI.parse(path) : URI.file(path);
        }
        else {
            path = URI.revive(path); // called from extension host
        }
        return workspacesService.removeRecentlyOpened([path]);
    },
    metadata: {
        description: 'Removes an entry with the given path from the recently opened list.',
        args: [
            { name: 'path', description: 'URI or URI string to remove from recently opened.', constraint: (value) => typeof value === 'string' || value instanceof URI }
        ]
    }
});
CommandsRegistry.registerCommand('_workbench.addToRecentlyOpened', async function (accessor, recentEntry) {
    const workspacesService = accessor.get(IWorkspacesService);
    const uri = recentEntry.uri;
    const label = recentEntry.label;
    const remoteAuthority = recentEntry.remoteAuthority;
    let recent = undefined;
    if (recentEntry.type === 'workspace') {
        const workspace = await workspacesService.getWorkspaceIdentifier(uri);
        recent = { workspace, label, remoteAuthority };
    }
    else if (recentEntry.type === 'folder') {
        recent = { folderUri: uri, label, remoteAuthority };
    }
    else {
        recent = { fileUri: uri, label, remoteAuthority };
    }
    return workspacesService.addRecentlyOpened([recent]);
});
CommandsRegistry.registerCommand('_workbench.getRecentlyOpened', async function (accessor) {
    const workspacesService = accessor.get(IWorkspacesService);
    return workspacesService.getRecentlyOpened();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlQ29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBZ0MsTUFBTSxtREFBbUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pF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