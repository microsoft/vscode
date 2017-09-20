/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadFileSystemShape, ExtHostFileSystemShape } from '../node/extHost.protocol';
import { IFileService, IFileSystemProvider, IStat, IFileChange } from 'vs/platform/files/common/files';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IProgress } from 'vs/platform/progress/common/progress';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';

@extHostNamedCustomer(MainContext.MainThreadFileSystem)
export class MainThreadFileSystem implements MainThreadFileSystemShape {

	private readonly _toDispose: IDisposable[] = [];
	private readonly _proxy: ExtHostFileSystemShape;
	private readonly _provider = new Map<number, RemoteFileSystemProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceEditingService private readonly _workspaceEditService: IWorkspaceEditingService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostFileSystem);
	}

	dispose(): void {
		dispose(this._toDispose);
	}

	$registerFileSystemProvider(handle: number, scheme: string): void {
		this._provider.set(handle, new RemoteFileSystemProvider(this._fileService, scheme, handle, this._proxy));
	}

	$unregisterFileSystemProvider(handle: number): void {
		dispose(this._provider.get(handle));
		this._provider.delete(handle);
	}

	$onDidAddFileSystemRoot(uri: URI): void {
		this._workspaceEditService.addFolders([uri]);
	}

	$onFileSystemChange(handle: number, changes: IFileChange[]): void {
		this._provider.get(handle).$onFileSystemChange(changes);
	}

	$reportFileChunk(handle: number, resource: URI, chunk: number[]): void {
		this._provider.get(handle).reportFileChunk(resource, chunk);
	}
}

class RemoteFileSystemProvider implements IFileSystemProvider {

	private readonly _onDidChange = new Emitter<IFileChange[]>();
	private readonly _registration: IDisposable;
	private readonly _reads = new Map<string, IProgress<Uint8Array>>();

	readonly onDidChange: Event<IFileChange[]> = this._onDidChange.event;


	constructor(
		service: IFileService,
		scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostFileSystemShape
	) {
		this._registration = service.registerProvider(scheme, this);
	}

	dispose(): void {
		this._registration.dispose();
		this._onDidChange.dispose();
	}

	$onFileSystemChange(changes: IFileChange[]): void {
		this._onDidChange.fire(changes);
	}

	// --- forwarding calls

	utimes(resource: URI, mtime: number): TPromise<IStat, any> {
		return this._proxy.$utimes(this._handle, resource, mtime);
	}
	stat(resource: URI): TPromise<IStat, any> {
		return this._proxy.$stat(this._handle, resource);
	}
	read(resource: URI, progress: IProgress<Uint8Array>): TPromise<void, any> {
		this._reads.set(resource.toString(), progress);
		return this._proxy.$read(this._handle, resource);
	}
	reportFileChunk(resource: URI, chunk: number[]): void {
		this._reads.get(resource.toString()).report(Buffer.from(chunk));
	}
	write(resource: URI, content: Uint8Array): TPromise<void, any> {
		return this._proxy.$write(this._handle, resource, [].slice.call(content));
	}
	unlink(resource: URI): TPromise<void, any> {
		return this._proxy.$unlink(this._handle, resource);
	}
	rename(resource: URI, target: URI): TPromise<void, any> {
		return this._proxy.$rename(this._handle, resource, target);
	}
	mkdir(resource: URI): TPromise<void, any> {
		return this._proxy.$mkdir(this._handle, resource);
	}
	readdir(resource: URI): TPromise<IStat[], any> {
		return this._proxy.$readdir(this._handle, resource);
	}
	rmdir(resource: URI): TPromise<void, any> {
		return this._proxy.$rmdir(this._handle, resource);
	}
}
