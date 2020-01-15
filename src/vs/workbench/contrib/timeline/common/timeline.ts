/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export function toKey(extension: ExtensionIdentifier | string, source: string) {
	return `${typeof extension === 'string' ? extension : ExtensionIdentifier.toKey(extension)}|${source}`;
}

export interface TimelineItem {
	date: number;
	source: string;
	label: string;
	id?: string;
	// iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;
	description?: string;
	detail?: string;

	// resourceUri?: Uri;
	// tooltip?: string | undefined;
	// command?: Command;
	// collapsibleState?: TreeItemCollapsibleState;
	// contextValue?: string;
}

export interface TimelineProvider {
	id: string;
	// selector: DocumentSelector;

	provideTimeline(uri: URI, since: number, token: CancellationToken): Promise<TimelineItem[]>;
}

export interface ITimelineService {
	readonly _serviceBrand: undefined;

	onDidChangeProviders: Event<void>;
	registerTimelineProvider(key: string, provider: TimelineProvider): IDisposable;
	unregisterTimelineProvider(key: string): void;

	getTimeline(uri: URI, since: number, token: CancellationToken): Promise<TimelineItem[]>;
}

const TIMELINE_SERVICE_ID = 'timeline';
export const ITimelineService = createDecorator<ITimelineService>(TIMELINE_SERVICE_ID);
