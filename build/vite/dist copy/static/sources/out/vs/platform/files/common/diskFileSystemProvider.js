/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { insert } from '../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { removeTrailingPathSeparator } from '../../../base/common/extpath.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { normalize } from '../../../base/common/path.js';
import { isRecursiveWatchRequest, reviveFileChanges } from './watcher.js';
import { LogLevel } from '../../log/common/log.js';
export class AbstractDiskFileSystemProvider extends Disposable {
    constructor(logService, options) {
        super();
        this.logService = logService;
        this.options = options;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this._onDidWatchError = this._register(new Emitter());
        this.onDidWatchError = this._onDidWatchError.event;
        this.universalWatchRequests = [];
        this.universalWatchRequestDelayer = this._register(new ThrottledDelayer(this.getRefreshWatchersDelay(this.universalWatchRequests.length)));
        this.nonRecursiveWatchRequests = [];
        this.nonRecursiveWatchRequestDelayer = this._register(new ThrottledDelayer(this.getRefreshWatchersDelay(this.nonRecursiveWatchRequests.length)));
    }
    watch(resource, opts) {
        if (opts.recursive || this.options?.watcher?.forceUniversal) {
            return this.watchUniversal(resource, opts);
        }
        return this.watchNonRecursive(resource, opts);
    }
    getRefreshWatchersDelay(count) {
        if (count > 200) {
            // If there are many requests to refresh, start to throttle
            // the refresh to reduce pressure. We see potentially thousands
            // of requests coming in on startup repeatedly so we take it easy.
            return 500;
        }
        // By default, use a short delay to keep watchers updating fast but still
        // with a delay so that we can efficiently deduplicate requests or reuse
        // existing watchers.
        return 0;
    }
    watchUniversal(resource, opts) {
        const request = this.toWatchRequest(resource, opts);
        const remove = insert(this.universalWatchRequests, request);
        // Trigger update
        this.refreshUniversalWatchers();
        return toDisposable(() => {
            // Remove from list of paths to watch universally
            remove();
            // Trigger update
            this.refreshUniversalWatchers();
        });
    }
    toWatchRequest(resource, opts) {
        const request = {
            path: this.toWatchPath(resource),
            excludes: opts.excludes,
            includes: opts.includes,
            recursive: opts.recursive,
            filter: opts.filter,
            correlationId: opts.correlationId
        };
        if (isRecursiveWatchRequest(request)) {
            // Adjust for polling
            const usePolling = this.options?.watcher?.recursive?.usePolling;
            if (usePolling === true) {
                request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
            }
            else if (Array.isArray(usePolling)) {
                if (usePolling.includes(request.path)) {
                    request.pollingInterval = this.options?.watcher?.recursive?.pollingInterval ?? 5000;
                }
            }
        }
        return request;
    }
    refreshUniversalWatchers() {
        this.universalWatchRequestDelayer.trigger(() => {
            return this.doRefreshUniversalWatchers();
        }, this.getRefreshWatchersDelay(this.universalWatchRequests.length)).catch(error => onUnexpectedError(error));
    }
    doRefreshUniversalWatchers() {
        // Create watcher if this is the first time
        if (!this.universalWatcher) {
            this.universalWatcher = this._register(this.createUniversalWatcher(changes => this._onDidChangeFile.fire(reviveFileChanges(changes)), msg => this.onWatcherLogMessage(msg), this.logService.getLevel() === LogLevel.Trace));
            // Apply log levels dynamically
            this._register(this.logService.onDidChangeLogLevel(() => {
                this.universalWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
            }));
        }
        // Ask to watch the provided paths
        return this.universalWatcher.watch(this.universalWatchRequests);
    }
    watchNonRecursive(resource, opts) {
        // Add to list of paths to watch non-recursively
        const request = {
            path: this.toWatchPath(resource),
            excludes: opts.excludes,
            includes: opts.includes,
            recursive: false,
            filter: opts.filter,
            correlationId: opts.correlationId
        };
        const remove = insert(this.nonRecursiveWatchRequests, request);
        // Trigger update
        this.refreshNonRecursiveWatchers();
        return toDisposable(() => {
            // Remove from list of paths to watch non-recursively
            remove();
            // Trigger update
            this.refreshNonRecursiveWatchers();
        });
    }
    refreshNonRecursiveWatchers() {
        this.nonRecursiveWatchRequestDelayer.trigger(() => {
            return this.doRefreshNonRecursiveWatchers();
        }, this.getRefreshWatchersDelay(this.nonRecursiveWatchRequests.length)).catch(error => onUnexpectedError(error));
    }
    doRefreshNonRecursiveWatchers() {
        // Create watcher if this is the first time
        if (!this.nonRecursiveWatcher) {
            this.nonRecursiveWatcher = this._register(this.createNonRecursiveWatcher(changes => this._onDidChangeFile.fire(reviveFileChanges(changes)), msg => this.onWatcherLogMessage(msg), this.logService.getLevel() === LogLevel.Trace));
            // Apply log levels dynamically
            this._register(this.logService.onDidChangeLogLevel(() => {
                this.nonRecursiveWatcher?.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
            }));
        }
        // Ask to watch the provided paths
        return this.nonRecursiveWatcher.watch(this.nonRecursiveWatchRequests);
    }
    //#endregion
    onWatcherLogMessage(msg) {
        if (msg.type === 'error') {
            this._onDidWatchError.fire(msg.message);
        }
        this.logWatcherMessage(msg);
    }
    logWatcherMessage(msg) {
        this.logService[msg.type](msg.message);
    }
    toFilePath(resource) {
        return normalize(resource.fsPath);
    }
    toWatchPath(resource) {
        const filePath = this.toFilePath(resource);
        // Ensure to have any trailing path separators removed, otherwise
        // we may believe the path is not "real" and will convert every
        // event back to this form, which is not warranted.
        // See also https://github.com/microsoft/vscode/issues/210517
        return removeTrailingPathSeparator(filePath);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9kaXNrRmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHekQsT0FBTyxFQUF1SSx1QkFBdUIsRUFBMEIsaUJBQWlCLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDdk8sT0FBTyxFQUFlLFFBQVEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBd0JoRSxNQUFNLE9BQWdCLDhCQUErQixTQUFRLFVBQVU7SUFLdEUsWUFDb0IsVUFBdUIsRUFDekIsT0FBd0M7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFIVyxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ3pCLFlBQU8sR0FBUCxPQUFPLENBQWlDO1FBS3ZDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTBCLENBQUMsQ0FBQztRQUNuRixvQkFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7UUFFcEMscUJBQWdCLEdBQUcsSUFBSSxDQUFD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