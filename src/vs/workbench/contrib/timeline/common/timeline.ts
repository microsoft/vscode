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

	relativeTime?: string;
	relativeTimeFullWord?: string;
	hideRelativeTime?: boolean;
}

export interface TimelineChangeEvent {

	/**
	 * The identifier of the timeline provider this event is from.
	 */
	id: string;

	/**
	 * The resource that has timeline entries changed or `undefined`
	 * if not known.
	 */
	uri: URI | undefined;

	/**
	 * Whether to drop all timeline entries and refresh them again.
	 */
	reset: boolean;
}

export interface TimelineOptions {
	cursor?: string;
	limit?: number | { timestamp: number; id?: string };
	resetCache?: boolean;
	cacheResults?: boolean;
}

export interface Timeline {

	/**
	 * The identifier of the timeline provider this timeline is from.
	 */
	source: string;

	items: TimelineItem[];

	paging?: {
		cursor: string | undefined;
	};
}

export interface TimelineProvider extends TimelineProviderDescriptor, IDisposable {
	readonly onDidChange?: Event<TimelineChangeEvent>;

	provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken): Promise<Timeline | undefined>;
}

export interface TimelineSource {
	id: string;
	label: string;
}

export interface TimelineProviderDescriptor {

	/**
	 * An identifier of the source of the timeline items. This can be used to filter sources.
	 */
	id: string;

	/**
	 * A human-readable string describing the source of the timeline items. This can be used as the display label when filtering sources.
	 */
	label: string;

	/**
	 * The resource scheme(s) this timeline provider is providing entries for.
	 */
	scheme: string | string[];
}

export interface TimelineProvidersChangeEvent {
	readonly added?: string[];
	readonly removed?: string[];
}

export interface TimelineRequest {
	readonly result: Promise<Timeline | undefined>;
	readonly options: TimelineOptions;
	readonly source: string;
	readonly tokenSource: CancellationTokenSource;
	readonly uri: URI;
}

export interface ITimelineService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent>;
	readonly onDidChangeTimeline: Event<TimelineChangeEvent>;
	readonly onDidChangeUri: Event<URI>;

	registerTimelineProvider(provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(id: string): void;

	getSources(): TimelineSource[];

	getTimeline(id: string, uri: URI, options: TimelineOptions, tokenSource: CancellationTokenSource): TimelineRequest | undefined;

	setUri(uri: URI): void;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
