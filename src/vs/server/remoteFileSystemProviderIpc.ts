/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { FileDeleteOptions, FileOverwriteOptions, FileType, IFileChange, IStat, IWatchOptions, FileOpenOptions, FileWriteOptions, FileReadStreamOptions } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { createRemoteURITransformer } from 'vs/server/remoteUriTransformer';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { DiskFileSystemProvider, IWatcherOptions } from 'vs/platform/files/node/diskFileSystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { posix, delimiter } from 'vs/base/common/path';
import { IServerEnvironmentService } from 'vs/server/serverEnvironmentService';
import { listenStream, ReadableStreamEventPayload } from 'vs/base/common/stream';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export class RemoteAgentFileSystemProviderChannel extends Disposable implements IServerChannel<RemoteAgentConnectionContext> {

	private readonly uriTransformerCache = new Map<string, IURITransformer>();
	private readonly fsProvider = this._register(new DiskFileSystemProvider(this.logService));

	constructor(
		private readonly logService: ILogService,
		private readonly environmentService: IServerEnvironmentService
	) {
		super();
	}

	call(ctx: RemoteAgentConnectionContext, command: string, arg?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer(ctx.remoteAuthority);

		switch (command) {
			case 'stat': return this.stat(uriTransformer, arg[0]);
			case 'readdir': return this.readdir(uriTransformer, arg[0]);
			case 'open': return this.open(uriTransformer, arg[0], arg[1]);
			case 'close': return this.close(arg[0]);
			case 'read': return this.read(arg[0], arg[1], arg[2]);
			case 'readFile': return this.readFile(uriTransformer, arg[0]);
			case 'write': return this.write(arg[0], arg[1], arg[2], arg[3], arg[4]);
			case 'writeFile': return this.writeFile(uriTransformer, arg[0], arg[1], arg[2]);
			case 'rename': return this.rename(uriTransformer, arg[0], arg[1], arg[2]);
			case 'copy': return this.copy(uriTransformer, arg[0], arg[1], arg[2]);
			case 'mkdir': return this.mkdir(uriTransformer, arg[0]);
			case 'delete': return this.delete(uriTransformer, arg[0], arg[1]);
			case 'watch': return this.watch(arg[0], arg[1], arg[2], arg[3]);
			case 'unwatch': return this.unwatch(arg[0], arg[1]);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(ctx: RemoteAgentConnectionContext, event: string, arg: any): Event<any> {
		const uriTransformer = this.getUriTransformer(ctx.remoteAuthority);

		switch (event) {
			case 'fileChange': return this.onFileChange(uriTransformer, arg[0]);
			case 'readFileStream': return this.onReadFileStream(uriTransformer, arg[0], arg[1]);
		}

		throw new Error(`Unknown event ${event}`);
	}

	private getUriTransformer(remoteAuthority: string): IURITransformer {
		let transformer = this.uriTransformerCache.get(remoteAuthority);
		if (!transformer) {
			transformer = createRemoteURITransformer(remoteAuthority);
			this.uriTransformerCache.set(remoteAuthority, transformer);
		}

		return transformer;
	}

	private transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents, supportVSCodeResource = false): URI {
		if (supportVSCodeResource && _resource.path === '/vscode-resource' && _resource.query) {
			const requestResourcePath = JSON.parse(_resource.query).requestResourcePath;

			return URI.from({ scheme: 'file', path: requestResourcePath });
		}

		return URI.revive(uriTransformer.transformIncoming(_resource));
	}

	//#region File Metadata Resolving

	private stat(uriTransformer: IURITransformer, _resource: UriComponents): Promise<IStat> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);

		return this.fsProvider.stat(resource);
	}

	private readdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<[string, FileType][]> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.fsProvider.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	private async readFile(uriTransformer: IURITransformer, _resource: UriComponents): Promise<VSBuffer> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);
		const buffer = await this.fsProvider.readFile(resource);

		return VSBuffer.wrap(buffer);
	}

	private onReadFileStream(uriTransformer: IURITransformer, _resource: URI, opts: FileReadStreamOptions): Event<ReadableStreamEventPayload<VSBuffer>> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);
		const cts = new CancellationTokenSource();

		const emitter = new Emitter<ReadableStreamEventPayload<VSBuffer>>({
			onLastListenerRemove: () => {

				// Ensure to cancel the read operation when there is no more
				// listener on the other side to prevent unneeded work.
				cts.cancel();
			}
		});

		const fileStream = this.fsProvider.readFileStream(resource, opts, cts.token);
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

	private writeFile(uriTransformer: IURITransformer, _resource: UriComponents, content: VSBuffer, opts: FileWriteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.fsProvider.writeFile(resource, content.buffer, opts);
	}

	private open(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileOpenOptions): Promise<number> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);

		return this.fsProvider.open(resource, opts);
	}

	private close(fd: number): Promise<void> {
		return this.fsProvider.close(fd);
	}

	private async read(fd: number, pos: number, length: number): Promise<[VSBuffer, number]> {
		const buffer = VSBuffer.alloc(length);
		const bufferOffset = 0; // offset is 0 because we create a buffer to read into for each call
		const bytesRead = await this.fsProvider.read(fd, pos, buffer.buffer, bufferOffset, length);

		return [buffer, bytesRead];
	}

	private write(fd: number, pos: number, data: VSBuffer, offset: number, length: number): Promise<number> {
		return this.fsProvider.write(fd, pos, data.buffer, offset, length);
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	private mkdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.fsProvider.mkdir(resource);
	}

	private delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileDeleteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.fsProvider.delete(resource, opts);
	}

	private rename(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = URI.revive(uriTransformer.transformIncoming(_source));
		const target = URI.revive(uriTransformer.transformIncoming(_target));

		return this.fsProvider.rename(source, target, opts);
	}

	private copy(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.fsProvider.copy(source, target, opts);
	}

	//#endregion

	//#region File Watching

	private readonly fileWatchers = new Map<string, SessionFileWatcher>();
	private readonly watchRequests = new Map<string, IDisposable>();

	private onFileChange(uriTransformer: IURITransformer, session: string): Event<IFileChange[] | string> {
		const emitter = new Emitter<IFileChange[] | string>({
			onFirstListenerAdd: () => {
				this.fileWatchers.set(session, new SessionFileWatcher(this.logService, this.environmentService, uriTransformer, emitter));
			},
			onLastListenerRemove: () => {
				dispose(this.fileWatchers.get(session));
				this.fileWatchers.delete(session);
			}
		});

		return emitter.event;
	}

	private async watch(session: string, req: number, _resource: UriComponents, opts: IWatchOptions): Promise<void> {
		const watcher = this.fileWatchers.get(session);
		if (watcher) {
			const disposable = watcher.watch(req, _resource, opts);
			this.watchRequests.set(session + req, disposable);
		}
	}

	private async unwatch(session: string, req: number): Promise<void> {
		const id = session + req;
		const disposable = this.watchRequests.get(id);
		if (disposable) {
			dispose(disposable);
			this.watchRequests.delete(id);
		}
	}

	//#endregion

	override dispose(): void {
		super.dispose();

		this.watchRequests.forEach(disposable => dispose(disposable));
		this.watchRequests.clear();

		this.fileWatchers.forEach(disposable => dispose(disposable));
		this.fileWatchers.clear();
	}
}

class SessionFileWatcher extends Disposable {

	private readonly watcherRequests = new Map<number, IDisposable>();
	private readonly fileWatcher = this._register(new DiskFileSystemProvider(this.logService, { watcher: this.getWatcherOptions() }));

	constructor(
		private readonly logService: ILogService,
		private readonly environmentService: IServerEnvironmentService,
		private readonly uriTransformer: IURITransformer,
		sessionEmitter: Emitter<IFileChange[] | string>
	) {
		super();

		this.registerListeners(sessionEmitter);
	}

	private registerListeners(sessionEmitter: Emitter<IFileChange[] | string>): void {
		const localChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());

		this._register(localChangeEmitter.event((events) => {
			sessionEmitter.fire(
				events.map(e => ({
					resource: this.uriTransformer.transformOutgoingURI(e.resource),
					type: e.type
				}))
			);
		}));

		this._register(this.fileWatcher.onDidChangeFile(events => localChangeEmitter.fire(events)));
		this._register(this.fileWatcher.onDidErrorOccur(error => sessionEmitter.fire(error)));
	}

	private getWatcherOptions(): IWatcherOptions | undefined {
		const fileWatcherPolling = this.environmentService.args['fileWatcherPolling'];
		if (fileWatcherPolling) {
			const segments = fileWatcherPolling.split(delimiter);
			const pollingInterval = Number(segments[0]);
			if (pollingInterval > 0) {
				const usePolling = segments.length > 1 ? segments.slice(1) : true;
				return { usePolling, pollingInterval };
			}
		}

		return undefined;
	}

	watch(req: number, _resource: UriComponents, opts: IWatchOptions): IDisposable {
		const resource = URI.revive(this.uriTransformer.transformIncoming(_resource));

		if (this.environmentService.extensionsPath) {
			// when opening the $HOME folder, we end up watching the extension folder
			// so simply exclude watching the extensions folder
			opts.excludes = [...(opts.excludes || []), posix.join(this.environmentService.extensionsPath, '**')];
		}

		this.watcherRequests.set(req, this.fileWatcher.watch(resource, opts));

		return toDisposable(() => {
			dispose(this.watcherRequests.get(req));
			this.watcherRequests.delete(req);
		});
	}

	override dispose(): void {
		super.dispose();

		this.watcherRequests.forEach(disposable => dispose(disposable));
		this.watcherRequests.clear();
	}
}
