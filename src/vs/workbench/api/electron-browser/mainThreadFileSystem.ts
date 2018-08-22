/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { FileWriteOptions, FileSystemProviderCapabilities, IFileChange, IFileService, IFileSystemProvider, IStat, IWatchOptions, FileType, FileOverwriteOptions, FileDeleteOptions } from 'vs/platform/files/common/files';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostFileSystemShape, IExtHostContext, IFileChangeDto, MainContext, MainThreadFileSystemShape } from '../node/extHost.protocol';
import { UriLabelRules, IUriLabelService } from 'vs/platform/uriLabel/common/uriLabel';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _fileProvider = new Map<number, RemoteFileSystemProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@IUriLabelService private readonly _uriLabelService: IUriLabelService
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

	$setUriFormatter(scheme: string, formatter: UriLabelRules): void {
		this._uriLabelService.registerFormater(scheme, formatter);
	}

	$onFileSystemChange(handle: number, changes: IFileChangeDto[]): void {
		this._fileProvider.get(handle).$onFileSystemChange(changes);
	}
}

class RemoteFileSystemProvider implements IFileSystemProvider {

	private readonly _onDidChange = new Emitter<IFileChange[]>();
	private readonly _registrations: IDisposable[];

	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChange.event;
	readonly capabilities: FileSystemProviderCapabilities;

	constructor(
		fileService: IFileService,
		scheme: string,
		capabilities: FileSystemProviderCapabilities,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this.capabilities = capabilities;
		this._registrations = [fileService.registerProvider(scheme, this)];
	}

	dispose(): void {
		dispose(this._registrations);
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

	stat(resource: URI): TPromise<IStat> {
		return this._proxy.$stat(this._handle, resource).then(undefined, err => {
			throw err;
		});
	}

	readFile(resource: URI): TPromise<Uint8Array> {
		return this._proxy.$readFile(this._handle, resource).then(encoded => {
			return Buffer.from(encoded, 'base64');
		});
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): TPromise<void> {
		let encoded = Buffer.isBuffer(content)
			? content.toString('base64')
			: Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64');
		return this._proxy.$writeFile(this._handle, resource, encoded, opts);
	}

	delete(resource: URI, opts: FileDeleteOptions): TPromise<void> {
		return this._proxy.$delete(this._handle, resource, opts);
	}

	mkdir(resource: URI): TPromise<void> {
		return this._proxy.$mkdir(this._handle, resource);
	}

	readdir(resource: URI): TPromise<[string, FileType][]> {
		return this._proxy.$readdir(this._handle, resource);
	}

	rename(resource: URI, target: URI, opts: FileOverwriteOptions): TPromise<void> {
		return this._proxy.$rename(this._handle, resource, target, opts);
	}

	copy(resource: URI, target: URI, opts: FileOverwriteOptions): TPromise<void> {
		return this._proxy.$copy(this._handle, resource, target, opts);
	}
}
