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
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';

export class LocalHistoryTimeline extends Disposable implements IWorkbenchContribution, TimelineProvider {

	static readonly ID = 'timeline.localHistory';

	readonly id = LocalHistoryTimeline.ID;

	readonly label = localize('localHistory', "Local History");

	readonly scheme = this.pathService.defaultUriScheme;

	private readonly _onDidChange = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ITimelineService private readonly timelineService: ITimelineService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IPathService private readonly pathService: IPathService
	) {
		super();

		this._register(this.timelineService.registerTimelineProvider(this));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.workingCopyHistoryService.onDidAddEntry(e => this.onDidAddWorkingCopyHistoryEntry(e.entry)));
	}

	private onDidAddWorkingCopyHistoryEntry(entry: IWorkingCopyHistoryEntry): void {

		// Re-emit as timeline change event
		this._onDidChange.fire({
			id: LocalHistoryTimeline.ID,
			uri: undefined, // for some reason the timeline only refreshes when `uri: undefined`
			reset: false
		});
	}

	async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken, internalOptions?: InternalTimelineOptions): Promise<Timeline> {
		const entries = await this.workingCopyHistoryService.getEntries(uri, token);

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
			themeIcon: Codicon.file,
			command: previousEntry ? {
				id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
				title: localize('compareLocalHistory', "Compare with Previous"),
				arguments: [
					previousEntry.location,
					entry.location,
					localize(
						'localHistoryCompareEditorLabel', "{0} ({1}) ↔ {2} ({3})",
						previousEntry.workingCopy.name,
						previousEntry.label,
						entry.workingCopy.name,
						entry.label
					),
					undefined
				]
			} : {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: localize('showLocalHistory', "Show Contents"),
				arguments: [
					entry.location,
					undefined,
					localize(
						'localHistoryEditorLabel', "{0} ({1})",
						entry.workingCopy.name,
						entry.label
					)
				]
			}
		};
	}
}
