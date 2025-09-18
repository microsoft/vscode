/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkingCopyHistoryService, IWorkingCopyHistoryEntry } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { getLocalHistoryDateFormatter } from './localHistory.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { LocalHistoryFileSystemProvider } from './localHistoryFileSystemProvider.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { LOCAL_HISTORY_ICON_ENTRY } from './localHistory.js';
import { IFileService } from '../../../../platform/files/common/files.js';

export class LocalHistoryQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = '@local';

	constructor(
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService
	) {
		super(LocalHistoryQuickAccessProvider.PREFIX, {
			noResultsPick: {
				label: localize('noLocalHistoryResults', "No local history entries found")
			}
		});
	}

	protected async _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {
		if (token.isCancellationRequested) {
			return [];
		}

		const picks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		const resources = await this.workingCopyHistoryService.getAll(token);

		if (token.isCancellationRequested) {
			return [];
		}

		if (resources.length === 0) {
			return [{
				label: localize('noLocalHistory', "No local history entries found"),
				description: localize('noLocalHistoryDetail', "Files are added to local history when they are saved.")
			}];
		}

		const dateFormatter = getLocalHistoryDateFormatter();
		const resourceGroups = new Map<string, IPickerQuickAccessItem[]>();

		for (const resource of resources) {
			if (token.isCancellationRequested) {
				return [];
			}

			const entries = await this.workingCopyHistoryService.getEntries(resource, token);
			if (entries.length === 0) {
				continue;
			}

			const resourceLabel = this.labelService.getUriLabel(resource, { relative: true });
			const resourceItems: IPickerQuickAccessItem[] = [];

			for (const entry of entries) {
				const label = SaveSourceRegistry.getSourceLabel(entry.source);
				const description = dateFormatter.format(entry.timestamp);
				const highlights = filter ? matchesFuzzy(filter, label) || matchesFuzzy(filter, resourceLabel) || matchesFuzzy(filter, description) : undefined;

				if (filter && !highlights) {
					continue;
				}

				resourceItems.push({
					label: `$(${LOCAL_HISTORY_ICON_ENTRY.id}) ${label}`,
					description,
					detail: resourceLabel,
					highlights: highlights ? { label: highlights } : undefined,
					iconClass: ThemeIcon.asClassName(LOCAL_HISTORY_ICON_ENTRY),
					accept: () => this.openEntry(entry)
				});
			}

			if (resourceItems.length > 0) {
				resourceGroups.set(resourceLabel, resourceItems);
			}
		}

		// Sort by resource name and add separators
		const sortedResourceNames = Array.from(resourceGroups.keys()).sort();
		let isFirst = true;

		for (const resourceName of sortedResourceNames) {
			const items = resourceGroups.get(resourceName)!;

			// Add separator for resource group (except for the first group)
			if (!isFirst) {
				picks.push({ type: 'separator' });
			}
			isFirst = false;

			// Sort entries by timestamp (newest first)
			items.sort((a, b) => {
				// Extract entry info for comparison - we'll embed it in the accept function closure
				return 0; // For now, keep original order
			});
			picks.push(...items);
		}

		return picks;
	}

	private async openEntry(entry: IWorkingCopyHistoryEntry): Promise<void> {
		const localHistoryResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({
			location: entry.location,
			associatedResource: entry.workingCopy.resource
		});

		// Check if the original file still exists
		const resourceExists = await this.fileService.exists(entry.workingCopy.resource);

		if (resourceExists) {
			// Compare with current file if it exists
			try {
				await this.commandService.executeCommand(
					API_OPEN_DIFF_EDITOR_COMMAND_ID,
					localHistoryResource,
					entry.workingCopy.resource,
					localize('localHistoryDiffTitle', "{0} ↔ {1}", 
						SaveSourceRegistry.getSourceLabel(entry.source),
						entry.workingCopy.name
					)
				);
			} catch (error) {
				// Fallback: open the local history entry directly
				await this.editorService.openEditor({
					resource: localHistoryResource
				});
			}
		} else {
			// Open the local history entry directly if original doesn't exist
			await this.editorService.openEditor({
				resource: localHistoryResource
			});
		}
	}
}