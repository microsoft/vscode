/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {EventType} from 'vs/platform/files/common/files';
import watcher = require('vs/workbench/services/files/node/watcher/common');
import {OutOfProcessWin32FolderWatcher} from 'vs/workbench/services/files/node/watcher/win32/csharpWatcherService';
import {IEventService} from 'vs/platform/event/common/event';

export class FileWatcher {

	constructor(
		private basePath: string,
		private ignored: string[],
		private eventEmitter: IEventService,
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

	private onRawFileEvents(events: watcher.IRawFileChange[]): void {

		// Emit through broadcast service
		if (events.length > 0) {
			this.eventEmitter.emit(EventType.FILE_CHANGES, watcher.toFileChangesEvent(events));
		}
	}

	private onError(error: string): void {
		this.errorLogger(error);
	}
}