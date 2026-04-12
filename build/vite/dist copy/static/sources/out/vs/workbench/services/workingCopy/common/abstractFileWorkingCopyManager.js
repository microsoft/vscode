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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Promises } from '../../../../base/common/async.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
let BaseFileWorkingCopyManager = class BaseFileWorkingCopyManager extends Disposable {
    constructor(fileService, logService, workingCopyBackupService) {
        super();
        this.fileService = fileService;
        this.logService = logService;
        this.workingCopyBackupService = workingCopyBackupService;
        this._onDidCreate = this._register(new Emitter());
        this.onDidCreate = this._onDidCreate.event;
        this.mapResourceToWorkingCopy = new ResourceMap();
        this.mapResourceToDisposeListener = new ResourceMap();
    }
    has(resource) {
        return this.mapResourceToWorkingCopy.has(resource);
    }
    add(resource, workingCopy) {
        const knownWorkingCopy = this.get(resource);
        if (knownWorkingCopy === workingCopy) {
            return; // already cached
        }
        // Add to our working copy map
        this.mapResourceToWorkingCopy.set(resource, workingCopy);
        // Update our dispose listener to remove it on dispose
        this.mapResourceToDisposeListener.get(resource)?.dispose();
        this.mapResourceToDisposeListener.set(resource, workingCopy.onWillDispose(() => this.remove(resource)));
        // Signal creation event
        this._onDidCreate.fire(workingCopy);
    }
    remove(resource) {
        // Dispose any existing listener
        const disposeListener = this.mapResourceToDisposeListener.get(resource);
        if (disposeListener) {
            dispose(disposeListener);
            this.mapResourceToDisposeListener.delete(resource);
        }
        // Remove from our working copy map
        return this.mapResourceToWorkingCopy.delete(resource);
    }
    //#region Get / Get all
    get workingCopies() {
        return [...this.mapResourceToWorkingCopy.values()];
    }
    get(resource) {
        return this.mapResourceToWorkingCopy.get(resource);
    }
    //#endregion
    //#region Lifecycle
    dispose() {
        super.dispose();
        // Clear working copy caches
        //
        // Note: we are not explicitly disposing the working copies
        // known to the manager because this can have unwanted side
        // effects such as backups getting discarded once the working
        // copy unregisters. We have an explicit `destroy`
        // for that purpose (https://github.com/microsoft/vscode/pull/123555)
        //
        this.mapResourceToWorkingCopy.clear();
        // Dispose the dispose listeners
        dispose(this.mapResourceToDisposeListener.values());
        this.mapResourceToDisposeListener.clear();
    }
    async destroy() {
        // Make sure all dirty working copies are saved to disk
        try {
            await Promises.settled(this.workingCopies.map(async (workingCopy) => {
                if (workingCopy.isDirty()) {
                    await this.saveWithFallback(workingCopy);
                }
            }));
        }
        catch (error) {
            this.logService.error(error);
        }
        // Dispose all working copies
        dispose(this.mapResourceToWorkingCopy.values());
        // Finally dispose manager
        this.dispose();
    }
    async saveWithFallback(workingCopy) {
        // First try regular save
        let saveSuccess = false;
        try {
            saveSuccess = await workingCopy.save();
        }
        catch (error) {
            // Ignore
        }
        // Then fallback to backup if that exists
        if (!saveSuccess || workingCopy.isDirty()) {
            const backup = await this.workingCopyBackupService.resolve(workingCopy);
            if (backup) {
                await this.fileService.writeFile(workingCopy.resource, backup.value, { unlock: true });
            }
        }
    }
};
BaseFileWorkingCopyManager = __decorate([
    __param(0, IFileService),
    __param(1, ILogService),
    __param(2, IWorkingCopyBackupService)
], BaseFileWorkingCopyManager);
export { BaseFileWorkingCopyManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9hYnN0cmFjdEZpbGVXb3JraW5nQ29weU1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBa0M1RCxJQUFlLDBCQUEwQixHQUF6QyxNQUFlLDBCQUEyRixTQUFRLFVBQVU7SUFRbEksWUFDZSxXQUE0QyxFQUM3QyxVQUEwQyxFQUM1Qix3QkFBc0U7UUFFakcsS0FBSyxFQUFFLENBQUM7UUFKeUIsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDMUIsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNULDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMkI7UUFUakYsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFLLENBQUMsQ0FBQztRQUN4RCxnQkFBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBRTlCLDZCQUF3QixHQUFHLElBQUksV0FBVyxFQUFLLENBQUM7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