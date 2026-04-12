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
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AsyncEmitter } from '../../../../base/common/event.js';
import { Promises } from '../../../../base/common/async.js';
import { insert } from '../../../../base/common/arrays.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkingCopyFileOperationParticipant } from './workingCopyFileOperationParticipant.js';
import { StoredFileWorkingCopySaveParticipant } from './storedFileWorkingCopySaveParticipant.js';
export const IWorkingCopyFileService = createDecorator('workingCopyFileService');
let WorkingCopyFileService = class WorkingCopyFileService extends Disposable {
    constructor(fileService, workingCopyService, instantiationService, uriIdentityService) {
        super();
        this.fileService = fileService;
        this.workingCopyService = workingCopyService;
        this.uriIdentityService = uriIdentityService;
        //#region Events
        this._onWillRunWorkingCopyFileOperation = this._register(new AsyncEmitter());
        this.onWillRunWorkingCopyFileOperation = this._onWillRunWorkingCopyFileOperation.event;
        this._onDidFailWorkingCopyFileOperation = this._register(new AsyncEmitter());
        this.onDidFailWorkingCopyFileOperation = this._onDidFailWorkingCopyFileOperation.event;
        this._onDidRunWorkingCopyFileOperation = this._register(new AsyncEmitter());
        this.onDidRunWorkingCopyFileOperation = this._onDidRunWorkingCopyFileOperation.event;
        //#endregion
        this.correlationIds = 0;
        //#endregion
        //#region Path related
        this.workingCopyProviders = [];
        this.fileOperationParticipants = this._register(instantiationService.createInstance(WorkingCopyFileOperationParticipant));
        this.saveParticipants = this._register(instantiationService.createInstance(StoredFileWorkingCopySaveParticipant));
        // register a default working copy provider that uses the working copy service
        this._register(this.registerWorkingCopyProvider(resource => {
            return this.workingCopyService.workingCopies.filter(workingCopy => {
                if (this.fileService.hasProvider(resource)) {
                    // only check for parents if the resource can be handled
                    // by the file system where we then assume a folder like
                    // path structure
                    return this.uriIdentityService.extUri.isEqualOrParent(workingCopy.resource, resource);
                }
                return this.uriIdentityService.extUri.isEqual(workingCopy.resource, resource);
            });
        }));
    }
    //#region File operations
    create(operations, token, undoInfo) {
        return this.doCreateFileOrFolder(operations, true, token, undoInfo);
    }
    createFolder(operations, token, undoInfo) {
        return this.doCreateFileOrFolder(operations, false, token, undoInfo);
    }
    async doCreateFileOrFolder(operations, isFile, token, undoInfo) {
        if (operations.length === 0) {
            return [];
        }
        // validate create operation before starting
        if (isFile) {
            const validateCreates = await Promises.settled(operations.map(operation => this.fileService.canCreateFile(operation.resource, { overwrite: operation.overwrite })));
            const error = validateCreates.find(validateCreate => validateCreate instanceof Error);
            if (error instanceof Error) {
                throw error;
            }
        }
        // file operation participant
        const files = operations.map(operation => ({ target: operation.resource }));
        await this.runFileOperationParticipants(files, 0 /* FileOperation.CREATE */, undoInfo, token);
        // before events
        const event = { correlationId: this.correlationIds++, operation: 0 /* FileOperation.CREATE */, files };
        await this._onWillRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
        // now actually create on disk
        let stats;
        try {
            if (isFile) {
                stats = await Promises.settled(operations.map(operation => this.fileService.createFile(operation.resource, operation.contents, { overwrite: operation.overwrite })));
            }
            else {
                stats = await Promises.settled(operations.map(operation => this.fileService.createFolder(operation.resource)));
            }
        }
        catch (error) {
            // error event
            await this._onDidFailWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
            throw error;
        }
        // after event
        await this._onDidRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
        return stats;
    }
    async move(operations, token, undoInfo) {
        return this.doMoveOrCopy(operations, true, token, undoInfo);
    }
    async copy(operations, token, undoInfo) {
        return this.doMoveOrCopy(operations, false, token, undoInfo);
    }
    async doMoveOrCopy(operations, move, token, undoInfo) {
        const stats = [];
        // validate move/copy operation before starting
        for (const { file: { source, target }, overwrite } of operations) {
            const validateMoveOrCopy = await (move ? this.fileService.canMove(source, target, overwrite) : this.fileService.canCopy(source, target, overwrite));
            if (validateMoveOrCopy instanceof Error) {
                throw validateMoveOrCopy;
            }
        }
        // file operation participant
        const files = operations.map(o => o.file);
        await this.runFileOperationParticipants(files, move ? 2 /* FileOperation.MOVE */ : 3 /* FileOperation.COPY */, undoInfo, token);
        // before event
        const event = { correlationId: this.correlationIds++, operation: move ? 2 /* FileOperation.MOVE */ : 3 /* FileOperation.COPY */, files };
        await this._onWillRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
        try {
            for (const { file: { source, target }, overwrite } of operations) {
                // if source and target are not equal, handle dirty working copies
                // depending on the operation:
                // - move: revert both source and target (if any)
                // - copy: revert target (if any)
                if (!this.uriIdentityService.extUri.isEqual(source, target)) {
                    const dirtyWorkingCopies = (move ? [...this.getDirty(source), ...this.getDirty(target)] : this.getDirty(target));
                    await Promises.settled(dirtyWorkingCopies.map(dirtyWorkingCopy => dirtyWorkingCopy.revert({ soft: true })));
                }
                // now we can rename the source to target via file operation
                if (move) {
                    stats.push(await this.fileService.move(source, target, overwrite));
                }
                else {
                    stats.push(await this.fileService.copy(source, target, overwrite));
                }
            }
        }
        catch (error) {
            // error event
            await this._onDidFailWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
            throw error;
        }
        // after event
        await this._onDidRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
        return stats;
    }
    async delete(operations, token, undoInfo) {
        // validate delete operation before starting
        for (const operation of operations) {
            const validateDelete = await this.fileService.canDelete(operation.resource, { recursive: operation.recursive, useTrash: operation.useTrash });
            if (validateDelete instanceof Error) {
                throw validateDelete;
            }
        }
        // file operation participant
        const files = operations.map(operation => ({ target: operation.resource }));
        await this.runFileOperationParticipants(files, 1 /* FileOperation.DELETE */, undoInfo, token);
        // before events
        const event = { correlationId: this.correlationIds++, operation: 1 /* FileOperation.DELETE */, files };
        await this._onWillRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
        // check for any existing dirty working copies for the resource
        // and do a soft revert before deleting to be able to close
        // any opened editor with these working copies
        for (const operation of operations) {
            const dirtyWorkingCopies = this.getDirty(operation.resource);
            await Promises.settled(dirtyWorkingCopies.map(dirtyWorkingCopy => dirtyWorkingCopy.revert({ soft: true })));
        }
        // now actually delete from disk
        try {
            for (const operation of operations) {
                await this.fileService.del(operation.resource, { recursive: operation.recursive, useTrash: operation.useTrash });
            }
        }
        catch (error) {
            // error event
            await this._onDidFailWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
            throw error;
        }
        // after event
        await this._onDidRunWorkingCopyFileOperation.fireAsync(event, CancellationToken.None /* intentional: we currently only forward cancellation to participants */);
    }
    addFileOperationParticipant(participant) {
        return this.fileOperationParticipants.addFileOperationParticipant(participant);
    }
    runFileOperationParticipants(files, operation, undoInfo, token) {
        return this.fileOperationParticipants.participate(files, operation, undoInfo, token);
    }
    get hasSaveParticipants() { return this.saveParticipants.length > 0; }
    addSaveParticipant(participant) {
        return this.saveParticipants.addSaveParticipant(participant);
    }
    runSaveParticipants(workingCopy, context, progress, token) {
        return this.saveParticipants.participate(workingCopy, context, progress, token);
    }
    registerWorkingCopyProvider(provider) {
        const remove = insert(this.workingCopyProviders, provider);
        return toDisposable(remove);
    }
    getDirty(resource) {
        const dirtyWorkingCopies = new Set();
        for (const provider of this.workingCopyProviders) {
            for (const workingCopy of provider(resource)) {
                if (workingCopy.isDirty()) {
                    dirtyWorkingCopies.add(workingCopy);
                }
            }
        }
        return Array.from(dirtyWorkingCopies);
    }
};
WorkingCopyFileService = __decorate([
    __param(0, IFileService),
    __param(1, IWorkingCopyService),
    __param(2, IInstantiationService),
    __param(3, IUriIdentityService)
], WorkingCopyFileService);
export { WorkingCopyFileService };
registerSingleton(IWorkingCopyFileService, WorkingCopyFileService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDcEgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBUyxZQUFZLEVBQWMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBd0MsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUkvRixPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdqRyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQTBCLHdCQUF3QixDQUFDLENBQUM7QUF5UW5HLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXVCLFNBQVEsVUFBVTtJQW1CckQsWUFD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