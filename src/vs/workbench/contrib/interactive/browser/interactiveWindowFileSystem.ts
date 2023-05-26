/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileSystemProviderCapabilities, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProvider, IFileWriteOptions, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export class InteractiveWindowFileSystem implements IFileSystemProvider {

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;

	constructor(private disposableFactory: () => IDisposable = () => Disposable.None) { }

	async readFile(_resource: URI): Promise<Uint8Array> {
		return new Uint8Array();
	}

	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> { }

	async stat(_resource: URI): Promise<IStat> {
		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: 0,
		};
	}
	async mkdir(_resource: URI): Promise<void> { }

	async readdir(_resource: URI): Promise<[string, FileType][]> {
		return [['', FileType.Unknown]];
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> { }

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> { }

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	onDidWatchError?: Event<string> | undefined;

	emitFileChangeEvents(changes: IFileChange[]): void {
		this._onDidChangeFile.fire(changes);
	}

	setCapabilities(capabilities: FileSystemProviderCapabilities): void {
		this.capabilities = capabilities;

		this._onDidChangeCapabilities.fire();
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable { return this.disposableFactory(); }
}
