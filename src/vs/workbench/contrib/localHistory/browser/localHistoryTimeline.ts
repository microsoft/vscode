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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { isEqual } from 'vs/base/common/resources';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { SaveSourceRegistry } from 'vs/workbench/common/editor';

export class LocalHistoryTimeline extends Disposable implements IWorkbenchContribution, TimelineProvider {

	private static readonly ID = 'timeline.localHistory';

	private static readonly MENU_CONTEXT_VALUE = 'localHistory:item';
	private static readonly MENU_CONTEXT_KEY = ContextKeyExpr.equals('timelineItem', LocalHistoryTimeline.MENU_CONTEXT_VALUE);

	private static readonly OPEN_CHANGES_LABEL = { value: localize('localHistory.openChanges', "Open Changes"), original: 'Open Changes' };

	readonly id = LocalHistoryTimeline.ID;

	readonly label = localize('localHistory', "Local History");

	readonly scheme = '*'; // we try to show local history for all schemes if possible

	private readonly _onDidChange = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ITimelineService private readonly timelineService: ITimelineService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IPathService private readonly pathService: IPathService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.registerComponents();
		this.registerActions();
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

	private registerActions(): void {
		const that = this;

		// Open changes
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.localHistory.openChanges',
					title: LocalHistoryTimeline.OPEN_CHANGES_LABEL,
					menu: {
						id: MenuId.TimelineItemContext,
						when: LocalHistoryTimeline.MENU_CONTEXT_KEY
					}
				});
			}
			async run(accessor: ServicesAccessor, arg1: unknown, uri: URI): Promise<void> {
				const commandService = accessor.get(ICommandService);

				const { location, associatedResource } = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri);

				const entries = await that.workingCopyHistoryService.getEntries(associatedResource, CancellationToken.None);

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
					return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...that.toCompareWithPreviousCommandArguments(currentEntry, previousEntry));
				}
			}
		}));
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
			label: entry.label,
			description: SaveSourceRegistry.getSourceLabel(entry.source),
			source: LocalHistoryTimeline.ID,
			timestamp: entry.timestamp,
			themeIcon: Codicon.save,
			contextValue: LocalHistoryTimeline.MENU_CONTEXT_VALUE,
			command: {
				id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
				title: LocalHistoryTimeline.OPEN_CHANGES_LABEL.value,
				arguments: this.toCompareWithPreviousCommandArguments(entry, previousEntry)
			}
		};
	}

	private toCompareWithPreviousCommandArguments(entry: IWorkingCopyHistoryEntry, previousEntry: IWorkingCopyHistoryEntry | undefined): unknown[] {
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
}
