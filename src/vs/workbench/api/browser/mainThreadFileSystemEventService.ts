/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileChangeType, IFileService, FileOperation } from 'vs/platform/files/common/files';
import { extHostCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, FileSystemEvents, IExtHostContext } from '../common/extHost.protocol';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { localize } from 'vs/nls';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _listener = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IProgressService progressService: IProgressService
	) {

		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		// file system events - (changes the editor and other make)
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};
		this._listener.add(fileService.onFileChanges(event => {
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
		}));


		// BEFORE file operation
		const messages = new Map<FileOperation, string>();
		messages.set(FileOperation.CREATE, localize('msg-create', "Running 'File Create' participants..."));
		messages.set(FileOperation.DELETE, localize('msg-delete', "Running 'File Delete' participants..."));
		messages.set(FileOperation.MOVE, localize('msg-rename', "Running 'File Rename' participants..."));

		this._listener.add(textFileService.onWillRunOperation(e => {
			const p = progressService.withProgress({ location: ProgressLocation.Window }, progress => {

				progress.report({ message: messages.get(e.operation) });

				const p1 = proxy.$onWillRunFileOperation(e.operation, e.target, e.source);
				const p2 = new Promise((_resolve, reject) => {
					setTimeout(() => reject(new Error('timeout')), 5000);
				});
				return Promise.race([p1, p2]);
			});

			e.waitUntil(p);
		}));

		// AFTER file operation
		this._listener.add(textFileService.onDidRunOperation(e => proxy.$onDidRunFileOperation(e.operation, e.target, e.source)));
	}

	dispose(): void {
		this._listener.dispose();
	}
}
