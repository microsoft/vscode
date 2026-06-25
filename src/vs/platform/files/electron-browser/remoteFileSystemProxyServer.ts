/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IFileService, IFileStatWithMetadata, FileType } from '../../files/common/files.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME } from '../common/remoteFileSystemProxy.js';

/**
 * Registered in every renderer process. Serves file system operations to other
 * windows that cannot directly access this window's remote file system provider.
 * The main process routes incoming requests via {@link RemoteFileSystemProxyMainHandler}.
 *
 * This follows the same pattern as {@link ElectronRemoteResourceLoader}.
 */
export class RemoteFileSystemProxyServer extends Disposable {

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		const channel: IServerChannel = {
			listen<T>(_: unknown, event: string): Event<T> {
				throw new Error(`Event not found: ${event}`);
			},

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			call: (_: unknown, command: string, arg?: any): Promise<any> => {
				const args = arg as unknown[];
				switch (command) {
					case 'stat': return this.stat(URI.revive(args[0] as UriComponents));
					case 'readdir': return this.readdir(URI.revive(args[0] as UriComponents));
					case 'readFile': return this.readFile(URI.revive(args[0] as UriComponents));
					case 'exists': return this.exists(URI.revive(args[0] as UriComponents));
					case 'resolve': return this.resolve(URI.revive(args[0] as UriComponents), args[1] as boolean);
				}

				throw new Error(`Call not found: ${command}`);
			}
		};

		mainProcessService.registerChannel(REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME, channel);
	}

	private async stat(uri: URI): Promise<{ type: FileType; size: number; mtime: number; ctime: number }> {
		const provider = this.fileService.getProvider(uri.scheme);
		if (!provider) {
			throw new Error(`No provider for scheme: ${uri.scheme}`);
		}
		return provider.stat(uri);
	}

	private async readdir(uri: URI): Promise<[string, FileType][]> {
		const provider = this.fileService.getProvider(uri.scheme);
		if (!provider) {
			throw new Error(`No provider for scheme: ${uri.scheme}`);
		}
		return provider.readdir(uri);
	}

	private async readFile(uri: URI): Promise<VSBuffer> {
		const content = await this.fileService.readFile(uri);
		return content.value;
	}

	private async exists(uri: URI): Promise<boolean> {
		return this.fileService.exists(uri);
	}

	private async resolve(uri: URI, resolveMetadata: boolean): Promise<IFileStatWithMetadata> {
		return this.fileService.resolve(uri, { resolveMetadata }) as Promise<IFileStatWithMetadata>;
	}
}
