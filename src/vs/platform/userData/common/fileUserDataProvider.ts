/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IFileSystemProviderWithFileReadWriteCapability, IFileChange, IWatchOptions, IStat, IFileOverwriteOptions, FileType, IFileWriteOptions, IFileDeleteOptions, FileSystemProviderCapabilities, IFileSystemProviderWithFileReadStreamCapability, IFileReadStreamOptions, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileFolderCopyCapability, hasFileFolderCopyCapability, hasFileAtomicWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileOpenOptions } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { ILogService } from 'vs/platform/log/common/log';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { VSBuffer } from 'vs/base/common/buffer';
import { isObject } from 'vs/base/common/types';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ResourceSet } from 'vs/base/common/map';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

/**
 * This is a wrapper on top of the local filesystem provider which will
 * 	- Convert the user data resources to file system scheme and vice-versa
 *  - Enforces atomic reads for user data
 */
export class FileUserDataProvider extends Disposable implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileFolderCopyCapability {

	get capabilities() { return this.fileSystemProvider.capabilities; }
	readonly onDidChangeCapabilities: Event<void> = this.fileSystemProvider.onDidChangeCapabilities;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private readonly watchResources = TernarySearchTree.forUris<URI>(() => !(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive));
	private readonly atomicWritesResources: ResourceSet;

	constructor(
		private readonly fileSystemScheme: string,
		private readonly fileSystemProvider: IFileSystemProviderWithFileReadWriteCapability & IFileSystemProviderWithOpenReadWriteCloseCapability & (IFileSystemProviderWithFileReadStreamCapability | IFileSystemProviderWithFileAtomicReadCapability | IFileSystemProviderWithFileFolderCopyCapability),
		private readonly userDataScheme: string,
		private readonly userDataProfilesService: IUserDataProfilesService,
		uriIdentityService: IUriIdentityService,
		private readonly logService: ILogService,
	) {
		super();
		this.atomicWritesResources = new ResourceSet((uri) => uriIdentityService.extUri.getComparisonKey(this.toFileSystemResource(uri)));
		this.updateAtomicWritesResources();
		this._register(userDataProfilesService.onDidChangeProfiles(() => this.updateAtomicWritesResources()));
		this._register(this.fileSystemProvider.onDidChangeFile(e => this.handleFileChanges(e)));
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

	private updateAtomicWritesResources(): void {
		this.atomicWritesResources.clear();
		for (const profile of this.userDataProfilesService.profiles) {
			this.atomicWritesResources.add(profile.settingsResource);
			this.atomicWritesResources.add(profile.keybindingsResource);
			this.atomicWritesResources.add(profile.tasksResource);
			this.atomicWritesResources.add(profile.extensionsResource);
		}
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

	readFile(resource: URI): Promise<Uint8Array> {
		return this.fileSystemProvider.readFile(this.toFileSystemResource(resource), { atomic: true });
	}

	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
		(async () => {
			try {
				const contents = await this.readFile(resource);
				stream.end(contents);
			} catch (error) {
				stream.error(error);
				stream.end();
			}
		})();
		return stream;
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this.fileSystemProvider.readdir(this.toFileSystemResource(resource));
	}

	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		if (this.atomicWritesResources.has(resource) && !isObject(opts.atomic) && hasFileAtomicWriteCapability(this.fileSystemProvider)) {
			opts = { ...opts, atomic: { postfix: '.vsctmp' } };
		}
		return this.fileSystemProvider.writeFile(this.toFileSystemResource(resource), content, opts);
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
					type: change.type
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
