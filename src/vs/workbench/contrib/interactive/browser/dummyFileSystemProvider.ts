/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileSystemProviderCapabilities, FileType, IFileChange, IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileSystemProvider, IFileWriteOptions, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export class DummyFileSystem implements IFileSystemProvider {
	private fdCounter = 1;

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileOpenReadWriteClose;

	public readFile(_resource: URI): Promise<Uint8Array> {
		return Promise.resolve(new Uint8Array);
	}

	public open(_resource: URI, _opts: IFileOpenOptions): Promise<number> {
		return Promise.resolve(this.fdCounter++);
	}

	public stat(_resource: URI): Promise<IStat> {
		return Promise.resolve({
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: 0,
		});
	}
	public mkdir(_resource: URI): Promise<void> {
		return Promise.resolve();
	}

	public readdir(_resource: URI): Promise<[string, FileType][]> {
		return Promise.resolve([['', FileType.Unknown]]);
	}

	public delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		return Promise.resolve();
	}

	public rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		return Promise.resolve();
	}

	copy?(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		return Promise.resolve();
	}
	writeFile?(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		return Promise.resolve();
	}
	// readFileStream?(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
	// 	return Promise.resolve();
	// }
	close?(_fd: number): Promise<void> {
		return Promise.resolve();
	}
	read?(_fd: number, _pos: number, data: Uint8Array, _offset: number, _length: number): Promise<number> {
		// claim no more bytes to read
		return Promise.resolve(0);
	}
	write?(_fd: number, _pos: number, data: Uint8Array, _offset: number, _length: number): Promise<number> {
		// claim all bytes written
		return Promise.resolve(data.byteLength);
	}
	cloneFile?(_from: URI, _to: URI): Promise<void> {
		return Promise.resolve();
	}

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	constructor(private disposableFactory: () => IDisposable = () => Disposable.None) { }
	onDidWatchError?: Event<string> | undefined;



	public emitFileChangeEvents(changes: IFileChange[]): void {
		this._onDidChangeFile.fire(changes);
	}

	public setCapabilities(capabilities: FileSystemProviderCapabilities): void {
		this.capabilities = capabilities;

		this._onDidChangeCapabilities.fire();
	}

	public watch(_resource: URI, _opts: IWatchOptions): IDisposable { return this.disposableFactory(); }
}
