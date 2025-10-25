/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileSystemProviderCapabilities, IStat, FileType, IFileDeleteOptions, IFileOverwriteOptions, IFileWriteOptions, FileSystemProviderErrorCode, IFileSystemProviderWithFileReadWriteCapability, createFileSystemProviderError } from '../../../../platform/files/common/files.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { NotSupportedError } from '../../../../base/common/errors.js';

export class FetchFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.Readonly + FileSystemProviderCapabilities.FileReadWrite + FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;

	// working implementations
	async readFile(resource: URI): Promise<Uint8Array> {
		try {
			const res = await fetch(resource.toString(true));
			if (res.status === 200) {
				return new Uint8Array(await res.arrayBuffer());
			}
			throw createFileSystemProviderError(res.statusText, FileSystemProviderErrorCode.Unknown);
		} catch (err) {
			throw createFileSystemProviderError(err, FileSystemProviderErrorCode.Unknown);
		}
	}

	// fake implementations
	async stat(_resource: URI): Promise<IStat> {
		return {
			type: FileType.File,
			size: 0,
			mtime: 0,
			ctime: 0
		};
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	// error implementations
	writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw new NotSupportedError();
	}
	readdir(_resource: URI): Promise<[string, FileType][]> {
		throw new NotSupportedError();
	}
	mkdir(_resource: URI): Promise<void> {
		throw new NotSupportedError();
	}
	delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw new NotSupportedError();
	}
	rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw new NotSupportedError();
	}
}
