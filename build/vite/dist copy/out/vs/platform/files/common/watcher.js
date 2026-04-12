/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { GLOBSTAR, parse } from '../../../base/common/glob.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { isAbsolute } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { isParent } from './files.js';
export function isWatchRequestWithCorrelation(request) {
    return typeof request.correlationId === 'number';
}
export function isRecursiveWatchRequest(request) {
    return request.recursive === true;
}
export class AbstractWatcherClient extends Disposable {
    static { this.MAX_RESTARTS = 5; }
    constructor(onFileChanges, onLogMessage, verboseLogging, options) {
        super();
        this.onFileChanges = onFileChanges;
        this.onLogMessage = onLogMessage;
        this.verboseLogging = verboseLogging;
        this.options = options;
        this.watcherDisposables = this._register(new MutableDisposable());
        this.requests = undefined;
        this.restartCounter = 0;
    }
    init() {
        // Associate disposables to the watcher
        const disposables = new DisposableStore();
        this.watcherDisposables.value = disposables;
        // Ask implementors to create the watcher
        this.watcher = this.createWatcher(disposables);
        this.watcher.setVerboseLogging(this.verboseLogging);
        // Wire in event handlers
        disposables.add(this.watcher.onDidChangeFile(changes => this.onFileChanges(changes)));
        disposables.add(this.watcher.onDidLogMessage(msg => this.onLogMessage(msg)));
        disposables.add(this.watcher.onDidError(e => this.onError(e.error, e.request)));
    }
    onError(error, failedRequest) {
        // Restart on error (up to N times, if possible)
        if (this.canRestart(error, failedRequest)) {
            if (this.restartCounter < AbstractWatcherClient.MAX_RESTARTS && this.requests) {
                this.error(`restarting watcher after unexpected error: ${error}`);
                this.restart(this.requests);
            }
            else {
                this.error(`gave up attempting to restart watcher after unexpected error: ${error}`);
            }
        }
        // Do not attempt to restart otherwise, report the error
        else {
            this.error(error);
        }
    }
    canRestart(error, failedRequest) {
        if (!this.options.restartOnError) {
            return false; // disabled by options
        }
        if (failedRequest) {
            // do not treat a failing request as a reason to restart the entire
            // watcher. it is possible that from a large amount of watch requests
            // some fail and we would constantly restart all requests only because
            // of that. rather, continue the watcher and leave the failed request
            return false;
        }
        if (error.indexOf('No space left on device') !== -1 ||
            error.indexOf('EMFILE') !== -1) {
            // do not restart when the error indicates that the system is running
            // out of handles for file watching. this is not recoverable anyway
            // and needs changes to the system before continuing
            return false;
        }
        return true;
    }
    restart(requests) {
        this.restartCounter++;
        this.init();
        this.watch(requests);
    }
    async watch(requests) {
        this.requests = requests;
        await this.watcher?.watch(requests);
    }
    async setVerboseLogging(verboseLogging) {
        this.verboseLogging = verboseLogging;
        await this.watcher?.setVerboseLogging(verboseLogging);
    }
    error(message) {
        this.onLogMessage({ type: 'error', message: `[File Watcher (${this.options.type})] ${message}` });
    }
    trace(message) {
        this.onLogMessage({ type: 'trace', message: `[File Watcher (${this.options.type})] ${message}` });
    }
    dispose() {
        // Render the watcher invalid from here
        this.watcher = undefined;
        return super.dispose();
    }
}
export class AbstractNonRecursiveWatcherClient extends AbstractWatcherClient {
    constructor(onFileChanges, onLogMessage, verboseLogging) {
        super(onFileChanges, onLogMessage, verboseLogging, { type: 'node.js', restartOnError: false });
    }
}
export class AbstractUniversalWatcherClient extends AbstractWatcherClient {
    constructor(onFileChanges, onLogMessage, verboseLogging) {
        super(onFileChanges, onLogMessage, verboseLogging, { type: 'universal', restartOnError: true });
    }
}
export function reviveFileChanges(changes) {
    return changes.map(change => ({
        type: change.type,
        resource: URI.revive(change.resource),
        cId: change.cId
    }));
}
export function coalesceEvents(changes) {
    // Build deltas
    const coalescer = new EventCoalescer();
    for (const event of changes) {
        coalescer.processEvent(event);
    }
    return coalescer.coalesce();
}
export function normalizeWatcherPattern(path, pattern) {
    // Patterns are always matched on the full absolute path
    // of the event. As such, if the pattern is not absolute
    // and is a string and does not start with a leading
    // `**`, we have to convert it to a relative pattern with
    // the given `base`
    if (typeof pattern === 'string' && !pattern.startsWith(GLOBSTAR) && !isAbsolute(pattern)) {
        return { base: path, pattern };
    }
    return pattern;
}
export function parseWatcherPatterns(path, patterns, ignoreCase) {
    const parsedPatterns = [];
    for (const pattern of patterns) {
        parsedPatterns.push(parse(normalizeWatcherPattern(path, pattern), { ignoreCase }));
    }
    return parsedPatterns;
}
class EventCoalescer {
    constructor() {
        this.coalesced = new Set();
        this.mapPathToChange = new Map();
    }
    toKey(event) {
        if (isLinux) {
            return event.resource.fsPath;
        }
        return event.resource.fsPath.toLowerCase(); // normalise to file system case sensitivity
    }
    processEvent(event) {
        const existingEvent = this.mapPathToChange.get(this.toKey(event));
        let keepEvent = false;
        // Event path already exists
        if (existingEvent) {
            const currentChangeType = existingEvent.type;
            const newChangeType = event.type;
            // macOS/Windows: track renames to different case
            // by keeping both CREATE and DELETE events
            if (existingEvent.resource.fsPath !== event.resource.fsPath && (event.type === 2 /* FileChangeType.DELETED */ || event.type === 1 /* FileChangeType.ADDED */)) {
                keepEvent = true;
            }
            // Ignore CREATE followed by DELETE in one go
            else if (currentChangeType === 1 /* FileChangeType.ADDED */ && newChangeType === 2 /* FileChangeType.DELETED */) {
                this.mapPathToChange.delete(this.toKey(event));
                this.coalesced.delete(existingEvent);
            }
            // Flatten DELETE followed by CREATE into CHANGE
            else if (currentChangeType === 2 /* FileChangeType.DELETED */ && newChangeType === 1 /* FileChangeType.ADDED */) {
                existingEvent.type = 0 /* FileChangeType.UPDATED */;
            }
            // Do nothing. Keep the created event
            else if (currentChangeType === 1 /* FileChangeType.ADDED */ && newChangeType === 0 /* FileChangeType.UPDATED */) { }
            // Otherwise apply change type
            else {
                existingEvent.type = newChangeType;
            }
        }
        // Otherwise keep
        else {
            keepEvent = true;
        }
        if (keepEvent) {
            this.coalesced.add(event);
            this.mapPathToChange.set(this.toKey(event), event);
        }
    }
    coalesce() {
        const addOrChangeEvents = [];
        const deletedPaths = [];
        // This algorithm will remove all DELETE events up to the root folder
        // that got deleted if any. This ensures that we are not producing
        // DELETE events for each file inside a folder that gets deleted.
        //
        // 1.) split ADD/CHANGE and DELETED events
        // 2.) sort short deleted paths to the top
        // 3.) for each DELETE, check if there is a deleted parent and ignore the event in that case
        return Array.from(this.coalesced).filter(e => {
            if (e.type !== 2 /* FileChangeType.DELETED */) {
                addOrChangeEvents.push(e);
                return false; // remove ADD / CHANGE
            }
            return true; // keep DELETE
        }).sort((e1, e2) => {
            return e1.resource.fsPath.length - e2.resource.fsPath.length; // shortest path first
        }).filter(e => {
            if (deletedPaths.some(deletedPath => isParent(e.resource.fsPath, deletedPath, !isLinux /* ignorecase */))) {
                return false; // DELETE is ignored if parent is deleted already
            }
            // otherwise mark as deleted
            deletedPaths.push(e.resource.fsPath);
            return true;
        }).concat(addOrChangeEvents);
    }
}
export function isFiltered(event, filter) {
    if (typeof filter === 'number') {
        switch (event.type) {
            case 1 /* FileChangeType.ADDED */:
                return (filter & 4 /* FileChangeFilter.ADDED */) === 0;
            case 2 /* FileChangeType.DELETED */:
                return (filter & 8 /* FileChangeFilter.DELETED */) === 0;
            case 0 /* FileChangeType.UPDATED */:
                return (filter & 2 /* FileChangeFilter.UPDATED */) === 0;
        }
    }
    return false;
}
export function requestFilterToString(filter) {
    if (typeof filter === 'number') {
        const filters = [];
        if (filter & 4 /* FileChangeFilter.ADDED */) {
            filters.push('Added');
        }
        if (filter & 8 /* FileChangeFilter.DELETED */) {
            filters.push('Deleted');
        }
        if (filter & 2 /* FileChangeFilter.UPDATED */) {
            filters.push('Updated');
        }
        if (filters.length === 0) {
            return '<all>';
        }
        return `[${filters.join(', ')}]`;
    }
    return '<none>';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi93YXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQW9CLEtBQUssRUFBaUIsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBaUQsUUFBUSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBK0NyRixNQUFNLFVBQVUsNkJBQTZCLENBQUMsT0FBc0I7SUFDbkUsT0FBTyxPQUFPLE9BQU8sQ0FBQyxhQUFhLEtBQUssUUFBUSxDQUFDO0FBQ2xELENBQUM7QUF3QkQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLE9BQXNCO0lBQzdELE9BQU8sT0FBTyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDbkMsQ0FBQztBQStGRCxNQUFNLE9BQWdCLHFCQUFzQixTQUFRLFVBQVU7YUFFckMsaUJBQVksR0FBRyxDQUFDLEFBQUosQ0FBSztJQVN6QyxZQUNrQixhQUErQyxFQUMvQyxZQUF3QyxFQUNqRCxjQUF1QixFQUN2QixPQUdQO1FBRUQsS0FBSyxFQUFFLENBQUM7UUFSUyxrQkFBYSxHQUFiLGFBQWEsQ0FBa0M7UUFDL0MsaUJBQVksR0FBWixZQUFZLENBQTRCO1FBQ2pELG1CQUFjLEdBQWQsY0FBYyxDQUFTO1FBQ3ZCLFlBQU8sR0FBUCxPQUFPLENBR2Q7UUFiZSx1QkFB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