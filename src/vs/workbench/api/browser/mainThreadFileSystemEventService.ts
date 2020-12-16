/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileChangeType, FileOperation, IFileService } from 'vs/platform/files/common/files';
import { extHostCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, FileSystemEvents, IExtHostContext } from '../common/extHost.protocol';
import { localize } from 'vs/nls';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkingCopyFileOperationParticipant, IWorkingCopyFileService, SourceTargetPair } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { reviveWorkspaceEditDto2 } from 'vs/workbench/api/browser/mainThreadEditors';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

@extHostCustomer
export class MainThreadFileSystemEventService {

	private readonly _listener = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IProgressService progressService: IProgressService
	) {

		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		// file system events - (changes the editor and other make)
		const events: FileSystemEvents = {
			created: [],
			changed: [],
			deleted: []
		};
		this._listener.add(fileService.onDidFilesChange(event => {
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


		const fileOperationParticipant = new class implements IWorkingCopyFileOperationParticipant {
			async participate(files: SourceTargetPair[], operation: FileOperation, undoRedoGroupId: number | undefined, isUndoing: boolean | undefined, timeout: number, token: CancellationToken) {
				if (isUndoing) {
					return;
				}

				const cts = new CancellationTokenSource(token);
				const timer = setTimeout(() => cts.cancel(), timeout);

				const data = await progressService.withProgress({
					location: ProgressLocation.Notification,
					title: this._progressLabel(operation),
					cancellable: true,
					delay: Math.min(timeout / 2, 3000)
				}, () => {
					// race extension host event delivery against timeout AND user-cancel
					const onWillEvent = proxy.$onWillRunFileOperation(operation, files, timeout, token);
					return raceCancellation(onWillEvent, cts.token);
				}, () => {
					// user-cancel
					cts.cancel();

				}).finally(() => {
					cts.dispose();
					clearTimeout(timer);
				});

				if (!data) {
					// cancelled or no reply
					return;
				}

				const edit = reviveWorkspaceEditDto2(data);
				await bulkEditService.apply(edit, {
					undoRedoGroupId,
					// this is a nested workspace edit, e.g one from a onWill-handler and for now we need to forcefully suppress
					// refactor previewing, see: https://github.com/microsoft/vscode/issues/111873#issuecomment-738739852
					suppressPreview: true
				});
			}
			private _progressLabel(operation: FileOperation): string {
				switch (operation) {
					case FileOperation.CREATE:
						return localize('msg-create', "Running 'File Create' participants...");
					case FileOperation.MOVE:
						return localize('msg-rename', "Running 'File Rename' participants...");
					case FileOperation.COPY:
						return localize('msg-copy', "Running 'File Copy' participants...");
					case FileOperation.DELETE:
						return localize('msg-delete', "Running 'File Delete' participants...");
				}
			}
		};

		// BEFORE file operation
		this._listener.add(workingCopyFileService.addFileOperationParticipant(fileOperationParticipant));

		// AFTER file operation
		this._listener.add(workingCopyFileService.onDidRunWorkingCopyFileOperation(e => proxy.$onDidRunFileOperation(e.operation, e.files)));
	}

	dispose(): void {
		this._listener.dispose();
	}


}


Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'files',
	properties: {
		'files.participants.timeout': {
			type: 'number',
			default: 60000,
			markdownDescription: localize('files.participants.timeout', "Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants."),
		}
	}
});
