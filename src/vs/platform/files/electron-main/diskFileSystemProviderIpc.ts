/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { localize } from 'vs/nls';
import { isWindows } from 'vs/base/common/platform';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { FileDeleteOptions, FileOverwriteOptions, FileType, IStat, FileOpenOptions, FileWriteOptions, FileReadStreamOptions, IFileChange, IWatchOptions, createFileSystemProviderError, FileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { FileWatcher as NodeJSWatcherService } from 'vs/platform/files/node/watcher/nodejs/watcherService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { listenStream, ReadableStreamEventPayload } from 'vs/base/common/stream';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { basename, normalize } from 'vs/base/common/path';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, toFileChanges } from 'vs/platform/files/common/watcher';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';

/**
 * A server implementation for a IPC based file system provider (see `IPCFileSystemProvider`)
 * client.
 */
export class DiskFileSystemProviderChannel extends Disposable implements IServerChannel {

	constructor(
		private readonly provider: DiskFileSystemProvider,
		private readonly logService: ILogService
	) {
		super();
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'stat': return this.stat(URI.revive(arg[0]));
			case 'readdir': return this.readdir(URI.revive(arg[0]));
			case 'open': return this.open(URI.revive(arg[0]), arg[1]);
			case 'close': return this.close(arg[0]);
			case 'read': return this.read(arg[0], arg[1], arg[2]);
			case 'readFile': return this.readFile(URI.revive(arg[0]));
			case 'write': return this.write(arg[0], arg[1], arg[2], arg[3], arg[4]);
			case 'writeFile': return this.writeFile(URI.revive(arg[0]), arg[1], arg[2]);
			case 'rename': return this.rename(URI.revive(arg[0]), URI.revive(arg[1]), arg[2]);
			case 'copy': return this.copy(URI.revive(arg[0]), URI.revive(arg[1]), arg[2]);
			case 'mkdir': return this.mkdir(URI.revive(arg[0]));
			case 'delete': return this.delete(URI.revive(arg[0]), arg[1]);
			case 'watch': return this.watch(arg[0], arg[1], URI.revive(arg[2]), arg[3]);
			case 'unwatch': return this.unwatch(arg[0], arg[1]);
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: unknown, event: string, arg: any): Event<any> {
		switch (event) {
			case 'fileChange': return this.onFileChange(arg[0]);
			case 'readFileStream': return this.onReadFileStream(URI.revive(arg[0]), arg[1]);
		}

		throw new Error(`Unknown event ${event}`);
	}

	//#region File Metadata Resolving

	private stat(resource: URI): Promise<IStat> {
		return this.provider.stat(resource);
	}

	private readdir(resource: URI): Promise<[string, FileType][]> {
		return this.provider.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	private async readFile(resource: URI): Promise<VSBuffer> {
		const buffer = await this.provider.readFile(resource);

		return VSBuffer.wrap(buffer);
	}

	private onReadFileStream(resource: URI, opts: FileReadStreamOptions): Event<ReadableStreamEventPayload<VSBuffer>> {
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

	private writeFile(resource: URI, content: VSBuffer, opts: FileWriteOptions): Promise<void> {
		return this.provider.writeFile(resource, content.buffer, opts);
	}

	private open(resource: URI, opts: FileOpenOptions): Promise<number> {
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

	private mkdir(resource: URI): Promise<void> {
		return this.provider.mkdir(resource);
	}

	private async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		if (!opts.useTrash) {
			return this.provider.delete(resource, opts);
		}

		const filePath = normalize(resource.fsPath);
		try {
			await shell.trashItem(filePath);
		} catch (error) {
			throw createFileSystemProviderError(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin", basename(filePath)) : localize('trashFailed', "Failed to move '{0}' to the trash", basename(filePath)), FileSystemProviderErrorCode.Unknown);
		}
	}

	private rename(source: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.rename(source, target, opts);
	}

	private copy(source: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.copy(source, target, opts);
	}

	//#endregion

	//#region File Watching

	private readonly sessionToWatcher = new Map<string /* session ID */, SessionFileWatcher>();
	private readonly watchRequests = new Map<string /* session ID + request ID */, IDisposable>();

	private onFileChange(sessionId: string): Event<IFileChange[] | string> {

		// We want a specific emitter for the given session so that events
		// from the one session do not end up on the other session. As such
		// we create a `SessionFileWatcher` and a `Emitter` for that session.
		const emitter = new Emitter<IFileChange[] | string>({
			onFirstListenerAdd: () => {
				this.sessionToWatcher.set(sessionId, new SessionFileWatcher(emitter, this.logService));
			},
			onLastListenerRemove: () => {
				dispose(this.sessionToWatcher.get(sessionId));
				this.sessionToWatcher.delete(sessionId);
			}
		});

		return emitter.event;
	}

	private async watch(sessionId: string, req: number, resource: URI, opts: IWatchOptions): Promise<void> {
		if (opts.recursive) {
			throw createFileSystemProviderError('Recursive watcher is not supported from main process', FileSystemProviderErrorCode.Unavailable);
		}

		const watcher = this.sessionToWatcher.get(sessionId);
		if (watcher) {
			const disposable = watcher.watch(req, resource);
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

	//#endregion

	override dispose(): void {
		super.dispose();

		this.watchRequests.forEach(disposable => dispose(disposable));
		this.watchRequests.clear();

		this.sessionToWatcher.forEach(disposable => dispose(disposable));
		this.sessionToWatcher.clear();
	}
}

class SessionFileWatcher extends Disposable {

	private readonly watcherRequests = new Map<number /* request ID */, IDisposable>();

	constructor(
		private readonly sessionEmitter: Emitter<IFileChange[] | string>,
		private readonly logService: ILogService
	) {
		super();
	}

	watch(req: number, resource: URI): IDisposable {
		const disposable = new DisposableStore();

		this.watcherRequests.set(req, disposable);
		disposable.add(toDisposable(() => this.watcherRequests.delete(req)));

		const watcher = disposable.add(new NodeJSWatcherService(
			normalize(resource.fsPath),
			changes => this.sessionEmitter.fire(toFileChanges(changes)),
			msg => this.onWatcherLogMessage(msg),
			this.logService.getLevel() === LogLevel.Trace
		));

		disposable.add(this.logService.onDidChangeLogLevel(() => {
			watcher.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		}));

		return disposable;
	}

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this.sessionEmitter.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	override dispose(): void {
		super.dispose();

		this.watcherRequests.forEach(disposable => dispose(disposable));
		this.watcherRequests.clear();
	}
}
