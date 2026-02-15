/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileDeleteOptions, IFileOverwriteOptions, FileSystemProviderCapabilities, FileType, IFileWriteOptions, IFileService, IStat, IWatchOptions, IFileSystemProviderWithFileReadWriteCapability } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { readTrustedDomains, TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, TRUSTED_DOMAINS_STORAGE_KEY } from './trustedDomains.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

const TRUSTED_DOMAINS_SCHEMA = 'trustedDomains';

const TRUSTED_DOMAINS_STAT: IStat = {
	type: FileType.File,
	ctime: Date.now(),
	mtime: Date.now(),
	size: 0
};

const CONFIG_HELP_TEXT_PRE = `// Links matching one or more entries in the list below can be opened without link protection.
// The following examples show what entries can look like:
// - "https://microsoft.com": Matches this specific domain using https
// - "https://microsoft.com:8080": Matches this specific domain on this port using https
// - "https://microsoft.com:*": Matches this specific domain on any port using https
// - "https://microsoft.com/foo": Matches https://microsoft.com/foo and https://microsoft.com/foo/bar,
//   but not https://microsoft.com/foobar or https://microsoft.com/bar
// - "https://*.microsoft.com": Match all domains ending in "microsoft.com" using https
// - "microsoft.com": Match this specific domain using either http or https
// - "*.microsoft.com": Match all domains ending in "microsoft.com" using either http or https
// - "http://192.168.0.1: Matches this specific IP using http
// - "http://192.168.0.*: Matches all IP's with this prefix using http
// - "*": Match all domains using either http or https
//
`;

const CONFIG_HELP_TEXT_AFTER = `//
// You can use the "Manage Trusted Domains" command to open this file.
// Save this file to apply the trusted domains rules.
`;

const CONFIG_PLACEHOLDER_TEXT = `[
	// "https://microsoft.com"
]`;

function computeTrustedDomainContent(defaultTrustedDomains: string[], trustedDomains: string[], configuring?: string) {
	let content = CONFIG_HELP_TEXT_PRE;

	if (defaultTrustedDomains.length > 0) {
		content += `// By default, VS Code trusts "localhost" as well as the following domains:\n`;
		defaultTrustedDomains.forEach(d => {
			content += `// - "${d}"\n`;
		});
	} else {
		content += `// By default, VS Code trusts "localhost".\n`;
	}

	content += CONFIG_HELP_TEXT_AFTER;

	content += configuring ? `\n// Currently configuring trust for ${configuring}\n` : '';

	if (trustedDomains.length === 0) {
		content += CONFIG_PLACEHOLDER_TEXT;
	} else {
		content += JSON.stringify(trustedDomains, null, 2);
	}

	return content;
}

export class TrustedDomainsFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.trustedDomainsFileSystemProvider';

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.fileService.registerProvider(TRUSTED_DOMAINS_SCHEMA, this);
	}

	stat(resource: URI): Promise<IStat> {
		return Promise.resolve(TRUSTED_DOMAINS_STAT);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		let trustedDomainsContent = this.storageService.get(
			TRUSTED_DOMAINS_CONTENT_STORAGE_KEY,
			StorageScope.APPLICATION
		);

		const configuring: string | undefined = resource.fragment;

		const { defaultTrustedDomains, trustedDomains } = await this.instantiationService.invokeFunction(readTrustedDomains);
		if (
			!trustedDomainsContent ||
			trustedDomainsContent.indexOf(CONFIG_HELP_TEXT_PRE) === -1 ||
			trustedDomainsContent.indexOf(CONFIG_HELP_TEXT_AFTER) === -1 ||
			trustedDomainsContent.indexOf(configuring ?? '') === -1 ||
			[...defaultTrustedDomains, ...trustedDomains].some(d => !assertReturnsDefined(trustedDomainsContent).includes(d))
		) {
			trustedDomainsContent = computeTrustedDomainContent(defaultTrustedDomains, trustedDomains, configuring);
		}

		const buffer = VSBuffer.fromString(trustedDomainsContent).buffer;
		return buffer;
	}

	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		try {
			const trustedDomainsContent = VSBuffer.wrap(content).toString();
			const trustedDomains = parse(trustedDomainsContent);

			this.storageService.store(TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, trustedDomainsContent, StorageScope.APPLICATION, StorageTarget.USER);
			this.storageService.store(
				TRUSTED_DOMAINS_STORAGE_KEY,
				JSON.stringify(trustedDomains) || '',
				StorageScope.APPLICATION,
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
	delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		return Promise.resolve(undefined!);
	}
	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		return Promise.resolve(undefined!);
	}
}
