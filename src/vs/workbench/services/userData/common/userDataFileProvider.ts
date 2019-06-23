/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { FileSystemProviderCapabilities, FileWriteOptions, IStat, FileType, FileDeleteOptions, IWatchOptions, FileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileChange, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { IUserDataService } from 'vs/workbench/services/userData/common/userData';
import { URI } from 'vs/base/common/uri';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event, Emitter } from 'vs/base/common/event';

export class UserDataFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	constructor(private readonly userDataService: IUserDataService) { super(); }

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChangeFile.event;

	private versions: Map<string, number> = new Map<string, number>();

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const key = this.userDataService.toKey(resource);
		if (!key) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return this.userDataService.onDidChange(e => {
			if (e.contains(key)) {
				this.versions.set(key, (this.versions.get(key) || 1) + 1);
				this._onDidChangeFile.fire(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]).changes);
			}
		});
	}

	async stat(resource: URI): Promise<IStat> {
		const key = this.userDataService.toKey(resource);
		if (!key) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return {
			type: FileType.File,
			ctime: 0,
			mtime: this.versions.get(key) || 0,
			size: 0
		};
	}
	mkdir(resource: URI): Promise<void> { throw new Error('not supported'); }
	readdir(resource: URI): Promise<[string, FileType][]> { throw new Error('not supported'); }
	delete(resource: URI, opts: FileDeleteOptions): Promise<void> { throw new Error('not supported'); }

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { throw new Error('not supported'); }

	async readFile(resource: URI): Promise<Uint8Array> {
		const key = this.userDataService.toKey(resource);
		if (!key) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		const content = await this.userDataService.read(key);
		return VSBuffer.fromString(content).buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		const key = this.userDataService.toKey(resource);
		if (!key) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return this.userDataService.write(key, VSBuffer.wrap(content).toString());
	}
}