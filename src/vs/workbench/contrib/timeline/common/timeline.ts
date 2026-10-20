/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Command } from '../../../../editor/common/languages.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityInformation } from '../../../../platform/accessibility/common/accessibility.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IEditableData } from '../../../common/views.js';

export function toKey(extension: ExtensionIdentifier | string, source: string) {
	return `${typeof extension === 'string' ? extension : ExtensionIdentifier.toKey(extension)}|${source}`;
}

export const TimelinePaneId = 'timeline';

export interface TimelineItem {

	/**
	 * The handle of the item must be unique across all the
	 * timeline items provided by this source.
	 */
	handle: string;

	/**
	 * The identifier of the timeline provider this timeline item is from.
	 */
	source: string;

	id?: string;

	label: string;
	description?: string;
	tooltip?: string | IMarkdownString | undefined;

	timestamp: number;

	accessibilityInformation?: IAccessibilityInformation;

	icon?: URI;
	iconDark?: URI;
	themeIcon?: ThemeIcon;

	command?: Command;
	contextValue?: string;

	/**
	 * The resource's content as of this item, used to compare items.
	 */
	resourceUri?: URI;

	relativeTime?: string;
	relativeTimeFullWord?: string;
	hideRelativeTime?: boolean;
}

/**
 * Signals that timelines of a provider changed.
 */
export interface TimelineChangeEvent {

	/**
	 * The identifier of the timeline provider this event is from.
	 */
	readonly id: string;

	/**
	 * Whether the workspace timeline changed, rather than timelines of files and folders.
	 */
	readonly workspace: boolean;

	/**
	 * The files or folders whose timelines changed, or `undefined` if all of
	 * them changed. Always `undefined` for the workspace timeline.
	 */
	readonly uris: readonly URI[] | undefined;
}

export const enum TimelineTriggerKind {
	Invoke = 1,
	Automatic = 2
}

export interface TimelineOptions {
	cursor?: string;
	limit?: number;
	triggerKind: TimelineTriggerKind;

	/**
	 * Internal to the Timeline view: whether the extension host should drop the items it cached for the provider.
	 */
	resetCache?: boolean;

	/**
	 * Internal to the Timeline view: whether the extension host should cache the returned items for commands.
	 */
	cacheResults?: boolean;
}

export interface Timeline {

	/**
	 * The identifier of the timeline provider this timeline is from.
	 */
	source: string;

	items: TimelineItem[];

	/**
	 * A provider-defined cursor for requesting the items after the ones returned, `undefined` if there are no more.
	 */
	cursor?: string;
}

/**
 * Provides the timelines of files and folders.
 */
export interface TimelineProvider extends TimelineProviderDescriptor, IDisposable {

	/**
	 * Fires the files or folders whose timelines changed, or `undefined` if all of them changed.
	 */
	readonly onDidChange?: Event<readonly URI[] | undefined>;

	provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken): Promise<Timeline | undefined>;
}

/**
 * Provides the timeline of the whole workspace.
 */
export interface WorkspaceTimelineProvider extends WorkspaceTimelineProviderDescriptor, IDisposable {
	readonly onDidChange?: Event<void>;

	provideWorkspaceTimeline(options: TimelineOptions, token: CancellationToken): Promise<Timeline | undefined>;
}

export interface TimelineSource {
	id: string;
	label: string;
}

export interface WorkspaceTimelineProviderDescriptor {

	/**
	 * An identifier of the source of the timeline items. This can be used to filter sources.
	 */
	id: string;

	/**
	 * A human-readable string describing the source of the timeline items. This can be used as the display label when filtering sources.
	 */
	label: string;
}

export interface TimelineProviderDescriptor extends WorkspaceTimelineProviderDescriptor {

	/**
	 * The resource scheme(s) this timeline provider is providing entries for.
	 */
	scheme: string | readonly string[];
}

/**
 * Signals that timeline sources were added or removed. A source in both `removed` and `added` remains with a
 * different set of providers, e.g. when only its workspace timeline provider was removed, and is reloaded.
 */
export interface TimelineProvidersChangeEvent {
	readonly added?: string[];
	readonly removed?: string[];
}

export interface TimelineRequest {
	readonly result: Promise<Timeline | undefined>;
	readonly options: TimelineOptions;
	readonly source: string;
	readonly tokenSource: CancellationTokenSource;

	/**
	 * The file or folder the timeline is requested for, `undefined` for the workspace timeline.
	 */
	readonly uri: URI | undefined;
}

/**
 * Identifies a timeline item across all timeline providers.
 */
export interface TimelineItemIdentifier {
	/**
	 * The identifier of the timeline provider the item is from.
	 */
	readonly source: string;

	/**
	 * The handle of the item, unique across the items of its provider.
	 */
	readonly handle: string;
}

/**
 * A timeline item that is being edited inline in the Timeline view.
 */
export interface TimelineEditable {
	readonly item: TimelineItemIdentifier;
	readonly data: IEditableData;
}

/**
 * Timelines are shown for a file or folder, or for the whole workspace. Throughout
 * the timeline APIs, a `uri` of `undefined` stands for the workspace timeline.
 */
export interface ITimelineService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent>;
	readonly onDidChangeTimeline: Event<TimelineChangeEvent>;

	/**
	 * Fires when a timeline is requested to be shown, with `undefined` for the workspace timeline.
	 */
	readonly onDidChangeUri: Event<URI | undefined>;

	/**
	 * Fires when a timeline item starts or stops being edited inline.
	 */
	readonly onDidChangeEditable: Event<void>;

	/**
	 * The timeline item that is being edited inline, if any.
	 */
	readonly editable: TimelineEditable | undefined;

	registerTimelineProvider(provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(id: string): void;

	registerWorkspaceTimelineProvider(provider: WorkspaceTimelineProvider): IDisposable;
	unregisterWorkspaceTimelineProvider(id: string): void;

	/**
	 * All sources, from both timeline and workspace timeline providers.
	 */
	getSources(): TimelineSource[];

	/**
	 * Whether any provider contributes to the workspace timeline.
	 */
	hasWorkspaceProviders(): boolean;

	getTimeline(id: string, uri: URI | undefined, options: TimelineOptions, tokenSource: CancellationTokenSource): TimelineRequest | undefined;

	/**
	 * Opens the Timeline view and pins it to the given file or folder, or to the workspace timeline when `uri` is `undefined`.
	 */
	setUri(uri: URI | undefined): Promise<void>;

	/**
	 * Starts editing the given timeline item inline in the Timeline view, or stops editing when `data` is `null`.
	 */
	setEditable(item: TimelineItemIdentifier, data: IEditableData | null): void;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
