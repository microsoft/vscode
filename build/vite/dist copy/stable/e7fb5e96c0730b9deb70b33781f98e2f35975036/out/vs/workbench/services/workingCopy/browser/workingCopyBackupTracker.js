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
import { IWorkingCopyBackupService } from '../common/workingCopyBackup.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyService } from '../common/workingCopyService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { WorkingCopyBackupTracker } from '../common/workingCopyBackupTracker.js';
import { IWorkingCopyEditorService } from '../common/workingCopyEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
let BrowserWorkingCopyBackupTracker = class BrowserWorkingCopyBackupTracker extends WorkingCopyBackupTracker {
    static { this.ID = 'workbench.contrib.browserWorkingCopyBackupTracker'; }
    constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, logService, workingCopyEditorService, editorService) {
        super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService);
    }
    onFinalBeforeShutdown(reason) {
        // Web: we cannot perform long running in the shutdown phase
        // As such we need to check sync if there are any modified working
        // copies that have not been backed up yet and then prevent the
        // shutdown if that is the case.
        const modifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
        if (!modifiedWorkingCopies.length) {
            return false; // nothing modified: no veto
        }
        if (!this.filesConfigurationService.isHotExitEnabled) {
            return true; // modified without backup: veto
        }
        for (const modifiedWorkingCopy of modifiedWorkingCopies) {
            if (!this.workingCopyBackupService.hasBackupSync(modifiedWorkingCopy, this.getContentVersion(modifiedWorkingCopy))) {
                this.logService.warn('Unload veto: pending backups');
                return true; // modified without backup: veto
            }
        }
        return false; // modified and backed up: no veto
    }
};
BrowserWorkingCopyBackupTracker = __decorate([
    __param(0, IWorkingCopyBackupService),
    __param(1, IFilesConfigurationService),
    __param(2, IWorkingCopyService),
    __param(3, ILifecycleService),
    __param(4, ILogService),
    __param(5, IWorkingCopyEditorService),
    __param(6, IEditorService)
], BrowserWorkingCopyBackupTracker);
export { BrowserWorkingCopyBackupTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2Jyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRS9ELElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQWdDLFNBQVEsd0JBQXdCO2FBRTVELE9BQUUsR0FBRyxtREFBbUQsQUFBdEQsQ0FBdUQ7SUFFekUsWUFDNEIsd0JBQW1ELEVBQ2xELHlCQUFxRCxFQUM1RCxrQkFBdUMsRUFDekMsZ0JBQW1DLEVBQ3pDLFVBQXVCLEVBQ1Qsd0JBQW1ELEVBQzlELGFBQTZCO1FBRTdDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUseUJBQXlCLEVBQUUsd0JBQXdCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDdkosQ0FBQztJQUVTLHFCQUFxQixDQUFDLE1BQXNCO1FBRXJELDREQUE0RDtRQUM1RCxrRUFBa0U7UUFDbEUsK0RBQStEO1FBQy9ELGdDQUFnQztRQUVoQyxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxxQkFBcUIsQ0FBQztRQUM1RSxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkMsT0FBTyxLQUFLLENBQUMsQ0FBQyw0QkFBNEI7UUFDM0MsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN0RCxPQUFPLElBQUksQ0FBQyxDQUFDLGdDQUFnQztRQUM5QyxDQUFDO1FBRUQsS0FBSyxNQUFNLG1CQUFtQixJQUFJLHFCQUFxQixFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLG1CQUFtQixDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNwSCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO2dCQUVyRCxPQUFPLElBQUksQ0FBQyxDQUFDLGdDQUFnQztZQUM5QyxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLENBQUMsa0NBQWtDO0lBQ2pELENBQUM7O0FBekNXLCtCQUErQjtJQUt6QyxXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSx5QkFBeUIsQ0FBQTtJQUN6QixXQUFBLGNBQWMsQ0FBQTtHQVhKLCtCQUErQixDQTBDM0MifQ==