/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { watchFile, unwatchFile } from 'fs';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWatchRequestWithCorrelation, requestFilterToString } from '../../common/watcher.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { DeferredPromise, ThrottledDelayer } from '../../../../base/common/async.js';
import { hash } from '../../../../base/common/hash.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
export class BaseWatcher extends Disposable {
    constructor() {
        super();
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this._onDidLogMessage = this._register(new Emitter());
        this.onDidLogMessage = this._onDidLogMessage.event;
        this._onDidWatchFail = this._register(new Emitter());
        this.onDidWatchFail = this._onDidWatchFail.event;
        this.correlatedWatchRequests = new Map();
        this.nonCorrelatedWatchRequests = new Map();
        this.suspendedWatchRequests = this._register(new DisposableMap());
        this.suspendedWatchRequestsWithPolling = new Set();
        this.updateWatchersDelayer = this._register(new ThrottledDelayer(this.getUpdateWatchersDelay()));
        this.suspendedWatchRequestPollingInterval = 5007; // node.js default
        this.joinWatch = new DeferredPromise();
        this.verboseLogging = false;
        this._register(this.onDidWatchFail(request => this.suspendWatchRequest({
            id: this.computeId(request),
            correlationId: this.isCorrelated(request) ? request.correlationId : undefined,
            path: request.path
        })));
    }
    isCorrelated(request) {
        return isWatchRequestWithCorrelation(request);
    }
    computeId(request) {
        if (this.isCorrelated(request)) {
            return request.correlationId;
        }
        else {
            // Requests without correlation do not carry any unique identifier, so we have to
            // come up with one based on the options of the request. This matches what the
            // file service does (vs/platform/files/common/fileService.ts#L1178).
            return hash(request);
        }
    }
    async watch(requests) {
        if (!this.joinWatch.isSettled) {
            this.joinWatch.complete();
        }
        this.joinWatch = new DeferredPromise();
        try {
            this.correlatedWatchRequests.clear();
            this.nonCorrelatedWatchRequests.clear();
            // Figure out correlated vs. non-correlated requests
            for (const request of requests) {
                if (this.isCorrelated(request)) {
                    this.correlatedWatchRequests.set(request.correlationId, request);
                }
                else {
                    this.nonCorrelatedWatchRequests.set(this.computeId(request), request);
                }
            }
            // Remove all suspended watch requests that are no longer watched
            for (const [id] of this.suspendedWatchRequests) {
                if (!this.nonCorrelatedWatchRequests.has(id) && !this.correlatedWatchRequests.has(id)) {
                    this.suspendedWatchRequests.deleteAndDispose(id);
                    this.suspendedWatchRequestsWithPolling.delete(id);
                }
            }
            return await this.updateWatchers(false /* not delayed */);
        }
        finally {
            this.joinWatch.complete();
        }
    }
    updateWatchers(delayed) {
        const nonSuspendedRequests = [];
        for (const [id, request] of [...this.nonCorrelatedWatchRequests, ...this.correlatedWatchRequests]) {
            if (!this.suspendedWatchRequests.has(id)) {
                nonSuspendedRequests.push(request);
            }
        }
        return this.updateWatchersDelayer.trigger(() => this.doWatch(nonSuspendedRequests), delayed ? this.getUpdateWatchersDelay() : 0).catch(error => onUnexpectedError(error));
    }
    getUpdateWatchersDelay() {
        return 800;
    }
    isSuspended(request) {
        const id = this.computeId(request);
        return this.suspendedWatchRequestsWithPolling.has(id) ? 'polling' : this.suspendedWatchRequests.has(id);
    }
    async suspendWatchRequest(request) {
        if (this.suspendedWatchRequests.has(request.id)) {
            return; // already suspended
        }
        const disposables = new DisposableStore();
        this.suspendedWatchRequests.set(request.id, disposables);
        // It is possible that a watch request fails right during watch()
        // phase while other requests succeed. To increase the chance of
        // reusing another watcher for suspend/resume tracking, we await
        // all watch requests having processed.
        await this.joinWatch.p;
        if (disposables.isDisposed) {
            return;
        }
        this.monitorSuspendedWatchRequest(request, disposables);
        this.updateWatchers(true /* delay this call as we might accumulate many failing watch requests on startup */);
    }
    resumeWatchRequest(request) {
        this.suspendedWatchRequests.deleteAndDispose(request.id);
        this.suspendedWatchRequestsWithPolling.delete(request.id);
        this.updateWatchers(false);
    }
    monitorSuspendedWatchRequest(request, disposables) {
        if (this.doMonitorWithExistingWatcher(request, disposables)) {
            this.trace(`reusing an existing recursive watcher to monitor ${request.path}`);
            this.suspendedWatchRequestsWithPolling.delete(request.id);
        }
        else {
            this.doMonitorWithNodeJS(request, disposables);
            this.suspendedWatchRequestsWithPolling.add(request.id);
        }
    }
    doMonitorWithExistingWatcher(request, disposables) {
        const subscription = this.recursiveWatcher?.subscribe(request.path, (error, change) => {
            if (disposables.isDisposed) {
                return; // return early if already disposed
            }
            if (error) {
                this.monitorSuspendedWatchRequest(request, disposables);
            }
            else if (change?.type === 1 /* FileChangeType.ADDED */) {
                this.onMonitoredPathAdded(request);
            }
        });
        if (subscription) {
            disposables.add(subscription);
            return true;
        }
        return false;
    }
    doMonitorWithNodeJS(request, disposables) {
        let pathNotFound = false;
        const watchFileCallback = (curr, prev) => {
            if (disposables.isDisposed) {
                return; // return early if already disposed
            }
            const currentPathNotFound = this.isPathNotFound(curr);
            const previousPathNotFound = this.isPathNotFound(prev);
            const oldPathNotFound = pathNotFound;
            pathNotFound = currentPathNotFound;
            // Watch path created: resume watching request
            if (!currentPathNotFound && (previousPathNotFound || oldPathNotFound)) {
                this.onMonitoredPathAdded(request);
            }
        };
        this.trace(`starting fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
        try {
            watchFile(request.path, { persistent: false, interval: this.suspendedWatchRequestPollingInterval }, watchFileCallback);
        }
        catch (error) {
            this.warn(`fs.watchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);
        }
        disposables.add(toDisposable(() => {
            this.trace(`stopping fs.watchFile() on ${request.path} (correlationId: ${request.correlationId})`);
            try {
                unwatchFile(request.path, watchFileCallback);
            }
            catch (error) {
                this.warn(`fs.unwatchFile() failed with error ${error} on path ${request.path} (correlationId: ${request.correlationId})`);
            }
        }));
    }
    onMonitoredPathAdded(request) {
        this.trace(`detected ${request.path} exists again, resuming watcher (correlationId: ${request.correlationId})`);
        // Emit as event
        const event = { resource: URI.file(request.path), type: 1 /* FileChangeType.ADDED */, cId: request.correlationId };
        this._onDidChangeFile.fire([event]);
        this.traceEvent(event, request);
        // Resume watching
        this.resumeWatchRequest(request);
    }
    isPathNotFound(stats) {
        return stats.ctimeMs === 0 && stats.ino === 0;
    }
    async stop() {
        this.suspendedWatchRequests.clearAndDisposeAll();
        this.suspendedWatchRequestsWithPolling.clear();
    }
    traceEvent(event, request) {
        if (this.verboseLogging) {
            const traceMsg = ` >> normalized ${event.type === 1 /* FileChangeType.ADDED */ ? '[ADDED]' : event.type === 2 /* FileChangeType.DELETED */ ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`;
            this.traceWithCorrelation(traceMsg, request);
        }
    }
    traceWithCorrelation(message, request) {
        if (this.verboseLogging) {
            this.trace(`${message}${typeof request.correlationId === 'number' ? ` <${request.correlationId}> ` : ``}`);
        }
    }
    requestToString(request) {
        return `${request.path} (excludes: ${request.excludes.length > 0 ? request.excludes : '<none>'}, includes: ${request.includes && request.includes.length > 0 ? JSON.stringify(request.includes) : '<all>'}, filter: ${requestFilterToString(request.filter)}, correlationId: ${typeof request.correlationId === 'number' ? request.correlationId : '<none>'})`;
    }
    async setVerboseLogging(enabled) {
        this.verboseLogging = enabled;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZVdhdGNoZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9maWxlcy9ub2RlL3dhdGNoZXIvYmFzZVdhdGNoZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQVMsTUFBTSxJQUFJLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hILE9BQU8sRUFBbUksNkJBQTZCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNoTyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFRdEUsTUFBTSxPQUFnQixXQUFZLFNBQVEsVUFBVTtJQXVCbkQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQXRCVSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFpQixDQUFDLENBQUM7UUFDMUUsb0JBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO1FBRXBDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWUsQ0FBQyxDQUFDO1FBQ3hFLG9CQUFlLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQztRQUVwQyxvQkFBZSxHQUFH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