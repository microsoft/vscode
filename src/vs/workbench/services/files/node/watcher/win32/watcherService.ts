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
	private eventEmitter: IEventService;

	constructor(private basePath: string, private ignored: string[], eventEmitter: IEventService, private errorLogger: (msg: string) => void, private verboseLogging: boolean) {
		this.eventEmitter = eventEmitter;
	}

	public startWatching(): () => void {
		let watcher = new OutOfProcessWin32FolderWatcher(
			this.basePath,
			this.ignored,
			this.errorLogger,
			(events) => this.onRawFileEvents(events),
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
}