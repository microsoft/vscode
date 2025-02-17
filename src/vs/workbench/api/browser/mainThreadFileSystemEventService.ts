/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileOperation, IFileService, IWatchOptions } from '../../../platform/files/common/files.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostFileSystemEventServiceShape, MainContext, MainThreadFileSystemEventServiceShape } from '../common/extHost.protocol.js';
import { localize } from '../../../nls.js';
import { IWorkingCopyFileOperationParticipant, IWorkingCopyFileService, SourceTargetPair, IFileOperationUndoRedoInfo } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IBulkEditService } from '../../../editor/browser/services/bulkEditService.js';
import { IProgressService, ProgressLocation } from '../../../platform/progress/common/progress.js';
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../base/common/severity.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { reviveWorkspaceEditDto } from './mainThreadBulkEdits.js';
import { UriComponents, URI } from '../../../base/common/uri.js';

@extHostNamedCustomer(MainContext.MainThreadFileSystemEventService)
export class MainThreadFileSystemEventService implements MainThreadFileSystemEventServiceShape {

	static readonly MementoKeyAdditionalEdits = `file.particpants.additionalEdits`;

	private readonly _proxy: ExtHostFileSystemEventServiceShape;

	private readonly _listener = new DisposableStore();
	private readonly _watches = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly _fileService: IFileService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IProgressService progressService: IProgressService,
		@IDialogService dialogService: IDialogService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IEnvironmentService envService: IEnvironmentService,
		@IUriIdentityService uriIdentService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);

		this._listener.add(_fileService.onDidFilesChange(event => {
			this._proxy.$onFileEvent({
				created: event.rawAdded,
				changed: event.rawUpdated,
				deleted: event.rawDeleted
			});
		}));

		const that = this;
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
					const onWillEvent = that._proxy.$onWillRunFileOperation(operation, files, timeout, cts.token);
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
						const { confirmed } = await dialogService.confirm({
							type: Severity.Info,
							message,
							primaryButton: localize('preview', "Show &&Preview"),
							cancelButton: localize('cancel', "Skip Changes")
						});
						showPreview = true;
						if (!confirmed) {
							// no changes wanted
							return;
						}
					} else {
						// choice
						enum Choice {
							OK = 0,
							Preview = 1,
							Cancel = 2
						}
						const { result, checkboxChecked } = await dialogService.prompt<Choice>({
							type: Severity.Info,
							message,
							buttons: [
								{
									label: localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
									run: () => Choice.OK
								},
								{
									label: localize({ key: 'preview', comment: ['&& denotes a mnemonic'] }, "Show &&Preview"),
									run: () => Choice.Preview
								}
							],
							cancelButton: {
								label: localize('cancel', "Skip Changes"),
								run: () => Choice.Cancel
							},
							checkbox: { label: localize('again', "Do not ask me again") }
						});
						if (result === Choice.Cancel) {
							// no changes wanted, don't persist cancel option
							return;
						}
						showPreview = result === Choice.Preview;
						if (checkboxChecked) {
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
		this._listener.add(workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this._proxy.$onDidRunFileOperation(e.operation, e.files)));
	}

	async $watch(extensionId: string, session: number, resource: UriComponents, unvalidatedOpts: IWatchOptions, correlate: boolean): Promise<void> {
		const uri = URI.revive(resource);

		const opts: IWatchOptions = {
			...unvalidatedOpts
		};

		// Convert a recursive watcher to a flat watcher if the path
		// turns out to not be a folder. Recursive watching is only
		// possible on folders, so we help all file watchers by checking
		// early.
		if (opts.recursive) {
			try {
				const stat = await this._fileService.stat(uri);
				if (!stat.isDirectory) {
					opts.recursive = false;
				}
			} catch (error) {
				// ignore
			}
		}

		// Correlated file watching: use an exclusive `createWatcher()`
		// Note: currently not enabled for extensions (but leaving in in case of future usage)
		if (correlate && !opts.recursive) {
			this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching correlated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);

			const watcherDisposables = new DisposableStore();
			const subscription = watcherDisposables.add(this._fileService.createWatcher(uri, { ...opts, recursive: false }));
			watcherDisposables.add(subscription.onDidChange(event => {
				this._proxy.$onFileEvent({
					session,
					created: event.rawAdded,
					changed: event.rawUpdated,
					deleted: event.rawDeleted
				});
			}));

			this._watches.set(session, watcherDisposables);
		}

		// Uncorrelated file watching: via shared `watch()`
		else {
			this._logService.trace(`MainThreadFileSystemEventService#$watch(): request to start watching uncorrelated (extension: ${extensionId}, path: ${uri.toString(true)}, recursive: ${opts.recursive}, session: ${session}, excludes: ${JSON.stringify(opts.excludes)}, includes: ${JSON.stringify(opts.includes)})`);

			const subscription = this._fileService.watch(uri, opts);
			this._watches.set(session, subscription);
		}
	}

	$unwatch(session: number): void {
		if (this._watches.has(session)) {
			this._logService.trace(`MainThreadFileSystemEventService#$unwatch(): request to stop watching (session: ${session})`);
			this._watches.deleteAndDispose(session);
		}
	}

	dispose(): void {
		this._listener.dispose();
		this._watches.dispose();
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
