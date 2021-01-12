/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileDeleteOptions, FileOverwriteOptions, FileSystemProviderCapabilities, FileType, FileWriteOptions, IFileService, IStat, IWatchOptions, IFileSystemProviderWithFileReadWriteCapability } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { VSBuffer } from 'vs/base/common/buffer';
import { TRUSTED_WORKSPACES_STORAGE_KEY } from 'vs/platform/workspace/common/trustedWorkspace';

const TRUSTED_WORKSPACES_SCHEMA = 'trustedWorkspaces';

const TRUSTED_WORKSPACES_STAT: IStat = {
	type: FileType.File,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

export class TrustedWorkspacesFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IWorkbenchContribution {
	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		this.fileService.registerProvider(TRUSTED_WORKSPACES_SCHEMA, this);
	}

	stat(resource: URI): Promise<IStat> {
		return Promise.resolve(TRUSTED_WORKSPACES_STAT);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		let trustedWorkspacesContent = this.storageService.get(TRUSTED_WORKSPACES_STORAGE_KEY, StorageScope.GLOBAL);

		const objectForm = JSON.parse(trustedWorkspacesContent || '{}');


		const buffer = VSBuffer.fromString(JSON.stringify(objectForm, undefined, 2)).buffer;
		return buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		try {
			const trustedWorkspacesContent = VSBuffer.wrap(content).toString();
			this.storageService.store(TRUSTED_WORKSPACES_STORAGE_KEY, trustedWorkspacesContent, StorageScope.GLOBAL, StorageTarget.MACHINE);
		} catch (err) { }

		return Promise.resolve();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return {
			dispose() {
				return;
			}
		};
	}
	mkdir(resource: URI): Promise<void> {
		return Promise.resolve(undefined!);
	}
	readdir(resource: URI): Promise<[string, FileType][]> {
		return Promise.resolve(undefined!);
	}
	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return Promise.resolve(undefined!);
	}
	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.resolve(undefined!);
	}
}
