/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ReadableStreamEvents } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, FileSystemProviderCapabilities, FileType, IFileWriteOptions, IFileChange, IFileSystemProvider, IStat, IWatchOptions, IFileReadStreamOptions } from '../../common/files.js';

export class NullFileSystemProvider implements IFileSystemProvider {

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly;

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	constructor(private disposableFactory: () => IDisposable = () => Disposable.None) { }

	emitFileChangeEvents(changes: IFileChange[]): void {
		this._onDidChangeFile.fire(changes);
	}

	setCapabilities(capabilities: FileSystemProviderCapabilities): void {
		this.capabilities = capabilities;

		this._onDidChangeCapabilities.fire();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable { return this.disposableFactory(); }
	async stat(resource: URI): Promise<IStat> { return undefined!; }
	async mkdir(resource: URI): Promise<void> { return undefined; }
	async readdir(resource: URI): Promise<[string, FileType][]> { return undefined!; }
	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> { return undefined; }
	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { return undefined; }
	async copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { return undefined; }
	async readFile(resource: URI): Promise<Uint8Array> { return undefined!; }
	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> { return undefined!; }
	async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> { return undefined; }
	async open(resource: URI, opts: IFileOpenOptions): Promise<number> { return undefined!; }
	async close(fd: number): Promise<void> { return undefined; }
	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return undefined!; }
	async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return undefined!; }
}
