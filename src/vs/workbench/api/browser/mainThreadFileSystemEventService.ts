/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { extHostCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ExtHostContext } from '../common/extHost.protocol';
import { localize } from 'vs/nls';
import { IWorkingCopyFileOperationParticipant, IWorkingCopyFileService, SourceTargetPair, IFileOperationUndoRedoInfo } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
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
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { reviveWorkspaceEditDto } from 'vs/workbench/api/browser/mainThreadBulkEdits';

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
		@IEnvironmentService envService: IEnvironmentService,
		@IUriIdentityService uriIdentService: IUriIdentityService
	) {

		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		this._listener.add(fileService.onDidFilesChange(event => {
			proxy.$onFileEvent({
				created: event.rawAdded,
				changed: event.rawUpdated,
				deleted: event.rawDeleted
			});
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
					const onWillEvent = proxy.$onWillRunFileOperation(operation, files, timeout, cts.token);
					return raceCancellation(onWillEvent, cts.token);
				}, () => {
					// user-cancel
					cts.cancel();

				}).finally(() => {
					cts.dispose();
					clearTimeout(timer);
				});

				if (!data || data.edit.edits.length === 0) {
					// cancelled, no reply, or no edits
					return;
				}

				const needsConfirmation = data.edit.edits.some(edit => edit.metadata?.needsConfirmation);
				let showPreview = storageService.getBoolean(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);

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
							storageService.store(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, showPreview, StorageScope.PROFILE, StorageTarget.USER);
						}
					}
				}

				logService.info('[onWill-handler] applying additional workspace edit from extensions', data.extensionNames);

				await bulkEditService.apply(
					reviveWorkspaceEditDto(data.edit, uriIdentService),
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
					case FileOperation.WRITE:
						return localize('msg-write', "Running 'File Write' participants...");
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
			title: {
				value: localize('label', "Reset choice for 'File operation needs preview'"),
				original: `Reset choice for 'File operation needs preview'`
			},
			f1: true
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IStorageService).remove(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, StorageScope.PROFILE);
	}
});
