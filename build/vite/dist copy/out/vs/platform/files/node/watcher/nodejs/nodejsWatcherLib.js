/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { watch, promises } from 'fs';
import { RunOnceWorker, ThrottledWorker } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isEqual, isEqualOrParent } from '../../../../../base/common/extpath.js';
import { Disposable, DisposableStore, thenRegisterOrDispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { normalizeNFC } from '../../../../../base/common/normalization.js';
import { basename, dirname, join } from '../../../../../base/common/path.js';
import { isLinux, isMacintosh } from '../../../../../base/common/platform.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { coalesceEvents, parseWatcherPatterns, isFiltered, isWatchRequestWithCorrelation } from '../../../common/watcher.js';
import { Lazy } from '../../../../../base/common/lazy.js';
export class NodeJSFileWatcherLibrary extends Disposable {
    // A delay in reacting to file deletes to support
    // atomic save operations where a tool may chose
    // to delete a file before creating it again for
    // an update.
    static { this.FILE_DELETE_HANDLER_DELAY = 100; }
    // A delay for collecting file changes from node.js
    // before collecting them for coalescing and emitting
    // Same delay as used for the recursive watcher.
    static { this.FILE_CHANGES_HANDLER_DELAY = 75; }
    get isReusingRecursiveWatcher() { return this._isReusingRecursiveWatcher; }
    get failed() { return this.didFail; }
    constructor(request, recursiveWatcher, onDidFilesChange, onDidWatchFail, onLogMessage, verboseLogging) {
        super();
        this.request = request;
        this.recursiveWatcher = recursiveWatcher;
        this.onDidFilesChange = onDidFilesChange;
        this.onDidWatchFail = onDidWatchFail;
        this.onLogMessage = onLogMessage;
        this.verboseLogging = verboseLogging;
        // Reduce likelyhood of spam from file events via throttling.
        // These numbers are a bit more aggressive compared to the
        // recursive watcher because we can have many individual
        // node.js watchers per request.
        // (https://github.com/microsoft/vscode/issues/124723)
        this.throttledFileChangesEmitter = this._register(new ThrottledWorker({
            maxWorkChunkSize: 100, // only process up to 100 changes at once before...
            throttleDelay: 200, // ...resting for 200ms until we process events again...
            maxBufferedWork: 10000 // ...but never buffering more than 10000 events in memory
        }, events => this.onDidFilesChange(events)));
        // Aggregate file changes over FILE_CHANGES_HANDLER_DELAY
        // to coalesce events and reduce spam.
        this.fileChangesAggregator = this._register(new RunOnceWorker(events => this.handleFileChanges(events), NodeJSFileWatcherLibrary.FILE_CHANGES_HANDLER_DELAY));
        this.cts = new CancellationTokenSource();
        this.realPath = new Lazy(async () => {
            // This property is intentionally `Lazy` and not using `realcase()` as the counterpart
            // in the recursive watcher because of the amount of paths this watcher is dealing with.
            // We try as much as possible to avoid even needing `realpath()` if we can because even
            // that method does an `lstat()` per segment of the path.
            let result = this.request.path;
            try {
                result = await Promises.realpath(this.request.path);
                if (this.request.path !== result) {
                    this.trace(`correcting a path to watch that seems to be a symbolic link (original: ${this.request.path}, real: ${result})`);
                }
            }
            catch (error) {
                // ignore
            }
            return result;
        });
        this._isReusingRecursiveWatcher = false;
        this.didFail = false;
        const ignoreCase = !isLinux;
        this.excludes = parseWatcherPatterns(this.request.path, this.request.excludes, ignoreCase);
        this.includes = this.request.includes ? parseWatcherPatterns(this.request.path, this.request.includes, ignoreCase) : undefined;
        this.filter = isWatchRequestWithCorrelation(this.request) ? this.request.filter : undefined; // filtering is only enabled when correlating because watchers are otherwise potentially reused
        this.ready = this.watch();
    }
    async watch() {
        try {
            const stat = await promises.stat(this.request.path);
            if (this.cts.token.isCancellationRequested) {
                return;
            }
            this._register(await this.doWatch(stat.isDirectory()));
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                this.error(error);
            }
            else {
                this.trace(`ignoring a path for watching who's stat info failed to resolve: ${this.request.path} (error: ${error})`);
            }
            this.notifyWatchFailed();
        }
    }
    notifyWatchFailed() {
        this.didFail = true;
        this.onDidWatchFail?.();
    }
    async doWatch(isDirectory) {
        const disposables = new DisposableStore();
        if (this.doWatchWithExistingWatcher(isDirectory, disposables)) {
            this.trace(`reusing an existing recursive watcher for ${this.request.path}`);
            this._isReusingRecursiveWatcher = true;
        }
        else {
            this._isReusingRecursiveWatcher = false;
            await this.doWatchWithNodeJS(isDirectory, disposables);
        }
        return disposables;
    }
    doWatchWithExistingWatcher(isDirectory, disposables) {
        if (isDirectory) {
            // Recursive watcher re-use is currently not enabled for when
            // folders are watched. this is because the dispatching in the
            // recursive watcher for non-recurive requests is optimized for
            // file changes  where we really only match on the exact path
            // and not child paths.
            return false;
        }
        const resource = URI.file(this.request.path);
        const subscription = this.recursiveWatcher?.subscribe(this.request.path, async (error, change) => {
            if (disposables.isDisposed) {
                return; // return early if already disposed
            }
            if (error) {
                await thenRegisterOrDispose(this.doWatch(isDirectory), disposables);
            }
            else if (change) {
                if (typeof change.cId === 'number' || typeof this.request.correlationId === 'number') {
                    // Re-emit this change with the correlation id of the request
                    // so that the client can correlate the event with the request
                    // properly. Without correlation, we do not have to do that
                    // because the event will appear on the global listener already.
                    this.onFileChange({ resource, type: change.type, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
                }
            }
        });
        if (subscription) {
            disposables.add(subscription);
            return true;
        }
        return false;
    }
    async doWatchWithNodeJS(isDirectory, disposables) {
        const realPath = await this.realPath.value;
        if (this.cts.token.isCancellationRequested) {
            return;
        }
        // macOS: watching samba shares can crash VSCode so we do
        // a simple check for the file path pointing to /Volumes
        // (https://github.com/microsoft/vscode/issues/106879)
        // TODO@electron this needs a revisit when the crash is
        // fixed or mitigated upstream.
        if (isMacintosh && isEqualOrParent(realPath, '/Volumes/', true)) {
            this.error(`Refusing to watch ${realPath} for changes using fs.watch() for possibly being a network share where watching is unreliable and unstable.`);
            return;
        }
        const cts = new CancellationTokenSource(this.cts.token);
        disposables.add(toDisposable(() => cts.dispose(true)));
        const watcherDisposables = new DisposableStore(); // we need a separate disposable store because we re-create the watcher from within in some cases
        disposables.add(watcherDisposables);
        try {
            const requestResource = URI.file(this.request.path);
            const pathBasename = basename(realPath);
            // Creating watcher can fail with an exception
            const watcher = watch(realPath);
            watcherDisposables.add(toDisposable(() => {
                watcher.removeAllListeners();
                watcher.close();
            }));
            this.trace(`Started watching: '${realPath}'`);
            // Folder: resolve children to emit proper events
            const folderChildren = new Set();
            if (isDirectory) {
                try {
                    for (const child of await Promises.readdir(realPath)) {
                        folderChildren.add(child);
                    }
                }
                catch (error) {
                    this.error(error);
                }
            }
            if (cts.token.isCancellationRequested) {
                return;
            }
            const mapPathToStatDisposable = new Map();
            watcherDisposables.add(toDisposable(() => {
                for (const [, disposable] of mapPathToStatDisposable) {
                    disposable.dispose();
                }
                mapPathToStatDisposable.clear();
            }));
            watcher.on('error', (code, signal) => {
                if (cts.token.isCancellationRequested) {
                    return;
                }
                this.error(`Failed to watch ${realPath} for changes using fs.watch() (${code}, ${signal})`);
                this.notifyWatchFailed();
            });
            watcher.on('change', (type, raw) => {
                if (cts.token.isCancellationRequested) {
                    return; // ignore if already disposed
                }
                if (this.verboseLogging) {
                    this.traceWithCorrelation(`[raw] ["${type}"] ${raw}`);
                }
                // Normalize file name
                let changedFileName = '';
                if (raw) { // https://github.com/microsoft/vscode/issues/38191
                    changedFileName = raw.toString();
                    if (isMacintosh) {
                        // Mac: uses NFD unicode form on disk, but we want NFC
                        // See also https://github.com/nodejs/node/issues/2165
                        changedFileName = normalizeNFC(changedFileName);
                    }
                }
                if (!changedFileName || (type !== 'change' && type !== 'rename')) {
                    return; // ignore unexpected events
                }
                // Folder
                if (isDirectory) {
                    // Folder child added/deleted
                    if (type === 'rename') {
                        // Cancel any previous stats for this file if existing
                        mapPathToStatDisposable.get(changedFileName)?.dispose();
                        // Wait a bit and try see if the file still exists on disk
                        // to decide on the resulting event
                        const timeoutHandle = setTimeout(async () => {
                            mapPathToStatDisposable.delete(changedFileName);
                            // Depending on the OS the watcher runs on, there
                            // is different behaviour for when the watched
                            // folder path is being deleted:
                            //
                            // -   macOS: not reported but events continue to
                            //            work even when the folder is brought
                            //            back, though it seems every change
                            //            to a file is reported as "rename"
                            // -   Linux: "rename" event is reported with the
                            //            name of the folder and events stop
                            //            working
                            // - Windows: an EPERM error is thrown that we
                            //            handle from the `on('error')` event
                            //
                            // We do not re-attach the watcher after timeout
                            // though as we do for file watches because for
                            // file watching specifically we want to handle
                            // the atomic-write cases where the file is being
                            // deleted and recreated with different contents.
                            if (isEqual(changedFileName, pathBasename, !isLinux) && !await Promises.exists(realPath)) {
                                this.onWatchedPathDeleted(requestResource);
                                return;
                            }
                            if (cts.token.isCancellationRequested) {
                                return;
                            }
                            // In order to properly detect renames on a case-insensitive
                            // file system, we need to use `existsChildStrictCase` helper
                            // because otherwise we would wrongly assume a file exists
                            // when it was renamed to same name but different case.
                            const fileExists = await this.existsChildStrictCase(join(realPath, changedFileName));
                            if (cts.token.isCancellationRequested) {
                                return; // ignore if disposed by now
                            }
                            // Figure out the correct event type:
                            // File Exists: either 'added' or 'updated' if known before
                            // File Does not Exist: always 'deleted'
                            let type;
                            if (fileExists) {
                                if (folderChildren.has(changedFileName)) {
                                    type = 0 /* FileChangeType.UPDATED */;
                                }
                                else {
                                    type = 1 /* FileChangeType.ADDED */;
                                    folderChildren.add(changedFileName);
                                }
                            }
                            else {
                                folderChildren.delete(changedFileName);
                                type = 2 /* FileChangeType.DELETED */;
                            }
                            this.onFileChange({ resource: joinPath(requestResource, changedFileName), type, cId: this.request.correlationId });
                        }, NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);
                        mapPathToStatDisposable.set(changedFileName, toDisposable(() => clearTimeout(timeoutHandle)));
                    }
                    // Folder child changed
                    else {
                        // Figure out the correct event type: if this is the
                        // first time we see this child, it can only be added
                        let type;
                        if (folderChildren.has(changedFileName)) {
                            type = 0 /* FileChangeType.UPDATED */;
                        }
                        else {
                            type = 1 /* FileChangeType.ADDED */;
                            folderChildren.add(changedFileName);
                        }
                        this.onFileChange({ resource: joinPath(requestResource, changedFileName), type, cId: this.request.correlationId });
                    }
                }
                // File
                else {
                    // File added/deleted
                    if (type === 'rename' || !isEqual(changedFileName, pathBasename, !isLinux)) {
                        // Depending on the OS the watcher runs on, there
                        // is different behaviour for when the watched
                        // file path is being deleted:
                        //
                        // -   macOS: "rename" event is reported and events
                        //            stop working
                        // -   Linux: "rename" event is reported and events
                        //            stop working
                        // - Windows: "rename" event is reported and events
                        //            continue to work when file is restored
                        //
                        // As opposed to folder watching, we re-attach the
                        // watcher after brief timeout to support "atomic save"
                        // operations where a tool may decide to delete a file
                        // and then create it with the updated contents.
                        //
                        // Different to folder watching, we emit a delete event
                        // though we never detect when the file is brought back
                        // because the watcher is disposed then.
                        const timeoutHandle = setTimeout(async () => {
                            const fileExists = await Promises.exists(realPath);
                            if (cts.token.isCancellationRequested) {
                                return; // ignore if disposed by now
                            }
                            // File still exists, so emit as change event and reapply the watcher
                            if (fileExists) {
                                this.onFileChange({ resource: requestResource, type: 0 /* FileChangeType.UPDATED */, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
                                watcherDisposables.add(await this.doWatch(false));
                            }
                            // File seems to be really gone, so emit a deleted and failed event
                            else {
                                this.onWatchedPathDeleted(requestResource);
                            }
                        }, NodeJSFileWatcherLibrary.FILE_DELETE_HANDLER_DELAY);
                        // Very important to dispose the watcher which now points to a stale inode
                        // and wire in a new disposable that tracks our timeout that is installed
                        watcherDisposables.clear();
                        watcherDisposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
                    }
                    // File changed
                    else {
                        this.onFileChange({ resource: requestResource, type: 0 /* FileChangeType.UPDATED */, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
                    }
                }
            });
        }
        catch (error) {
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.error(`Failed to watch ${realPath} for changes using fs.watch() (${error.toString()})`);
            this.notifyWatchFailed();
        }
    }
    onWatchedPathDeleted(resource) {
        this.warn('Watcher shutdown because watched path got deleted');
        // Emit events and flush in case the watcher gets disposed
        this.onFileChange({ resource, type: 2 /* FileChangeType.DELETED */, cId: this.request.correlationId }, true /* skip excludes/includes (file is explicitly watched) */);
        this.fileChangesAggregator.flush();
        this.notifyWatchFailed();
    }
    onFileChange(event, skipIncludeExcludeChecks = false) {
        if (this.cts.token.isCancellationRequested) {
            return;
        }
        // Logging
        if (this.verboseLogging) {
            this.traceWithCorrelation(`${event.type === 1 /* FileChangeType.ADDED */ ? '[ADDED]' : event.type === 2 /* FileChangeType.DELETED */ ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`);
        }
        // Add to aggregator unless excluded or not included (not if explicitly disabled)
        if (!skipIncludeExcludeChecks && this.excludes.some(exclude => exclude(event.resource.fsPath))) {
            if (this.verboseLogging) {
                this.traceWithCorrelation(` >> ignored (excluded) ${event.resource.fsPath}`);
            }
        }
        else if (!skipIncludeExcludeChecks && this.includes && this.includes.length > 0 && !this.includes.some(include => include(event.resource.fsPath))) {
            if (this.verboseLogging) {
                this.traceWithCorrelation(` >> ignored (not included) ${event.resource.fsPath}`);
            }
        }
        else {
            this.fileChangesAggregator.work(event);
        }
    }
    handleFileChanges(fileChanges) {
        // Coalesce events: merge events of same kind
        const coalescedFileChanges = coalesceEvents(fileChanges);
        // Filter events: based on request filter property
        const filteredEvents = [];
        for (const event of coalescedFileChanges) {
            if (isFiltered(event, this.filter)) {
                if (this.verboseLogging) {
                    this.traceWithCorrelation(` >> ignored (filtered) ${event.resource.fsPath}`);
                }
                continue;
            }
            filteredEvents.push(event);
        }
        if (filteredEvents.length === 0) {
            return;
        }
        // Logging
        if (this.verboseLogging) {
            for (const event of filteredEvents) {
                this.traceWithCorrelation(` >> normalized ${event.type === 1 /* FileChangeType.ADDED */ ? '[ADDED]' : event.type === 2 /* FileChangeType.DELETED */ ? '[DELETED]' : '[CHANGED]'} ${event.resource.fsPath}`);
            }
        }
        // Broadcast to clients via throttled emitter
        const worked = this.throttledFileChangesEmitter.work(filteredEvents);
        // Logging
        if (!worked) {
            this.warn(`started ignoring events due to too many file change events at once (incoming: ${filteredEvents.length}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
        }
        else {
            if (this.throttledFileChangesEmitter.pending > 0) {
                this.trace(`started throttling events due to large amount of file change events at once (pending: ${this.throttledFileChangesEmitter.pending}, most recent change: ${filteredEvents[0].resource.fsPath}). Use 'files.watcherExclude' setting to exclude folders with lots of changing files (e.g. compilation output).`);
            }
        }
    }
    async existsChildStrictCase(path) {
        if (isLinux) {
            return Promises.exists(path);
        }
        try {
            const pathBasename = basename(path);
            const children = await Promises.readdir(dirname(path));
            return children.some(child => child === pathBasename);
        }
        catch (error) {
            this.trace(error);
            return false;
        }
    }
    setVerboseLogging(verboseLogging) {
        this.verboseLogging = verboseLogging;
    }
    error(error) {
        if (!this.cts.token.isCancellationRequested) {
            this.onLogMessage?.({ type: 'error', message: `[File Watcher (node.js)] ${error}` });
        }
    }
    warn(message) {
        if (!this.cts.token.isCancellationRequested) {
            this.onLogMessage?.({ type: 'warn', message: `[File Watcher (node.js)] ${message}` });
        }
    }
    trace(message) {
        if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
            this.onLogMessage?.({ type: 'trace', message: `[File Watcher (node.js)] ${message}` });
        }
    }
    traceWithCorrelation(message) {
        if (!this.cts.token.isCancellationRequested && this.verboseLogging) {
            this.trace(`${message}${typeof this.request.correlationId === 'number' ? ` <${this.request.correlationId}> ` : ``}`);
        }
    }
    dispose() {
        this.cts.dispose(true);
        super.dispose();
    }
}
/**
 * Watch the provided `path` for changes and return
 * the data in chunks of `Uint8Array` for further use.
 */
export async function watchFileContents(path, onData, onReady, token, bufferSize = 512) {
    const handle = await Promises.open(path, 'r');
    const buffer = Buffer.allocUnsafe(bufferSize);
    const cts = new CancellationTokenSource(token);
    let error = undefined;
    let isReading = false;
    const request = { path, excludes: [], recursive: false };
    const watcher = new NodeJSFileWatcherLibrary(request, undefined, changes => {
        (async () => {
            for (const { type } of changes) {
                if (type === 0 /* FileChangeType.UPDATED */) {
                    if (isReading) {
                        return; // return early if we are already reading the output
                    }
                    isReading = true;
                    try {
                        // Consume the new contents of the file until finished
                        // everytime there is a change event signalling a change
                        while (!cts.token.isCancellationRequested) {
                            const { bytesRead } = await Promises.read(handle, buffer, 0, bufferSize, null);
                            if (!bytesRead || cts.token.isCancellationRequested) {
                                break;
                            }
                            onData(buffer.slice(0, bytesRead));
                        }
                    }
                    catch (err) {
                        error = new Error(err);
                        cts.dispose(true);
                    }
                    finally {
                        isReading = false;
                    }
                }
            }
        })();
    });
    await watcher.ready;
    onReady();
    return new Promise((resolve, reject) => {
        cts.token.onCancellationRequested(async () => {
            watcher.dispose();
            try {
                await Promises.close(handle);
            }
            catch (err) {
                error = new Error(err);
            }
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzV2F0Y2hlckxpYi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL25vZGUvd2F0Y2hlci9ub2RlanMvbm9kZWpzV2F0Y2hlckxpYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUNyQyxPQUFPLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLHFCQUFxQixFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBZSxjQUFjLEVBQTZCLG9CQUFvQixFQUFrQyxVQUFVLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyTSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFHMUQs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