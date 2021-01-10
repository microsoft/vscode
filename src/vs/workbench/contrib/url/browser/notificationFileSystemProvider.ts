/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { parse } from 'vs/base/common/json';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FileDeleteOptions, FileOverwriteOptions, FileSystemProviderCapabilities, FileType, FileWriteOptions, IFileService, IStat, IWatchOptions, IFileSystemProviderWithFileReadWriteCapability } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { VSBuffer } from 'vs/base/common/buffer';
import { MANAGE_NOTIFICATIONS_CONTENT_STORAGE_KEY, MANAGE_NOTIFICATIONS_STORAGE_KEY } from 'vs/workbench/contrib/url/browser/manageNotifications';

const MANAGE_NOTIFICATIONS_STAT: IStat = {
	type: FileType.File,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

export class NotificationFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IWorkbenchContribution {
	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		//@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.fileService.registerProvider('notifications', this);
	}
	onDidErrorOccur?: Event<string> | undefined;
	stat(resource: URI): Promise<IStat> {
		return Promise.resolve(MANAGE_NOTIFICATIONS_STAT);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const buffer = VSBuffer.fromString('hi').buffer;
		return buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		try {
			const trustedDomainsContent = VSBuffer.wrap(content).toString();
			const trustedDomains = parse(trustedDomainsContent);

			this.storageService.store(MANAGE_NOTIFICATIONS_CONTENT_STORAGE_KEY, trustedDomainsContent, StorageScope.GLOBAL, StorageTarget.USER);
			this.storageService.store(
				MANAGE_NOTIFICATIONS_STORAGE_KEY,
				JSON.stringify(trustedDomains) || '',
				StorageScope.GLOBAL,
				StorageTarget.USER
			);
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
