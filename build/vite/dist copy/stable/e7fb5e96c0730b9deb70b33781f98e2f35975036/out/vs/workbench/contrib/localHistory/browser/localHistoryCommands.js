/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IWorkingCopyHistoryService } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { LocalHistoryFileSystemProvider } from './localHistoryFileSystemProvider.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { registerAction2, Action2, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { basename, basenameOrAuthority, dirname } from '../../../../base/common/resources.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { EditorResourceAccessor, SaveSourceRegistry, SideBySideEditor } from '../../../common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../common/contextkeys.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_RESTORE, LOCAL_HISTORY_MENU_CONTEXT_KEY } from './localHistory.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
const LOCAL_HISTORY_CATEGORY = localize2('localHistory.category', 'Local History');
const CTX_LOCAL_HISTORY_ENABLED = ContextKeyExpr.has('config.workbench.localHistory.enabled');
//#region Compare with File
export const COMPARE_WITH_FILE_LABEL = localize2('localHistory.compareWithFile', 'Compare with File');
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.compareWithFile',
            title: COMPARE_WITH_FILE_LABEL,
            menu: {
                id: MenuId.TimelineItemContext,
                group: '1_compare',
                order: 1,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const commandService = accessor.get(ICommandService);
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(entry, entry.workingCopy.resource));
        }
    }
});
//#endregion
//#region Compare with Previous
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.compareWithPrevious',
            title: localize2('localHistory.compareWithPrevious', 'Compare with Previous'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '1_compare',
                order: 2,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const commandService = accessor.get(ICommandService);
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const editorService = accessor.get(IEditorService);
        const { entry, previous } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            // Without a previous entry, just show the entry directly
            if (!previous) {
                return openEntry(entry, editorService);
            }
            // Open real diff editor
            return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(previous, entry));
        }
    }
});
//#endregion
//#region Select for Compare / Compare with Selected
let itemSelectedForCompare = undefined;
const LocalHistoryItemSelectedForCompare = new RawContextKey('localHistoryItemSelectedForCompare', false, true);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.selectForCompare',
            title: localize2('localHistory.selectForCompare', 'Select for Compare'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '2_compare_with',
                order: 2,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const contextKeyService = accessor.get(IContextKeyService);
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            itemSelectedForCompare = item;
            LocalHistoryItemSelectedForCompare.bindTo(contextKeyService).set(true);
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.compareWithSelected',
            title: localize2('localHistory.compareWithSelected', 'Compare with Selected'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '2_compare_with',
                order: 1,
                when: ContextKeyExpr.and(LOCAL_HISTORY_MENU_CONTEXT_KEY, LocalHistoryItemSelectedForCompare)
            }
        });
    }
    async run(accessor, item) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const commandService = accessor.get(ICommandService);
        if (!itemSelectedForCompare) {
            return;
        }
        const selectedEntry = (await findLocalHistoryEntry(workingCopyHistoryService, itemSelectedForCompare)).entry;
        if (!selectedEntry) {
            return;
        }
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedEntry, entry));
        }
    }
});
//#endregion
//#region Show Contents
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.open',
            title: localize2('localHistory.open', 'Show Contents'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '3_contents',
                order: 1,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const editorService = accessor.get(IEditorService);
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            return openEntry(entry, editorService);
        }
    }
});
//#region Restore Contents
const RESTORE_CONTENTS_LABEL = localize2('localHistory.restore', 'Restore Contents');
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.restoreViaEditor',
            title: RESTORE_CONTENTS_LABEL,
            menu: {
                id: MenuId.EditorTitle,
                group: 'navigation',
                order: -10,
                when: ResourceContextKey.Scheme.isEqualTo(LocalHistoryFileSystemProvider.SCHEMA)
            },
            icon: LOCAL_HISTORY_ICON_RESTORE
        });
    }
    async run(accessor, uri) {
        const { associatedResource, location } = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri);
        return restore(accessor, { uri: associatedResource, handle: basenameOrAuthority(location) });
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.restore',
            title: RESTORE_CONTENTS_LABEL,
            menu: {
                id: MenuId.TimelineItemContext,
                group: '3_contents',
                order: 2,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        return restore(accessor, item);
    }
});
const restoreSaveSource = SaveSourceRegistry.registerSource('localHistoryRestore.source', localize('localHistoryRestore.source', "File Restored"));
async function restore(accessor, item) {
    const fileService = accessor.get(IFileService);
    const dialogService = accessor.get(IDialogService);
    const workingCopyService = accessor.get(IWorkingCopyService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
        // Ask for confirmation
        const { confirmed } = await dialogService.confirm({
            type: 'warning',
            message: localize('confirmRestoreMessage', "Do you want to restore the contents of '{0}'?", basename(entry.workingCopy.resource)),
            detail: localize('confirmRestoreDetail', "Restoring will discard any unsaved changes."),
            primaryButton: localize({ key: 'restoreButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Restore")
        });
        if (!confirmed) {
            return;
        }
        // Revert all dirty working copies for target
        const workingCopies = workingCopyService.getAll(entry.workingCopy.resource);
        if (workingCopies) {
            for (const workingCopy of workingCopies) {
                if (workingCopy.isDirty()) {
                    await workingCopy.revert({ soft: true });
                }
            }
        }
        // Replace target with contents of history entry
        try {
            await fileService.cloneFile(entry.location, entry.workingCopy.resource);
        }
        catch (error) {
            // It is possible that we fail to copy the history entry to the
            // destination, for example when the destination is write protected.
            // In that case tell the user and return, it is still possible for
            // the user to manually copy the changes over from the diff editor.
            await dialogService.error(localize('unableToRestore', "Unable to restore '{0}'.", basename(entry.workingCopy.resource)), toErrorMessage(error));
            return;
        }
        // Restore all working copies for target
        if (workingCopies) {
            for (const workingCopy of workingCopies) {
                await workingCopy.revert({ force: true });
            }
        }
        // Open target
        await editorService.openEditor({ resource: entry.workingCopy.resource });
        // Add new entry
        await workingCopyHistoryService.addEntry({
            resource: entry.workingCopy.resource,
            source: restoreSaveSource
        }, CancellationToken.None);
        // Close source
        await closeEntry(entry, editorService);
    }
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.restoreViaPicker',
            title: localize2('localHistory.restoreViaPicker', 'Find Entry to Restore'),
            f1: true,
            category: LOCAL_HISTORY_CATEGORY,
            precondition: CTX_LOCAL_HISTORY_ENABLED
        });
    }
    async run(accessor) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const quickInputService = accessor.get(IQuickInputService);
        const modelService = accessor.get(IModelService);
        const languageService = accessor.get(ILanguageService);
        const labelService = accessor.get(ILabelService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const commandService = accessor.get(ICommandService);
        const historyService = accessor.get(IHistoryService);
        // Show all resources with associated history entries in picker
        // with progress because this operation will take longer the more
        // files have been saved overall.
        //
        // Sort the resources by history to put more relevant entries
        // to the top.
        const resourcePickerDisposables = new DisposableStore();
        const resourcePicker = resourcePickerDisposables.add(quickInputService.createQuickPick());
        let cts = new CancellationTokenSource();
        resourcePickerDisposables.add(resourcePicker.onDidHide(() => cts.dispose(true)));
        resourcePicker.busy = true;
        resourcePicker.show();
        const resources = new ResourceSet(await workingCopyHistoryService.getAll(cts.token));
        const recentEditorResources = new ResourceSet(coalesce(historyService.getHistory().map(({ resource }) => resource)));
        const resourcesSortedByRecency = [];
        for (const resource of recentEditorResources) {
            if (resources.has(resource)) {
                resourcesSortedByRecency.push(resource);
                resources.delete(resource);
            }
        }
        resourcesSortedByRecency.push(...[...resources].sort((r1, r2) => r1.fsPath < r2.fsPath ? -1 : 1));
        resourcePicker.busy = false;
        resourcePicker.placeholder = localize('restoreViaPicker.filePlaceholder', "Select the file to show local history for");
        resourcePicker.matchOnLabel = true;
        resourcePicker.matchOnDescription = true;
        resourcePicker.items = [...resourcesSortedByRecency].map(resource => ({
            resource,
            label: basenameOrAuthority(resource),
            description: labelService.getUriLabel(dirname(resource), { relative: true }),
            iconClasses: getIconClasses(modelService, languageService, resource)
        }));
        await Event.toPromise(resourcePicker.onDidAccept);
        resourcePickerDisposables.dispose();
        const resource = resourcePicker.selectedItems.at(0)?.resource;
        if (!resource) {
            return;
        }
        // Show all entries for the picked resource in another picker
        // and open the entry in the end that was selected by the user
        const entryPickerDisposables = new DisposableStore();
        const entryPicker = entryPickerDisposables.add(quickInputService.createQuickPick());
        cts = new CancellationTokenSource();
        entryPickerDisposables.add(entryPicker.onDidHide(() => cts.dispose(true)));
        entryPicker.busy = true;
        entryPicker.show();
        const entries = await workingCopyHistoryService.getEntries(resource, cts.token);
        entryPicker.busy = false;
        entryPicker.canAcceptInBackground = true;
        entryPicker.placeholder = localize('restoreViaPicker.entryPlaceholder', "Select the local history entry to open");
        entryPicker.matchOnLabel = true;
        entryPicker.matchOnDescription = true;
        entryPicker.items = Array.from(entries).reverse().map(entry => ({
            entry,
            label: `$(circle-outline) ${SaveSourceRegistry.getSourceLabel(entry.source)}`,
            description: toLocalHistoryEntryDateLabel(entry.timestamp)
        }));
        entryPickerDisposables.add(entryPicker.onDidAccept(async (e) => {
            if (!e.inBackground) {
                entryPickerDisposables.dispose();
            }
            const selectedItem = entryPicker.selectedItems.at(0);
            if (!selectedItem) {
                return;
            }
            const resourceExists = await fileService.exists(selectedItem.entry.workingCopy.resource);
            if (resourceExists) {
                return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedItem.entry, selectedItem.entry.workingCopy.resource, { preserveFocus: e.inBackground }));
            }
            return openEntry(selectedItem.entry, editorService, { preserveFocus: e.inBackground });
        }));
    }
});
MenuRegistry.appendMenuItem(MenuId.TimelineTitle, { command: { id: 'workbench.action.localHistory.restoreViaPicker', title: localize2('localHistory.restoreViaPickerMenu', 'Local History: Find Entry to Restore...') }, group: 'submenu', order: 1, when: CTX_LOCAL_HISTORY_ENABLED });
//#endregion
//#region Rename
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.rename',
            title: localize2('localHistory.rename', 'Rename'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '5_edit',
                order: 1,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const quickInputService = accessor.get(IQuickInputService);
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            const disposables = new DisposableStore();
            const inputBox = disposables.add(quickInputService.createInputBox());
            inputBox.title = localize('renameLocalHistoryEntryTitle', "Rename Local History Entry");
            inputBox.ignoreFocusOut = true;
            inputBox.placeholder = localize('renameLocalHistoryPlaceholder', "Enter the new name of the local history entry");
            inputBox.value = SaveSourceRegistry.getSourceLabel(entry.source);
            inputBox.show();
            disposables.add(inputBox.onDidAccept(() => {
                if (inputBox.value) {
                    workingCopyHistoryService.updateEntry(entry, { source: inputBox.value }, CancellationToken.None);
                }
                disposables.dispose();
            }));
        }
    }
});
//#endregion
//#region Delete
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.delete',
            title: localize2('localHistory.delete', 'Delete'),
            menu: {
                id: MenuId.TimelineItemContext,
                group: '5_edit',
                order: 2,
                when: LOCAL_HISTORY_MENU_CONTEXT_KEY
            }
        });
    }
    async run(accessor, item) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const editorService = accessor.get(IEditorService);
        const dialogService = accessor.get(IDialogService);
        const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
        if (entry) {
            // Ask for confirmation
            const { confirmed } = await dialogService.confirm({
                type: 'warning',
                message: localize('confirmDeleteMessage', "Do you want to delete the local history entry of '{0}' from {1}?", entry.workingCopy.name, toLocalHistoryEntryDateLabel(entry.timestamp)),
                detail: localize('confirmDeleteDetail', "This action is irreversible!"),
                primaryButton: localize({ key: 'deleteButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete"),
            });
            if (!confirmed) {
                return;
            }
            // Remove via service
            await workingCopyHistoryService.removeEntry(entry, CancellationToken.None);
            // Close any opened editors
            await closeEntry(entry, editorService);
        }
    }
});
//#endregion
//#region Delete All
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.deleteAll',
            title: localize2('localHistory.deleteAll', 'Delete All'),
            f1: true,
            category: LOCAL_HISTORY_CATEGORY,
            precondition: CTX_LOCAL_HISTORY_ENABLED
        });
    }
    async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        // Ask for confirmation
        const { confirmed } = await dialogService.confirm({
            type: 'warning',
            message: localize('confirmDeleteAllMessage', "Do you want to delete all entries of all files in local history?"),
            detail: localize('confirmDeleteAllDetail', "This action is irreversible!"),
            primaryButton: localize({ key: 'deleteAllButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete All"),
        });
        if (!confirmed) {
            return;
        }
        // Remove via service
        await workingCopyHistoryService.removeAll(CancellationToken.None);
    }
});
//#endregion
//#region Create
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.localHistory.create',
            title: localize2('localHistory.create', 'Create Entry'),
            f1: true,
            category: LOCAL_HISTORY_CATEGORY,
            precondition: ContextKeyExpr.and(CTX_LOCAL_HISTORY_ENABLED, ActiveEditorContext)
        });
    }
    async run(accessor) {
        const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        const labelService = accessor.get(ILabelService);
        const pathService = accessor.get(IPathService);
        const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (resource?.scheme !== pathService.defaultUriScheme && resource?.scheme !== Schemas.vscodeUserData) {
            return; // only enable for selected schemes
        }
        const disposables = new DisposableStore();
        const inputBox = disposables.add(quickInputService.createInputBox());
        inputBox.title = localize('createLocalHistoryEntryTitle', "Create Local History Entry");
        inputBox.ignoreFocusOut = true;
        inputBox.placeholder = localize('createLocalHistoryPlaceholder', "Enter the new name of the local history entry for '{0}'", labelService.getUriBasenameLabel(resource));
        inputBox.show();
        disposables.add(inputBox.onDidAccept(async () => {
            const entrySource = inputBox.value;
            disposables.dispose();
            if (entrySource) {
                await workingCopyHistoryService.addEntry({ resource, source: inputBox.value }, CancellationToken.None);
            }
        }));
    }
});
//#endregion
//#region Helpers
async function openEntry(entry, editorService, options) {
    const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
    await editorService.openEditor({
        resource,
        label: localize('localHistoryEditorLabel', "{0} ({1} • {2})", entry.workingCopy.name, SaveSourceRegistry.getSourceLabel(entry.source), toLocalHistoryEntryDateLabel(entry.timestamp)),
        options
    });
}
async function closeEntry(entry, editorService) {
    const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
    const editors = editorService.findEditors(resource, { supportSideBySide: SideBySideEditor.ANY });
    await editorService.closeEditors(editors, { preserveFocus: true });
}
export function toDiffEditorArguments(arg1, arg2, options) {
    // Left hand side is always a working copy history entry
    const originalResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: arg1.location, associatedResource: arg1.workingCopy.resource });
    let label;
    // Right hand side depends on how the method was called
    // and is either another working copy history entry
    // or the file on disk.
    let modifiedResource;
    // Compare with file on disk
    if (URI.isUri(arg2)) {
        const resource = arg2;
        modifiedResource = resource;
        label = localize('localHistoryCompareToFileEditorLabel', "{0} ({1} • {2}) ↔ {3}", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), arg1.workingCopy.name);
    }
    // Compare with another entry
    else {
        const modified = arg2;
        modifiedResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: modified.location, associatedResource: modified.workingCopy.resource });
        label = localize('localHistoryCompareToPreviousEditorLabel', "{0} ({1} • {2}) ↔ {3} ({4} • {5})", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), modified.workingCopy.name, SaveSourceRegistry.getSourceLabel(modified.source), toLocalHistoryEntryDateLabel(modified.timestamp));
    }
    return [
        originalResource,
        modifiedResource,
        label,
        options ? [undefined, options] : undefined
    ];
}
export async function findLocalHistoryEntry(workingCopyHistoryService, descriptor) {
    // When the resource URI uses the `vscode-local-history` scheme (e.g.
    // when triggered from the diff editor), map it back to the original
    // file URI so that the history service can find matching entries.
    let uri = descriptor.uri;
    if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
        uri = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
    }
    const entries = await workingCopyHistoryService.getEntries(uri, CancellationToken.None);
    let currentEntry = undefined;
    let previousEntry = undefined;
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.id === descriptor.handle) {
            currentEntry = entry;
            previousEntry = entries[i - 1];
            break;
        }
    }
    return {
        entry: currentEntry,
        previous: previousEntry
    };
}
const SEP = /\//g;
function toLocalHistoryEntryDateLabel(timestamp) {
    return `${getLocalHistoryDateFormatter().format(timestamp).replace(SEP, '-')}`; // preserving `/` will break editor labels, so replace it with a non-path symbol
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxIaXN0b3J5Q29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2NhbEhpc3RvcnkvYnJvd3Nlci9sb2NhbEhpc3RvcnlDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQTRCLDBCQUEwQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEksT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbEcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV6SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHNC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