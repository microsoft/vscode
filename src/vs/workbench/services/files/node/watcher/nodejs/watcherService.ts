/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiskFileChange, normalizeFileChanges } from 'vs/workbench/services/files/node/watcher/watcher';
import { Disposable } from 'vs/base/common/lifecycle';
import { statLink } from 'vs/base/node/pfs';
import { realpath } from 'vs/base/node/extpath';
import { watchFolder, watchFile, CHANGE_BUFFER_DELAY } from 'vs/base/node/watcher';
import { FileChangeType } from 'vs/platform/files/common/files';
import { ThrottledDelayer } from 'vs/base/common/async';
import { join, basename } from 'vs/base/common/path';

export class FileWatcher extends Disposable {
	private isDisposed: boolean;

	private fileChangesDelayer: ThrottledDelayer<void> = this._register(new ThrottledDelayer<void>(CHANGE_BUFFER_DELAY * 2 /* sync on delay from underlying library */));
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
			const { stat, isSymbolicLink } = await statLink(this.path);

			if (this.isDisposed) {
				return;
			}

			let pathToWatch = this.path;
			if (isSymbolicLink) {
				try {
					pathToWatch = await realpath(pathToWatch);
				} catch (error) {
					this.onError(error);
				}
			}

			// Watch Folder
			if (stat.isDirectory()) {
				this._register(watchFolder(pathToWatch, (eventType, path) => {
					this.onFileChange({
						type: eventType === 'changed' ? FileChangeType.UPDATED : eventType === 'added' ? FileChangeType.ADDED : FileChangeType.DELETED,
						path: join(this.path, basename(path)) // ensure path is identical with what was passed in
					});
				}, error => this.onError(error)));
			}

			// Watch File
			else {
				this._register(watchFile(pathToWatch, eventType => {
					this.onFileChange({
						type: eventType === 'changed' ? FileChangeType.UPDATED : FileChangeType.DELETED,
						path: this.path // ensure path is identical with what was passed in
					});
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
			if (normalizedFileChanges.length > 0) {
				this.onFileChanges(normalizedFileChanges);
			}

			return Promise.resolve();
		});
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