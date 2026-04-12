/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MainThreadFileSystemEventService_1;
import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { localize } from '../../../nls.js';
import { IWorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IBulkEditService } from '../../../editor/browser/services/bulkEditService.js';
import { IProgressService } from '../../../platform/progress/common/progress.js';
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../base/common/severity.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { reviveWorkspaceEditDto } from './mainThreadBulkEdits.js';
import { URI } from '../../../base/common/uri.js';
let MainThreadFileSystemEventService = class MainThreadFileSystemEventService {
    static { MainThreadFileSystemEventService_1 = this; }
    static { this.MementoKeyAdditionalEdits = `file.particpants.additionalEdits`; }
    constructor(extHostContext, _fileService, workingCopyFileService, bulkEditService, progressService, dialogService, storageService, logService, envService, uriIdentService, _logService) {
        this._fileService = _fileService;
        this._logService = _logService;
        this._listener = new DisposableStore();
        this._watches = new DisposableMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemEventService);
        this._listener.add(_fileService.onDidFilesChange(event => {
            this._proxy.$onFileEvent({
                created: event.rawAdded,
                changed: event.rawUpdated,
                deleted: event.rawDeleted
            });
        }));
        const that = this;
        const fileOperationParticipant = new class {
            async participate(files, operation, undoInfo, timeout, token) {
                if (undoInfo?.isUndoing) {
                    return;
                }
                const cts = new CancellationTokenSource(token);
                const timer = setTimeout(() => cts.cancel(), timeout);
                const data = await progressService.withProgress({
                    location: 15 /* ProgressLocation.Notification */,
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
                let showPreview = storageService.getBoolean(MainThreadFileSystemEventService_1.MementoKeyAdditionalEdits, 0 /* StorageScope.PROFILE */);
                if (envService.extensionTestsLocationURI) {
                    // don't show dialog in tests
                    showPreview = false;
                }
                if (showPreview === undefined) {
                    // show a user facing message
                    let message;
                    if (data.extensionNames.length === 1) {
                        if (operation === 0 /* FileOperation.CREATE */) {
                            message = localize('ask.1.create', "Extension '{0}' wants to make refactoring changes with this file creation", data.extensionNames[0]);
                        }
                        else if (operation === 3 /* FileOperation.COPY */) {
                            message = localize('ask.1.copy', "Extension '{0}' wants to make refactoring changes with this file copy", data.extensionNames[0]);
                        }
                        else if (operation === 2 /* FileOperation.MOVE */) {
                            message = localize('ask.1.move', "Extension '{0}' wants to make refactoring changes with this file move", data.extensionNames[0]);
                        }
                        else /* if (operation === FileOperation.DELETE) */ {
                            message = localize('ask.1.delete', "Extension '{0}' wants to make refactoring changes with this file deletion", data.extensionNames[0]);
                        }
                    }
                    else {
                        if (operation === 0 /* FileOperation.CREATE */) {
                            message = localize({ key: 'ask.N.create', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file creation", data.extensionNames.length);
                        }
                        else if (operation === 3 /* FileOperation.COPY */) {
                            message = localize({ key: 'ask.N.copy', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file copy", data.extensionNames.length);
                        }
                        else if (operation === 2 /* FileOperation.MOVE */) {
                            message = localize({ key: 'ask.N.move', comment: ['{0} is a number, e.g "3 extensions want..."'] }, "{0} extensions want to make refactoring changes with this file move", data.extensionNames.length);
                        }
                        else /* if (operation === FileOperation.DELETE) */ {
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
                    }
                    else {
                        // choice
                        let Choice;
                        (function (Choice) {
                            Choice[Choice["OK"] = 0] = "OK";
                            Choice[Choice["Preview"] = 1] = "Preview";
                            Choice[Choice["Cancel"] = 2] = "Cancel";
                        })(Choice || (Choice = {}));
                        const { result, checkboxChecked } = await dialogService.prompt({
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
                            storageService.store(MainThreadFileSystemEventService_1.MementoKeyAdditionalEdits, showPreview, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
                        }
                    }
                }
                logService.info('[onWill-handler] applying additional workspace edit from extensions', data.extensionNames);
                await bulkEditService.apply(reviveWorkspaceEditDto(data.edit, uriIdentService), { undoRedoGroupId: undoInfo?.undoRedoGroupId, showPreview });
            }
            _progressLabel(operation) {
                switch (operation) {
                    case 0 /* FileOperation.CREATE */:
                        return localize('msg-create', "Running 'File Create' participants...");
                    case 2 /* FileOperation.MOVE */:
                        return localize('msg-rename', "Running 'File Rename' participants...");
                    case 3 /* FileOperation.COPY */:
                        return localize('msg-copy', "Running 'File Copy' participants...");
                    case 1 /* FileOperation.DELETE */:
                        return localize('msg-delete', "Running 'File Delete' participants...");
                    case 4 /* FileOperation.WRITE */:
                        return localize('msg-write', "Running 'File Write' participants...");
                }
            }
        };
        // BEFORE file operation
        this._listener.add(workingCopyFileService.addFileOperationParticipant(fileOperationParticipant));
        // AFTER file operation
        this._listener.add(workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this._proxy.$onDidRunFileOperation(e.operation, e.files)));
    }
    async $watch(extensionId, session, resource, unvalidatedOpts, correlate) {
        const uri = URI.revive(resource);
        const canHandleWatcher = await this._fileService.canHandleResource(uri);
        if (!canHandleWatcher) {
            this._logService.warn(`MainThreadFileSystemEventService#$watch(): cannot watch resource as its scheme is not handled by the file service (extension: ${extensionId}, path: ${uri.toString(true)})`);
        }
        const opts = {
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
            }
            catch (error) {
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
    $unwatch(session) {
        if (this._watches.has(session)) {
            this._logService.trace(`MainThreadFileSystemEventService#$unwatch(): request to stop watching (session: ${session})`);
            this._watches.deleteAndDispose(session);
        }
    }
    dispose() {
        this._listener.dispose();
        this._watches.dispose();
    }
};
MainThreadFileSystemEventService = MainThreadFileSystemEventService_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadFileSystemEventService),
    __param(1, IFileService),
    __param(2, IWorkingCopyFileService),
    __param(3, IBulkEditService),
    __param(4, IProgressService),
    __param(5, IDialogService),
    __param(6, IStorageService),
    __param(7, ILogService),
    __param(8, IEnvironmentService),
    __param(9, IUriIdentityService),
    __param(10, ILogService)
], MainThreadFileSystemEventService);
export { MainThreadFileSystemEventService };
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
    run(accessor) {
        accessor.get(IStorageService).remove(MainThreadFileSystemEventService.MementoKeyAdditionalEdits, 0 /* StorageScope.PROFILE */);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkYsT0FBTyxFQUFpQixZQUFZLEVBQWlCLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQXNDLFdBQVcsRUFBeUMsTUFBTSwrQkFBK0IsQ0FBQztBQUN2SixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUF3Qyx1QkFBdUIsRUFBZ0QsTUFBTSw2REFBNkQsQ0FBQztBQUMxTCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsZ0JBQWdCLEVBQW9CLE1BQU0sK0NBQStDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakUsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM3RSxPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLDZDQUE2QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdkYsT0FBTyxFQUFFLFdBQVcs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