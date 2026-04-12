/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, AsyncEmitter } from '../../../base/common/event.js';
import { GLOBSTAR, GLOB_SPLIT, parse } from '../../../base/common/glob.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import * as typeConverter from './extHostTypeConverters.js';
import { Disposable, WorkspaceEdit } from './extHostTypes.js';
import { Lazy } from '../../../base/common/lazy.js';
import { rtrim } from '../../../base/common/strings.js';
import { normalizeWatcherPattern } from '../../../platform/files/common/watcher.js';
import { Schemas } from '../../../base/common/network.js';
class FileSystemWatcher {
    get ignoreCreateEvents() {
        return Boolean(this._config & 0b001);
    }
    get ignoreChangeEvents() {
        return Boolean(this._config & 0b010);
    }
    get ignoreDeleteEvents() {
        return Boolean(this._config & 0b100);
    }
    constructor(mainContext, configuration, fileSystemInfo, workspace, extension, dispatcher, globPattern, options) {
        this.session = Math.random();
        this._onDidCreate = new Emitter();
        this._onDidChange = new Emitter();
        this._onDidDelete = new Emitter();
        this._config = 0;
        if (options.ignoreCreateEvents) {
            this._config += 0b001;
        }
        if (options.ignoreChangeEvents) {
            this._config += 0b010;
        }
        if (options.ignoreDeleteEvents) {
            this._config += 0b100;
        }
        const ignoreCase = typeof globPattern === 'string' ?
            !((fileSystemInfo.getCapabilities(Schemas.file) ?? 0) & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */) :
            fileSystemInfo.extUri.ignorePathCasing(URI.revive(globPattern.baseUri));
        // Performance: pre-lowercase pattern and paths to use fast case-sensitive
        // matching instead of repeated case-insensitive comparisons in the hot loop.
        // By normalizing to lowercase upfront, we enforce `ignoreCase: false` so the
        // glob parser uses strict `===` / `endsWith` instead of character-by-character
        // case-folding on every comparison.
        let matchGlob = globPattern;
        if (ignoreCase) {
            matchGlob = typeof globPattern === 'string'
                ? globPattern.toLowerCase()
                : { base: globPattern.base.toLowerCase(), pattern: globPattern.pattern.toLowerCase() };
        }
        const parsedPattern = parse(matchGlob, { ignoreCase: false /* speeds up matching, but requires us to lowercase paths and patterns */ });
        // 1.64.x behavior change: given the new support to watch any folder
        // we start to ignore events outside the workspace when only a string
        // pattern is provided to avoid sending events to extensions that are
        // unexpected.
        // https://github.com/microsoft/vscode/issues/3025
        const excludeOutOfWorkspaceEvents = typeof globPattern === 'string';
        // 1.84.x introduces new proposed API for a watcher to set exclude
        // rules. In these cases, we turn the file watcher into correlation
        // mode and ignore any event that does not match the correlation ID.
        //
        // Update (Feb 2025): proposal is discontinued, so the previous
        // `options.correlate` is always `false`.
        const excludeUncorrelatedEvents = false;
        const subscription = dispatcher(events => {
            if (typeof events.session === 'number' && events.session !== this.session) {
                return; // ignore events from other file watchers that are in correlation mode
            }
            if (excludeUncorrelatedEvents && typeof events.session === 'undefined') {
                return; // ignore events from other non-correlating file watcher when we are in correlation mode
            }
            if (!options.ignoreCreateEvents) {
                for (const { uri, lowerCaseFsPath } of events.created) {
                    if (parsedPattern(ignoreCase ? lowerCaseFsPath : uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
                        this._onDidCreate.fire(uri);
                    }
                }
            }
            if (!options.ignoreChangeEvents) {
                for (const { uri, lowerCaseFsPath } of events.changed) {
                    if (parsedPattern(ignoreCase ? lowerCaseFsPath : uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
                        this._onDidChange.fire(uri);
                    }
                }
            }
            if (!options.ignoreDeleteEvents) {
                for (const { uri, lowerCaseFsPath } of events.deleted) {
                    if (parsedPattern(ignoreCase ? lowerCaseFsPath : uri.fsPath) && (!excludeOutOfWorkspaceEvents || workspace.getWorkspaceFolder(uri))) {
                        this._onDidDelete.fire(uri);
                    }
                }
            }
        });
        this._disposable = Disposable.from(this.ensureWatching(mainContext, workspace, configuration, extension, globPattern, options, false), this._onDidCreate, this._onDidChange, this._onDidDelete, subscription);
    }
    ensureWatching(mainContext, workspace, configuration, extension, globPattern, options, correlate) {
        const disposable = Disposable.from();
        if (typeof globPattern === 'string') {
            return disposable; // workspace is already watched by default, no need to watch again!
        }
        if (options.ignoreChangeEvents && options.ignoreCreateEvents && options.ignoreDeleteEvents) {
            return disposable; // no need to watch if we ignore all events
        }
        const proxy = mainContext.getProxy(MainContext.MainThreadFileSystemEventService);
        let recursive = false;
        if (globPattern.pattern.includes(GLOBSTAR) || globPattern.pattern.includes(GLOB_SPLIT)) {
            recursive = true; // only watch recursively if pattern indicates the need for it
        }
        const excludes = [];
        let includes = undefined;
        let filter;
        // Correlated: adjust filter based on arguments
        if (correlate) {
            if (options.ignoreChangeEvents || options.ignoreCreateEvents || options.ignoreDeleteEvents) {
                filter = 2 /* FileChangeFilter.UPDATED */ | 4 /* FileChangeFilter.ADDED */ | 8 /* FileChangeFilter.DELETED */;
                if (options.ignoreChangeEvents) {
                    filter &= ~2 /* FileChangeFilter.UPDATED */;
                }
                if (options.ignoreCreateEvents) {
                    filter &= ~4 /* FileChangeFilter.ADDED */;
                }
                if (options.ignoreDeleteEvents) {
                    filter &= ~8 /* FileChangeFilter.DELETED */;
                }
            }
        }
        // Uncorrelated: adjust includes and excludes based on settings
        else {
            // Automatically add `files.watcherExclude` patterns when watching
            // recursively to give users a chance to configure exclude rules
            // for reducing the overhead of watching recursively
            if (recursive && excludes.length === 0) {
                const workspaceFolder = workspace.getWorkspaceFolder(URI.revive(globPattern.baseUri));
                const watcherExcludes = configuration.getConfiguration('files', workspaceFolder).get('watcherExclude');
                if (watcherExcludes) {
                    for (const key in watcherExcludes) {
                        if (key && watcherExcludes[key] === true) {
                            excludes.push(key);
                        }
                    }
                }
            }
            // Non-recursive watching inside the workspace will overlap with
            // our standard workspace watchers. To prevent duplicate events,
            // we only want to include events for files that are otherwise
            // excluded via `files.watcherExclude`. As such, we configure
            // to include each configured exclude pattern so that only those
            // events are reported that are otherwise excluded.
            // However, we cannot just use the pattern as is, because a pattern
            // such as `bar` for a exclude, will work to exclude any of
            // `<workspace path>/bar` but will not work as include for files within
            // `bar` unless a suffix of `/**` if added.
            // (https://github.com/microsoft/vscode/issues/148245)
            else if (!recursive) {
                const workspaceFolder = workspace.getWorkspaceFolder(URI.revive(globPattern.baseUri));
                if (workspaceFolder) {
                    const watcherExcludes = configuration.getConfiguration('files', workspaceFolder).get('watcherExclude');
                    if (watcherExcludes) {
                        for (const key in watcherExcludes) {
                            if (key && watcherExcludes[key] === true) {
                                const includePattern = `${rtrim(key, '/')}/${GLOBSTAR}`;
                                if (!includes) {
                                    includes = [];
                                }
                                includes.push(normalizeWatcherPattern(workspaceFolder.uri.fsPath, includePattern));
                            }
                        }
                    }
                    // Still ignore watch request if there are actually no configured
                    // exclude rules, because in that case our default recursive watcher
                    // should be able to take care of all events.
                    if (!includes || includes.length === 0) {
                        return disposable;
                    }
                }
            }
        }
        proxy.$watch(extension.identifier.value, this.session, globPattern.baseUri, { recursive, excludes, includes, filter }, Boolean(correlate));
        return Disposable.from({ dispose: () => proxy.$unwatch(this.session) });
    }
    dispose() {
        this._disposable.dispose();
    }
    get onDidCreate() {
        return this._onDidCreate.event;
    }
    get onDidChange() {
        return this._onDidChange.event;
    }
    get onDidDelete() {
        return this._onDidDelete.event;
    }
}
class LazyRevivedFileSystemEvents {
    get created() { return this._created.value; }
    get changed() { return this._changed.value; }
    get deleted() { return this._deleted.value; }
    static _revive(uriComponents) {
        const uri = URI.revive(uriComponents);
        return { uri, lowerCaseFsPath: uri.fsPath.toLowerCase() };
    }
    constructor(_events) {
        this._events = _events;
        this._created = new Lazy(() => this._events.created.map(LazyRevivedFileSystemEvents._revive));
        this._changed = new Lazy(() => this._events.changed.map(LazyRevivedFileSystemEvents._revive));
        this._deleted = new Lazy(() => this._events.deleted.map(LazyRevivedFileSystemEvents._revive));
        this.session = this._events.session;
    }
}
export class ExtHostFileSystemEventService {
    constructor(_mainContext, _logService, _extHostDocumentsAndEditors) {
        this._mainContext = _mainContext;
        this._logService = _logService;
        this._extHostDocumentsAndEditors = _extHostDocumentsAndEditors;
        this._onFileSystemEvent = new Emitter();
        this._onDidRenameFile = new Emitter();
        this._onDidCreateFile = new Emitter();
        this._onDidDeleteFile = new Emitter();
        this._onWillRenameFile = new AsyncEmitter();
        this._onWillCreateFile = new AsyncEmitter();
        this._onWillDeleteFile = new AsyncEmitter();
        this.onDidRenameFile = this._onDidRenameFile.event;
        this.onDidCreateFile = this._onDidCreateFile.event;
        this.onDidDeleteFile = this._onDidDeleteFile.event;
        //
    }
    //--- file events
    createFileSystemWatcher(workspace, configProvider, fileSystemInfo, extension, globPattern, options) {
        return new FileSystemWatcher(this._mainContext, configProvider, fileSystemInfo, workspace, extension, this._onFileSystemEvent.event, typeConverter.GlobPattern.from(globPattern), options);
    }
    $onFileEvent(events) {
        this._onFileSystemEvent.fire(new LazyRevivedFileSystemEvents(events));
    }
    //--- file operations
    $onDidRunFileOperation(operation, files) {
        switch (operation) {
            case 2 /* FileOperation.MOVE */:
                this._onDidRenameFile.fire(Object.freeze({ files: files.map(f => ({ oldUri: URI.revive(f.source), newUri: URI.revive(f.target) })) }));
                break;
            case 1 /* FileOperation.DELETE */:
                this._onDidDeleteFile.fire(Object.freeze({ files: files.map(f => URI.revive(f.target)) }));
                break;
            case 0 /* FileOperation.CREATE */:
            case 3 /* FileOperation.COPY */:
                this._onDidCreateFile.fire(Object.freeze({ files: files.map(f => URI.revive(f.target)) }));
                break;
            default:
            //ignore, dont send
        }
    }
    getOnWillRenameFileEvent(extension) {
        return this._createWillExecuteEvent(extension, this._onWillRenameFile);
    }
    getOnWillCreateFileEvent(extension) {
        return this._createWillExecuteEvent(extension, this._onWillCreateFile);
    }
    getOnWillDeleteFileEvent(extension) {
        return this._createWillExecuteEvent(extension, this._onWillDeleteFile);
    }
    _createWillExecuteEvent(extension, emitter) {
        return (listener, thisArg, disposables) => {
            const wrappedListener = function wrapped(e) { listener.call(thisArg, e); };
            wrappedListener.extension = extension;
            return emitter.event(wrappedListener, undefined, disposables);
        };
    }
    async $onWillRunFileOperation(operation, files, timeout, token) {
        switch (operation) {
            case 2 /* FileOperation.MOVE */:
                return await this._fireWillEvent(this._onWillRenameFile, { files: files.map(f => ({ oldUri: URI.revive(f.source), newUri: URI.revive(f.target) })) }, timeout, token);
            case 1 /* FileOperation.DELETE */:
                return await this._fireWillEvent(this._onWillDeleteFile, { files: files.map(f => URI.revive(f.target)) }, timeout, token);
            case 0 /* FileOperation.CREATE */:
            case 3 /* FileOperation.COPY */:
                return await this._fireWillEvent(this._onWillCreateFile, { files: files.map(f => URI.revive(f.target)) }, timeout, token);
        }
        return undefined;
    }
    async _fireWillEvent(emitter, data, timeout, token) {
        const extensionNames = new Set();
        const edits = [];
        await emitter.fireAsync(data, token, async (thenable, listener) => {
            // ignore all results except for WorkspaceEdits. Those are stored in an array.
            const now = Date.now();
            const result = await Promise.resolve(thenable);
            if (result instanceof WorkspaceEdit) {
                edits.push([listener.extension, result]);
                extensionNames.add(listener.extension.displayName ?? listener.extension.identifier.value);
            }
            if (Date.now() - now > timeout) {
                this._logService.warn('SLOW file-participant', listener.extension.identifier);
            }
        });
        if (token.isCancellationRequested) {
            return undefined;
        }
        if (edits.length === 0) {
            return undefined;
        }
        // concat all WorkspaceEdits collected via waitUntil-call and send them over to the renderer
        const dto = { edits: [] };
        for (const [, edit] of edits) {
            const { edits } = typeConverter.WorkspaceEdit.from(edit, {
                getTextDocumentVersion: uri => this._extHostDocumentsAndEditors.getDocument(uri)?.version,
                getNotebookDocumentVersion: () => undefined,
            });
            dto.edits = dto.edits.concat(edits);
        }
        return { edit: dto, extensionNames: Array.from(extensionNames) };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0RmlsZVN5c3RlbUV2ZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLFlBQVksRUFBOEIsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBb0IsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDN0YsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUdqRSxPQUFPLEVBQStJLFdBQVcsRUFBdUIsTUFBTSx1QkFBdUIsQ0FBQztBQUN0TixPQUFPLEtBQUssYUFBYSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFNOUQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXBELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFRMUQsTUFBTSxpQkFBaUI7SUFXdEIsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIs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