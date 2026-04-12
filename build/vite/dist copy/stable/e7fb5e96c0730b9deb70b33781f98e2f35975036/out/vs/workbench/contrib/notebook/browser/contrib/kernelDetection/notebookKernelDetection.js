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
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../../../common/contributions.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
let NotebookKernelDetection = class NotebookKernelDetection extends Disposable {
    constructor(_notebookKernelService, _extensionService, _notebookLoggingService) {
        super();
        this._notebookKernelService = _notebookKernelService;
        this._extensionService = _extensionService;
        this._notebookLoggingService = _notebookLoggingService;
        this._detectionMap = new Map();
        this._localDisposableStore = this._register(new DisposableStore());
        this._registerListeners();
    }
    _registerListeners() {
        this._localDisposableStore.clear();
        this._localDisposableStore.add(this._extensionService.onWillActivateByEvent(e => {
            if (e.event.startsWith('onNotebook:')) {
                if (this._extensionService.activationEventIsDone(e.event)) {
                    return;
                }
                // parse the event to get the notebook type
                const notebookType = e.event.substring('onNotebook:'.length);
                if (notebookType === '*') {
                    // ignore
                    return;
                }
                let shouldStartDetection = false;
                const extensionStatus = this._extensionService.getExtensionsStatus();
                this._extensionService.extensions.forEach(extension => {
                    if (extensionStatus[extension.identifier.value].activationTimes) {
                        // already activated
                        return;
                    }
                    if (extension.activationEvents?.includes(e.event)) {
                        shouldStartDetection = true;
                    }
                });
                if (shouldStartDetection && !this._detectionMap.has(notebookType)) {
                    this._notebookLoggingService.debug('KernelDetection', `start extension activation for ${notebookType}`);
                    const task = this._notebookKernelService.registerNotebookKernelDetectionTask({
                        notebookType: notebookType
                    });
                    this._detectionMap.set(notebookType, task);
                }
            }
        }));
        let timer = null;
        this._localDisposableStore.add(this._extensionService.onDidChangeExtensionsStatus(() => {
            if (timer) {
                clearTimeout(timer);
            }
            // activation state might not be updated yet, postpone to next frame
            timer = setTimeout(() => {
                const taskToDelete = [];
                for (const [notebookType, task] of this._detectionMap) {
                    if (this._extensionService.activationEventIsDone(`onNotebook:${notebookType}`)) {
                        this._notebookLoggingService.debug('KernelDetection', `finish extension activation for ${notebookType}`);
                        taskToDelete.push(notebookType);
                        task.dispose();
                    }
                }
                taskToDelete.forEach(notebookType => {
                    this._detectionMap.delete(notebookType);
                });
            });
        }));
        this._localDisposableStore.add({
            dispose: () => {
                if (timer) {
                    clearTimeout(timer);
                }
            }
        });
    }
};
NotebookKernelDetection = __decorate([
    __param(0, INotebookKernelService),
    __param(1, IExtensionService),
    __param(2, INotebookLoggingService)
], NotebookKernelDetection);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookKernelDetection, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxEZXRlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIva2VybmVsRGV0ZWN0aW9uL25vdGVib29rS2VybmVsRGV0ZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDdEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ2xGLE9BQU8sRUFBMkQsVUFBVSxJQUFJLG1CQUFtQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEosT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFHNUYsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO0lBSS9DLFlBQ3lCLHNCQUErRCxFQUNwRSxpQkFBcUQsRUFDL0MsdUJBQWlFO1FBRTFGLEtBQUssRUFBRSxDQUFDO1FBSmlDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFDbkQsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUM5Qiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQXlCO1FBTm5GLGtCQUFhLEdBQUcsSUFBSSxHQUFHLEVBQXVCLENBQUM7UUFDdEMsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFTOUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVPLGtC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