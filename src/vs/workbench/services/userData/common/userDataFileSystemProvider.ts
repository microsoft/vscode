/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { FileSystemProviderCapabilities, FileWriteOptions, IStat, FileType, FileDeleteOptions, IWatchOptions, FileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileChange, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { IUserDataProvider } from 'vs/workbench/services/userData/common/userData';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import * as resources from 'vs/base/common/resources';
import { TernarySearchTree } from 'vs/base/common/map';

export class UserDataFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	private readonly versions: Map<string, number> = new Map<string, number>();

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChangeFile.event;


	constructor(
		private readonly userDataHome: URI,
		private readonly userDataProvider: IUserDataProvider
	) {
		super();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const path = this.toPath(resource);
		if (!path) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return this.userDataProvider.onDidChangeFile(e => {
			if (new UserDataChangesEvent(e).contains(path)) {
				this.versions.set(path, (this.versions.get(path) || 1) + 1);
				this._onDidChangeFile.fire(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]).changes);
			}
		});
	}

	async stat(resource: URI): Promise<IStat> {
		const path = this.toPath(resource);
		if (!path) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return {
			type: FileType.File,
			ctime: 0,
			mtime: this.versions.get(path) || 0,
			size: 0
		};
	}

	mkdir(resource: URI): Promise<void> { throw new Error('not supported'); }
	delete(resource: URI, opts: FileDeleteOptions): Promise<void> { throw new Error('not supported'); }
	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { throw new Error('not supported'); }

	async readFile(resource: URI): Promise<Uint8Array> {
		const path = this.toPath(resource);
		if (!path) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return this.userDataProvider.readFile(path);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const path = this.toPath(resource);
		if (!path) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		const children = await this.userDataProvider.listFiles(path);
		return children.map(c => [c, FileType.Unknown]);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		const path = this.toPath(resource);
		if (!path) {
			throw new Error(`Invalud user data resource ${resource}`);
		}
		return this.userDataProvider.writeFile(path, content);
	}

	private toPath(resource: URI): string | undefined {
		return resources.relativePath(this.userDataHome, resource);
	}
}

class UserDataChangesEvent {

	private _pathsTree: TernarySearchTree<string> | undefined = undefined;

	constructor(readonly paths: string[]) { }

	private get pathsTree(): TernarySearchTree<string> {
		if (!this._pathsTree) {
			this._pathsTree = TernarySearchTree.forPaths<string>();
			for (const path of this.paths) {
				this._pathsTree.set(path, path);
			}
		}
		return this._pathsTree;
	}

	contains(keyOrSegment: string): boolean {
		return this.pathsTree.findSubstr(keyOrSegment) !== undefined;
	}

}