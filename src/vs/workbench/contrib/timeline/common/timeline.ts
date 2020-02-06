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
	timestamp: number;
	label: string;
	id?: string;
	icon?: URI,
	iconDark?: URI,
	themeIcon?: { id: string },
	description?: string;
	detail?: string;
	command?: Command;
	contextValue?: string;
}

export interface TimelineItemWithSource extends TimelineItem {
	source: string;
}

export interface TimelineChangeEvent {
	id: string;
	uri?: URI;
}

export interface TimelineProvider extends TimelineProviderDescriptor, IDisposable {
	onDidChange?: Event<TimelineChangeEvent>;

	provideTimeline(uri: URI, token: CancellationToken): Promise<TimelineItemWithSource[]>;
}

export interface TimelineProviderDescriptor {
	id: string;
	label: string;

	// selector: DocumentSelector;
}

export interface TimelineProvidersChangeEvent {
	readonly added?: string[];
	readonly removed?: string[];
}

export interface TimelineRequest {
	readonly items: Promise<TimelineItemWithSource[]>;
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

	getTimeline(uri: URI, token: CancellationToken): Promise<TimelineItem[]>;

	getTimelineRequest(id: string, uri: URI, tokenSource: CancellationTokenSource): TimelineRequest | undefined;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
