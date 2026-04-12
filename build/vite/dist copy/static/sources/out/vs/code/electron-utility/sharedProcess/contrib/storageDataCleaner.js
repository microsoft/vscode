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
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { Promises } from '../../../../base/node/pfs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { StorageClient } from '../../../../platform/storage/common/storageIpc.js';
import { EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE } from '../../../../platform/workspace/common/workspace.js';
import { NON_EMPTY_WORKSPACE_ID_LENGTH } from '../../../../platform/workspaces/node/workspaces.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { Schemas } from '../../../../base/common/network.js';
let UnusedWorkspaceStorageDataCleaner = class UnusedWorkspaceStorageDataCleaner extends Disposable {
    constructor(environmentService, logService, nativeHostService, mainProcessService) {
        super();
        this.environmentService = environmentService;
        this.logService = logService;
        this.nativeHostService = nativeHostService;
        this.mainProcessService = mainProcessService;
        const scheduler = this._register(new RunOnceScheduler(() => {
            this.cleanUpStorage();
        }, 30 * 1000 /* after 30s */));
        scheduler.schedule();
    }
    async cleanUpStorage() {
        this.logService.trace('[storage cleanup]: Starting to clean up workspace storage folders for unused empty workspaces.');
        try {
            const workspaceStorageHome = this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath;
            const workspaceStorageFolders = await Promises.readdir(workspaceStorageHome);
            const storageClient = new StorageClient(this.mainProcessService.getChannel('storage'));
            await Promise.all(workspaceStorageFolders.map(async (workspaceStorageFolder) => {
                const workspaceStoragePath = join(workspaceStorageHome, workspaceStorageFolder);
                if (workspaceStorageFolder.length === NON_EMPTY_WORKSPACE_ID_LENGTH) {
                    return; // keep workspace storage for folders/workspaces that can be accessed still
                }
                if (workspaceStorageFolder === EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE.id) {
                    return; // keep workspace storage for empty extension development workspaces
                }
                const windows = await this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });
                if (windows.some(window => window.workspace?.id === workspaceStorageFolder)) {
                    return; // keep workspace storage for empty workspaces opened as window
                }
                const isStorageUsed = await storageClient.isUsed(workspaceStoragePath);
                if (isStorageUsed) {
                    return; // keep workspace storage for empty workspaces that are in use
                }
                this.logService.trace(`[storage cleanup]: Deleting workspace storage folder ${workspaceStorageFolder} as it seems to be an unused empty workspace.`);
                await Promises.rm(workspaceStoragePath);
            }));
        }
        catch (error) {
            onUnexpectedError(error);
        }
    }
};
UnusedWorkspaceStorageDataCleaner = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, ILogService),
    __param(2, INativeHostService),
    __param(3, IMainProcessService)
], UnusedWorkspaceStorageDataCleaner);
export { UnusedWorkspaceStorageDataCleaner };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZURhdGFDbGVhbmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvY29kZS9lbGVjdHJvbi11dGlsaXR5L3NoYXJlZFByb2Nlc3MvY29udHJpYi9zdG9yYWdlRGF0YUNsZWFuZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsNENBQTRDLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsSCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdEQsSUFBTSxpQ0FBaUMsR0FBdkMsTUFBTSxpQ0FBa0MsU0FBUSxVQUFVO0lBRWhFLFlBQzZDLGtCQUE2QyxFQUMzRCxVQUF1QixFQUNoQixpQkFBcUMsRUFDcEMsa0JB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