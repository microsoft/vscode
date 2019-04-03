/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiskFileChange, normalizeFileChanges } from 'vs/workbench/services/files2/node/watcher/normalizer';
import { Disposable } from 'vs/base/common/lifecycle';
import { stat } from 'vs/base/node/pfs';
import { watchFolder, watchFile } from 'vs/base/node/watcher';
import { FileChangeType } from 'vs/platform/files/common/files';
import { ThrottledDelayer } from 'vs/base/common/async';

export class FileWatcher extends Disposable {
	private isDisposed: boolean;

	private fileChangesDelayer: ThrottledDelayer<void> = this._register(new ThrottledDelayer<void>(50));
	private fileChangesBuffer: IDiskFileChange[] = [];

	constructor(
		private path: string,
		private onFileChanges: (changes: IDiskFileChange[]) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogger: (msg: string) => void,
		private verboseLogging: boolean
	) {
		super();

		this.startWatching();
	}

	private async startWatching(): Promise<void> {
		try {
			const fileStat = await stat(this.path);

			if (this.isDisposed) {
				return;
			}

			// Watch Folder
			if (fileStat.isDirectory()) {
				this._register(watchFolder(this.path, (eventType, path) => {
					this.onFileChange({ type: eventType === 'changed' ? FileChangeType.UPDATED : eventType === 'added' ? FileChangeType.ADDED : FileChangeType.DELETED, path });
				}, error => this.onError(error)));
			}

			// Watch File
			else {
				this._register(watchFile(this.path, (eventType, path) => {
					this.onFileChange({ type: eventType === 'changed' ? FileChangeType.UPDATED : FileChangeType.DELETED, path });
				}, error => this.onError(error)));
			}
		} catch (error) {
			this.onError(error);
		}
	}

	private onFileChange(event: IDiskFileChange): void {

		// Add to buffer
		this.fileChangesBuffer.push(event);

		// Logging
		if (this.verboseLogging) {
			this.onVerbose(`[File Watcher (node.js)] ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
		}

		// Handle emit through delayer to accommodate for bulk changes and thus reduce spam
		this.fileChangesDelayer.trigger(() => {
			const fileChanges = this.fileChangesBuffer;
			this.fileChangesBuffer = [];

			// Event normalization
			const normalizedFileChanges = normalizeFileChanges(fileChanges);

			// Logging
			if (this.verboseLogging) {
				normalizedFileChanges.forEach(event => {
					this.onVerbose(`[File Watcher (node.js)] >> normalized ${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
				});
			}

			// Fire
			this.onFileEvents(normalizedFileChanges);

			return Promise.resolve();
		});
	}

	private onFileEvents(events: IDiskFileChange[]): void {
		if (this.isDisposed) {
			return;
		}

		// Emit through event emitter
		if (events.length > 0) {
			this.onFileChanges(events);
		}
	}

	private onError(error: string): void {
		if (!this.isDisposed) {
			this.errorLogger(error);
		}
	}

	private onVerbose(msg: string): void {
		if (!this.isDisposed) {
			this.verboseLogger(msg);
		}
	}

	dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}