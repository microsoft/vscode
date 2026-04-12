/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isRecursiveWatchRequest, requestFilterToString } from '../../common/watcher.js';
export function computeStats(requests, failedRecursiveRequests, recursiveWatcher, nonRecursiveWatcher) {
    const lines = [];
    const allRecursiveRequests = sortByPathPrefix(requests.filter(request => isRecursiveWatchRequest(request)));
    const nonSuspendedRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === false);
    const suspendedPollingRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === 'polling');
    const suspendedNonPollingRecursiveRequests = allRecursiveRequests.filter(request => recursiveWatcher.isSuspended(request) === true);
    const recursiveRequestsStatus = computeRequestStatus(allRecursiveRequests, recursiveWatcher);
    const recursiveWatcherStatus = computeRecursiveWatchStatus(recursiveWatcher);
    const allNonRecursiveRequests = sortByPathPrefix(requests.filter(request => !isRecursiveWatchRequest(request)));
    const nonSuspendedNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === false);
    const suspendedPollingNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === 'polling');
    const suspendedNonPollingNonRecursiveRequests = allNonRecursiveRequests.filter(request => nonRecursiveWatcher.isSuspended(request) === true);
    const nonRecursiveRequestsStatus = computeRequestStatus(allNonRecursiveRequests, nonRecursiveWatcher);
    const nonRecursiveWatcherStatus = computeNonRecursiveWatchStatus(nonRecursiveWatcher);
    lines.push('[Summary]');
    lines.push(`- Recursive Requests:     total: ${allRecursiveRequests.length}, suspended: ${recursiveRequestsStatus.suspended}, polling: ${recursiveRequestsStatus.polling}, failed: ${failedRecursiveRequests}`);
    lines.push(`- Non-Recursive Requests: total: ${allNonRecursiveRequests.length}, suspended: ${nonRecursiveRequestsStatus.suspended}, polling: ${nonRecursiveRequestsStatus.polling}`);
    lines.push(`- Recursive Watchers:     total: ${Array.from(recursiveWatcher.watchers).length}, active: ${recursiveWatcherStatus.active}, failed: ${recursiveWatcherStatus.failed}, stopped: ${recursiveWatcherStatus.stopped}`);
    lines.push(`- Non-Recursive Watchers: total: ${Array.from(nonRecursiveWatcher.watchers).length}, active: ${nonRecursiveWatcherStatus.active}, failed: ${nonRecursiveWatcherStatus.failed}, reusing: ${nonRecursiveWatcherStatus.reusing}`);
    lines.push(`- I/O Handles Impact:     total: ${recursiveRequestsStatus.polling + nonRecursiveRequestsStatus.polling + recursiveWatcherStatus.active + nonRecursiveWatcherStatus.active}`);
    lines.push(`\n[Recursive Requests (${allRecursiveRequests.length}, suspended: ${recursiveRequestsStatus.suspended}, polling: ${recursiveRequestsStatus.polling})]:`);
    const recursiveRequestLines = [];
    for (const request of [nonSuspendedRecursiveRequests, suspendedPollingRecursiveRequests, suspendedNonPollingRecursiveRequests].flat()) {
        fillRequestStats(recursiveRequestLines, request, recursiveWatcher);
    }
    lines.push(...alignTextColumns(recursiveRequestLines));
    const recursiveWatcheLines = [];
    fillRecursiveWatcherStats(recursiveWatcheLines, recursiveWatcher);
    lines.push(...alignTextColumns(recursiveWatcheLines));
    lines.push(`\n[Non-Recursive Requests (${allNonRecursiveRequests.length}, suspended: ${nonRecursiveRequestsStatus.suspended}, polling: ${nonRecursiveRequestsStatus.polling})]:`);
    const nonRecursiveRequestLines = [];
    for (const request of [nonSuspendedNonRecursiveRequests, suspendedPollingNonRecursiveRequests, suspendedNonPollingNonRecursiveRequests].flat()) {
        fillRequestStats(nonRecursiveRequestLines, request, nonRecursiveWatcher);
    }
    lines.push(...alignTextColumns(nonRecursiveRequestLines));
    const nonRecursiveWatcheLines = [];
    fillNonRecursiveWatcherStats(nonRecursiveWatcheLines, nonRecursiveWatcher);
    lines.push(...alignTextColumns(nonRecursiveWatcheLines));
    return `\n\n[File Watcher] request stats:\n\n${lines.join('\n')}\n\n`;
}
function alignTextColumns(lines) {
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
function computeRequestStatus(requests, watcher) {
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
function computeRecursiveWatchStatus(recursiveWatcher) {
    let active = 0;
    let failed = 0;
    let stopped = 0;
    for (const watcher of recursiveWatcher.watchers) {
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
function computeNonRecursiveWatchStatus(nonRecursiveWatcher) {
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
function sortByPathPrefix(requests) {
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
function isUniversalWatchRequest(obj) {
    const candidate = obj;
    return typeof candidate?.path === 'string';
}
function fillRequestStats(lines, request, watcher) {
    const decorations = [];
    const suspended = watcher.isSuspended(request);
    if (suspended !== false) {
        if (suspended === 'polling') {
            decorations.push('[SUSPENDED <polling>]');
        }
        else {
            decorations.push('[SUSPENDED <non-polling>]');
        }
    }
    lines.push(` ${request.path}\t${decorations.length > 0 ? decorations.join(' ') + ' ' : ''}(${requestDetailsToString(request)})`);
}
function requestDetailsToString(request) {
    return `excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, filter: ${requestFilterToString(request.filter)}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'}`;
}
function fillRecursiveWatcherStats(lines, recursiveWatcher) {
    const watchers = sortByPathPrefix(Array.from(recursiveWatcher.watchers));
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
function fillNonRecursiveWatcherStats(lines, nonRecursiveWatcher) {
    const allWatchers = sortByPathPrefix(Array.from(nonRecursiveWatcher.watchers));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlclN0YXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZmlsZXMvbm9kZS93YXRjaGVyL3dhdGNoZXJTdGF0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQXFELHVCQUF1QixFQUEwQixxQkFBcUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBSXBLLE1BQU0sVUFBVSxZQUFZLENBQzNCLFFBQWtDLEVBQ2xDLHVCQUErQixFQUMvQixnQkFBK0IsRUFDL0IsbUJBQWtDO0lBRWxDLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUUzQixNQUFNLG9CQUFvQixHQUFHLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUcsTUFBTSw2QkFBNkIsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUM7SUFDOUgsTUFBTSxpQ0FBaUMsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUM7SUFDdEksTUFBTSxvQ0FBb0MsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7SUFFcEksTUFBTSx1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyxvQkFBb0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzdGLE1BQU0sc0JBQXNCLEdB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