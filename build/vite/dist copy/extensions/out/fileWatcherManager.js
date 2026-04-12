"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWatcherManager = void 0;
const vscode_uri_1 = require("vscode-uri");
const pathMapper_1 = require("./pathMapper");
/**
 * Copied from `ts.FileWatcherEventKind` to avoid direct dependency.
 */
var FileWatcherEventKind;
(function (FileWatcherEventKind) {
    FileWatcherEventKind[FileWatcherEventKind["Created"] = 0] = "Created";
    FileWatcherEventKind[FileWatcherEventKind["Changed"] = 1] = "Changed";
    FileWatcherEventKind[FileWatcherEventKind["Deleted"] = 2] = "Deleted";
})(FileWatcherEventKind || (FileWatcherEventKind = {}));
class FileWatcherManager {
    watchPort;
    enabledExperimentalTypeAcquisition;
    pathMapper;
    logger;
    static noopWatcher = { close() { } };
    watchFiles = new Map();
    watchDirectories = new Map();
    watchId = 0;
    constructor(watchPort, extensionUri, enabledExperimentalTypeAcquisition, pathMapper, logger) {
        this.watchPort = watchPort;
        this.enabledExperimentalTypeAcquisition = enabledExperimentalTypeAcquisition;
        this.pathMapper = pathMapper;
        this.logger = logger;
        watchPort.onmessage = (e) => this.updateWatch(e.data.event, vscode_uri_1.URI.from(e.data.uri), extensionUri);
    }
    watchFile(path, callback, pollingInterval, options) {
        if ((0, pathMapper_1.looksLikeLibDtsPath)(path)) { // We don't support watching lib files on web since they are readonly
            return FileWatcherManager.noopWatcher;
        }
        this.logger.logVerbose('fs.watchFile', { path });
        let uri;
        try {
            uri = this.pathMapper.toResource(path);
        }
        catch (e) {
            console.error(e);
            return FileWatcherManager.noopWatcher;
        }
        this.watchFiles.set(path, { callback, pollingInterval, options });
        const watchIds = [++this.watchId];
        this.watchPort.postMessage({ type: 'watchFile', uri: uri, id: watchIds[0] });
        if (this.enabledExperimentalTypeAcquisition && (0, pathMapper_1.looksLikeNodeModules)(path) && uri.scheme !== 'vscode-global-typings') {
            watchIds.push(++this.watchId);
            this.watchPort.postMessage({ type: 'watchFile', uri: (0, pathMapper_1.mapUri)(uri, 'vscode-global-typings'), id: watchIds[1] });
        }
        return {
            close: () => {
                this.logger.logVerbose('fs.watchFile.close', { path });
                this.watchFiles.delete(path);
                for (const id of watchIds) {
                    this.watchPort.postMessage({ type: 'dispose', id });
                }
            }
        };
    }
    watchDirectory(path, callback, recursive, options) {
        this.logger.logVerbose('fs.watchDirectory', { path });
        let uri;
        try {
            uri = this.pathMapper.toResource(path);
        }
        catch (e) {
            console.error(e);
            return FileWatcherManager.noopWatcher;
        }
        this.watchDirectories.set(path, { callback, recursive, options });
        const watchIds = [++this.watchId];
        this.watchPort.postMessage({ type: 'watchDirectory', recursive, uri, id: this.watchId });
        return {
            close: () => {
                this.logger.logVerbose('fs.watchDirectory.close', { path });
                this.watchDirectories.delete(path);
                for (const id of watchIds) {
                    this.watchPort.postMessage({ type: 'dispose', id });
                }
            }
        };
    }
    updateWatch(event, uri, extensionUri) {
        const kind = this.toTsWatcherKind(event);
        const path = (0, pathMapper_1.fromResource)(extensionUri, uri);
        const fileWatcher = this.watchFiles.get(path);
        if (fileWatcher) {
            fileWatcher.callback(path, kind);
            return;
        }
        for (const watch of Array.from(this.watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
            this.watchDirectories.get(watch).callback(path);
            return;
        }
        console.error(`no watcher found for ${path}`);
    }
    toTsWatcherKind(event) {
        if (event === 'create') {
            return FileWatcherEventKind.Created;
        }
        else if (event === 'change') {
            return FileWatcherEventKind.Changed;
        }
        else if (event === 'delete') {
            return FileWatcherEventKind.Deleted;
        }
        throw new Error(`Unknown event: ${event}`);
    }
}
exports.FileWatcherManager = FileWatcherManager;
//# sourceMappingURL=fileWatcherManager.js.map