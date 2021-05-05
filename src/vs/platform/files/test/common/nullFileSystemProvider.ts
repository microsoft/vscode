/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { FileSystemProviderCapabilities, IFileSystemProvider, IWatchOptions, IStat, FileType, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, IFileChange } from 'vs/platform/files/common/files';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';

export class NullFileSystemProvider implements IFileSystemProvider {

	capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly;

	private readonly _onDidChangeCapabilities = new Emitter<void>();
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	setCapabilities(capabilities: FileSystemProviderCapabilities): void {
		this.capabilities = capabilities;

		this._onDidChangeCapabilities.fire();
	}

	readonly onDidChangeFile: Event<readonly IFileChange[]> = Event.None;

	constructor(private disposableFactory: () => IDisposable = () => Disposable.None) { }

	watch(resource: URI, opts: IWatchOptions): IDisposable { return this.disposableFactory(); }
	async stat(resource: URI): Promise<IStat> { return undefined!; }
	async mkdir(resource: URI): Promise<void> { return undefined; }
	async readdir(resource: URI): Promise<[string, FileType][]> { return undefined!; }
	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> { return undefined; }
	async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { return undefined; }
	async copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { return undefined; }
	async readFile?(resource: URI): Promise<Uint8Array> { return undefined!; }
	async writeFile?(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> { return undefined; }
	async open?(resource: URI, opts: FileOpenOptions): Promise<number> { return undefined!; }
	async close?(fd: number): Promise<void> { return undefined; }
	async read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return undefined!; }
	async write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return undefined!; }
}
