/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import parcelWatcher from '@parcel/watcher';
import { promises } from 'fs';
import { tmpdir, homedir } from 'os';
import { URI } from '../../../../../base/common/uri.js';
import { DeferredPromise, RunOnceScheduler, RunOnceWorker, ThrottledWorker } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { randomPath, isEqual, isEqualOrParent } from '../../../../../base/common/extpath.js';
import { GLOBSTAR, patternsEquals } from '../../../../../base/common/glob.js';
import { BaseWatcher } from '../baseWatcher.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { normalizeNFC } from '../../../../../base/common/normalization.js';
import { normalize, join } from '../../../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { Promises, realcase } from '../../../../../base/node/pfs.js';
import { coalesceEvents, parseWatcherPatterns, isFiltered } from '../../../common/watcher.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
export class ParcelWatcherInstance extends Disposable {
    get failed() { return this.didFail; }
    get stopped() { return this.didStop; }
    constructor(
    /**
     * Signals when the watcher is ready to watch.
     */
    ready, request, 
    /**
     * How often this watcher has been restarted in case of an unexpected
     * shutdown.
     */
    restarts, 
    /**
     * The cancellation token associated with the lifecycle of the watcher.
     */
    token, 
    /**
     * An event aggregator to coalesce events and reduce duplicates.
     */
    worker, stopFn) {
        super();
        this.ready = ready;
        this.request = request;
        this.restarts = restarts;
        this.token = token;
        this.worker = worker;
        this.stopFn = stopFn;
        this._onDidStop = this._register(new Emitter());
        this.onDidStop = this._onDidStop.event;
        this._onDidFail = this._register(new Emitter());
        this.onDidFail = this._onDidFail.event;
        this.didFail = false;
        this.didStop = false;
        this.subscriptions = new Map();
        const ignoreCase = !isLinux;
        this.includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes, ignoreCase) : undefined;
        this.excludes = this.request.excludes ? parseWatcherPatterns(this.request.path, this.request.excludes, ignoreCase) : undefined;
        this._register(toDisposable(() => this.subscriptions.clear()));
    }
    subscribe(path, callback) {
        path = URI.file(path).fsPath; // make sure to store the path in `fsPath` form to match it with events later
        let subscriptions = this.subscriptions.get(path);
        if (!subscriptions) {
            subscriptions = new Set();
            this.subscriptions.set(path, subscriptions);
        }
        subscriptions.add(callback);
        return toDisposable(() => {
            const subscriptions = this.subscriptions.get(path);
            if (subscriptions) {
                subscriptions.delete(callback);
                if (subscriptions.size === 0) {
                    this.subscriptions.delete(path);
                }
            }
        });
    }
    get subscriptionsCount() {
        return this.subscriptions.size;
    }
    notifyFileChange(path, change) {
        const subscriptions = this.subscriptions.get(path);
        if (subscriptions) {
            for (const subscription of subscriptions) {
                subscription(change);
            }
        }
    }
    notifyWatchFailed() {
        this.didFail = true;
        this._onDidFail.fire();
    }
    include(path) {
        if (!this.includes || this.includes.length === 0) {
            return true; // no specific includes defined, include all
        }
        return this.includes.some(include => include(path));
    }
    exclude(path) {
        return Boolean(this.excludes?.some(exclude => exclude(path)));
    }
    async stop(joinRestart) {
        this.didStop = true;
        try {
            await this.stopFn();
        }
        finally {
            this._onDidStop.fire({ joinRestart });
            this.dispose();
        }
    }
}
export class ParcelWatcher extends BaseWatcher {
    static { this.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE = new Map([
        ['create', 1 /* FileChangeType.ADDED */],
        ['update', 0 /* FileChangeType.UPDATED */],
        ['delete', 2 /* FileChangeType.DELETED */]
    ]); }
    static { this.PREDEFINED_EXCLUDES = {
        'win32': [],
        'darwin': [
            join(homedir(), 'Library', 'Containers') // Triggers access dialog from macOS 14 (https://github.com/microsoft/vscode/issues/208105)
        ],
        'linux': []
    }; }
    static { this.PARCEL_WATCHER_BACKEND = isWindows ? 'windows' : isLinux ? 'inotify' : 'fs-events'; }
    get watchers() { return this._watchers.values(); }
    // A delay for collecting file changes from Parcel
    // before collecting them for coalescing and emitting.
    // Parcel internally uses 50ms as delay, so we use 75ms,
    // to schedule sufficiently after Parcel.
    //
    // Note: since Parcel 2.0.7, the very first event is
    // emitted without delay if no events occured over a
    // duration of 500ms. But we always want to aggregate
    // events to apply our coleasing logic.
    //
    static { this.FILE_CHANGES_HANDLER_DELAY = 75; }
    constructor() {
        super();
        this._onDidError = this._register(new Emitter());
        this.onDidError = this._onDidError.event;
        this._watchers = new Map();
        // Reduce likelyhood of spam from file events via throttling.
        // (https://github.com/microsoft/vscode/issues/124723)
        this.throttledFileChangesEmitter = this._register(new ThrottledWorker({
            maxWorkChunkSize: 500, // only process up to 500 changes at once before...
            throttleDelay: 200, // ...resting for 200ms until we process events again...
            maxBufferedWork: 30000 // ...but never buffering more than 30000 events in memory
        }, events => this._onDidChangeFile.fire(events)));
        this.enospcErrorLogged = false;
        this.registerListeners();
    }
    registerListeners() {
        const onUncaughtException = (error) => this.onUnexpectedError(error);
        const onUnhandledRejection = (error) => this.onUnexpectedError(error);
        process.on('uncaughtException', onUncaughtException);
        process.on('unhandledRejection', onUnhandledRejection);
        this._register(toDisposable(() => {
            process.off('uncaughtException', onUncaughtException);
            process.off('unhandledRejection', onUnhandledRejection);
        }));
    }
    async doWatch(requests) {
        // Figure out duplicates to remove from the requests
        requests = await this.removeDuplicateRequests(requests);
        // Figure out which watchers to start and which to stop
        const requestsToStart = [];
        const watchersToStop = new Set(Array.from(this.watchers));
        for (const request of requests) {
            const watcher = this._watchers.get(this.requestToWatcherKey(request));
            if (watcher && patternsEquals(watcher.request.excludes, request.excludes) && patternsEquals(watcher.request.includes, request.includes) && watcher.request.pollingInterval === request.pollingInterval) {
                watchersToStop.delete(watcher); // keep watcher
            }
            else {
                requestsToStart.push(request); // start watching
            }
        }
        // Logging
        if (requestsToStart.length) {
            this.trace(`Request to start watching: ${requestsToStart.map(request => this.requestToString(request)).join(',')}`);
        }
        if (watchersToStop.size) {
            this.trace(`Request to stop watching: ${Array.from(watchersToStop).map(watcher => this.requestToString(watcher.request)).join(',')}`);
        }
        // Stop watching as instructed
        for (const watcher of watchersToStop) {
            await this.stopWatching(watcher);
        }
        // Start watching as instructed
        for (const request of requestsToStart) {
            if (request.pollingInterval) {
                await this.startPolling(request, request.pollingInterval);
            }
            else {
                await this.startWatching(request);
            }
        }
    }
    requestToWatcherKey(request) {
        return typeof request.correlationId === 'number' ? request.correlationId : this.pathToWatcherKey(request.path);
    }
    pathToWatcherKey(path) {
        return isLinux ? path : path.toLowerCase() /* ignore path casing */;
    }
    async startPolling(request, pollingInterval, restarts = 0) {
        const cts = new CancellationTokenSource();
        const instance = new DeferredPromise();
        const snapshotFile = randomPath(tmpdir(), 'vscode-watcher-snapshot');
        // Remember as watcher instance
        const watcher = new ParcelWatcherInstance(instance.p, request, restarts, cts.token, new RunOnceWorker(events => this.handleParcelEvents(events, watcher), ParcelWatcher.FILE_CHANGES_HANDLER_DELAY), async () => {
            cts.dispose(true);
            watcher.worker.flush();
            watcher.worker.dispose();
            pollingWatcher.dispose();
            await promises.unlink(snapshotFile);
        });
        this._watchers.set(this.requestToWatcherKey(request), watcher);
        // Path checks for symbolic links / wrong casing
        const { realPath, realPathDiffers, realPathLength } = await this.normalizePath(request);
        this.trace(`Started watching: '${realPath}' with polling interval '${pollingInterval}'`);
        let counter = 0;
        const pollingWatcher = new RunOnceScheduler(async () => {
            counter++;
            if (cts.token.isCancellationRequested) {
                return;
            }
            // We already ran before, check for events since
            const parcelWatcherLib = parcelWatcher;
            try {
                if (counter > 1) {
                    const parcelEvents = await parcelWatcherLib.getEventsSince(realPath, snapshotFile, { ignore: this.addPredefinedExcludes(request.excludes), backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });
                    if (cts.token.isCancellationRequested) {
                        return;
                    }
                    // Handle & emit events
                    this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
                }
                // Store a snapshot of files to the snapshot file
                await parcelWatcherLib.writeSnapshot(realPath, snapshotFile, { ignore: this.addPredefinedExcludes(request.excludes), backend: ParcelWatcher.PARCEL_WATCHER_BACKEND });
            }
            catch (error) {
                this.onUnexpectedError(error, request);
            }
            // Signal we are ready now when the first snapshot was written
            if (counter === 1) {
                instance.complete();
            }
            if (cts.token.isCancellationRequested) {
                return;
            }
            // Schedule again at the next interval
            pollingWatcher.schedule();
        }, pollingInterval);
        pollingWatcher.schedule(0);
    }
    async startWatching(request, restarts = 0) {
        const cts = new CancellationTokenSource();
        const instance = new DeferredPromise();
        // Remember as watcher instance
        const watcher = new ParcelWatcherInstance(instance.p, request, restarts, cts.token, new RunOnceWorker(events => this.handleParcelEvents(events, watcher), ParcelWatcher.FILE_CHANGES_HANDLER_DELAY), async () => {
            cts.dispose(true);
            watcher.worker.flush();
            watcher.worker.dispose();
            const watcherInstance = await instance.p;
            await watcherInstance?.unsubscribe();
        });
        this._watchers.set(this.requestToWatcherKey(request), watcher);
        // Path checks for symbolic links / wrong casing
        const { realPath, realPathDiffers, realPathLength } = await this.normalizePath(request);
        try {
            const parcelWatcherLib = parcelWatcher;
            const parcelWatcherInstance = await parcelWatcherLib.subscribe(realPath, (error, parcelEvents) => {
                if (watcher.token.isCancellationRequested) {
                    return; // return early when disposed
                }
                // In any case of an error, treat this like a unhandled exception
                // that might require the watcher to restart. We do not really know
                // the state of parcel at this point and as such will try to restart
                // up to our maximum of restarts.
                if (error) {
                    this.onUnexpectedError(error, request);
                }
                // Handle & emit events
                this.onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength);
            }, {
                backend: ParcelWatcher.PARCEL_WATCHER_BACKEND,
                ignore: this.addPredefinedExcludes(watcher.request.excludes)
            });
            this.trace(`Started watching: '${realPath}' with backend '${ParcelWatcher.PARCEL_WATCHER_BACKEND}'`);
            instance.complete(parcelWatcherInstance);
        }
        catch (error) {
            this.onUnexpectedError(error, request);
            instance.complete(undefined);
            watcher.notifyWatchFailed();
            this._onDidWatchFail.fire(request);
        }
    }
    addPredefinedExcludes(initialExcludes) {
        const excludes = [...initialExcludes];
        const predefinedExcludes = ParcelWatcher.PREDEFINED_EXCLUDES[process.platform];
        if (Array.isArray(predefinedExcludes)) {
            for (const exclude of predefinedExcludes) {
                if (!excludes.includes(exclude)) {
                    excludes.push(exclude);
                }
            }
        }
        return excludes;
    }
    onParcelEvents(parcelEvents, watcher, realPathDiffers, realPathLength) {
        if (parcelEvents.length === 0) {
            return;
        }
        // Normalize events: handle NFC normalization and symlinks
        // It is important to do this before checking for includes
        // to check on the original path.
        this.normalizeEvents(parcelEvents, watcher.request, realPathDiffers, realPathLength);
        // Check for includes
        const includedEvents = this.handleIncludes(watcher, parcelEvents);
        // Add to event aggregator for later processing
        for (const includedEvent of includedEvents) {
            watcher.worker.work(includedEvent);
        }
    }
    handleIncludes(watcher, parcelEvents) {
        const events = [];
        for (const { path, type: parcelEventType } of parcelEvents) {
            const type = ParcelWatcher.MAP_PARCEL_WATCHER_ACTION_TO_FILE_CHANGE.get(parcelEventType);
            if (this.verboseLogging) {
                this.traceWithCorrelation(`${type === 1 /* FileChangeType.ADDED */ ? '[ADDED]' : type === 2 /* FileChangeType.DELETED */ ? '[DELETED]' : '[CHANGED]'} ${path}`, watcher.request);
            }
            // Apply include filter if any
            if (!watcher.include(path)) {
                if (this.verboseLogging) {
                    this.traceWithCorrelation(` >> ignored (not included) ${path}`, watcher.request);
                }
            }
            else {
                events.push({ type, resource: URI.file(path), cId: watcher.request.correlationId });
            }
        }
        return events;
    }
    handleParcelEvents(parcelEvents, watcher) {
        // Coalesce events: merge events of same kind
        const coalescedEvents = coalesceEvents(parcelEvents);
        // Filter events: check for specific events we want to exclude
        const { events: filteredEvents, rootDeleted } = this.filterEvents(coalescedEvents, watcher);
        // Broadcast to clients
        this.emitEvents(filteredEvents, watcher);
        // Handle root path deletes
        if (rootDeleted) {
            this.onWatchedPathDeleted(watcher);
        }
    }
    emitEvents(events, watcher) {
        if (events.length === 0) {
            return;
        }
        // Broadcast to clients via throttler
        const worked = this.throttledFileChangesEmitter.work(events);
        // Logging
        if (!worked) {
            this.warn(`started ignoring events due to too many file change events at once (incoming: ${events.length}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
        }
        else {
            if (this.throttledFileChangesEmitter.pending > 0) {
                this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${events[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`, watcher);
            }
        }
    }
    async normalizePath(request) {
        let realPath = request.path;
        let realPathDiffers = false;
        let realPathLength = request.path.length;
        try {
            // First check for symbolic link
            realPath = await Promises.realpath(request.path);
            // Second check for casing difference
            // Note: this will be a no-op on Linux platforms
            if (request.path === realPath) {
                realPath = await realcase(request.path) ?? request.path;
            }
            // Correct watch path as needed
            if (request.path !== realPath) {
                realPathLength = realPath.length;
                realPathDiffers = true;
                this.trace(`correcting a path to watch that seems to be a symbolic link or wrong casing (original: ${request.path}, real: ${realPath})`);
            }
        }
        catch (error) {
            // ignore
        }
        return { realPath, realPathDiffers, realPathLength };
    }
    normalizeEvents(events, request, realPathDiffers, realPathLength) {
        for (const event of events) {
            // Mac uses NFD unicode form on disk, but we want NFC
            if (isMacintosh) {
                event.path = normalizeNFC(event.path);
            }
            // Workaround for https://github.com/parcel-bundler/watcher/issues/68
            // where watching root drive letter adds extra backslashes.
            if (isWindows) {
                if (request.path.length <= 3) { // for ex. c:, C:\
                    event.path = normalize(event.path);
                }
            }
            // Convert paths back to original form in case it differs
            if (realPathDiffers) {
                event.path = request.path + event.path.substr(realPathLength);
            }
        }
    }
    filterEvents(events, watcher) {
        const filteredEvents = [];
        let rootDeleted = false;
        const filter = this.isCorrelated(watcher.request) ? watcher.request.filter : undefined; // filtering is only enabled when correlating because watchers are otherwise potentially reused
        for (const event of events) {
            // Emit to instance subscriptions if any before filtering
            if (watcher.subscriptionsCount > 0) {
                watcher.notifyFileChange(event.resource.fsPath, event);
            }
            // Filtering
            rootDeleted = event.type === 2 /* FileChangeType.DELETED */ && isEqual(event.resource.fsPath, watcher.request.path, !isLinux);
            if (isFiltered(event, filter)) {
                if (this.verboseLogging) {
                    this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`, watcher.request);
                }
                continue;
            }
            // Logging
            this.traceEvent(event, watcher.request);
            filteredEvents.push(event);
        }
        return { events: filteredEvents, rootDeleted };
    }
    onWatchedPathDeleted(watcher) {
        this.warn('Watcher shutdown because watched path got deleted', watcher);
        watcher.notifyWatchFailed();
        this._onDidWatchFail.fire(watcher.request);
    }
    onUnexpectedError(error, request) {
        const msg = toErrorMessage(error);
        // Specially handle ENOSPC errors that can happen when
        // the watcher consumes so many file descriptors that
        // we are running into a limit. We only want to warn
        // once in this case to avoid log spam.
        // See https://github.com/microsoft/vscode/issues/7950
        if (msg.indexOf('No space left on device') !== -1) {
            if (!this.enospcErrorLogged) {
                this.error('Inotify limit reached (ENOSPC)', request);
                this.enospcErrorLogged = true;
            }
        }
        // Version 2.5.1 introduces 3 new errors on macOS
        // via https://github.dev/parcel-bundler/watcher/pull/196
        else if (msg.indexOf('File system must be re-scanned') !== -1) {
            this.error(msg, request);
        }
        // Any other error is unexpected and we should try to
        // restart the watcher as a result to get into healthy
        // state again if possible and if not attempted too much
        else {
            this.error(`Unexpected error: ${msg} (EUNKNOWN)`, request);
            this._onDidError.fire({ request, error: msg });
        }
    }
    async stop() {
        await super.stop();
        for (const watcher of this.watchers) {
            await this.stopWatching(watcher);
        }
    }
    restartWatching(watcher, delay = 800) {
        // Restart watcher delayed to accommodate for
        // changes on disk that have triggered the
        // need for a restart in the first place.
        const scheduler = new RunOnceScheduler(async () => {
            if (watcher.token.isCancellationRequested) {
                return; // return early when disposed
            }
            const restartPromise = new DeferredPromise();
            try {
                // Await the watcher having stopped, as this is
                // needed to properly re-watch the same path
                await this.stopWatching(watcher, restartPromise.p);
                // Start watcher again counting the restarts
                if (watcher.request.pollingInterval) {
                    await this.startPolling(watcher.request, watcher.request.pollingInterval, watcher.restarts + 1);
                }
                else {
                    await this.startWatching(watcher.request, watcher.restarts + 1);
                }
            }
            finally {
                restartPromise.complete();
            }
        }, delay);
        scheduler.schedule();
        watcher.token.onCancellationRequested(() => scheduler.dispose());
    }
    async stopWatching(watcher, joinRestart) {
        this.trace(`stopping file watcher`, watcher);
        this._watchers.delete(this.requestToWatcherKey(watcher.request));
        try {
            await watcher.stop(joinRestart);
        }
        catch (error) {
            this.error(`Unexpected error stopping watcher: ${toErrorMessage(error)}`, watcher.request);
        }
    }
    async removeDuplicateRequests(requests, validatePaths = true) {
        // Sort requests by path length to have shortest first
        // to have a way to prevent children to be watched if
        // parents exist.
        requests.sort((requestA, requestB) => requestA.path.length - requestB.path.length);
        // Ignore requests for the same paths that have the same correlation
        const mapCorrelationtoRequests = new Map();
        for (const request of requests) {
            if (request.excludes.includes(GLOBSTAR)) {
                continue; // path is ignored entirely (via `**` glob exclude)
            }
            let requestsForCorrelation = mapCorrelationtoRequests.get(request.correlationId);
            if (!requestsForCorrelation) {
                requestsForCorrelation = new Map();
                mapCorrelationtoRequests.set(request.correlationId, requestsForCorrelation);
            }
            const path = this.pathToWatcherKey(request.path);
            if (requestsForCorrelation.has(path)) {
                this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
            }
            requestsForCorrelation.set(path, request);
        }
        const normalizedRequests = [];
        for (const requestsForCorrelation of mapCorrelationtoRequests.values()) {
            // Only consider requests for watching that are not
            // a child of an existing request path to prevent
            // duplication. In addition, drop any request where
            // everything is excluded (via `**` glob).
            //
            // However, allow explicit requests to watch folders
            // that are symbolic links because the Parcel watcher
            // does not allow to recursively watch symbolic links.
            const requestTrie = TernarySearchTree.forPaths(!isLinux);
            for (const request of requestsForCorrelation.values()) {
                // Check for overlapping request paths (but preserve symbolic links)
                if (requestTrie.findSubstr(request.path)) {
                    if (requestTrie.has(request.path)) {
                        this.trace(`ignoring a request for watching who's path is already watched: ${this.requestToString(request)}`);
                    }
                    else {
                        try {
                            if (!(await promises.lstat(request.path)).isSymbolicLink()) {
                                this.trace(`ignoring a request for watching who's parent is already watched: ${this.requestToString(request)}`);
                                continue;
                            }
                        }
                        catch (error) {
                            this.trace(`ignoring a request for watching who's lstat failed to resolve: ${this.requestToString(request)} (error: ${error})`);
                            this._onDidWatchFail.fire(request);
                            continue;
                        }
                    }
                }
                // Check for invalid paths
                if (validatePaths && !(await this.isPathValid(request.path))) {
                    this._onDidWatchFail.fire(request);
                    continue;
                }
                requestTrie.set(request.path, request);
            }
            normalizedRequests.push(...Array.from(requestTrie).map(([, request]) => request));
        }
        return normalizedRequests;
    }
    async isPathValid(path) {
        try {
            const stat = await promises.stat(path);
            if (!stat.isDirectory()) {
                this.trace(`ignoring a path for watching that is a file and not a folder: ${path}`);
                return false;
            }
        }
        catch (error) {
            this.trace(`ignoring a path for watching who's stat info failed to resolve: ${path} (error: ${error})`);
            return false;
        }
        return true;
    }
    subscribe(path, callback) {
        for (const watcher of this.watchers) {
            if (watcher.failed) {
                continue; // watcher has already failed
            }
            if (!isEqualOrParent(path, watcher.request.path, !isLinux)) {
                continue; // watcher does not consider this path
            }
            if (watcher.exclude(path) ||
                !watcher.include(path)) {
                continue; // parcel instance does not consider this path
            }
            const disposables = new DisposableStore();
            disposables.add(Event.once(watcher.onDidStop)(async (e) => {
                await e.joinRestart; // if we are restarting, await that so that we can possibly reuse this watcher again
                if (disposables.isDisposed) {
                    return;
                }
                callback(true /* error */);
            }));
            disposables.add(Event.once(watcher.onDidFail)(() => callback(true /* error */)));
            disposables.add(watcher.subscribe(path, change => callback(null, change)));
            return disposables;
        }
        return undefined;
    }
    trace(message, watcher) {
        if (this.verboseLogging) {
            this._onDidLogMessage.fire({ type: 'trace', message: this.toMessage(message, watcher?.request) });
        }
    }
    warn(message, watcher) {
        this._onDidLogMessage.fire({ type: 'warn', message: this.toMessage(message, watcher?.request) });
    }
    error(message, request) {
        this._onDidLogMessage.fire({ type: 'error', message: this.toMessage(message, request) });
    }
    toMessage(message, request) {
        return request ? `[File Watcher ('parcel')] ${message} (path: ${request.path})` : `[File Watcher ('parcel')] ${message}`;
    }
    get recursiveWatcher() { return this; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyY2VsV2F0Y2hlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL25vZGUvd2F0Y2hlci9wYXJjZWwvcGFyY2VsV2F0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLGFBQWEsTUFBTSxpQkFBaUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzlCLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4SCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBaUIsY0FBYyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2hELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFB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