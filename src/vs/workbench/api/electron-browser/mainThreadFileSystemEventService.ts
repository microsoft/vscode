/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ExtHostFileSystemEventServiceShape, FileSystemEvents } from '../node/extHost.protocol';
import { IDisposable } from "vs/base/common/lifecycle";

export class MainThreadFileSystemEventService {

	private readonly _listener: IDisposable;

	constructor(
		@IThreadService threadService: IThreadService,
		@IFileService fileService: IFileService
	) {

		const proxy: ExtHostFileSystemEventServiceShape = threadService.get(ExtHostContext.ExtHostFileSystemEventService);
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};

		this._listener = fileService.onFileChanges(event => {
			for (let change of event.changes) {
				switch (change.type) {
					case FileChangeType.ADDED:
						events.created.push(change.resource);
						break;
					case FileChangeType.UPDATED:
						events.changed.push(change.resource);
						break;
					case FileChangeType.DELETED:
						events.deleted.push(change.resource);
						break;
				}
			}

			proxy.$onFileEvent(events);
			events.created.length = 0;
			events.changed.length = 0;
			events.deleted.length = 0;
		});
	}

	dispose(): void {
		this._listener.dispose();
	}
}
