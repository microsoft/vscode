/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileWriteOptions, FileSystemProviderCapabilities, IFileChange, IFileService, IFileSystemProvider, IStat, IWatchOptions, FileType, FileOverwriteOptions, FileDeleteOptions } from 'vs/platform/files/common/files';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostFileSystemShape, IExtHostContext, IFileChangeDto, MainContext, MainThreadFileSystemShape } from '../node/extHost.protocol';
import { LabelRules, ILabelService } from 'vs/platform/label/common/label';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _fileProvider = new Map<number, RemoteFileSystemProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystem);
	}

	dispose(): void {
		this._fileProvider.forEach(value => value.dispose());
		this._fileProvider.clear();
	}

	$registerFileSystemProvider(handle: number, scheme: string, capabilities: FileSystemProviderCapabilities): void {
		this._fileProvider.set(handle, new RemoteFileSystemProvider(this._fileService, scheme, capabilities, handle, this._proxy));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._fileProvider.get(handle));
		this._fileProvider.delete(handle);
	}

	$setUriFormatter(selector: string, formatter: LabelRules): void {
		this._labelService.registerFormatter(selector, formatter);
	}

	$onFileSystemChange(handle: number, changes: IFileChangeDto[]): void {
		this._fileProvider.get(handle).$onFileSystemChange(changes);
	}
}

class RemoteFileSystemProvider implements IFileSystemProvider {

	private readonly _onDidChange = new Emitter<IFileChange[]>();
	private readonly _registration: IDisposable;

	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChange.event;

	readonly capabilities: FileSystemProviderCapabilities;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	constructor(
		fileService: IFileService,
		scheme: string,
		capabilities: FileSystemProviderCapabilities,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this.capabilities = capabilities;
		this._registration = fileService.registerProvider(scheme, this);
	}

	dispose(): void {
		this._registration.dispose();
		this._onDidChange.dispose();
	}

	watch(resource: URI, opts: IWatchOptions) {
		const session = Math.random();
		this._proxy.$watch(this._handle, session, resource, opts);
		return toDisposable(() => {
			this._proxy.$unwatch(this._handle, session);
		});
	}

	$onFileSystemChange(changes: IFileChangeDto[]): void {
		this._onDidChange.fire(changes.map(RemoteFileSystemProvider._createFileChange));
	}

	private static _createFileChange(dto: IFileChangeDto): IFileChange {
		return { resource: URI.revive(dto.resource), type: dto.type };
	}

	// --- forwarding calls

	private static _asBuffer(data: Uint8Array): Buffer {
		return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}

	stat(resource: URI): Promise<IStat> {
		return this._proxy.$stat(this._handle, resource).then(undefined, err => {
			throw err;
		});
	}

	readFile(resource: URI): Promise<Uint8Array> {
		return this._proxy.$readFile(this._handle, resource);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		return this._proxy.$writeFile(this._handle, resource, RemoteFileSystemProvider._asBuffer(content), opts);
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return this._proxy.$delete(this._handle, resource, opts);
	}

	mkdir(resource: URI): Promise<void> {
		return this._proxy.$mkdir(this._handle, resource);
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this._proxy.$readdir(this._handle, resource);
	}

	rename(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this._proxy.$rename(this._handle, resource, target, opts);
	}

	copy(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this._proxy.$copy(this._handle, resource, target, opts);
	}

	open(resource: URI): Promise<number> {
		return this._proxy.$open(this._handle, resource);
	}

	close(fd: number): Promise<void> {
		return this._proxy.$close(this._handle, fd);
	}

	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this._proxy.$read(this._handle, fd, pos, RemoteFileSystemProvider._asBuffer(data), offset, length);
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this._proxy.$write(this._handle, fd, pos, RemoteFileSystemProvider._asBuffer(data), offset, length);
	}
}
