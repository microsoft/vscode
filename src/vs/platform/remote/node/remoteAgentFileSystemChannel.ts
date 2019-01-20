/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { FileChangeType, FileDeleteOptions, FileOverwriteOptions, FileSystemProviderCapabilities, FileType, FileWriteOptions, IFileChange, IFileSystemProvider, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export const REMOTE_FILE_SYSTEM_CHANNEL_NAME = 'remotefilesystem';

export interface IFileChangeDto {
	resource: UriComponents;
	type: FileChangeType;
}

export class RemoteExtensionsFileSystemProvider extends Disposable implements IFileSystemProvider {

	private readonly _session: string;
	private readonly _channel: IChannel;

	private readonly _onDidChange = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChange.event;

	public capabilities: FileSystemProviderCapabilities;
	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	constructor(channel: IChannel) {
		super();
		this._session = generateUuid();
		this._channel = channel;

		this.setCaseSensitive(true);

		this._channel.listen<IFileChangeDto[]>('filechange', [this._session])((events) => {
			this._onDidChange.fire(events.map(RemoteExtensionsFileSystemProvider._createFileChange));
		});
	}

	dispose(): void {
		super.dispose();
	}

	setCaseSensitive(isCaseSensitive: boolean) {
		let capabilities = (
			FileSystemProviderCapabilities.FileReadWrite
			| FileSystemProviderCapabilities.FileFolderCopy
		);
		if (isCaseSensitive) {
			capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
		}
		this.capabilities = capabilities;
		this._onDidChangeCapabilities.fire(undefined);
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const req = Math.random();
		this._channel.call('watch', [this._session, req, resource, opts]);
		return toDisposable(() => {
			this._channel.call('unwatch', [this._session, req]);
		});
	}

	private static _createFileChange(dto: IFileChangeDto): IFileChange {
		return { resource: URI.revive(dto.resource), type: dto.type };
	}

	// --- forwarding calls

	private static _asBuffer(data: Uint8Array): Buffer {
		return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}

	stat(resource: URI): Promise<IStat> {
		return this._channel.call('stat', [resource]);
	}

	readFile(resource: URI): Promise<Uint8Array> {
		return this._channel.call('readFile', [resource]);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		const contents = RemoteExtensionsFileSystemProvider._asBuffer(content);
		return this._channel.call('writeFile', [resource, contents, opts]);
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return this._channel.call('delete', [resource, opts]);
	}

	mkdir(resource: URI): Promise<void> {
		return this._channel.call('mkdir', [resource]);
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this._channel.call('readdir', [resource]);
	}

	rename(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this._channel.call('rename', [resource, target, opts]);
	}

	copy(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
		return this._channel.call('copy', [resource, target, opts]);
	}
}
