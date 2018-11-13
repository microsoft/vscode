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
	private readonly _remoteAuthority: string;
	private readonly _channel: IChannel;
	private readonly _onDidChange = this._register(new Emitter<IFileChange[]>());

	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChange.event;
	readonly capabilities: FileSystemProviderCapabilities;

	constructor(
		remoteAuthority: string,
		channel: IChannel,
		isCaseSensitive: boolean
	) {
		super();
		this._session = generateUuid();
		this._remoteAuthority = remoteAuthority;
		this._channel = channel;

		let capabilities = (
			FileSystemProviderCapabilities.FileReadWrite
			| FileSystemProviderCapabilities.FileFolderCopy
		);
		if (isCaseSensitive) {
			capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
		}
		this.capabilities = capabilities;

		this._channel.listen<IFileChangeDto[]>('filechange', [this._remoteAuthority, this._session])((events) => {
			this._onDidChange.fire(events.map(RemoteExtensionsFileSystemProvider._createFileChange));
		});
		setInterval(() => {
			this._channel.call('keepWatching', [this._session]);
		}, 1000);
	}

	dispose(): void {
		super.dispose();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const req = Math.random();
		this._channel.call('watch', [this._remoteAuthority, this._session, req, resource, opts]);
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

	stat(resource: URI): Thenable<IStat> {
		return this._channel.call('stat', [this._remoteAuthority, resource]);
	}

	readFile(resource: URI): Thenable<Uint8Array> {
		return this._channel.call('readFile', [this._remoteAuthority, resource]);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Thenable<void> {
		const contents = RemoteExtensionsFileSystemProvider._asBuffer(content);
		return this._channel.call('writeFile', [this._remoteAuthority, resource, contents.toString('base64'), opts]);
	}

	delete(resource: URI, opts: FileDeleteOptions): Thenable<void> {
		return this._channel.call('delete', [this._remoteAuthority, resource, opts]);
	}

	mkdir(resource: URI): Thenable<void> {
		return this._channel.call('mkdir', [this._remoteAuthority, resource]);
	}

	readdir(resource: URI): Thenable<[string, FileType][]> {
		return this._channel.call('readdir', [this._remoteAuthority, resource]);
	}

	rename(resource: URI, target: URI, opts: FileOverwriteOptions): Thenable<void> {
		return this._channel.call('rename', [this._remoteAuthority, resource, target, opts]);
	}

	copy(resource: URI, target: URI, opts: FileOverwriteOptions): Thenable<void> {
		return this._channel.call('copy', [this._remoteAuthority, resource, target, opts]);
	}
}
