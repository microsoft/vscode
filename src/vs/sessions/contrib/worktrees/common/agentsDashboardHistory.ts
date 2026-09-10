/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export enum AgentsDashboardHistoryEventType {
	SessionStarted = 'sessionStarted',
	SessionDone = 'sessionDone',
	PullRequestCreated = 'pullRequestCreated',
	PullRequestMerged = 'pullRequestMerged',
	DiskUsage = 'diskUsage',
}

export type AgentsDashboardHistoryEvent =
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.SessionStarted; readonly timestamp: number }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.SessionDone; readonly timestamp: number; readonly durationMs: number }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.PullRequestCreated; readonly timestamp: number }
	| { readonly id: string; readonly type: AgentsDashboardHistoryEventType.PullRequestMerged; readonly timestamp: number }
	| {
		readonly id: string;
		readonly type: AgentsDashboardHistoryEventType.DiskUsage;
		readonly timestamp: number;
		readonly value: number;
		readonly medianSessionBytes?: number;
		readonly largestSessionBytes?: number;
	};

export type AgentsDashboardHistoryRange = 'today' | 'week' | 'month';

export interface IAgentsDashboardHistoryBucket {
	readonly start: number;
	readonly end: number;
	readonly label: string;
	readonly sessionsStarted: number;
	readonly sessionsDone: number;
	readonly pullRequestsCreated: number;
	readonly pullRequestsMerged: number;
	readonly medianCompletionDurationMs: number | undefined;
	readonly diskUsageBytes: number | undefined;
	readonly medianSessionStorageBytes: number | undefined;
	readonly largestSessionStorageBytes: number | undefined;
}

export interface IAgentsDashboardHistoryService {
	readonly _serviceBrand: undefined;
	readonly events: IObservable<readonly AgentsDashboardHistoryEvent[]>;
	/** Adds an in-memory history overlay for development fixtures. Never persisted. */
	setDevelopmentEvents(events: readonly AgentsDashboardHistoryEvent[]): void;
}

export const IAgentsDashboardHistoryService = createDecorator<IAgentsDashboardHistoryService>('agentsDashboardHistoryService');

export function buildAgentsDashboardHistoryBuckets(
	events: readonly AgentsDashboardHistoryEvent[],
	range: AgentsDashboardHistoryRange,
	now: number,
): IAgentsDashboardHistoryBucket[] {
	const intervals = createIntervals(range, now);
	let lastDiskUsage: number | undefined;
	let medianSessionStorageBytes: number | undefined;
	let largestSessionStorageBytes: number | undefined;
	const diskEvents = events
		.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.DiskUsage }> =>
			event.type === AgentsDashboardHistoryEventType.DiskUsage)
		.sort((a, b) => a.timestamp - b.timestamp);
	let diskEventIndex = 0;

	return intervals.map(interval => {
		const bucketEvents = events.filter(event => event.timestamp >= interval.start && event.timestamp < interval.end);
		while (diskEventIndex < diskEvents.length && diskEvents[diskEventIndex].timestamp < interval.end) {
			const event = diskEvents[diskEventIndex++];
			lastDiskUsage = event.value;
			medianSessionStorageBytes = event.medianSessionBytes;
			largestSessionStorageBytes = event.largestSessionBytes;
		}
		const durations = bucketEvents
			.filter((event): event is Extract<AgentsDashboardHistoryEvent, { type: AgentsDashboardHistoryEventType.SessionDone }> =>
				event.type === AgentsDashboardHistoryEventType.SessionDone)
			.map(event => event.durationMs)
			.sort((a, b) => a - b);
		return {
			...interval,
			sessionsStarted: countEvents(bucketEvents, AgentsDashboardHistoryEventType.SessionStarted),
			sessionsDone: countEvents(bucketEvents, AgentsDashboardHistoryEventType.SessionDone),
			pullRequestsCreated: countEvents(bucketEvents, AgentsDashboardHistoryEventType.PullRequestCreated),
			pullRequestsMerged: countEvents(bucketEvents, AgentsDashboardHistoryEventType.PullRequestMerged),
			medianCompletionDurationMs: median(durations),
			diskUsageBytes: lastDiskUsage,
			medianSessionStorageBytes,
			largestSessionStorageBytes,
		};
	});
}

function countEvents(events: readonly AgentsDashboardHistoryEvent[], type: AgentsDashboardHistoryEventType): number {
	return events.filter(event => event.type === type).length;
}

function median(values: readonly number[]): number | undefined {
	if (values.length === 0) {
		return undefined;
	}
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function createIntervals(range: AgentsDashboardHistoryRange, now: number): { start: number; end: number; label: string }[] {
	const current = new Date(now);
	if (range === 'today') {
		const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
		const intervals: { start: number; end: number; label: string }[] = [];
		for (let bucketStart = start; bucketStart <= now; bucketStart += 60 * 60 * 1000) {
			intervals.push({
				start: bucketStart,
				end: Math.min(bucketStart + 60 * 60 * 1000, now + 1),
				label: new Date(bucketStart).toLocaleTimeString(undefined, { hour: 'numeric', timeZoneName: 'short' }),
			});
		}
		return intervals;
	}

	const days = range === 'week' ? 7 : 30;
	return Array.from({ length: days }, (_, index) => {
		const dayOffset = index - days + 1;
		const bucketStartDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + dayOffset);
		const bucketEndDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + dayOffset + 1);
		return {
			start: bucketStartDate.getTime(),
			end: index === days - 1 ? now + 1 : bucketEndDate.getTime(),
			label: bucketStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
		};
	});
}
