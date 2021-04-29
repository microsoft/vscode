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
import { IWorkingCopyFileOperationParticipant, IWorkingCopyFileService, SourceTargetPair, IFileOperationUndoRedoInfo } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { reviveWorkspaceEditDto2 } from 'vs/workbench/api/browser/mainThreadEditors';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

@extHostCustomer
export class MainThreadFileSystemEventService {

	static readonly MementoKeyAdditionalEdits = `file.particpants.additionalEdits`;

	private readonly _listener = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService fileService: IFileService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IProgressService progressService: IProgressService,
		@IDialogService dialogService: IDialogService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IEnvironmentService envService: IEnvironmentService
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
			async participate(files: SourceTargetPair[], operation: FileOperation, undoInfo: IFileOperationUndoRedoInfo | undefined, timeout: number, token: CancellationToken) {
				if (undoInfo?.isUndoing) {
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

				const needsConfirmation = data.edit.edits.some(edit => edit.metadata?.needsConfirmation);
				let showPreview = storageService.getBoolean(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.GLOBAL);

				if (envService.extensionTestsLocationURI) {
					// don't show dialog in tests
					showPreview = false;
				}

				if (showPreview === undefined) {
					// show a user facing message

					let message: string;
					if (data.extensionNames.length === 1) {
						if (operation === FileOperation.CREATE) {
							message = localize('ask.1.create', "Extension '{0}' wants to make refactoring changes with this file creation", data.extensionNames[0]);
						} else if (operation === FileOperation.COPY) {
							message = localize('ask.1.copy', "Extension '{0}' wants to make refactoring changes with this file copy", data.extensionNames[0]);
						} else if (operation === FileOperation.MOVE) {
							message = localize('ask.1.move', "Extension '{0}' wants to make refactoring changes with this file move", data.extensionNames[0]);
						} else /* if (operation === FileOperation.DELETE) */ {
							message = localize('ask.1.delete', "Extension '{0}' wants to make refactoring changes with this file deletion", data.extensionNames[0]);
						}
					} else {
						if (operation === FileOperation.CREATE) {
							message = localize({ key: 'ask.N.create', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file creation", data.extensionNames.length);
						} else if (operation === FileOperation.COPY) {
							message = localize({ key: 'ask.N.copy', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file copy", data.extensionNames.length);
						} else if (operation === FileOperation.MOVE) {
							message = localize({ key: 'ask.N.move', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file move", data.extensionNames.length);
						} else /* if (operation === FileOperation.DELETE) */ {
							message = localize({ key: 'ask.N.delete', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file deletion", data.extensionNames.length);
						}
					}

					if (needsConfirmation) {
						// edit which needs confirmation -> always show dialog
						const answer = await dialogService.show(Severity.Info, message, [localize('preview', "Show Preview"), localize('cancel', "Skip Changes")], { cancelId: 1 });
						showPreview = true;
						if (answer.choice === 1) {
							// no changes wanted
							return;
						}
					} else {
						// choice
						const answer = await dialogService.show(Severity.Info, message,
							[localize('ok', "OK"), localize('preview', "Show Preview"), localize('cancel', "Skip Changes")],
							{
								cancelId: 2,
								checkbox: { label: localize('again', "Don't ask again") }
							}
						);
						if (answer.choice === 2) {
							// no changes wanted, don't persist cancel option
							return;
						}
						showPreview = answer.choice === 1;
						if (answer.checkboxChecked /* && answer.choice !== 2 */) {
							storageService.store(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, showPreview, StorageScope.GLOBAL, StorageTarget.USER);
						}
					}
				}

				logService.info('[onWill-handler] applying additional workspace edit from extensions', data.extensionNames);

				await bulkEditService.apply(
					reviveWorkspaceEditDto2(data.edit),
					{ undoRedoGroupId: undoInfo?.undoRedoGroupId, showPreview }
				);
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

registerAction2(class ResetMemento extends Action2 {
	constructor() {
		super({
			id: 'files.participants.resetChoice',
			title: localize('label', "Reset choice for 'File operation needs preview'"),
			f1: true
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IStorageService).remove(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.GLOBAL);
	}
});


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
