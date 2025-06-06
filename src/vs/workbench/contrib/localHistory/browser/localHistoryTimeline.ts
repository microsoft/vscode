/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITimelineService, Timeline, TimelineChangeEvent, TimelineItem, TimelineOptions, TimelineProvider } from '../../timeline/common/timeline.js';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { URI } from '../../../../base/common/uri.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { LocalHistoryFileSystemProvider } from './localHistoryFileSystemProvider.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COMPARE_WITH_FILE_LABEL, toDiffEditorArguments } from './localHistoryCommands.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_ENTRY, LOCAL_HISTORY_MENU_CONTEXT_VALUE } from './localHistory.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getVirtualWorkspaceAuthority } from '../../../../platform/workspace/common/virtualWorkspace.js';

export class LocalHistoryTimeline extends Disposable implements IWorkbenchContribution, TimelineProvider {

	static readonly ID = 'workbench.contrib.localHistoryTimeline';

	private static readonly LOCAL_HISTORY_ENABLED_SETTINGS_KEY = 'workbench.localHistory.enabled';

	readonly id = 'timeline.localHistory';

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
			id: this.id,
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
			source: this.id,
			items
		};
	}

	private toTimelineItem(entry: IWorkingCopyHistoryEntry): TimelineItem {
		return {
			handle: entry.id,
			label: SaveSourceRegistry.getSourceLabel(entry.source),
			tooltip: new MarkdownString(`$(history) ${getLocalHistoryDateFormatter().format(entry.timestamp)}\n\n${SaveSourceRegistry.getSourceLabel(entry.source)}${entry.sourceDescription ? ` (${entry.sourceDescription})` : ``}`, { supportThemeIcons: true }),
			source: this.id,
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
