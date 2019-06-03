/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { FileDeleteOptions, FileOverwriteOptions, FileType, IFileChange, IStat, IWatchOptions, FileOpenOptions } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { createRemoteURITransformer } from 'vs/agent/remoteUriTransformer';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { DiskFileSystemProvider } from 'vs/workbench/services/files/node/diskFileSystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { posix } from 'vs/base/common/path';

class SessionFileWatcher extends Disposable {

	private readonly _uriTransformer: IURITransformer;
	private readonly _watcherRequests: Map<number, IDisposable>;
	private readonly _fileWatcher: DiskFileSystemProvider;
	private readonly _environmentService: IEnvironmentService;

	constructor(logService: ILogService, environmentService: IEnvironmentService, uriTransformer: IURITransformer, emitter: Emitter<IFileChange[]>) {
		super();
		this._uriTransformer = uriTransformer;
		this._environmentService = environmentService;
		this._watcherRequests = new Map();

		const localEmitter = this._register(new Emitter<IFileChange[]>());
		this._fileWatcher = this._register(new DiskFileSystemProvider(logService));
		this._register(localEmitter.event((events) => {
			emitter.fire(
				events.map(e => ({
					resource: this._uriTransformer.transformOutgoingURI(e.resource),
					type: e.type
				}))
			);
		}));

		this._register(this._fileWatcher.onDidChangeFile(events => localEmitter.fire(events)));
	}

	watch(req: number, _resource: UriComponents, opts: IWatchOptions): IDisposable {
		const resource = URI.revive(this._uriTransformer.transformIncoming(_resource));

		if (this._environmentService.extensionsPath) {
			// exclude watching the extensions folder, see Microsoft/vscode-remotee#1473
			opts.excludes = [...(opts.excludes || []), posix.join(this._environmentService.extensionsPath, '**')];
		}

		this._watcherRequests.set(req, this._fileWatcher.watch(resource, opts));

		return toDisposable(() => {
			dispose(this._watcherRequests.get(req));
			this._watcherRequests.delete(req);
		});
	}

	dispose(): void {
		super.dispose();

		this._watcherRequests.forEach(disposable => dispose(disposable));
		this._watcherRequests.clear();
	}
}

export class RemoteAgentFileSystemChannel extends Disposable implements IServerChannel<RemoteAgentConnectionContext> {

	private readonly _logService: ILogService;
	private readonly _environmentService: IEnvironmentService;
	private readonly _uriTransformerCache: Map<string, IURITransformer>;
	private readonly _fileWatchers: Map<string, SessionFileWatcher>;
	private readonly _fsProvider: DiskFileSystemProvider;
	private readonly _watchRequests: Map<string, IDisposable> = new Map();

	constructor(logService: ILogService, environmentService: IEnvironmentService) {
		super();
		this._logService = logService;
		this._environmentService = environmentService;
		this._uriTransformerCache = new Map();
		this._fileWatchers = new Map();
		this._fsProvider = this._register(new DiskFileSystemProvider(logService));
	}

	call(ctx: RemoteAgentConnectionContext, command: string, arg?: any): Promise<any> {

		const uriTransformer = this._getUriTransformer(ctx.remoteAuthority);

		switch (command) {
			case 'stat': return this._stat(uriTransformer, arg[0]);
			case 'readdir': return this._readdir(uriTransformer, arg[0]);
			case 'open': return this._open(uriTransformer, arg[0], arg[1]);
			case 'close': return this._close(arg[0]);
			case 'read': return this._read(arg[0], arg[1], arg[2]);
			case 'readFile': return this._readFile(uriTransformer, arg[0]);
			case 'write': return this._write(arg[0], arg[1], arg[2], arg[3], arg[4]);
			case 'rename': return this._rename(uriTransformer, arg[0], arg[1], arg[2]);
			case 'copy': return this._copy(uriTransformer, arg[0], arg[1], arg[2]);
			case 'mkdir': return this._mkdir(uriTransformer, arg[0]);
			case 'delete': return this._delete(uriTransformer, arg[0], arg[1]);
			case 'watch': return this._watch(arg[0], arg[1], arg[2], arg[3]);
			case 'unwatch': return this._unwatch(arg[0], arg[1]);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(ctx: RemoteAgentConnectionContext, event: string, arg: any): Event<any> {

		const uriTransformer = this._getUriTransformer(ctx.remoteAuthority);

		if (event === 'filechange') {
			const session = arg[0];
			const emitter = new Emitter<IFileChange[]>({
				onFirstListenerAdd: () => {
					this._fileWatchers.set(session, new SessionFileWatcher(this._logService, this._environmentService, uriTransformer, emitter));
				},
				onLastListenerRemove: () => {
					dispose(this._fileWatchers.get(session));
					this._fileWatchers.delete(session);
				}
			});
			return emitter.event;
		}

		throw new Error(`Unknown event ${event}`);
	}

	private _getUriTransformer(remoteAuthority: string): IURITransformer {
		let transformer = this._uriTransformerCache.get(remoteAuthority);
		if (!transformer) {
			transformer = createRemoteURITransformer(remoteAuthority);
			this._uriTransformerCache.set(remoteAuthority, transformer);
		}
		return transformer;
	}

	private _stat(uriTransformer: IURITransformer, _resource: UriComponents): Promise<IStat> {
		const resource = this._transformIncoming(uriTransformer, _resource, true);
		return this._fsProvider.stat(resource);
	}

	private _readdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<[string, FileType][]> {
		const resource = this._transformIncoming(uriTransformer, _resource);
		return this._fsProvider.readdir(resource);
	}

	private _open(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileOpenOptions): Promise<number> {
		const resource = this._transformIncoming(uriTransformer, _resource, true);
		return this._fsProvider.open(resource, opts);
	}

	private _close(_fd: number): Promise<void> {
		return this._fsProvider.close(_fd);
	}

	private async _read(fd: number, pos: number, length: number): Promise<[VSBuffer, number]> {
		const buffer = VSBuffer.alloc(length);
		const bufferOffset = 0; // offset is 0 because we create a buffer to read into for each call
		const bytesRead = await this._fsProvider.read(fd, pos, buffer.buffer, bufferOffset, length);

		return [buffer, bytesRead];
	}

	private _write(fd: number, pos: number, data: VSBuffer, offset: number, length: number): Promise<number> {
		return this._fsProvider.write(fd, pos, data.buffer, offset, length);
	}

	// TODO@alex remove me once electron-main no longer calls this directly
	private async _readFile(uriTransformer: IURITransformer, _resource: UriComponents): Promise<VSBuffer> {
		const resource = this._transformIncoming(uriTransformer, _resource, true);
		const buff = await this._fsProvider.readFile(resource);
		return VSBuffer.wrap(buff);
	}

	private _rename(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = URI.revive(uriTransformer.transformIncoming(_source));
		const target = URI.revive(uriTransformer.transformIncoming(_target));
		return this._fsProvider.rename(source, target, opts);
	}

	private _copy(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = this._transformIncoming(uriTransformer, _source);
		const target = this._transformIncoming(uriTransformer, _target);
		return this._fsProvider.copy(source, target, opts);
	}

	private _mkdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<void> {
		const resource = this._transformIncoming(uriTransformer, _resource);
		return this._fsProvider.mkdir(resource);
	}

	private _delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileDeleteOptions): Promise<void> {
		const resource = this._transformIncoming(uriTransformer, _resource);
		return this._fsProvider.delete(resource, opts);
	}

	private _transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents, supportVSCodeResource = false): URI {
		if (supportVSCodeResource && _resource.path === '/vscode-resource' && _resource.query) {
			const requestResourcePath = JSON.parse(_resource.query).requestResourcePath;
			return URI.from({ scheme: 'file', path: requestResourcePath });
		} else {
			return URI.revive(uriTransformer.transformIncoming(_resource));
		}
	}

	private _watch(session: string, req: number, _resource: UriComponents, opts: IWatchOptions): Promise<void> {
		const id = session + req;
		const watcher = this._fileWatchers.get(session);
		if (watcher) {
			const disposable = watcher.watch(req, _resource, opts);
			this._watchRequests.set(id, disposable);
		}

		return Promise.resolve();
	}

	private _unwatch(session: string, req: number): Promise<void> {
		const id = session + req;
		const disposable = this._watchRequests.get(id);
		if (disposable) {
			dispose(disposable);
			this._watchRequests.delete(id);
		}

		return Promise.resolve();
	}

	dispose(): void {
		super.dispose();

		this._watchRequests.forEach(disposable => dispose(disposable));
		this._watchRequests.clear();

		this._fileWatchers.forEach(disposable => dispose(disposable));
		this._fileWatchers.clear();
	}
}