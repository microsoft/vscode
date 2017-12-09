/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ExtHostContext, ExtHostFileSystemEventServiceShape, FileSystemEvents, IExtHostContext } from '../node/extHost.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _listener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService
	) {

		const proxy: ExtHostFileSystemEventServiceShape = extHostContext.get(ExtHostContext.ExtHostFileSystemEventService);
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
