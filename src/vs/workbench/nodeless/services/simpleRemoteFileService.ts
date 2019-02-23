/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IFileService, IResourceEncodings, FileChangesEvent, FileOperationEvent, IResolveFileOptions, IFileStat, IResolveFileResult, IResolveContentOptions, IContent, IStreamContent, ITextSnapshot, IUpdateContentOptions, ICreateFileOptions } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { timeout } from 'vs/base/common/async';
import { basename } from 'vs/base/common/resources';

export class SimpleRemoteFileService implements IFileService {

	_serviceBrand: any;

	encoding: IResourceEncodings;

	private readonly _onFileChanges: Emitter<FileChangesEvent>;
	private readonly _onAfterOperation: Emitter<FileOperationEvent>;

	private content = 'Hello Html';

	constructor() {
		this._onFileChanges = new Emitter<FileChangesEvent>();
		this._onAfterOperation = new Emitter<FileOperationEvent>();
	}

	setContent(content: string): void {
		this.content = content;
	}

	getContent(): string {
		return this.content;
	}

	get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	fireFileChanges(event: FileChangesEvent): void {
		this._onFileChanges.fire(event);
	}

	get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	fireAfterOperation(event: FileOperationEvent): void {
		this._onAfterOperation.fire(event);
	}

	resolveFile(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat> {
		return Promise.resolve({
			resource,
			etag: Date.now().toString(),
			encoding: 'utf8',
			mtime: Date.now(),
			isDirectory: false,
			name: basename(resource)
		});
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]> {
		return Promise.all(toResolve.map(resourceAndOption => this.resolveFile(resourceAndOption.resource, resourceAndOption.options))).then(stats => stats.map(stat => ({ stat, success: true })));
	}

	existsFile(_resource: URI): Promise<boolean> {
		return Promise.resolve(true);
	}

	resolveContent(resource: URI, _options?: IResolveContentOptions): Promise<IContent> {
		return Promise.resolve({
			resource: resource,
			value: this.content,
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: basename(resource)
		});
	}

	resolveStreamContent(resource: URI, _options?: IResolveContentOptions): Promise<IStreamContent> {
		return Promise.resolve({
			resource: resource,
			value: {
				on: (event: string, callback: Function): void => {
					if (event === 'data') {
						callback(this.content);
					}
					if (event === 'end') {
						callback();
					}
				}
			},
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: basename(resource)
		});
	}

	updateContent(resource: URI, _value: string | ITextSnapshot, _options?: IUpdateContentOptions): Promise<IFileStat> {
		return timeout(0).then(() => ({
			resource,
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			isDirectory: false,
			name: basename(resource)
		}));
	}

	moveFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStat> {
		return Promise.resolve(null!);
	}

	copyFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStat> {
		throw new Error('not implemented');
	}

	createFile(_resource: URI, _content?: string, _options?: ICreateFileOptions): Promise<IFileStat> {
		throw new Error('not implemented');
	}

	readFolder(_resource: URI) {
		return Promise.resolve([]);
	}

	createFolder(_resource: URI): Promise<IFileStat> {
		throw new Error('not implemented');
	}

	onDidChangeFileSystemProviderRegistrations = Event.None;

	registerProvider(_scheme: string, _provider) {
		return { dispose() { } };
	}

	activateProvider(_scheme: string): Promise<void> {
		throw new Error('not implemented');
	}

	canHandleResource(resource: URI): boolean {
		return resource.scheme === 'file';
	}

	del(_resource: URI, _options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	watchFileChanges(_resource: URI): void {
	}

	unwatchFileChanges(_resource: URI): void {
	}

	getWriteEncoding(_resource: URI): string {
		return 'utf8';
	}

	dispose(): void {
	}
}