/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IRawFileChange, toFileChangesEvent } from 'vs/workbench/services/files/node/watcher/common';
import { OutOfProcessWin32FolderWatcher } from 'vs/workbench/services/files/node/watcher/win32/csharpWatcherService';
import { FileChangesEvent } from 'vs/platform/files/common/files';

export class FileWatcher {

	constructor(
		private basePath: string,
		private ignored: string[],
		private onFileChanges: (changes: FileChangesEvent) => void,
		private errorLogger: (msg: string) => void,
		private verboseLogging: boolean
	) {
	}

	public startWatching(): () => void {
		let watcher = new OutOfProcessWin32FolderWatcher(
			this.basePath,
			this.ignored,
			(events) => this.onRawFileEvents(events),
			(error) => this.onError(error),
			this.verboseLogging
		);

		return () => watcher.dispose();
	}

	private onRawFileEvents(events: IRawFileChange[]): void {

		// Emit through broadcast service
		if (events.length > 0) {
			this.onFileChanges(toFileChangesEvent(events));
		}
	}

	private onError(error: string): void {
		this.errorLogger(error);
	}
}