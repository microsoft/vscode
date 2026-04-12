/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { DiskFileSystemProvider } from './diskFileSystemProvider.js';
import { Disposable, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { listenStream } from '../../../base/common/stream.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
/**
 * A server implementation for a IPC based file system provider client.
 */
export class AbstractDiskFileSystemProviderChannel extends Disposable {
    constructor(provider, logService) {
        super();
        this.provider = provider;
        this.logService = logService;
        //#endregion
        //#region File Watching
        this.sessionToWatcher = new Map();
        this.watchRequests = new Map();
    }
    call(ctx, command, args) {
        const uriTransformer = this.getUriTransformer(ctx);
        switch (command) {
            case 'stat': return this.stat(uriTransformer, args[0]);
            case 'realpath': return this.realpath(uriTransformer, args[0]);
            case 'readdir': return this.readdir(uriTransformer, args[0]);
            case 'open': return this.open(uriTransformer, args[0], args[1]);
            case 'close': return this.close(args[0]);
            case 'read': return this.read(args[0], args[1], args[2]);
            case 'readFile': return this.readFile(uriTransformer, args[0], args[1]);
            case 'write': return this.write(args[0], args[1], args[2], args[3], args[4]);
            case 'writeFile': return this.writeFile(uriTransformer, args[0], args[1], args[2]);
            case 'rename': return this.rename(uriTransformer, args[0], args[1], args[2]);
            case 'copy': return this.copy(uriTransformer, args[0], args[1], args[2]);
            case 'cloneFile': return this.cloneFile(uriTransformer, args[0], args[1]);
            case 'mkdir': return this.mkdir(uriTransformer, args[0]);
            case 'delete': return this.delete(uriTransformer, args[0], args[1]);
            case 'watch': return this.watch(uriTransformer, args[0], args[1], args[2], args[3]);
            case 'unwatch': return this.unwatch(args[0], args[1]);
        }
        throw new Error(`IPC Command ${command} not found`);
    }
    listen(ctx, event, args) {
        const uriTransformer = this.getUriTransformer(ctx);
        switch (event) {
            case 'fileChange': return this.onFileChange(uriTransformer, args[0]);
            case 'readFileStream': return this.onReadFileStream(uriTransformer, args[0], args[1]);
        }
        throw new Error(`Unknown event ${event}`);
    }
    //#region File Metadata Resolving
    stat(uriTransformer, _resource) {
        const resource = this.transformIncoming(uriTransformer, _resource, true);
        return this.provider.stat(resource);
    }
    realpath(uriTransformer, _resource) {
        const resource = this.transformIncoming(uriTransformer, _resource, true);
        return this.provider.realpath(resource);
    }
    readdir(uriTransformer, _resource) {
        const resource = this.transformIncoming(uriTransformer, _resource);
        return this.provider.readdir(resource);
    }
    //#endregion
    //#region File Reading/Writing
    async readFile(uriTransformer, _resource, opts) {
        const resource = this.transformIncoming(uriTransformer, _resource, true);
        const buffer = await this.provider.readFile(resource, opts);
        return VSBuffer.wrap(buffer);
    }
    onReadFileStream(uriTransformer, _resource, opts) {
        const resource = this.transformIncoming(uriTransformer, _resource, true);
        const cts = new CancellationTokenSource();
        const emitter = new Emitter({
            onDidRemoveLastListener: () => {
                // Ensure to cancel the read operation when there is no more
                // listener on the other side to prevent unneeded work.
                cts.cancel();
            }
        });
        const fileStream = this.provider.readFileStream(resource, opts, cts.token);
        listenStream(fileStream, {
            onData: chunk => emitter.fire(VSBuffer.wrap(chunk)),
            onError: error => emitter.fire(error),
            onEnd: () => {
                // Forward event
                emitter.fire('end');
                // Cleanup
                emitter.dispose();
                cts.dispose();
            }
        });
        return emitter.event;
    }
    writeFile(uriTransformer, _resource, content, opts) {
        const resource = this.transformIncoming(uriTransformer, _resource);
        return this.provider.writeFile(resource, content.buffer, opts);
    }
    open(uriTransformer, _resource, opts) {
        const resource = this.transformIncoming(uriTransformer, _resource, true);
        return this.provider.open(resource, opts);
    }
    close(fd) {
        return this.provider.close(fd);
    }
    async read(fd, pos, length) {
        const buffer = VSBuffer.alloc(length);
        const bufferOffset = 0; // offset is 0 because we create a buffer to read into for each call
        const bytesRead = await this.provider.read(fd, pos, buffer.buffer, bufferOffset, length);
        return [buffer, bytesRead];
    }
    write(fd, pos, data, offset, length) {
        return this.provider.write(fd, pos, data.buffer, offset, length);
    }
    //#endregion
    //#region Move/Copy/Delete/Create Folder
    mkdir(uriTransformer, _resource) {
        const resource = this.transformIncoming(uriTransformer, _resource);
        return this.provider.mkdir(resource);
    }
    delete(uriTransformer, _resource, opts) {
        const resource = this.transformIncoming(uriTransformer, _resource);
        return this.provider.delete(resource, opts);
    }
    rename(uriTransformer, _source, _target, opts) {
        const source = this.transformIncoming(uriTransformer, _source);
        const target = this.transformIncoming(uriTransformer, _target);
        return this.provider.rename(source, target, opts);
    }
    copy(uriTransformer, _source, _target, opts) {
        const source = this.transformIncoming(uriTransformer, _source);
        const target = this.transformIncoming(uriTransformer, _target);
        return this.provider.copy(source, target, opts);
    }
    //#endregion
    //#region Clone File
    cloneFile(uriTransformer, _source, _target) {
        const source = this.transformIncoming(uriTransformer, _source);
        const target = this.transformIncoming(uriTransformer, _target);
        return this.provider.cloneFile(source, target);
    }
    onFileChange(uriTransformer, sessionId) {
        // We want a specific emitter for the given session so that events
        // from the one session do not end up on the other session. As such
        // we create a `SessionFileWatcher` and a `Emitter` for that session.
        const emitter = new Emitter({
            onWillAddFirstListener: () => {
                this.sessionToWatcher.set(sessionId, this.createSessionFileWatcher(uriTransformer, emitter));
            },
            onDidRemoveLastListener: () => {
                dispose(this.sessionToWatcher.get(sessionId));
                this.sessionToWatcher.delete(sessionId);
            }
        });
        return emitter.event;
    }
    async watch(uriTransformer, sessionId, req, _resource, opts) {
        const watcher = this.sessionToWatcher.get(sessionId);
        if (watcher) {
            const resource = this.transformIncoming(uriTransformer, _resource);
            const disposable = watcher.watch(req, resource, opts);
            this.watchRequests.set(sessionId + req, disposable);
        }
    }
    async unwatch(sessionId, req) {
        const id = sessionId + req;
        const disposable = this.watchRequests.get(id);
        if (disposable) {
            dispose(disposable);
            this.watchRequests.delete(id);
        }
    }
    //#endregion
    dispose() {
        super.dispose();
        for (const [, disposable] of this.watchRequests) {
            disposable.dispose();
        }
        this.watchRequests.clear();
        for (const [, disposable] of this.sessionToWatcher) {
            disposable.dispose();
        }
        this.sessionToWatcher.clear();
    }
}
export class AbstractSessionFileWatcher extends Disposable {
    constructor(uriTransformer, sessionEmitter, logService, environmentService) {
        super();
        this.uriTransformer = uriTransformer;
        this.environmentService = environmentService;
        this.watcherRequests = new Map();
        this.fileWatcher = this._register(new DiskFileSystemProvider(logService));
        this.registerListeners(sessionEmitter);
    }
    registerListeners(sessionEmitter) {
        const localChangeEmitter = this._register(new Emitter());
        this._register(localChangeEmitter.event((events) => {
            sessionEmitter.fire(events.map(e => ({
                resource: this.uriTransformer.transformOutgoingURI(e.resource),
                type: e.type,
                cId: e.cId
            })));
        }));
        this._register(this.fileWatcher.onDidChangeFile(events => localChangeEmitter.fire(events)));
        this._register(this.fileWatcher.onDidWatchError(error => sessionEmitter.fire(error)));
    }
    getRecursiveWatcherOptions(environmentService) {
        return undefined; // subclasses can override
    }
    getExtraExcludes(environmentService) {
        return undefined; // subclasses can override
    }
    watch(req, resource, opts) {
        const extraExcludes = this.getExtraExcludes(this.environmentService);
        if (Array.isArray(extraExcludes)) {
            opts.excludes = [...opts.excludes, ...extraExcludes];
        }
        this.watcherRequests.set(req, this.fileWatcher.watch(resource, opts));
        return toDisposable(() => {
            dispose(this.watcherRequests.get(req));
            this.watcherRequests.delete(req);
        });
    }
    dispose() {
        for (const [, disposable] of this.watcherRequests) {
            disposable.dispose();
        }
        this.watcherRequests.clear();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlza0ZpbGVTeXN0ZW1Qcm92aWRlclNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlclNlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBOEIsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFRL0U7O0dBRUc7QUFDSCxNQUFNLE9BQWdCLHFDQUF5QyxTQUFRLFVBQVU7SUFFaEYsWUFDb0IsUUFBZ0MsRUFDaEMsVUFBdUI7UUFFMUMsS0FBSyxFQUFFLENBQUM7UUFIVyxhQUFRLEdBQVIsUUFBUSxDQUF3QjtRQUNoQyxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBZ0wzQyxZQUFZO1FBRVosdUJBQXVCO1FBRU4scUJBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQWdELENBQUM7UUFDM0Usa0JBQWEsR0FBRyxJQUFJLEdBQUcsRUFBcUQsQ0FBQztJQWxMOUYsQ0FBQztJQUVELElBQUksQ0FBVSxHQUFNLEVBQUUsT0FBZSxFQUFFLElBQWU7UUFDckQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRW5ELFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyxNQUFNLENB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