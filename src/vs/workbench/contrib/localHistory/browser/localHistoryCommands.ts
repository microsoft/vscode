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
import { isEqual } from 'vs/base/common/resources';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';

export const OPEN_CHANGES_LABEL = { value: localize('localHistory.openChanges', "Open Changes"), original: 'Open Changes' };

export const LOCAL_HISTORY_MENU_CONTEXT_VALUE = 'localHistory:item';
export const LOCAL_HISTORY_MENU_CONTEXT_KEY = ContextKeyExpr.equals('timelineItem', LOCAL_HISTORY_MENU_CONTEXT_VALUE);

// Open Changes
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.openChanges',
			title: OPEN_CHANGES_LABEL,
			menu: {
				id: MenuId.TimelineItemContext,
				when: LOCAL_HISTORY_MENU_CONTEXT_KEY
			}
		});
	}
	async run(accessor: ServicesAccessor, arg1: unknown, uri: URI): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);

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

		if (currentEntry) {
			return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toCompareWithPreviousCommandArguments(currentEntry, previousEntry));
		}
	}
});

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
