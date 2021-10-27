/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { URI, UriComponents } from 'vs/base/common/uri';
import { VSBuffer } from 'vs/base/common/buffer';
import { ReadableStreamEventPayload, listenStream } from 'vs/base/common/stream';
import { IStat, FileReadStreamOptions, FileWriteOptions, FileOpenOptions, FileDeleteOptions, FileOverwriteOptions, IFileChange, IWatchOptions, FileType } from 'vs/platform/files/common/files';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export interface ISessionFileWatcher extends IDisposable {
	watch(req: number, resource: URI, opts: IWatchOptions): IDisposable;
}

/**
 * A server implementation for a IPC based file system provider
 * (see `IPCFileSystemProvider`) client.
 */
export abstract class AbstractDiskFileSystemProviderChannel<T> extends Disposable implements IServerChannel<T> {

	constructor(
		protected readonly provider: DiskFileSystemProvider,
		protected readonly logService: ILogService
	) {
		super();
	}

	call(ctx: T, command: string, arg?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer(ctx);

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
			case 'watch': return this.watch(uriTransformer, arg[0], arg[1], arg[2], arg[3]);
			case 'unwatch': return this.unwatch(arg[0], arg[1]);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(ctx: T, event: string, arg: any): Event<any> {
		const uriTransformer = this.getUriTransformer(ctx);

		switch (event) {
			case 'fileChange': return this.onFileChange(uriTransformer, arg[0]);
			case 'readFileStream': return this.onReadFileStream(uriTransformer, arg[0], arg[1]);
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

	private readdir(uriTransformer: IURITransformer, _resource: UriComponents): Promise<[string, FileType][]> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	private async readFile(uriTransformer: IURITransformer, _resource: UriComponents): Promise<VSBuffer> {
		const resource = this.transformIncoming(uriTransformer, _resource, true);
		const buffer = await this.provider.readFile(resource);

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

	private writeFile(uriTransformer: IURITransformer, _resource: UriComponents, content: VSBuffer, opts: FileWriteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.writeFile(resource, content.buffer, opts);
	}

	private open(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileOpenOptions): Promise<number> {
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

	protected delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileDeleteOptions): Promise<void> {
		const resource = this.transformIncoming(uriTransformer, _resource);

		return this.provider.delete(resource, opts);
	}

	private rename(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.provider.rename(source, target, opts);
	}

	private copy(uriTransformer: IURITransformer, _source: UriComponents, _target: UriComponents, opts: FileOverwriteOptions): Promise<void> {
		const source = this.transformIncoming(uriTransformer, _source);
		const target = this.transformIncoming(uriTransformer, _target);

		return this.provider.copy(source, target, opts);
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
			onFirstListenerAdd: () => {
				this.sessionToWatcher.set(sessionId, this.createSessionFileWatcher(uriTransformer, emitter));
			},
			onLastListenerRemove: () => {
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

		this.watchRequests.forEach(disposable => dispose(disposable));
		this.watchRequests.clear();

		this.sessionToWatcher.forEach(disposable => dispose(disposable));
		this.sessionToWatcher.clear();
	}
}
