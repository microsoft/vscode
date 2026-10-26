/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/84297

	/**
	 * An entry in a timeline, such as a commit or a saved version of a file.
	 */
	export class TimelineItem {
		/**
		 * When the item occurred, in milliseconds since 1 January 1970 00:00:00 UTC.
		 */
		timestamp: number;

		/**
		 * A human-readable string describing the timeline item.
		 */
		label: string;

		/**
		 * Optional id for the timeline item. It must be unique across all the timeline items provided by its provider.
		 *
		 * If not provided, the item is identified by its timestamp. Set an id when two items can have the same timestamp.
		 */
		id?: string;

		/**
		 * The icon path or {@link ThemeIcon} for the timeline item.
		 */
		iconPath?: IconPath;

		/**
		 * A human-readable string describing less prominent details of the timeline item.
		 */
		description?: string;

		/**
		 * The tooltip text when you hover over the timeline item.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * The {@link Command} that should be executed when the timeline item is opened.
		 *
		 * For an item that changes multiple resources, such as a commit in a folder or workspace timeline,
		 * use the `vscode.changes` command to show all of its changes.
		 */
		command?: Command;

		/**
		 * The {@link Uri} of the resource's content as of this item, for example a `git:` uri for a commit
		 * or the uri of a saved version of a file.
		 *
		 * When set, two selected items can be compared, including items from different providers.
		 * Leave it `undefined` when the item does not represent a single version of a resource, for example
		 * a commit in a folder or workspace timeline.
		 *
		 * Unlike {@link TreeItem.resourceUri}, it is not used to derive the label or icon, and no file
		 * decorations are shown for it.
		 */
		resourceUri?: Uri;

		/**
		 * Context value of the timeline item. This can be used to contribute specific actions to the item.
		 * For example, a timeline item is given a context value as `commit`. When contributing actions to `timeline/item/context`
		 * using `menus` extension point, you can specify context value for key `timelineItem` in `when` expression like `timelineItem == commit`.
		 * ```
		 *	"contributes": {
		 *		"menus": {
		 *			"timeline/item/context": [
		 *				{
		 *					"command": "extension.copyCommitId",
		 *					"when": "timelineItem == commit && !listMultiSelection"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This will show the `extension.copyCommitId` action only for items where `contextValue` is `commit`,
		 * and only when a single item is selected.
		 *
		 * Commands contributed to `timeline/item/context` are run with the following arguments:
		 * 1. The {@link TimelineItem} the command was run on.
		 * 2. The {@link Uri} of the file or folder whose timeline is shown, or `undefined` for the workspace timeline.
		 * 3. The id of the provider of the item, see {@link TimelineProvider.id}.
		 * 4. If the item is part of a multi-selection, all selected items from the same provider, including the
		 *    first argument. Otherwise `undefined`.
		 *
		 * Commands contributed by other extensions receive read-only copies of the items, with all properties
		 * except {@link TimelineItem.command command}. The extension that provided the items receives the
		 * original objects.
		 */
		contextValue?: string;

		/**
		 * Accessibility information used when screen reader interacts with this timeline item.
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * @param label A human-readable string describing the timeline item.
		 * @param timestamp When the item occurred, in milliseconds since 1 January 1970 00:00:00 UTC.
		 */
		constructor(label: string, timestamp: number);
	}

	/**
	 * A set of timeline items returned by a {@link TimelineProvider} or a {@link WorkspaceTimelineProvider}.
	 */
	export interface Timeline {
		/**
		 * The timeline items, ordered from newest to oldest.
		 */
		readonly items: readonly TimelineItem[];

		/**
		 * A provider-defined cursor for requesting the items that come after the ones returned, see
		 * {@link TimelineOptions.cursor}. Omit when there are no more items.
		 */
		readonly cursor?: string;
	}

	/**
	 * The reason a timeline is requested.
	 */
	export enum TimelineTriggerKind {
		/**
		 * The user explicitly refreshed the timeline. Providers that cache results should fetch fresh data.
		 */
		Invoke = 1,

		/**
		 * The timeline was requested automatically, for example because the active editor changed,
		 * the provider signaled a change, or the user loaded more items.
		 */
		Automatic = 2
	}

	/**
	 * Options for a timeline request.
	 */
	export interface TimelineOptions {
		/**
		 * A {@link Timeline.cursor cursor} from a previous result, to request the items that come after it.
		 * `undefined` requests the newest items.
		 */
		readonly cursor?: string;

		/**
		 * The number of items requested. Returning more or fewer items is allowed; return a
		 * {@link Timeline.cursor cursor} when there are more. `undefined` requests all items.
		 *
		 * When a timeline changes, the newest items are requested again, with a `limit` of at least the
		 * number of items already loaded.
		 */
		readonly limit?: number;

		/**
		 * Why the timeline is requested.
		 */
		readonly triggerKind: TimelineTriggerKind;
	}

	/**
	 * Provides the timelines of files and folders.
	 *
	 * Commands contributed to the `timeline/title` menu are run with the {@link Uri} of the file or folder whose
	 * timeline is shown, or `undefined` for the workspace timeline. Use the `timelineForWorkspace` context key in
	 * their `when` clauses to tell whether the workspace timeline is shown.
	 */
	export interface TimelineProvider {
		/**
		 * A unique identifier for this provider. It is passed to commands and used to filter the Timeline view.
		 *
		 * Registering two timeline providers with the same id fails. A {@link WorkspaceTimelineProvider} from the
		 * same extension can use the same id, in which case both are shown as one source of the Timeline view.
		 */
		readonly id: string;

		/**
		 * A human-readable name for this provider, shown when filtering the Timeline view.
		 */
		readonly label: string;

		/**
		 * An optional event to signal that timelines from this provider have changed. Fire the {@link Uri uris}
		 * of the files or folders whose timelines changed, or `undefined` to signal that all of them changed.
		 *
		 * Items that are already shown are requested again, so changed and removed items are updated.
		 */
		readonly onDidChangeTimeline?: Event<Uri | Uri[] | undefined>;

		/**
		 * Provide {@link TimelineItem timeline items} for a file or folder.
		 *
		 * @param uri The {@link Uri} of the file or folder to provide the timeline for.
		 * @param options Options for this request.
		 * @param token A cancellation token.
		 * @returns A {@link Timeline} or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
	}

	/**
	 * Provides the timeline of the whole workspace, for example the history of the workspace's repositories.
	 * In a multi-root workspace, the timeline covers all workspace folders.
	 *
	 * While the workspace timeline is shown, the `timelineForWorkspace` context key is `true`.
	 */
	export interface WorkspaceTimelineProvider {
		/**
		 * A unique identifier for this provider. It is passed to commands and used to filter the Timeline view.
		 *
		 * Registering two workspace timeline providers with the same id fails. A {@link TimelineProvider} from the
		 * same extension can use the same id, in which case both are shown as one source of the Timeline view.
		 */
		readonly id: string;

		/**
		 * A human-readable name for this provider, shown when filtering the Timeline view.
		 */
		readonly label: string;

		/**
		 * An optional event to signal that the workspace timeline from this provider has changed.
		 *
		 * Items that are already shown are requested again, so changed and removed items are updated.
		 */
		readonly onDidChangeWorkspaceTimeline?: Event<void>;

		/**
		 * Provide {@link TimelineItem timeline items} for the whole workspace.
		 *
		 * @param options Options for this request.
		 * @param token A cancellation token.
		 * @returns A {@link Timeline} or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideWorkspaceTimeline(options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
	}

	export namespace workspace {
		/**
		 * Register a provider for the timelines of files and folders.
		 *
		 * Multiple providers can be registered. In that case, providers are asked in parallel and the results
		 * are merged. A failing provider (rejected promise or exception) will not cause a failure of the whole
		 * operation.
		 *
		 * To activate your extension when the Timeline view is shown, use the `onView:timeline` activation event.
		 *
		 * @param scheme A scheme or schemes of the resources this provider provides timelines for. Use `*` to
		 * target all resources.
		 * @param provider A timeline provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTimelineProvider(scheme: string | readonly string[], provider: TimelineProvider): Disposable;

		/**
		 * Register a provider for the workspace timeline.
		 *
		 * Multiple providers can be registered. In that case, providers are asked in parallel and the results
		 * are merged. A failing provider (rejected promise or exception) will not cause a failure of the whole
		 * operation.
		 *
		 * To activate your extension when the Timeline view is shown, use the `onView:timeline` activation event.
		 *
		 * @param provider A workspace timeline provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerWorkspaceTimelineProvider(provider: WorkspaceTimelineProvider): Disposable;
	}
}
