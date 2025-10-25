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
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { LocalHistoryFileSystemProvider } from './localHistoryFileSystemProvider.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { registerAction2, Action2, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { basename, basenameOrAuthority, dirname } from '../../../../base/common/resources.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { EditorResourceAccessor, SaveSourceRegistry, SideBySideEditor } from '../../../common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../common/contextkeys.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
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
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

const LOCAL_HISTORY_CATEGORY = localize2('localHistory.category', 'Local History');
const CTX_LOCAL_HISTORY_ENABLED = ContextKeyExpr.has('config.workbench.localHistory.enabled');

export interface ITimelineCommandArgument {
	uri: URI;
	handle: string;
}

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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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

let itemSelectedForCompare: ITimelineCommandArgument | undefined = undefined;

const LocalHistoryItemSelectedForCompare = new RawContextKey<boolean>('localHistoryItemSelectedForCompare', false, true);

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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor, uri: URI): Promise<void> {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
		return restore(accessor, item);
	}
});

const restoreSaveSource = SaveSourceRegistry.registerSource('localHistoryRestore.source', localize('localHistoryRestore.source', "File Restored"));

async function restore(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
		} catch (error) {

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
	async run(accessor: ServicesAccessor): Promise<void> {
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
		const resourcePicker = resourcePickerDisposables.add(quickInputService.createQuickPick<IQuickPickItem & { resource: URI }>());

		let cts = new CancellationTokenSource();
		resourcePickerDisposables.add(resourcePicker.onDidHide(() => cts.dispose(true)));

		resourcePicker.busy = true;
		resourcePicker.show();

		const resources = new ResourceSet(await workingCopyHistoryService.getAll(cts.token));
		const recentEditorResources = new ResourceSet(coalesce(historyService.getHistory().map(({ resource }) => resource)));

		const resourcesSortedByRecency: URI[] = [];
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
		const entryPicker = entryPickerDisposables.add(quickInputService.createQuickPick<IQuickPickItem & { entry: IWorkingCopyHistoryEntry }>());

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

		entryPickerDisposables.add(entryPicker.onDidAccept(async e => {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
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
	async run(accessor: ServicesAccessor): Promise<void> {
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
	async run(accessor: ServicesAccessor): Promise<void> {
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

async function openEntry(entry: IWorkingCopyHistoryEntry, editorService: IEditorService, options?: IEditorOptions): Promise<void> {
	const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });

	await editorService.openEditor({
		resource,
		label: localize('localHistoryEditorLabel', "{0} ({1} • {2})", entry.workingCopy.name, SaveSourceRegistry.getSourceLabel(entry.source), toLocalHistoryEntryDateLabel(entry.timestamp)),
		options
	});
}

async function closeEntry(entry: IWorkingCopyHistoryEntry, editorService: IEditorService): Promise<void> {
	const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });

	const editors = editorService.findEditors(resource, { supportSideBySide: SideBySideEditor.ANY });
	await editorService.closeEditors(editors, { preserveFocus: true });
}

export function toDiffEditorArguments(entry: IWorkingCopyHistoryEntry, resource: URI, options?: IEditorOptions): unknown[];
export function toDiffEditorArguments(previousEntry: IWorkingCopyHistoryEntry, entry: IWorkingCopyHistoryEntry, options?: IEditorOptions): unknown[];
export function toDiffEditorArguments(arg1: IWorkingCopyHistoryEntry, arg2: IWorkingCopyHistoryEntry | URI, options?: IEditorOptions): unknown[] {

	// Left hand side is always a working copy history entry
	const originalResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: arg1.location, associatedResource: arg1.workingCopy.resource });

	let label: string;

	// Right hand side depends on how the method was called
	// and is either another working copy history entry
	// or the file on disk.

	let modifiedResource: URI;

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

export async function findLocalHistoryEntry(workingCopyHistoryService: IWorkingCopyHistoryService, descriptor: ITimelineCommandArgument): Promise<{ entry: IWorkingCopyHistoryEntry | undefined; previous: IWorkingCopyHistoryEntry | undefined }> {
	const entries = await workingCopyHistoryService.getEntries(descriptor.uri, CancellationToken.None);

	let currentEntry: IWorkingCopyHistoryEntry | undefined = undefined;
	let previousEntry: IWorkingCopyHistoryEntry | undefined = undefined;
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
function toLocalHistoryEntryDateLabel(timestamp: number): string {
	return `${getLocalHistoryDateFormatter().format(timestamp).replace(SEP, '-')}`; // preserving `/` will break editor labels, so replace it with a non-path symbol
}

//#endregion
