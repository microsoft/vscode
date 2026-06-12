/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import {
	FileSystemProviderCapabilities,
	FileType,
	IFileChange,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileService,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileWriteOptions,
	IStat,
	IWatchOptions,
} from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { REMOTE_FILE_SYSTEM_PROXY_HANDLER_CHANNEL_NAME } from '../common/remoteFileSystemProxy.js';

/**
 * A read-only file system provider registered in windows that do not have a
 * direct remote connection. It proxies file system operations through the main
 * process to a window that owns the matching remote file system provider.
 *
 * This enables copy/paste and drag-and-drop of files between remote and local
 * workspaces.
 */
export class RemoteFileSystemProxyClient extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	static register(
		fileService: IFileService,
		mainProcessService: IMainProcessService,
		logService: ILogService,
		remoteAuthority: string | undefined,
	): IDisposable {
		// If this window has its own remote connection, it uses the direct
		// RemoteFileSystemProviderClient. Registering the proxy here would
		// create a loop (main process routes back to this same window).
		if (remoteAuthority) {
			return Disposable.None;
		}

		const disposables = new DisposableStore();

		// Listen for activation of the vscode-remote scheme. Since this
		// window has no direct remote connection, register the proxy provider
		// that routes through the main process to a window that does.
		disposables.add(fileService.onWillActivateFileSystemProvider(e => {
			if (e.scheme === Schemas.vscodeRemote) {
				e.join((async () => {
					try {
						const provider = new RemoteFileSystemProxyClient(mainProcessService, logService);
						disposables.add(provider);
						disposables.add(fileService.registerProvider(Schemas.vscodeRemote, provider));
						logService.info('RemoteFileSystemProxyClient: Registered proxy provider for vscode-remote scheme');
					} catch (error) {
						logService.error('RemoteFileSystemProxyClient: Failed to register proxy provider', error);
					}
				})());
			}
		}));

		return disposables;
	}

	private readonly channel: IChannel;

	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	get capabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileReadWrite |
			FileSystemProviderCapabilities.Readonly |
			FileSystemProviderCapabilities.PathCaseSensitive;
	}

	private constructor(
		mainProcessService: IMainProcessService,
		private readonly logService: ILogService,
	) {
		super();

		// Get the channel from the main process — the main process handler will
		// route calls to the appropriate renderer window based on the URI's
		// remote authority
		this.channel = mainProcessService.getChannel(REMOTE_FILE_SYSTEM_PROXY_HANDLER_CHANNEL_NAME);
	}

	async stat(resource: URI): Promise<IStat> {
		this.logService.trace('RemoteFileSystemProxyClient#stat', resource.toString());
		return this.channel.call('stat', [resource]);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		this.logService.trace('RemoteFileSystemProxyClient#readdir', resource.toString());
		return this.channel.call('readdir', [resource]);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		this.logService.trace('RemoteFileSystemProxyClient#readFile', resource.toString());
		const buffer: VSBuffer = await this.channel.call('readFile', [resource]);
		return buffer.buffer;
	}

	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw new Error('Remote file system proxy provider is read-only');
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async mkdir(_resource: URI): Promise<void> {
		throw new Error('Remote file system proxy provider is read-only');
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw new Error('Remote file system proxy provider is read-only');
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw new Error('Remote file system proxy provider is read-only');
	}
}
