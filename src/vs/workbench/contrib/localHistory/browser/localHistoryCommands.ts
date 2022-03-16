/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { LocalHistoryFileSystemProvider } from 'vs/workbench/contrib/localHistory/browser/localHistoryFileSystemProvider';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { basename, basenameOrAuthority } from 'vs/base/common/resources';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ResourceContextKey } from 'vs/workbench/common/contextkeys';
import { Codicon } from 'vs/base/common/codicons';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export const LOCAL_HISTORY_MENU_CONTEXT_VALUE = 'localHistory:item';
export const LOCAL_HISTORY_MENU_CONTEXT_KEY = ContextKeyExpr.equals('timelineItem', LOCAL_HISTORY_MENU_CONTEXT_VALUE);

interface ITimelineCommandArgument {
	uri: URI;
	handle: string;
}

//#region Compare with File

export const COMPARE_WITH_FILE_LABEL = { value: localize('localHistory.compareWithFile', "Compare with File"), original: 'Compare with File' };

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
			title: { value: localize('localHistory.compareWithPrevious', "Compare with Previous"), original: 'Compare with Previous' },
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

async function openEntry(entry: IWorkingCopyHistoryEntry, editorService: IEditorService): Promise<void> {
	await editorService.openEditor({
		resource: LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource, label: entry.workingCopy.name }),
		label: localize('localHistoryEditorLabel', "{0} ({1} {2})", entry.workingCopy.name, SaveSourceRegistry.getSourceLabel(entry.source), entry.timestamp.label)
	});
}

//#endregion

//#region Select for Compare / Compare with Selected

let itemSelectedForCompare: ITimelineCommandArgument | undefined = undefined;

const LocalHistoryItemSelectedForCompare = new RawContextKey<boolean>('localHistoryItemSelectedForCompare', false, true);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.selectForCompare',
			title: { value: localize('localHistory.selectForCompare', "Select for Compare"), original: 'Select for Compare' },
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
			title: { value: localize('localHistory.compareWithSelected', "Compare with Selected"), original: 'Compare with Selected' },
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
			title: { value: localize('localHistory.open', "Show Contents"), original: 'Show Contents' },
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

const RESTORE_CONTENTS_LABEL = { value: localize('localHistory.restore', "Restore Contents"), original: 'Restore Contents' };

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.restoreFromEditor',
			title: RESTORE_CONTENTS_LABEL,
			menu: {
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: -10,
				when: ResourceContextKey.Scheme.isEqualTo(LocalHistoryFileSystemProvider.SCHEMA)
			},
			icon: Codicon.check
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
			message: localize('confirmRestoreMessage', "Do you want to restore the contents of '{0}'?", basename(entry.workingCopy.resource)),
			detail: localize('confirmRestoreDetail', "Restoring will discard any unsaved changes."),
			primaryButton: localize({ key: 'restoreButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Restore"),
			type: 'warning'
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
		await fileService.cloneFile(entry.location, entry.workingCopy.resource);

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
	}
}

//#endregion

//#region Rename

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.rename',
			title: { value: localize('localHistory.rename', "Rename"), original: 'Rename' },
			menu: {
				id: MenuId.TimelineItemContext,
				group: '4_edit',
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
			const inputBox = quickInputService.createInputBox();
			inputBox.title = localize('renameLocalHistoryEntryTitle', "Rename Local History Entry");
			inputBox.ignoreFocusOut = true;
			inputBox.placeholder = localize('renameLocalHistoryPlaceholder', "Enter the new name of the local history entry");
			inputBox.value = SaveSourceRegistry.getSourceLabel(entry.source);
			inputBox.show();
			inputBox.onDidAccept(() => {
				if (inputBox.value) {
					workingCopyHistoryService.updateEntry(entry, { source: inputBox.value }, CancellationToken.None);
				}
				inputBox.dispose();
			});
		}
	}
});

//#endregion

//#region Delete

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.delete',
			title: { value: localize('localHistory.delete', "Delete"), original: 'Delete' },
			menu: {
				id: MenuId.TimelineItemContext,
				group: '4_edit',
				order: 2,
				when: LOCAL_HISTORY_MENU_CONTEXT_KEY
			}
		});
	}
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
		const dialogService = accessor.get(IDialogService);

		const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
		if (entry) {

			// Ask for confirmation
			const { confirmed } = await dialogService.confirm({
				message: localize('confirmDeleteMessage', "Do you want to delete the local history entry of '{0}' from {1}?", entry.workingCopy.name, entry.timestamp.label),
				detail: localize('confirmDeleteDetail', "This action is irreversible!"),
				primaryButton: localize({ key: 'deleteButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete"),
				type: 'warning'
			});

			if (!confirmed) {
				return;
			}

			// Remove via service
			await workingCopyHistoryService.removeEntry(entry, CancellationToken.None);
		}
	}
});

//#endregion

//#region Delete All

const LOCAL_HISTORY_CATEGORY = { value: localize('localHistory.category', "Local History"), original: 'Local History' };

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.deleteAll',
			title: { value: localize('localHistory.deleteAll', "Delete All..."), original: 'Delete All...' },
			f1: true,
			category: LOCAL_HISTORY_CATEGORY
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);

		// Ask for confirmation
		const { confirmed } = await dialogService.confirm({
			message: localize('confirmDeleteAllMessage', "Do you want to delete all entries of the local history?"),
			detail: localize('confirmDeleteAllDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'deleteAllButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete All"),
			type: 'warning'
		});

		if (!confirmed) {
			return;
		}

		// Remove via service
		await workingCopyHistoryService.removeAll(CancellationToken.None);
	}
});

//#endregion

//#region Helpers

export function toDiffEditorArguments(entry: IWorkingCopyHistoryEntry, resource: URI): unknown[];
export function toDiffEditorArguments(previousEntry: IWorkingCopyHistoryEntry, entry: IWorkingCopyHistoryEntry): unknown[];
export function toDiffEditorArguments(arg1: IWorkingCopyHistoryEntry, arg2: IWorkingCopyHistoryEntry | URI): unknown[] {

	// Left hand side is always a working copy history entry
	const originalResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: arg1.location, associatedResource: arg1.workingCopy.resource, label: arg1.workingCopy.name });

	let label: string;

	// Right hand side depends on how the method was called
	// and is either another working copy history entry
	// or the file on disk.

	let modifiedResource: URI;

	// Compare with file on disk
	if (URI.isUri(arg2)) {
		const resource = arg2;

		modifiedResource = resource;
		label = localize('localHistoryCompareToFileEditorLabel', "{0} ({1} {2}) ↔ {3}", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), arg1.timestamp.label, arg1.workingCopy.name);
	}

	// Compare with another entry
	else {
		const modified = arg2;

		modifiedResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: modified.location, associatedResource: modified.workingCopy.resource, label: modified.workingCopy.name });
		label = localize('localHistoryCompareToPreviousEditorLabel', "{0} ({1} {2}) ↔ {3} ({4} {5})", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), arg1.timestamp.label, modified.workingCopy.name, SaveSourceRegistry.getSourceLabel(modified.source), modified.timestamp.label);
	}

	return [
		originalResource,
		modifiedResource,
		label,
		undefined // important to keep order of arguments in command proper
	];
}

async function findLocalHistoryEntry(workingCopyHistoryService: IWorkingCopyHistoryService, descriptor: ITimelineCommandArgument): Promise<{ entry: IWorkingCopyHistoryEntry | undefined; previous: IWorkingCopyHistoryEntry | undefined }> {
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

//#endregion
