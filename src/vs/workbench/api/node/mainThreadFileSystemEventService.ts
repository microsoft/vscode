/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {FileChangesEvent, FileChangeType} from 'vs/platform/files/common/files';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {IEventService} from 'vs/platform/event/common/event';
import {RunOnceScheduler} from 'vs/base/common/async';
import {ExtHostContext, ExtHostFileSystemEventServiceShape, FileSystemEvents} from './extHostProtocol';

export class MainThreadFileSystemEventService {

	constructor( @IEventService eventService: IEventService, @IThreadService threadService: IThreadService) {

		const proxy: ExtHostFileSystemEventServiceShape = threadService.get(ExtHostContext.ExtHostFileSystemEventService);
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};

		const scheduler = new RunOnceScheduler(() => {
			proxy._onFileEvent(events);
			events.created.length = 0;
			events.changed.length = 0;
			events.deleted.length = 0;
		}, 100);

		eventService.addListener2('files:fileChanges', (event: FileChangesEvent) => {
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
			scheduler.schedule();
		});
	}
}
