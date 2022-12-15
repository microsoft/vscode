/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITimelineService, Timeline, TimelineChangeEvent, TimelineItem, TimelineOptions, TimelineProvider } from 'vs/workbench/contrib/timeline/common/timeline';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { URI } from 'vs/base/common/uri';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IFileService } from 'vs/platform/files/common/files';
import { LocalHistoryFileSystemProvider } from 'vs/workbench/contrib/localHistory/browser/localHistoryFileSystemProvider';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { COMPARE_WITH_FILE_LABEL, toDiffEditorArguments } from 'vs/workbench/contrib/localHistory/browser/localHistoryCommands';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_ENTRY, LOCAL_HISTORY_MENU_CONTEXT_VALUE } from 'vs/workbench/contrib/localHistory/browser/localHistory';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getVirtualWorkspaceAuthority } from 'vs/platform/workspace/common/virtualWorkspace';

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
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
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
		this._register(this.workingCopyHistoryService.onDidAddEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
		this._register(this.workingCopyHistoryService.onDidChangeEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
		this._register(this.workingCopyHistoryService.onDidReplaceEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
		this._register(this.workingCopyHistoryService.onDidRemoveEntry(e => this.onDidChangeWorkingCopyHistoryEntry(e.entry)));
		this._register(this.workingCopyHistoryService.onDidRemoveEntries(() => this.onDidChangeWorkingCopyHistoryEntry(undefined /* all entries */)));
		this._register(this.workingCopyHistoryService.onDidMoveEntries(() => this.onDidChangeWorkingCopyHistoryEntry(undefined /* all entries */)));

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LocalHistoryTimeline.LOCAL_HISTORY_ENABLED_SETTINGS_KEY)) {
				this.updateTimelineRegistration();
			}
		}));
	}

	private onDidChangeWorkingCopyHistoryEntry(entry: IWorkingCopyHistoryEntry | undefined): void {

		// Re-emit as timeline change event
		this._onDidChange.fire({
			id: LocalHistoryTimeline.ID,
			uri: entry?.workingCopy.resource,
			reset: true // there is no other way to indicate that items might have been replaced/removed
		});
	}

	async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken): Promise<Timeline> {
		const items: TimelineItem[] = [];

		// Try to convert the provided `uri` into a form that is likely
		// for the provider to find entries for so that we can ensure
		// the timeline is always providing local history entries

		let resource: URI | undefined = undefined;
		if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
			// `vscode-local-history`: convert back to the associated resource
			resource = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
		} else if (uri.scheme === this.pathService.defaultUriScheme || uri.scheme === Schemas.vscodeUserData) {
			// default-scheme / settings: keep as is
			resource = uri;
		} else if (this.fileService.hasProvider(uri)) {
			// anything that is backed by a file system provider:
			// try best to convert the URI back into a form that is
			// likely to match the workspace URIs. That means:
			// - change to the default URI scheme
			// - change to the remote authority or virtual workspace authority
			// - preserve the path
			resource = URI.from({
				scheme: this.pathService.defaultUriScheme,
				authority: this.environmentService.remoteAuthority ?? getVirtualWorkspaceAuthority(this.contextService.getWorkspace()),
				path: uri.path
			});
		}

		if (resource) {

			// Retrieve from working copy history
			const entries = await this.workingCopyHistoryService.getEntries(resource, token);

			// Convert to timeline items
			for (const entry of entries) {
				items.push(this.toTimelineItem(entry));
			}
		}

		return {
			source: LocalHistoryTimeline.ID,
			items
		};
	}

	private toTimelineItem(entry: IWorkingCopyHistoryEntry): TimelineItem {
		return {
			handle: entry.id,
			label: SaveSourceRegistry.getSourceLabel(entry.source),
			tooltip: new MarkdownString(`$(history) ${getLocalHistoryDateFormatter().format(entry.timestamp)}\n\n${SaveSourceRegistry.getSourceLabel(entry.source)}`, { supportThemeIcons: true }),
			source: LocalHistoryTimeline.ID,
			timestamp: entry.timestamp,
			themeIcon: LOCAL_HISTORY_ICON_ENTRY,
			contextValue: LOCAL_HISTORY_MENU_CONTEXT_VALUE,
			command: {
				id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
				title: COMPARE_WITH_FILE_LABEL.value,
				arguments: toDiffEditorArguments(entry, entry.workingCopy.resource)
			}
		};
	}
}
