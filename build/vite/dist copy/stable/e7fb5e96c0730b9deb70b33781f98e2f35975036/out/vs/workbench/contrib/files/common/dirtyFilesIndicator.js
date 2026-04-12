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
import * as nls from '../../../../nls.js';
import { VIEWLET_ID } from './files.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
let DirtyFilesIndicator = class DirtyFilesIndicator extends Disposable {
    static { this.ID = 'workbench.contrib.dirtyFilesIndicator'; }
    constructor(activityService, workingCopyService, filesConfigurationService) {
        super();
        this.activityService = activityService;
        this.workingCopyService = workingCopyService;
        this.filesConfigurationService = filesConfigurationService;
        this.badgeHandle = this._register(new MutableDisposable());
        this.lastKnownDirtyCount = 0;
        this.updateActivityBadge();
        this.registerListeners();
    }
    registerListeners() {
        // Working copy dirty indicator
        this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onWorkingCopyDidChangeDirty(workingCopy)));
    }
    onWorkingCopyDidChangeDirty(workingCopy) {
        const gotDirty = workingCopy.isDirty();
        if (gotDirty && !(workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
            return; // do not indicate dirty of working copies that are auto saved after short delay
        }
        if (gotDirty || this.lastKnownDirtyCount > 0) {
            this.updateActivityBadge();
        }
    }
    updateActivityBadge() {
        const dirtyCount = this.lastKnownDirtyCount = this.workingCopyService.dirtyCount;
        // Indicate dirty count in badge if any
        if (dirtyCount > 0) {
            this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, {
                badge: new NumberBadge(dirtyCount, num => num === 1 ? nls.localize('dirtyFile', "1 unsaved file") : nls.localize('dirtyFiles', "{0} unsaved files", dirtyCount)),
            });
        }
        else {
            this.badgeHandle.clear();
        }
    }
};
DirtyFilesIndicator = __decorate([
    __param(0, IActivityService),
    __param(1, IWorkingCopyService),
    __param(2, IFilesConfigurationService)
], DirtyFilesIndicator);
export { DirtyFilesIndicator };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlydHlGaWxlc0luZGljYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2NvbW1vbi9kaXJ0eUZpbGVzSW5kaWNhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN4QyxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRS9HLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTthQUVsQyxPQUFFLEdBQUcsdUNBQXVDLEFBQTFDLENBQTJDO0lBTTdELFlBQ21CLGVBQWtELEVBQy9DLGtCQUF3RCxFQUNqRCx5QkFBc0U7UUFFbEcsS0FBSyxFQUFFLENBQUM7UUFKMkIsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBQzlCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDaEMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQVBsRixnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFFL0Qsd0JBQW1CLEdBQUcsQ0FBQyxDQUFDO1FBUy9CLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRTNCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxpQkFBaUI7UUFFeEIsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4SCxDQUFDO0lBRU8sMkJBQTJCLENBQUMsV0FBeUI7UUFDNUQsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3ZDLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsWUFBWSwyQ0FBbUMsQ0FBQyxJQUFJLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUM5SixPQUFPLENBQUMsZ0ZBQWdGO1FBQ3pGLENBQUM7UUFFRCxJQUFJLFFBQVEsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDNUIsQ0FBQztJQUNGLENBQUM7SUFFTyxtQkFBbUI7UUFDMUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUM7UUFFakYsdUNBQXVDO1FBQ3ZDLElBQUksVUFBVSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMseUJBQXlCLENBQ3RFLFVBQVUsRUFDVjtnQkFDQyxLQUFLLEVBQUUsSUFBSSxXQUFXLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDaEssQ0FDRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDOztBQW5EVyxtQkFBbUI7SUFTN0IsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsMEJBQTBCLENBQUE7R0FYaEIsbUJBQW1CLENBb0QvQiJ9