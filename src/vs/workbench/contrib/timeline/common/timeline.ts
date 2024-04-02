/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Command } from 'vs/editor/common/languages';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { ThemeIcon } from 'vs/base/common/themables';
import { IMarkdownString } from 'vs/base/common/htmlContent';

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
	onDidChange?: Event<TimelineChangeEvent>;

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

	onDidChangeProviders: Event<TimelineProvidersChangeEvent>;
	onDidChangeTimeline: Event<TimelineChangeEvent>;
	onDidChangeUri: Event<URI>;

	registerTimelineProvider(provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(id: string): void;

	getSources(): TimelineSource[];

	getTimeline(id: string, uri: URI, options: TimelineOptions, tokenSource: CancellationTokenSource): TimelineRequest | undefined;

	setUri(uri: URI): void;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
