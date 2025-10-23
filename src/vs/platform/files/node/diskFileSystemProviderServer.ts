/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { DiskFileSystemProvider } from './diskFileSystemProvider.js';
import { Disposable, dispose, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { ReadableStreamEventPayload, listenStream } from '../../../base/common/stream.js';
import { IStat, IFileReadStreamOptions, IFileWriteOptions, IFileOpenOptions, IFileDeleteOptions, IFileOverwriteOptions, IFileChange, IWatchOptions, FileType, IFileAtomicReadOptions } from '../common/files.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IRecursiveWatcherOptions } from '../common/watcher.js';

export interface ISessionFileWatcher extends IDisposable {
	watch(req: number, resource: URI, opts: IWatchOptions): IDisposable;
}

/**
 * A server implementation for a IPC based file system provider client.
 */
export abstract class AbstractDiskFileSystemProviderChannel<T> extends Disposable implements IServerChannel<T> {

	constructor(
		protected readonly provider: DiskFileSystemProvider,
		protected readonly logService: ILogService
	) {
		super();
	}

	call<TResult>(ctx: T, command: string, args: unknown[]): Promise<TResult> {
		const uriTransformer = this.getUriTransformer(ctx);

		switch (command) {
			case 'stat': return this.stat(uriTransformer, args[0] as UriComponents) as Promise<TResult>;
			case 'realpath': return this.realpath(uriTransformer, args[0] as UriComponents) as Promise<TResult>;
			case 'readdir': return this.readdir(uriTransformer, args[0] as UriComponents) as Promise<TResult>;
			case 'open': return this.open(uriTransformer, args[0] as UriComponents, args[1] as IFileOpenOptions) as Promise<TResult>;
			case 'close': return this.close(args[0] as number) as Promise<TResult>;
			case 'read': return this.read(args[0] as number, args[1] as number, args[2] as number) as Promise<TResult>;
			case 'readFile': return this.readFile(uriTransformer, args[0] as UriComponents, args[1] as IFileAtomicReadOptions) as Promise<TResult>;
			case 'write': return this.write(args[0] as number, args[1] as number, args[2] as VSBuffer, args[3] as number, args[4] as number) as Promise<TResult>;
			case 'writeFile': return this.writeFile(uriTransformer, args[0] as UriComponents, args[1] as VSBuffer, args[2] as IFileWriteOptions) as Promise<TResult>;
			case 'rename': return this.rename(uriTransformer, args[0] as UriComponents, args[1] as UriComponents, args[2] as IFileOverwriteOptions) as Promise<TResult>;
			case 'copy': return this.copy(uriTransformer, args[0] as UriComponents, args[1] as UriComponents, args[2] as IFileOverwriteOptions) as Promise<TResult>;
			case 'cloneFile': return this.cloneFile(uriTransformer, args[0] as UriComponents, args[1] as UriComponents) as Promise<TResult>;
			case 'mkdir': return this.mkdir(uriTransformer, args[0] as UriComponents) as Promise<TResult>;
			case 'delete': return this.delete(uriTransformer, args[0] as UriComponents, args[1] as IFileDeleteOptions) as Promise<TResult>;
			case 'watch': return this.watch(uriTransformer, args[0] as string, args[1] as number, args[2] as UriComponents, args[3] as IWatchOptions) as Promise<TResult>;
			case 'unwatch': return this.unwatch(args[0] as string, args[1] as number) as Promise<TResult>;
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen<TResult>(ctx: T, event: string, args: unknown[]): Event<TResult> {
		const uriTransformer = this.getUriTransformer(ctx);

		switch (event) {
			case 'fileChange': return this.onFileChange(uriTransformer, args[0] as string) as Event<TResult>;
			case 'readFileStream': return this.onReadFileStream(uriTransformer, args[0] as URI, args[1] as IFileReadStreamOptions) as Event<TResult>;
		}

		throw new Error(`Unknown event ${event}`);
	}

	protected abstract getUriTransformer(ctx: T): IURITransformer;

	protected abstract transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents, supportVSCodeResource?: boolean): URI;

	//#region File Metadata Resolving

	private stat(uriTransformer: IURITransformer, _resource: UriComponents): Promise<IStat> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);

		return this.provider.stat(resource);
	}

	private realpath(uriTransformer: IURITransformer, _resource: UriComponents): Promise<string> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);

		return this.provider.realpath(resource);
	}

	private readdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<[string, FileType][]> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	private async readFile(uriTransformer: IURITransformer, _resource: UriComponents, opts?: IFileAtomicReadOptions): Promise<VSBuffer> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);
		const buffer = await this.provider.readFile(resource, opts);

		return VSBuffer.wrap(buffer);
	}

	private onReadFileStream(uriTransformer: IURITransformer, _resource: URI, opts: IFileReadStreamOptions): Event<ReadableStreamEventPayload<VSBuffer>> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);
		const cts = new CancellationTokenSource();

		const emitter = new Emitter<ReadableStreamEventPayload<VSBuffer>>({
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

	private writeFile(uriTransformer: IURITransformer, _resource: UriComponents, content: VSBuffer, opts: IFileWriteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.writeFile(resource, content.buffer, opts);
	}

	private open(uriTransformer: IURITransformer, _resource: UriComponents, opts: IFileOpenOptions): Promise<number> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);

		return this.provider.open(resource, opts);
	}

	private close(fd: number): Promise<void> {
		return this.provider.close(fd);
	}

	private async read(fd: number, pos: number, length: number): Promise<[VSBuffer, number]> {
		const buffer = VSBuffer.alloc(length);
		const bufferOffset = 0; // offset is 0 because we create a buffer to read into for each call
		const bytesRead = await this.provider.read(fd, pos, buffer.buffer, bufferOffset, length);

		return [buffer, bytesRead];
	}

	private write(fd: number, pos: number, data: VSBuffer, offset: number, length: number): Promise<number> {
		return this.provider.write(fd, pos, data.buffer, offset, length);
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	private mkdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.mkdir(resource);
	}

	protected delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: IFileDeleteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.delete(resource, opts);
	}

	private rename(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: IFileOverwriteOptions): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.provider.rename(source, target, opts);
	}

	private copy(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: IFileOverwriteOptions): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.provider.copy(source, target, opts);
	}

	//#endregion

	//#region Clone File

	private cloneFile(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.provider.cloneFile(source, target);
	}

	//#endregion

	//#region File Watching

	private readonly sessionToWatcher = new Map<string /* session ID */, ISessionFileWatcher>();
	private readonly watchRequests = new Map<string /* session ID + request ID */, IDisposable>();

	private onFileChange(uriTransformer: IURITransformer, sessionId: string): Event<IFileChange[] | string> {

		// We want a specific emitter for the given session so that events
		// from the one session do not end up on the other session. As such
		// we create a `SessionFileWatcher` and a `Emitter` for that session.

		const emitter = new Emitter<IFileChange[] | string>({
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

	private async watch(uriTransformer: IURITransformer, sessionId: string, req: number, _resource: UriComponents, opts: IWatchOptions): Promise<void> {
		const watcher = this.sessionToWatcher.get(sessionId);
		if (watcher) {
			const resource = this.transformIncoming(uriTransformer, _resource);
			const disposable = watcher.watch(req, resource, opts);
			this.watchRequests.set(sessionId + req, disposable);
		}
	}

	private async unwatch(sessionId: string, req: number): Promise<void> {
		const id = sessionId + req;
		const disposable = this.watchRequests.get(id);
		if (disposable) {
			dispose(disposable);
			this.watchRequests.delete(id);
		}
	}

	protected abstract createSessionFileWatcher(uriTransformer: IURITransformer, emitter: Emitter<IFileChange[] | string>): ISessionFileWatcher;

	//#endregion

	override dispose(): void {
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

export abstract class AbstractSessionFileWatcher extends Disposable implements ISessionFileWatcher {

	private readonly watcherRequests = new Map<number, IDisposable>();

	// To ensure we use one file watcher per session, we keep a
	// disk file system provider instantiated for this session.
	// The provider is cheap and only stateful when file watching
	// starts.
	//
	// This is important because we want to ensure that we only
	// forward events from the watched paths for this session and
	// not other clients that asked to watch other paths.
	private readonly fileWatcher: DiskFileSystemProvider;

	constructor(
		private readonly uriTransformer: IURITransformer,
		sessionEmitter: Emitter<IFileChange[] | string>,
		logService: ILogService,
		private readonly environmentService: IEnvironmentService
	) {
		super();

		this.fileWatcher = this._register(new DiskFileSystemProvider(logService));

		this.registerListeners(sessionEmitter);
	}

	private registerListeners(sessionEmitter: Emitter<IFileChange[] | string>): void {
		const localChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());

		this._register(localChangeEmitter.event((events) => {
			sessionEmitter.fire(
				events.map(e => ({
					resource: this.uriTransformer.transformOutgoingURI(e.resource),
					type: e.type,
					cId: e.cId
				}))
			);
		}));

		this._register(this.fileWatcher.onDidChangeFile(events => localChangeEmitter.fire(events)));
		this._register(this.fileWatcher.onDidWatchError(error => sessionEmitter.fire(error)));
	}

	protected getRecursiveWatcherOptions(environmentService: IEnvironmentService): IRecursiveWatcherOptions | undefined {
		return undefined; // subclasses can override
	}

	protected getExtraExcludes(environmentService: IEnvironmentService): string[] | undefined {
		return undefined; // subclasses can override
	}

	watch(req: number, resource: URI, opts: IWatchOptions): IDisposable {
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

	override dispose(): void {
		for (const [, disposable] of this.watcherRequests) {
			disposable.dispose();
		}
		this.watcherRequests.clear();

		super.dispose();
	}
}
