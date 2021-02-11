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
import { WORKSPACE_TRUST_STORAGE_KEY } from 'vs/workbench/services/workspaces/common/workspaceTrust';

const WORKSPACE_TRUST_SCHEMA = 'workspaceTrust';

const TRUSTED_WORKSPACES_STAT: IStat = {
	type: FileType.File,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

const PREPENDED_TEXT = `// The following file is a placeholder UX for managing trusted workspaces. It will be replaced by a rich editor and provide
// additonal information about what trust means. e.g. enabling trust will unblock automatic tasks on startup and list the tasks. It will enable certain extensions
// and list the extensions with associated functionality.
`;

export class WorkspaceTrustFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IWorkbenchContribution {
	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		this.fileService.registerProvider(WORKSPACE_TRUST_SCHEMA, this);
	}

	stat(resource: URI): Promise<IStat> {
		return Promise.resolve(TRUSTED_WORKSPACES_STAT);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		let workspacesTrustContent = this.storageService.get(WORKSPACE_TRUST_STORAGE_KEY, StorageScope.GLOBAL);

		let objectForm = {};
		try {
			objectForm = JSON.parse(workspacesTrustContent || '{}');
		} catch { }

		const buffer = VSBuffer.fromString(PREPENDED_TEXT + JSON.stringify(objectForm, undefined, 2)).buffer;
		return buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		try {
			const workspacesTrustContent = VSBuffer.wrap(content).toString().replace(PREPENDED_TEXT, '');
			this.storageService.store(WORKSPACE_TRUST_STORAGE_KEY, workspacesTrustContent, StorageScope.GLOBAL, StorageTarget.MACHINE);
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
