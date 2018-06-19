/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { FileChangeType, IFileService, FileOperation } from 'vs/platform/files/common/files';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, ExtHostFileSystemEventServiceShape, FileSystemEvents, IExtHostContext } from '../node/extHost.protocol';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _fileEventListener: IDisposable;
	private readonly _fileOperationListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService
	) {

		const proxy: ExtHostFileSystemEventServiceShape = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		// file system events - (changes the editor and other make)
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};
		this._fileEventListener = fileService.onFileChanges(event => {
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

		// file operation events - (changes the editor makes)
		this._fileOperationListener = fileService.onAfterOperation(e => {
			if (e.operation === FileOperation.MOVE) {
				proxy.$onFileRename(e.resource, e.target.resource);
			}
		});
	}

	dispose(): void {
		this._fileEventListener.dispose();
		this._fileOperationListener.dispose();
	}
}
