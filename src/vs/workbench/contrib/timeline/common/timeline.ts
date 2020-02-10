/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Command } from 'vs/editor/common/modes';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export function toKey(extension: ExtensionIdentifier | string, source: string) {
	return `${typeof extension === 'string' ? extension : ExtensionIdentifier.toKey(extension)}|${source}`;
}

export interface TimelineItem {
	handle: string;
	source: string;

	timestamp: number;
	label: string;
	icon?: URI,
	iconDark?: URI,
	themeIcon?: { id: string },
	description?: string;
	detail?: string;
	command?: Command;
	contextValue?: string;
}

export interface TimelineChangeEvent {
	id: string;
	uri?: URI;
}

export interface TimelineCursor {
	cursor?: any;
	before?: boolean;
	limit?: number;
}

export interface Timeline {
	source: string;
	items: TimelineItem[];

	cursor?: any;
	more?: boolean;
}

export interface TimelineProvider extends TimelineProviderDescriptor, IDisposable {
	onDidChange?: Event<TimelineChangeEvent>;

	provideTimeline(uri: URI, cursor: TimelineCursor, token: CancellationToken, options?: { cacheResults?: boolean }): Promise<Timeline | undefined>;
}

export interface TimelineProviderDescriptor {
	id: string;
	label: string;
	scheme: string | string[];
}

export interface TimelineProvidersChangeEvent {
	readonly added?: string[];
	readonly removed?: string[];
}

export interface TimelineRequest {
	readonly result: Promise<Timeline | undefined>;
	readonly source: string;
	readonly tokenSource: CancellationTokenSource;
	readonly uri: URI;
}

export interface ITimelineService {
	readonly _serviceBrand: undefined;

	onDidChangeProviders: Event<TimelineProvidersChangeEvent>;
	onDidChangeTimeline: Event<TimelineChangeEvent>;

	registerTimelineProvider(provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(id: string): void;

	getSources(): string[];

	getTimeline(id: string, uri: URI, cursor: TimelineCursor, tokenSource: CancellationTokenSource, options?: { cacheResults?: boolean }): TimelineRequest | undefined;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
