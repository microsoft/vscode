/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { parse } from 'vs/base/common/json';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import {
	FileDeleteOptions,
	FileOverwriteOptions,
	FileSystemProviderCapabilities,
	FileType,
	FileWriteOptions,
	IFileService,
	IFileSystemProvider,
	IStat,
	IWatchOptions
} from 'vs/platform/files/common/files';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { VSBuffer } from 'vs/base/common/buffer';

const TRUSTED_DOMAINS_SCHEMA = 'trustedDomains';

const TRUSTED_DOMAINS_STAT: IStat = {
	type: FileType.File,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

const CONFIG_HELP_TEXT = `// Configure trusted domains by editing and saving this file
// You can use \`*\` to match subdomains. For example https://*.visualstudio.com would match:
// - https://code.visualstudio.com
// - https://update.code.visualstudio.com
`;

export class TrustedDomainsFileSystemProvider implements IFileSystemProvider, IWorkbenchContribution {
	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService
	) {
		this.fileService.registerProvider(TRUSTED_DOMAINS_SCHEMA, this);
	}

	stat(resource: URI): Promise<IStat> {
		return Promise.resolve(TRUSTED_DOMAINS_STAT);
	}

	readFile(resource: URI): Promise<Uint8Array> {
		let trustedDomains: string[] = [];

		try {
			const trustedDomainsSrc = this.storageService.get('http.linkProtectionTrustedDomains', StorageScope.GLOBAL);
			if (trustedDomainsSrc) {
				trustedDomains = JSON.parse(trustedDomainsSrc);
			}
		} catch (err) { }

		const trustedDomainsContent = CONFIG_HELP_TEXT + JSON.stringify(trustedDomains, null, 2);


		const buffer = VSBuffer.fromString(trustedDomainsContent).buffer;
		return Promise.resolve(buffer);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		let trustedDomainsd = [];

		try {
			trustedDomainsd = parse(content.toString());
		} catch (err) { }

		this.storageService.store(
			'http.linkProtectionTrustedDomains',
			JSON.stringify(trustedDomainsd),
			StorageScope.GLOBAL
		);

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
