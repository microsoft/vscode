/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { getNextTickChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IWatcherService } from 'vs/platform/files/node/watcher/nsfw/watcher';
import { IDiskFileChange, ILogMessage, IWatchRequest, WatcherService } from 'vs/platform/files/common/watcher';

export class FileWatcher extends WatcherService {

	private service: IWatcherService | undefined;

	private isDisposed = false;

	constructor(
		private readonly onDidFilesChange: (changes: IDiskFileChange[]) => void,
		private readonly onLogMessage: (msg: ILogMessage) => void,
		private verboseLogging: boolean
	) {
		super();

		this.startWatching();
	}

	private startWatching(): void {
		const client = this._register(new Client(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			{
				serverName: 'File Watcher (nsfw)',
				args: ['--type=watcherServiceNSFW'],
				env: {
					VSCODE_AMD_ENTRYPOINT: 'vs/platform/files/node/watcher/nsfw/watcherApp',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
				}
			}
		));

		// Initialize watcher
		this.service = ProxyChannel.toService<IWatcherService>(getNextTickChannel(client.getChannel('watcher')));
		this.service.setVerboseLogging(this.verboseLogging);

		// Wire in event handlers
		this._register(this.service.onDidChangeFile(e => !this.isDisposed && this.onDidFilesChange(e)));
		this._register(this.service.onDidLogMessage(e => this.onLogMessage(e)));
	}

	async setVerboseLogging(verboseLogging: boolean): Promise<void> {
		this.verboseLogging = verboseLogging;

		if (!this.isDisposed) {
			await this.service?.setVerboseLogging(verboseLogging);
		}
	}

	error(message: string) {
		this.onLogMessage({ type: 'error', message: `[File Watcher (nsfw)] ${message}` });
	}

	async watch(requests: IWatchRequest[]): Promise<void> {
		if (!this.isDisposed) {
			await this.service?.watch(requests);
		}
	}

	override dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}
