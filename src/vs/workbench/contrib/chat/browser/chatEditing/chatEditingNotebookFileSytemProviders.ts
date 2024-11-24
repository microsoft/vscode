/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ReadableStreamEvents } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileSystemProviderCapabilities, FileType, IFileChange, IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileReadStreamOptions, IFileSystemProvider, IFileWriteOptions, IStat, IWatchOptions } from '../../../../../platform/files/common/files.js';

export class ChatEditingNotebookFileSystemProvider implements IFileSystemProvider {
	public static readonly scheme = 'chat-editing-ntoebook-model';

	public static getEmptyFileURI(): URI {
		return URI.from({
			scheme: ChatEditingNotebookFileSystemProvider.scheme,
			query: JSON.stringify({ kind: 'empty' }),
		});
	}

	public static getFileURI(documentId: string, path: string): URI {
		return URI.from({
			scheme: ChatEditingNotebookFileSystemProvider.scheme,
			path,
			query: JSON.stringify({ kind: 'doc' }),
		});
	}
	public static getSnapshotFileURI(requestId: string | undefined, path: string): URI {
		return URI.from({
			scheme: ChatEditingNotebookFileSystemProvider.scheme,
			path,
			query: JSON.stringify({ requestId: requestId ?? '' }),
		});
	}

	public readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.FileReadStream;
	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile: Event<readonly IFileChange[]> = Event.None;
	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}
	async stat(_resource: URI): Promise<IStat> {
		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: 0
		};
	}
	mkdir(_resource: URI): Promise<void> {
		throw new Error('Method not implemented.');
	}
	readdir(_resource: URI): Promise<[string, FileType][]> {
		throw new Error('Method not implemented.');
	}
	delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}
	rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}
	copy?(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}
	readFile?(__resource: URI): Promise<Uint8Array> {
		throw new Error('Method not implemented.');
	}
	writeFile?(__resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}
	readFileStream?(__resource: URI, _opts: IFileReadStreamOptions, _token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		throw new Error('Method not implemented.');
	}
	open?(__resource: URI, _opts: IFileOpenOptions): Promise<number> {
		throw new Error('Method not implemented.');
	}
	close?(_fd: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	read?(_fd: number, _pos: number, _data: Uint8Array, _offset: number, _length: number): Promise<number> {
		throw new Error('Method not implemented.');
	}
	write?(_fd: number, _pos: number, _data: Uint8Array, _offset: number, _length: number): Promise<number> {
		throw new Error('Method not implemented.');
	}
	cloneFile?(_from: URI, __to: URI): Promise<void> {
		throw new Error('Method not implemented.');
	}
}
