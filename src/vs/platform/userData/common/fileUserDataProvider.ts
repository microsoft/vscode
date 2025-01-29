/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IFileSystemProviderWithFileReadWriteCapability, IFileChange, IWatchOptions, IStat, IFileOverwriteOptions, FileType, IFileWriteOptions, IFileDeleteOptions, FileSystemProviderCapabilities, IFileSystemProviderWithFileReadStreamCapability, IFileReadStreamOptions, IFileSystemProviderWithFileAtomicReadCapability, hasFileFolderCopyCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileOpenOptions, IFileSystemProviderWithFileAtomicWriteCapability, IFileSystemProviderWithFileAtomicDeleteCapability, IFileSystemProviderWithFileFolderCopyCapability, IFileSystemProviderWithFileCloneCapability, hasFileCloneCapability, IFileAtomicReadOptions, IFileAtomicOptions } from '../../files/common/files.js';
import { URI } from '../../../base/common/uri.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ReadableStreamEvents } from '../../../base/common/stream.js';
import { ILogService } from '../../log/common/log.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { ResourceSet } from '../../../base/common/map.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';

/**
 * This is a wrapper on top of the local filesystem provider which will
 * 	- Convert the user data resources to file system scheme and vice-versa
 *  - Enforces atomic reads for user data
 */
export class FileUserDataProvider extends Disposable implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileAtomicWriteCapability,
	IFileSystemProviderWithFileAtomicDeleteCapability,
	IFileSystemProviderWithFileCloneCapability {

	readonly capabilities = this.fileSystemProvider.capabilities;
	readonly onDidChangeCapabilities = this.fileSystemProvider.onDidChangeCapabilities;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly watchResources = TernarySearchTree.forUris<URI>(() => !(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive));
	private readonly atomicReadWriteResources = new ResourceSet((uri) => this.uriIdentityService.extUri.getComparisonKey(this.toFileSystemResource(uri)));

	constructor(
		private readonly fileSystemScheme: string,
		private readonly fileSystemProvider: IFileSystemProviderWithFileReadWriteCapability & IFileSystemProviderWithOpenReadWriteCloseCapability & IFileSystemProviderWithFileReadStreamCapability & IFileSystemProviderWithFileAtomicReadCapability & IFileSystemProviderWithFileAtomicWriteCapability & IFileSystemProviderWithFileAtomicDeleteCapability,
		private readonly userDataScheme: string,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly logService: ILogService,
	) {
		super();
		this.updateAtomicReadWritesResources();
		this._register(userDataProfilesService.onDidChangeProfiles(() => this.updateAtomicReadWritesResources()));
		this._register(this.fileSystemProvider.onDidChangeFile(e => this.handleFileChanges(e)));
	}

	private updateAtomicReadWritesResources(): void {
		this.atomicReadWriteResources.clear();
		for (const profile of this.userDataProfilesService.profiles) {
			this.atomicReadWriteResources.add(profile.settingsResource);
			this.atomicReadWriteResources.add(profile.keybindingsResource);
			this.atomicReadWriteResources.add(profile.tasksResource);
			this.atomicReadWriteResources.add(profile.extensionsResource);
		}
	}

	open(resource: URI, opts: IFileOpenOptions): Promise<number> {
		return this.fileSystemProvider.open(this.toFileSystemResource(resource), opts);
	}

	close(fd: number): Promise<void> {
		return this.fileSystemProvider.close(fd);
	}

	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this.fileSystemProvider.read(fd, pos, data, offset, length);
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this.fileSystemProvider.write(fd, pos, data, offset, length);
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		this.watchResources.set(resource, resource);
		const disposable = this.fileSystemProvider.watch(this.toFileSystemResource(resource), opts);
		return toDisposable(() => {
			this.watchResources.delete(resource);
			disposable.dispose();
		});
	}

	stat(resource: URI): Promise<IStat> {
		return this.fileSystemProvider.stat(this.toFileSystemResource(resource));
	}

	mkdir(resource: URI): Promise<void> {
		return this.fileSystemProvider.mkdir(this.toFileSystemResource(resource));
	}

	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		return this.fileSystemProvider.rename(this.toFileSystemResource(from), this.toFileSystemResource(to), opts);
	}

	readFile(resource: URI, opts?: IFileAtomicReadOptions): Promise<Uint8Array> {
		return this.fileSystemProvider.readFile(this.toFileSystemResource(resource), opts);
	}

	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		return this.fileSystemProvider.readFileStream(this.toFileSystemResource(resource), opts, token);
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this.fileSystemProvider.readdir(this.toFileSystemResource(resource));
	}

	enforceAtomicReadFile(resource: URI): boolean {
		return this.atomicReadWriteResources.has(resource);
	}

	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		return this.fileSystemProvider.writeFile(this.toFileSystemResource(resource), content, opts);
	}

	enforceAtomicWriteFile(resource: URI): IFileAtomicOptions | false {
		if (this.atomicReadWriteResources.has(resource)) {
			return { postfix: '.vsctmp' };
		}

		return false;
	}

	delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		return this.fileSystemProvider.delete(this.toFileSystemResource(resource), opts);
	}

	copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		if (hasFileFolderCopyCapability(this.fileSystemProvider)) {
			return this.fileSystemProvider.copy(this.toFileSystemResource(from), this.toFileSystemResource(to), opts);
		}
		throw new Error('copy not supported');
	}

	cloneFile(from: URI, to: URI): Promise<void> {
		if (hasFileCloneCapability(this.fileSystemProvider)) {
			return this.fileSystemProvider.cloneFile(this.toFileSystemResource(from), this.toFileSystemResource(to));
		}
		throw new Error('clone not supported');
	}

	private handleFileChanges(changes: readonly IFileChange[]): void {
		const userDataChanges: IFileChange[] = [];
		for (const change of changes) {
			if (change.resource.scheme !== this.fileSystemScheme) {
				continue; // only interested in file schemes
			}

			const userDataResource = this.toUserDataResource(change.resource);
			if (this.watchResources.findSubstr(userDataResource)) {
				userDataChanges.push({
					resource: userDataResource,
					type: change.type,
					cId: change.cId
				});
			}
		}
		if (userDataChanges.length) {
			this.logService.debug('User data changed');
			this._onDidChangeFile.fire(userDataChanges);
		}
	}

	private toFileSystemResource(userDataResource: URI): URI {
		return userDataResource.with({ scheme: this.fileSystemScheme });
	}

	private toUserDataResource(fileSystemResource: URI): URI {
		return fileSystemResource.with({ scheme: this.userDataScheme });
	}

}
