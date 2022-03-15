/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
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
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LOCAL_HISTORY_MENU_CONTEXT_VALUE, COMPARE_WITH_FILE_LABEL, toDiffEditorArguments } from 'vs/workbench/contrib/localHistory/browser/localHistoryCommands';

export class LocalHistoryTimeline extends Disposable implements IWorkbenchContribution, TimelineProvider {

	private static readonly ID = 'timeline.localHistory';

	private static readonly LOCAL_HISTORY_ENABLED_SETTINGS_KEY = 'workbench.localHistory.enabled';

	readonly id = LocalHistoryTimeline.ID;

	readonly label = localize('localHistory', "Local History");

	readonly scheme = '*'; // we try to show local history for all schemes if possible

	private readonly _onDidChange = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly timelineProviderDisposable = this._register(new MutableDisposable());

	constructor(
		@ITimelineService private readonly timelineService: ITimelineService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IPathService private readonly pathService: IPathService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.registerComponents();
		this.registerListeners();
	}

	private registerComponents(): void {

		// Timeline (if enabled)
		this.updateTimelineRegistration();

		// File Service Provider
		this._register(this.fileService.registerProvider(LocalHistoryFileSystemProvider.SCHEMA, new LocalHistoryFileSystemProvider(this.fileService)));

		// Formatter
		this._register(this.labelService.registerFormatter(new LocalHistoryFileLabelFormatter()));
	}

	private updateTimelineRegistration(): void {
		if (this.configurationService.getValue<boolean>(LocalHistoryTimeline.LOCAL_HISTORY_ENABLED_SETTINGS_KEY)) {
			this.timelineProviderDisposable.value = this.timelineService.registerTimelineProvider(this);
		} else {
			this.timelineProviderDisposable.clear();
		}
	}

	private registerListeners(): void {

		// History changes
		this._register(this.workingCopyHistoryService.onDidAddEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry, false /* entry added */)));
		this._register(this.workingCopyHistoryService.onDidRemoveEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry, true /* entry removed */)));

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LocalHistoryTimeline.LOCAL_HISTORY_ENABLED_SETTINGS_KEY)) {
				this.updateTimelineRegistration();
			}
		}));
	}

	private onDidChangeWorkingCopyHistoryEntry(entry: IWorkingCopyHistoryEntry, entryRemoved: boolean): void {

		// Re-emit as timeline change event
		this._onDidChange.fire({
			id: LocalHistoryTimeline.ID,
			uri: entry.workingCopy.resource,
			reset: entryRemoved
		});
	}

	async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken, internalOptions?: InternalTimelineOptions): Promise<Timeline> {
		const items: TimelineItem[] = [];

		// Try to convert the provided `uri` into a form that is likely
		// for the provider to find entries for:
		// - `vscode-local-history`: convert back to the associated resource
		// - default-scheme: keep as is
		// - anything that is backed by a file system provider: convert
		let resource: URI | undefined = undefined;
		if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
			resource = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
		} else if (uri.scheme === this.pathService.defaultUriScheme) {
			resource = uri;
		} else if (this.fileService.hasProvider(uri)) {
			resource = URI.from({ scheme: this.pathService.defaultUriScheme, authority: this.environmentService.remoteAuthority, path: uri.path });
		}

		if (resource) {

			// Retrieve from working copy history
			const entries = await this.workingCopyHistoryService.getEntries(resource, token);

			// Convert to timeline items
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				const previousEntry: IWorkingCopyHistoryEntry | undefined = entries[i - 1];

				items.push(this.toTimelineItem(entry, previousEntry));
			}
		}

		return {
			source: LocalHistoryTimeline.ID,
			items
		};
	}

	private toTimelineItem(entry: IWorkingCopyHistoryEntry, previousEntry: IWorkingCopyHistoryEntry | undefined): TimelineItem {
		return {
			handle: entry.id,
			label: SaveSourceRegistry.getSourceLabel(entry.source) ?? entry.source,
			description: entry.timestamp.label,
			source: LocalHistoryTimeline.ID,
			timestamp: entry.timestamp.value,
			themeIcon: Codicon.save,
			contextValue: LOCAL_HISTORY_MENU_CONTEXT_VALUE,
			command: {
				id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
				title: COMPARE_WITH_FILE_LABEL.value,
				arguments: toDiffEditorArguments(entry, entry.workingCopy.resource)
			}
		};
	}
}
