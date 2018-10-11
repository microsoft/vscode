/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FileChangeType, IFileService, FileOperation } from 'vs/platform/files/common/files';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ExtHostContext, FileSystemEvents, IExtHostContext } from '../node/extHost.protocol';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _listener = new Array<IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService,
		@ITextFileService textfileService: ITextFileService,
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

		// file operation events - (changes the editor makes)
		fileService.onAfterOperation(e => {
			if (e.operation === FileOperation.MOVE) {
				proxy.$onFileRename(e.resource, e.target.resource);
			}
		}, undefined, this._listener);

		textfileService.onWillMove(e => {
			let promise = proxy.$onWillRename(e.oldResource, e.newResource);
			e.waitUntil(promise);
		}, undefined, this._listener);
	}

	dispose(): void {
		dispose(this._listener);
	}
}
