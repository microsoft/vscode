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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { basename, isEqual } from 'vs/base/common/resources';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const OPEN_CHANGES_LABEL = { value: localize('localHistory.openChanges', "Open Changes"), original: 'Open Changes' };

export const LOCAL_HISTORY_MENU_CONTEXT_VALUE = 'localHistory:item';
export const LOCAL_HISTORY_MENU_CONTEXT_KEY = ContextKeyExpr.equals('timelineItem', LOCAL_HISTORY_MENU_CONTEXT_VALUE);

//#region Open Changes

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.openChanges',
			title: OPEN_CHANGES_LABEL,
			menu: {
				id: MenuId.TimelineItemContext,
				group: 'navigation',
				order: 1,
				when: LOCAL_HISTORY_MENU_CONTEXT_KEY
			}
		});
	}
	async run(accessor: ServicesAccessor, arg1: unknown, uri: URI): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);

		const { entry, previous } = await findLocalHistoryEntry(workingCopyHistoryService, uri);
		if (entry) {
			return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toCompareWithPreviousCommandArguments(entry, previous));
		}
	}
});

//#endregion

//#region Restore

const restoreSaveSource = SaveSourceRegistry.registerSource('localHistoryRestore.source', localize('localHistoryRestore.source', "File Restored"));

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.restore',
			title: { value: localize('localHistory.restore', "Restore..."), original: 'Restore...' },
			menu: {
				id: MenuId.TimelineItemContext,
				group: '1_restore',
				order: 1,
				when: LOCAL_HISTORY_MENU_CONTEXT_KEY
			}
		});
	}
	async run(accessor: ServicesAccessor, arg1: unknown, uri: URI): Promise<void> {
		const fileService = accessor.get(IFileService);
		const dialogService = accessor.get(IDialogService);
		const workingCopyService = accessor.get(IWorkingCopyService);
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
		const editorService = accessor.get(IEditorService);

		const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, uri);
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
});

//#endregion

//#region Helpers

export function toCompareWithPreviousCommandArguments(entry: IWorkingCopyHistoryEntry, previousEntry: IWorkingCopyHistoryEntry | undefined): unknown[] {
	return [
		LocalHistoryFileSystemProvider.toLocalHistoryFileSystem(previousEntry ?
			{ location: previousEntry.location, associatedResource: previousEntry.workingCopy.resource, label: previousEntry.workingCopy.name } :
			LocalHistoryFileSystemProvider.EMPTY
		),
		LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource, label: entry.workingCopy.name }),
		{
			label: previousEntry ? localize(
				'localHistoryCompareEditorLabel', "{0} ({1}) ↔ {2} ({3})",
				previousEntry.workingCopy.name,
				previousEntry.label,
				entry.workingCopy.name,
				entry.label
			) : localize(
				'localHistoryCompareEditorLabelWithoutPrevious', "{0} ({1})",
				entry.workingCopy.name,
				entry.label
			),
			description: SaveSourceRegistry.getSourceLabel(entry.source)
		},
		undefined // important to keep order of arguments in command proper
	];
}

async function findLocalHistoryEntry(workingCopyHistoryService: IWorkingCopyHistoryService, uri: URI): Promise<{ entry: IWorkingCopyHistoryEntry | undefined; previous: IWorkingCopyHistoryEntry | undefined }> {
	const { location, associatedResource } = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri);

	const entries = await workingCopyHistoryService.getEntries(associatedResource, CancellationToken.None);

	let currentEntry: IWorkingCopyHistoryEntry | undefined = undefined;
	let previousEntry: IWorkingCopyHistoryEntry | undefined = undefined;
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];

		if (isEqual(entry.location, location)) {
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
