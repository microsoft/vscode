/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { localize } from 'vs/nls';
import { isWindows } from 'vs/base/common/platform';
import { Emitter, Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { FileDeleteOptions, FileOverwriteOptions, FileType, IStat, FileOpenOptions, FileWriteOptions, FileReadStreamOptions } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { listenStream, ReadableStreamEventPayload } from 'vs/base/common/stream';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { basename, normalize } from 'vs/base/common/path';

export class DiskFileSystemProviderChannel implements IServerChannel {

	constructor(
		private readonly provider: DiskFileSystemProvider
	) {
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
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: unknown, event: string, arg: any): Event<any> {
		switch (event) {
			case 'filechange': return Event.None; // not supported from here, needs to use shared process for file watching
			case 'readFileStream': return this.onReadFileStream(arg[0], arg[1]);
		}

		throw new Error(`Unknown event ${event}`);
	}

	private onReadFileStream(resource: UriComponents, opts: FileReadStreamOptions): Event<ReadableStreamEventPayload<VSBuffer>> {
		const cts = new CancellationTokenSource();

		const emitter = new Emitter<ReadableStreamEventPayload<VSBuffer>>({
			onLastListenerRemove: () => {

				// Ensure to cancel the read operation when there is no more
				// listener on the other side to prevent unneeded work.
				cts.cancel();
			}
		});

		const fileStream = this.provider.readFileStream(URI.revive(resource), opts, cts.token);
		listenStream(fileStream, {
			onData: chunk => emitter.fire(VSBuffer.wrap(chunk)),
			onError: error => emitter.fire(error),
			onEnd: () => {
				emitter.fire('end');

				// Cleanup
				emitter.dispose();
				cts.dispose();
			}
		});

		return emitter.event;
	}

	private stat(resource: URI): Promise<IStat> {
		return this.provider.stat(resource);
	}

	private readdir(resource: URI): Promise<[string, FileType][]> {
		return this.provider.readdir(resource);
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

	private async readFile(resource: URI): Promise<VSBuffer> {
		const buff = await this.provider.readFile(resource);

		return VSBuffer.wrap(buff);
	}

	private write(fd: number, pos: number, data: VSBuffer, offset: number, length: number): Promise<number> {
		return this.provider.write(fd, pos, data.buffer, offset, length);
	}

	private writeFile(resource: URI, content: VSBuffer, opts: FileWriteOptions): Promise<void> {
		return this.provider.writeFile(resource, content.buffer, opts);
	}

	private rename(source: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.rename(source, target, opts);
	}

	private copy(source: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.copy(source, target, opts);
	}

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
			throw new Error(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin", basename(filePath)) : localize('trashFailed', "Failed to move '{0}' to the trash", basename(filePath)));
		}
	}
}
