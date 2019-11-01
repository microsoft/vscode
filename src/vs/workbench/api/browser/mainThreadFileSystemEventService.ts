/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { extHostCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, FileSystemEvents, IExtHostContext } from '../common/extHost.protocol';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _listener = new Array<IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService
	) {

		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		// file system events - (changes the editor and other make)
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};
		fileService.onFileChanges(event => {
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
		}, undefined, this._listener);

		// file operation events
		fileService.onWillRunOperation(e => proxy.$onWillRunFileOperation(e.operation, e.target, e.source));
		fileService.onAfterOperation(e => proxy.$onDidRunFileOperation(e.operation, e.resource, e.target && e.target.resource), undefined, this._listener);
	}

	dispose(): void {
		dispose(this._listener);
	}
}
