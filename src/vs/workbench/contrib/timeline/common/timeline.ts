/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
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
	date: number;
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

export interface TimelineProvider extends TimelineProviderDescriptor, IDisposable {
	provideTimeline(uri: URI, since: number, token: CancellationToken): Promise<TimelineItem[]>;
}

export interface TimelineProviderDescriptor {
	source: string;
	sourceDescription: string;

	replaceable?: boolean;
	// selector: DocumentSelector;
}

export interface ITimelineService {
	readonly _serviceBrand: undefined;

	onDidChangeProviders: Event<void>;
	registerTimelineProvider(provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(source: string): void;

	getTimeline(uri: URI, since: number, token: CancellationToken): Promise<TimelineItem[]>;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
