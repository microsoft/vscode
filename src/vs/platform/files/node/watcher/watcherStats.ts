/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUniversalWatchRequest, requestFilterToString } from 'vs/platform/files/common/watcher';
import { INodeJSWatcherInstance, NodeJSWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { ParcelWatcher, ParcelWatcherInstance } from 'vs/platform/files/node/watcher/parcel/parcelWatcher';

export function computeStats(
	requests: IUniversalWatchRequest[],
	recursiveWatcher: ParcelWatcher,
	nonRecursiveWatcher: NodeJSWatcher
): string {
	const lines: string[] = [];

	const allRecursiveRequests = sortByPathPrefix(requests.filter(request => request.recursive));
	const nonSuspendedRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === false);
	const suspendedPollingRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === 'polling');
	const suspendedNonPollingRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === true);

	const recursiveRequestsStatus = computeRequestStatus(allRecursiveRequests, recursiveWatcher);
	const recursiveWatcherStatus = computeRecursiveWatchStatus(recursiveWatcher);

	const allNonRecursiveRequests = sortByPathPrefix(requests.filter(request => !request.recursive));
	const nonSuspendedNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === false);
	const suspendedPollingNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === 'polling');
	const suspendedNonPollingNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === true);

	const nonRecursiveRequestsStatus = computeRequestStatus(allNonRecursiveRequests, nonRecursiveWatcher);
	const nonRecursiveWatcherStatus = computeNonRecursiveWatchStatus(nonRecursiveWatcher);

	lines.push('[Summary]');
	lines.push(`- Recursive Requests:     total: ${allRecursiveRequests.length}, suspended: ${recursiveRequestsStatus.suspended}, polling: ${recursiveRequestsStatus.polling}`);
	lines.push(`- Non-Recursive Requests: total: ${allNonRecursiveRequests.length}, suspended: ${nonRecursiveRequestsStatus.suspended}, polling: ${nonRecursiveRequestsStatus.polling}`);
	lines.push(`- Recursive Watchers:     total: ${recursiveWatcher.watchers.size}, active: ${recursiveWatcherStatus.active}, failed: ${recursiveWatcherStatus.failed}, stopped: ${recursiveWatcherStatus.stopped}`);
	lines.push(`- Non-Recursive Watchers: total: ${nonRecursiveWatcher.watchers.size}, active: ${nonRecursiveWatcherStatus.active}, failed: ${nonRecursiveWatcherStatus.failed}, reusing: ${nonRecursiveWatcherStatus.reusing}`);
	lines.push(`- I/O Handles Impact:     total: ${recursiveRequestsStatus.polling + nonRecursiveRequestsStatus.polling + recursiveWatcherStatus.active + nonRecursiveWatcherStatus.active}`);

	lines.push(`\n[Recursive Requests (${allRecursiveRequests.length}, suspended: ${recursiveRequestsStatus.suspended}, polling: ${recursiveRequestsStatus.polling})]:`);
	const recursiveRequestLines: string[] = [];
	for (const request of [nonSuspendedRecursiveRequests, suspendedPollingRecursiveRequests, suspendedNonPollingRecursiveRequests].flat()) {
		fillRequestStats(recursiveRequestLines, request, recursiveWatcher);
	}
	lines.push(...alignTextColumns(recursiveRequestLines));

	const recursiveWatcheLines: string[] = [];
	fillRecursiveWatcherStats(recursiveWatcheLines, recursiveWatcher);
	lines.push(...alignTextColumns(recursiveWatcheLines));

	lines.push(`\n[Non-Recursive Requests (${allNonRecursiveRequests.length}, suspended: ${nonRecursiveRequestsStatus.suspended}, polling: ${nonRecursiveRequestsStatus.polling})]:`);
	const nonRecursiveRequestLines: string[] = [];
	for (const request of [nonSuspendedNonRecursiveRequests, suspendedPollingNonRecursiveRequests, suspendedNonPollingNonRecursiveRequests].flat()) {
		fillRequestStats(nonRecursiveRequestLines, request, nonRecursiveWatcher);
	}
	lines.push(...alignTextColumns(nonRecursiveRequestLines));

	const nonRecursiveWatcheLines: string[] = [];
	fillNonRecursiveWatcherStats(nonRecursiveWatcheLines, nonRecursiveWatcher);
	lines.push(...alignTextColumns(nonRecursiveWatcheLines));

	return `\n\n[File Watcher] request stats:\n\n${lines.join('\n')}\n\n`;
}

function alignTextColumns(lines: string[]) {
	let maxLength = 0;
	for (const line of lines) {
		maxLength = Math.max(maxLength, line.split('\t')[0].length);
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const parts = line.split('\t');
		if (parts.length === 2) {
			const padding = ' '.repeat(maxLength - parts[0].length);
			lines[i] = `${parts[0]}${padding}\t${parts[1]}`;
		}
	}

	return lines;
}

function computeRequestStatus(requests: IUniversalWatchRequest[], watcher: ParcelWatcher | NodeJSWatcher): { suspended: number; polling: number } {
	let polling = 0;
	let suspended = 0;

	for (const request of requests) {
		const isSuspended = watcher.isSuspended(request);
		if (isSuspended === false) {
			continue;
		}

		suspended++;

		if (isSuspended === 'polling') {
			polling++;
		}
	}

	return { suspended, polling };
}

function computeRecursiveWatchStatus(recursiveWatcher: ParcelWatcher): { active: number; failed: number; stopped: number } {
	let active = 0;
	let failed = 0;
	let stopped = 0;

	for (const watcher of recursiveWatcher.watchers.values()) {
		if (!watcher.failed && !watcher.stopped) {
			active++;
		}
		if (watcher.failed) {
			failed++;
		}
		if (watcher.stopped) {
			stopped++;
		}
	}

	return { active, failed, stopped };
}

function computeNonRecursiveWatchStatus(nonRecursiveWatcher: NodeJSWatcher): { active: number; failed: number; reusing: number } {
	let active = 0;
	let failed = 0;
	let reusing = 0;

	for (const watcher of nonRecursiveWatcher.watchers) {
		if (!watcher.instance.failed && !watcher.instance.isReusingRecursiveWatcher) {
			active++;
		}
		if (watcher.instance.failed) {
			failed++;
		}
		if (watcher.instance.isReusingRecursiveWatcher) {
			reusing++;
		}
	}

	return { active, failed, reusing };
}

function sortByPathPrefix(requests: IUniversalWatchRequest[]): IUniversalWatchRequest[];
function sortByPathPrefix(requests: INodeJSWatcherInstance[]): INodeJSWatcherInstance[];
function sortByPathPrefix(requests: ParcelWatcherInstance[]): ParcelWatcherInstance[];
function sortByPathPrefix(requests: IUniversalWatchRequest[] | INodeJSWatcherInstance[] | ParcelWatcherInstance[]): IUniversalWatchRequest[] | INodeJSWatcherInstance[] | ParcelWatcherInstance[] {
	requests.sort((r1, r2) => {
		const p1 = isUniversalWatchRequest(r1) ? r1.path : r1.request.path;
		const p2 = isUniversalWatchRequest(r2) ? r2.path : r2.request.path;

		const minLength = Math.min(p1.length, p2.length);
		for (let i = 0; i < minLength; i++) {
			if (p1[i] !== p2[i]) {
				return (p1[i] < p2[i]) ? -1 : 1;
			}
		}

		return p1.length - p2.length;
	});

	return requests;
}

function isUniversalWatchRequest(obj: unknown): obj is IUniversalWatchRequest {
	const candidate = obj as IUniversalWatchRequest | undefined;

	return typeof candidate?.path === 'string';
}

function fillRequestStats(lines: string[], request: IUniversalWatchRequest, watcher: ParcelWatcher | NodeJSWatcher): void {
	const decorations = [];
	const suspended = watcher.isSuspended(request);
	if (suspended !== false) {
		if (suspended === 'polling') {
			decorations.push('[SUSPENDED <polling>]');
		} else {
			decorations.push('[SUSPENDED <non-polling>]');
		}
	}

	lines.push(` ${request.path}\t${decorations.length > 0 ? decorations.join(' ') + ' ' : ''}(${requestDetailsToString(request)})`);
}

function requestDetailsToString(request: IUniversalWatchRequest): string {
	return `excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, filter: ${requestFilterToString(request.filter)}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'}`;
}

function fillRecursiveWatcherStats(lines: string[], recursiveWatcher: ParcelWatcher): void {
	const watchers = sortByPathPrefix(Array.from(recursiveWatcher.watchers.values()));

	const { active, failed, stopped } = computeRecursiveWatchStatus(recursiveWatcher);
	lines.push(`\n[Recursive Watchers (${watchers.length}, active: ${active}, failed: ${failed}, stopped: ${stopped})]:`);

	for (const watcher of watchers) {
		const decorations = [];
		if (watcher.failed) {
			decorations.push('[FAILED]');
		}
		if (watcher.stopped) {
			decorations.push('[STOPPED]');
		}
		if (watcher.subscriptionsCount > 0) {
			decorations.push(`[SUBSCRIBED:${watcher.subscriptionsCount}]`);
		}
		if (watcher.restarts > 0) {
			decorations.push(`[RESTARTED:${watcher.restarts}]`);
		}
		lines.push(` ${watcher.request.path}\t${decorations.length > 0 ? decorations.join(' ') + ' ' : ''}(${requestDetailsToString(watcher.request)})`);
	}
}

function fillNonRecursiveWatcherStats(lines: string[], nonRecursiveWatcher: NodeJSWatcher): void {
	const allWatchers = sortByPathPrefix(Array.from(nonRecursiveWatcher.watchers.values()));
	const activeWatchers = allWatchers.filter(watcher => !watcher.instance.failed && !watcher.instance.isReusingRecursiveWatcher);
	const failedWatchers = allWatchers.filter(watcher => watcher.instance.failed);
	const reusingWatchers = allWatchers.filter(watcher => watcher.instance.isReusingRecursiveWatcher);

	const { active, failed, reusing } = computeNonRecursiveWatchStatus(nonRecursiveWatcher);
	lines.push(`\n[Non-Recursive Watchers (${allWatchers.length}, active: ${active}, failed: ${failed}, reusing: ${reusing})]:`);

	for (const watcher of [activeWatchers, failedWatchers, reusingWatchers].flat()) {
		const decorations = [];
		if (watcher.instance.failed) {
			decorations.push('[FAILED]');
		}
		if (watcher.instance.isReusingRecursiveWatcher) {
			decorations.push('[REUSING]');
		}
		lines.push(` ${watcher.request.path}\t${decorations.length > 0 ? decorations.join(' ') + ' ' : ''}(${requestDetailsToString(watcher.request)})`);
	}
}
