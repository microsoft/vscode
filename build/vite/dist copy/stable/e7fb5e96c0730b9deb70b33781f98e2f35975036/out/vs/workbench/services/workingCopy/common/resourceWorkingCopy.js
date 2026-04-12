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
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
let ResourceWorkingCopy = class ResourceWorkingCopy extends Disposable {
    constructor(resource, fileService) {
        super();
        this.resource = resource;
        this.fileService = fileService;
        //#region Orphaned Tracking
        this._onDidChangeOrphaned = this._register(new Emitter());
        this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
        this.orphaned = false;
        //#endregion
        //#region Dispose
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
    }
    isOrphaned() {
        return this.orphaned;
    }
    async onDidFilesChange(e) {
        let fileEventImpactsUs = false;
        let newInOrphanModeGuess;
        // If we are currently orphaned, we check if the file was added back
        if (this.orphaned) {
            const fileWorkingCopyResourceAdded = e.contains(this.resource, 1 /* FileChangeType.ADDED */);
            if (fileWorkingCopyResourceAdded) {
                newInOrphanModeGuess = false;
                fileEventImpactsUs = true;
            }
        }
        // Otherwise we check if the file was deleted
        else {
            const fileWorkingCopyResourceDeleted = e.contains(this.resource, 2 /* FileChangeType.DELETED */);
            if (fileWorkingCopyResourceDeleted) {
                newInOrphanModeGuess = true;
                fileEventImpactsUs = true;
            }
        }
        if (fileEventImpactsUs && this.orphaned !== newInOrphanModeGuess) {
            let newInOrphanModeValidated = false;
            if (newInOrphanModeGuess) {
                // We have received reports of users seeing delete events even though the file still
                // exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
                // Since we do not want to mark the working copy as orphaned, we have to check if the
                // file is really gone and not just a faulty file event.
                await timeout(100, CancellationToken.None);
                if (this.isDisposed()) {
                    newInOrphanModeValidated = true;
                }
                else {
                    const exists = await this.fileService.exists(this.resource);
                    newInOrphanModeValidated = !exists;
                }
            }
            if (this.orphaned !== newInOrphanModeValidated && !this.isDisposed()) {
                this.setOrphaned(newInOrphanModeValidated);
            }
        }
    }
    setOrphaned(orphaned) {
        if (this.orphaned !== orphaned) {
            this.orphaned = orphaned;
            this._onDidChangeOrphaned.fire();
        }
    }
    isDisposed() {
        return this._store.isDisposed;
    }
    dispose() {
        // State
        this.orphaned = false;
        // Event
        this._onWillDispose.fire();
        super.dispose();
    }
    //#endregion
    //#region Modified Tracking
    isModified() {
        return this.isDirty();
    }
};
ResourceWorkingCopy = __decorate([
    __param(1, IFileService)
], ResourceWorkingCopy);
export { ResourceWorkingCopy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2VXb3JraW5nQ29weS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vcmVzb3VyY2VXb3JraW5nQ29weS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRSxPQUFPLEVBQW9DLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBK0JyRyxJQUFlLG1CQUFtQixHQUFsQyxNQUFlLG1CQUFvQixTQUFRLFVBQVU7SUFFM0QsWUFDVSxRQUFhLEVBQ1IsV0FBNEM7UUFFMUQsS0FBSyxFQUFFLENBQUM7UUFIQyxhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQ1csZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFPM0QsMkJBQTJCO1FBRVYseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDbkUsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQztRQUV2RCxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBNER6QixZQUFZO1FBR1osaUJBQWlCO1FBRUEsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUM3RCxrQkFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDO1FBMUVsRCxJQUFJLENBQUMsU0FBUyxDQUFDLElB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