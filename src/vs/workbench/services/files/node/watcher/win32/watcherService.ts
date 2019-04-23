/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiskFileChange } from 'vs/workbench/services/files/node/watcher/watcher';
import { OutOfProcessWin32FolderWatcher } from 'vs/workbench/services/files/node/watcher/win32/csharpWatcherService';
import { posix } from 'vs/base/common/path';
import { rtrim, endsWith } from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';

export class FileWatcher extends Disposable {
	private isDisposed: boolean;
	private folder: { path: string, excludes: string[] };

	constructor(
		folders: { path: string, excludes: string[] }[],
		private onFileChanges: (changes: IDiskFileChange[]) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean
	) {
		super();

		this.folder = folders[0];

		if (this.folder.path.indexOf('\\\\') === 0 && endsWith(this.folder.path, posix.sep)) {
			// for some weird reason, node adds a trailing slash to UNC paths
			// we never ever want trailing slashes as our base path unless
			// someone opens root ("/").
			// See also https://github.com/nodejs/io.js/issues/1765
			this.folder.path = rtrim(this.folder.path, posix.sep);
		}

		this.startWatching();
	}

	private startWatching(): void {
		this._register(new OutOfProcessWin32FolderWatcher(
			this.folder.path,
			this.folder.excludes,
			events => this.onFileEvents(events),
			error => this.onError(error),
			this.verboseLogging
		));
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

	dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}