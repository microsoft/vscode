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
import { combinedDisposable, Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
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
			case 'watch': return Promise.resolve(this.watch(arg[0], arg[1], URI.revive(arg[2]), arg[3]));
			case 'unwatch': return Promise.resolve(this.unwatch(arg[0], arg[1]));
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: unknown, event: string, arg: any): Event<any> {
		switch (event) {
			case 'filechange': return this.onDidChangeFileOrError.event;
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

	private readonly onDidChangeFileOrError = this._register(new Emitter<readonly IFileChange[] | string>());

	private readonly nonRecursiveFileWatchers = new Map<string /* ID */, IDisposable>();

	private watch(sessionId: string, req: number, resource: URI, opts: IWatchOptions): void {
		if (opts.recursive) {
			throw createFileSystemProviderError('Recursive watcher is not supported from main process', FileSystemProviderErrorCode.Unavailable);
		}

		const watcher = new NodeJSWatcherService(
			normalize(resource.fsPath),
			changes => this.onDidChangeFileOrError.fire(toFileChanges(changes)),
			msg => this.onWatcherLogMessage(msg),
			this.logService.getLevel() === LogLevel.Trace
		);

		const logLevelListener = this.logService.onDidChangeLogLevel(() => {
			watcher.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		});

		const id = sessionId + req;
		this.nonRecursiveFileWatchers.set(id, combinedDisposable(watcher, logLevelListener));
	}

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this.onDidChangeFileOrError.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	private unwatch(sessionId: string, req: number): void {
		const id = sessionId + req;
		const disposable = this.nonRecursiveFileWatchers.get(id);
		if (disposable) {
			dispose(disposable);
			this.nonRecursiveFileWatchers.delete(id);
		}
	}

	//#endregion

	override dispose(): void {
		super.dispose();

		this.nonRecursiveFileWatchers.forEach(disposable => dispose(disposable));
		this.nonRecursiveFileWatchers.clear();
	}
}
