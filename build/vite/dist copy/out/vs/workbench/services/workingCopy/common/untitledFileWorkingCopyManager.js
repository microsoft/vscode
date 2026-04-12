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
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { UntitledFileWorkingCopy } from './untitledFileWorkingCopy.js';
import { Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { BaseFileWorkingCopyManager } from './abstractFileWorkingCopyManager.js';
import { ResourceMap } from '../../../../base/common/map.js';
let UntitledFileWorkingCopyManager = class UntitledFileWorkingCopyManager extends BaseFileWorkingCopyManager {
    constructor(workingCopyTypeId, modelFactory, saveDelegate, fileService, labelService, logService, workingCopyBackupService, workingCopyService) {
        super(fileService, logService, workingCopyBackupService);
        this.workingCopyTypeId = workingCopyTypeId;
        this.modelFactory = modelFactory;
        this.saveDelegate = saveDelegate;
        this.labelService = labelService;
        this.workingCopyService = workingCopyService;
        //#region Events
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        //#endregion
        this.mapResourceToWorkingCopyListeners = new ResourceMap();
    }
    async resolve(options) {
        const workingCopy = this.doCreateOrGet(options);
        await workingCopy.resolve();
        return workingCopy;
    }
    doCreateOrGet(options = Object.create(null)) {
        const massagedOptions = this.massageOptions(options);
        // Return existing instance if asked for it
        if (massagedOptions.untitledResource) {
            const existingWorkingCopy = this.get(massagedOptions.untitledResource);
            if (existingWorkingCopy) {
                return existingWorkingCopy;
            }
        }
        // Create new instance otherwise
        return this.doCreate(massagedOptions);
    }
    massageOptions(options) {
        const massagedOptions = Object.create(null);
        // Handle associated resource
        if (options.associatedResource) {
            massagedOptions.untitledResource = URI.from({
                scheme: Schemas.untitled,
                authority: options.associatedResource.authority,
                fragment: options.associatedResource.fragment,
                path: options.associatedResource.path,
                query: options.associatedResource.query
            });
            massagedOptions.associatedResource = options.associatedResource;
        }
        // Handle untitled resource
        else {
            if (options.untitledResource?.scheme === Schemas.untitled) {
                massagedOptions.untitledResource = options.untitledResource;
            }
            massagedOptions.isScratchpad = options.isScratchpad;
        }
        // Take over initial value
        massagedOptions.contents = options.contents;
        return massagedOptions;
    }
    doCreate(options) {
        // Create a new untitled resource if none is provided
        let untitledResource = options.untitledResource;
        if (!untitledResource) {
            let counter = 1;
            do {
                untitledResource = URI.from({
                    scheme: Schemas.untitled,
                    path: options.isScratchpad ? `Scratchpad-${counter}` : `Untitled-${counter}`,
                    query: this.workingCopyTypeId ?
                        `typeId=${this.workingCopyTypeId}` : // distinguish untitled resources among others by encoding the `typeId` as query param
                        undefined // keep untitled resources for text files as they are (when `typeId === ''`)
                });
                counter++;
            } while (this.has(untitledResource));
        }
        // Create new working copy with provided options
        const workingCopy = new UntitledFileWorkingCopy(this.workingCopyTypeId, untitledResource, this.labelService.getUriBasenameLabel(untitledResource), !!options.associatedResource, !!options.isScratchpad, options.contents, this.modelFactory, this.saveDelegate, this.workingCopyService, this.workingCopyBackupService, this.logService);
        // Register
        this.registerWorkingCopy(workingCopy);
        return workingCopy;
    }
    registerWorkingCopy(workingCopy) {
        // Install working copy listeners
        const workingCopyListeners = new DisposableStore();
        workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
        workingCopyListeners.add(workingCopy.onWillDispose(() => this._onWillDispose.fire(workingCopy)));
        // Keep for disposal
        this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);
        // Add to cache
        this.add(workingCopy.resource, workingCopy);
        // If the working copy is dirty right from the beginning,
        // make sure to emit this as an event
        if (workingCopy.isDirty()) {
            this._onDidChangeDirty.fire(workingCopy);
        }
    }
    remove(resource) {
        const removed = super.remove(resource);
        // Dispose any existing working copy listeners
        const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
        if (workingCopyListener) {
            dispose(workingCopyListener);
            this.mapResourceToWorkingCopyListeners.delete(resource);
        }
        return removed;
    }
    //#endregion
    //#region Lifecycle
    dispose() {
        super.dispose();
        // Dispose the working copy change listeners
        dispose(this.mapResourceToWorkingCopyListeners.values());
        this.mapResourceToWorkingCopyListeners.clear();
    }
    //#endregion
    notifyDidSave(source, target) {
        this._onDidSave.fire({ source, target });
    }
};
UntitledFileWorkingCopyManager = __decorate([
    __param(3, IFileService),
    __param(4, ILabelService),
    __param(5, ILogService),
    __param(6, IWorkingCopyBackupService),
    __param(7, IWorkingCopyService)
], UntitledFileWorkingCopyManager);
export { UntitledFileWorkingCopyManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi91bnRpdGxlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFnTCx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JQLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNuRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLDBCQUEwQixFQUErQixNQUFNLHFDQUFxQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQWdIdEQsSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBd0UsU0FBUSwwQkFBMEQ7SUFpQnRKLFlBQ2tCLGlCQUF5QixFQUN6QixZQUFxRCxFQUNyRCxZQUFxRCxFQUN4RCxXQUF5QixFQUN4QixZQUE0QyxF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