/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileSystemProviderCapabilities, FileType, IFileChange, IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileSystemProvider, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export class InteractiveWindowFileSystem implements IFileSystemProvider {

	private fdCounter = 1;

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileOpenReadWriteClose;

	public constructor(private disposableFactory: () => IDisposable = () => Disposable.None) { }

	public async readFile(_resource: URI): Promise<Uint8Array> {
		return new Uint8Array();
	}

	public async open(_resource: URI, _opts: IFileOpenOptions): Promise<number> {
		return this.fdCounter++;
	}

	public async stat(_resource: URI): Promise<IStat> {
		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: 0,
		};
	}
	public async mkdir(_resource: URI): Promise<void> { }

	public async readdir(_resource: URI): Promise<[string, FileType][]> {
		return [['', FileType.Unknown]];
	}

	public async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> { }

	public async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> { }

	public async close?(_fd: number): Promise<void> { }

	public async read?(_fd: number, _pos: number, data: Uint8Array, _offset: number, _length: number): Promise<number> {
		// claim no more bytes to read
		return 0;
	}

	public async write?(_fd: number, _pos: number, data: Uint8Array, _offset: number, _length: number): Promise<number> {
		// claim all bytes written
		return data.byteLength;
	}

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

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
