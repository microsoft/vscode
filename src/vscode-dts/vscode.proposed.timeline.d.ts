/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/84297

	export class TimelineItem {
		/**
		 * A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred.
		 */
		timestamp: number;

		/**
		 * A human-readable string describing the timeline item.
		 */
		label: string;

		/**
		 * Optional id for the timeline item. It must be unique across all the timeline items provided by this source.
		 *
		 * If not provided, an id is generated using the timeline item's timestamp.
		 */
		id?: string;

		/**
		 * The icon path or {@link ThemeIcon} for the timeline item.
		 */
		iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

		/**
		 * A human readable string describing less prominent details of the timeline item.
		 */
		description?: string;

		/**
		 * The tooltip text when you hover over the timeline item.
		 */
		tooltip?: string | MarkdownString | undefined;

		/**
		 * The {@link Command} that should be executed when the timeline item is selected.
		 */
		command?: Command;

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
		 *					"when": "timelineItem == commit"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This will show the `extension.copyCommitId` action only for items where `contextValue` is `commit`.
		 */
		contextValue?: string;

		/**
		 * Accessibility information used when screen reader interacts with this timeline item.
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * @param label A human-readable string describing the timeline item
		 * @param timestamp A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred
		 */
		constructor(label: string, timestamp: number);
	}

	export interface TimelineChangeEvent {
		/**
		 * The {@link Uri} of the resource for which the timeline changed.
		 */
		uri: Uri;

		/**
		 * A flag which indicates whether the entire timeline should be reset.
		 */
		reset?: boolean;
	}

	export interface Timeline {
		readonly paging?: {
			/**
			 * A provider-defined cursor specifying the starting point of timeline items which are after the ones returned.
			 * Use `undefined` to signal that there are no more items to be returned.
			 */
			readonly cursor: string | undefined;
		};

		/**
		 * An array of {@link TimelineItem timeline items}.
		 */
		readonly items: readonly TimelineItem[];
	}

	export interface TimelineOptions {
		/**
		 * A provider-defined cursor specifying the starting point of the timeline items that should be returned.
		 */
		cursor?: string;

		/**
		 * An optional maximum number timeline items or the all timeline items newer (inclusive) than the timestamp or id that should be returned.
		 * If `undefined` all timeline items should be returned.
		 */
		limit?: number | { timestamp: number; id?: string };
	}

	export interface TimelineProvider {
		/**
		 * An optional event to signal that the timeline for a source has changed.
		 * To signal that the timeline for all resources (uris) has changed, do not pass any argument or pass `undefined`.
		 */
		onDidChange?: Event<TimelineChangeEvent | undefined>;

		/**
		 * An identifier of the source of the timeline items. This can be used to filter sources.
		 */
		readonly id: string;

		/**
		 * A human-readable string describing the source of the timeline items. This can be used as the display label when filtering sources.
		 */
		readonly label: string;

		/**
		 * Provide {@link TimelineItem timeline items} for a {@link Uri}.
		 *
		 * @param uri The {@link Uri} of the file to provide the timeline for.
		 * @param options A set of options to determine how results should be returned.
		 * @param token A cancellation token.
		 * @return The {@link TimelineResult timeline result} or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
	}

	export namespace workspace {
		/**
		 * Register a timeline provider.
		 *
		 * Multiple providers can be registered. In that case, providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param scheme A scheme or schemes that defines which documents this provider is applicable to. Can be `*` to target all documents.
		 * @param provider A timeline provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		*/
		export function registerTimelineProvider(scheme: string | string[], provider: TimelineProvider): Disposable;
	}
}
