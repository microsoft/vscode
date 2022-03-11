/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { InternalTimelineOptions, ITimelineService, Timeline, TimelineChangeEvent, TimelineItem, TimelineOptions, TimelineProvider } from 'vs/workbench/contrib/timeline/common/timeline';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { URI } from 'vs/base/common/uri';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { Codicon } from 'vs/base/common/codicons';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IFileService } from 'vs/platform/files/common/files';
import { LocalHistoryFileLabelFormatter, LocalHistoryFileSystemProvider } from 'vs/workbench/contrib/localHistory/browser/localHistoryFileSystemProvider';
import { ILabelService } from 'vs/platform/label/common/label';

export class LocalHistoryTimeline extends Disposable implements IWorkbenchContribution, TimelineProvider {

	static readonly ID = 'timeline.localHistory';

	readonly id = LocalHistoryTimeline.ID;

	readonly label = localize('localHistory', "Local History");

	readonly scheme = [this.pathService.defaultUriScheme, LocalHistoryFileSystemProvider.SCHEMA];

	private readonly _onDidChange = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ITimelineService private readonly timelineService: ITimelineService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IPathService private readonly pathService: IPathService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();

		this.registerComponents();
		this.registerListeners();
	}

	private registerComponents(): void {

		// Timeline
		this._register(this.timelineService.registerTimelineProvider(this));

		// File Service Provider
		this._register(this.fileService.registerProvider(LocalHistoryFileSystemProvider.SCHEMA, new LocalHistoryFileSystemProvider(this.fileService)));

		// Formatter
		this._register(this.labelService.registerFormatter(new LocalHistoryFileLabelFormatter()));
	}

	private registerListeners(): void {
		this._register(this.workingCopyHistoryService.onDidAddEntry(e => this.onDidAddWorkingCopyHistoryEntry(e.entry)));
	}

	private onDidAddWorkingCopyHistoryEntry(entry: IWorkingCopyHistoryEntry): void {

		// Re-emit as timeline change event
		this._onDidChange.fire({
			id: LocalHistoryTimeline.ID,
			uri: entry.workingCopy.resource,
			reset: false
		});
	}

	async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken, internalOptions?: InternalTimelineOptions): Promise<Timeline> {

		// Make sure to support both default scheme and local history
		// scheme, in case the user is looking at a history entry.
		let resource: URI;
		if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
			resource = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
		} else {
			resource = uri;
		}

		// Retrieve from working copy history
		const entries = await this.workingCopyHistoryService.getEntries(resource, token);

		// Convert to timeline items
		const items: TimelineItem[] = [];
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const previousEntry: IWorkingCopyHistoryEntry | undefined = entries[i - 1];

			items.push(this.toTimelineItem(entry, previousEntry));
		}

		return {
			source: LocalHistoryTimeline.ID,
			items
		};
	}

	private toTimelineItem(entry: IWorkingCopyHistoryEntry, previousEntry: IWorkingCopyHistoryEntry | undefined): TimelineItem {
		return {
			handle: entry.id,
			label: entry.label,
			description: entry.description,
			source: LocalHistoryTimeline.ID,
			timestamp: entry.timestamp,
			themeIcon: Codicon.save,
			command: {
				id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
				title: localize('compareLocalHistory', "Compare with Previous"),
				arguments: [
					LocalHistoryFileSystemProvider.toLocalHistoryFileSystem(previousEntry ? { location: previousEntry.location, associatedResource: previousEntry.workingCopy.resource, label: previousEntry.workingCopy.name } : LocalHistoryFileSystemProvider.EMPTY),
					LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource, label: entry.workingCopy.name }),
					previousEntry ? localize(
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
					undefined // important to keep order of arguments in command proper
				]
			}
		};
	}
}
