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
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILifecycleMainService, } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { IUserDataProfilesMainService } from './userDataProfile.js';
import { toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
let UserDataProfilesHandler = class UserDataProfilesHandler extends Disposable {
    constructor(lifecycleMainService, userDataProfilesService, windowsMainService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this.windowsMainService = windowsMainService;
        this._register(lifecycleMainService.onWillLoadWindow(e => {
            if (e.reason === 2 /* LoadReason.LOAD */) {
                this.unsetProfileForWorkspace(e.window);
            }
        }));
        this._register(lifecycleMainService.onBeforeCloseWindow(window => this.unsetProfileForWorkspace(window)));
        this._register(new RunOnceScheduler(() => this.cleanUpEmptyWindowAssociations(), 30 * 1000 /* after 30s */)).schedule();
    }
    async unsetProfileForWorkspace(window) {
        const workspace = this.getWorkspace(window);
        const profile = this.userDataProfilesService.getProfileForWorkspace(workspace);
        if (profile?.isTransient) {
            this.userDataProfilesService.unsetWorkspace(workspace, profile.isTransient);
            if (profile.isTransient) {
                await this.userDataProfilesService.cleanUpTransientProfiles();
            }
        }
    }
    getWorkspace(window) {
        return window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost);
    }
    cleanUpEmptyWindowAssociations() {
        const associatedEmptyWindows = this.userDataProfilesService.getAssociatedEmptyWindows();
        if (associatedEmptyWindows.length === 0) {
            return;
        }
        const openedWorkspaces = this.windowsMainService.getWindows().map(window => this.getWorkspace(window));
        for (const associatedEmptyWindow of associatedEmptyWindows) {
            if (openedWorkspaces.some(openedWorkspace => openedWorkspace.id === associatedEmptyWindow.id)) {
                continue;
            }
            this.userDataProfilesService.unsetWorkspace(associatedEmptyWindow, false);
        }
    }
};
UserDataProfilesHandler = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IUserDataProfilesMainService),
    __param(2, IWindowsMainService)
], UserDataProfilesHandler);
export { UserDataProfilesHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlc0hhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGVzSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixHQUFHLE1BQU0sdURBQXVELENBQUM7QUFFL0YsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDcEUsT0FBTyxFQUEyQixxQkFBcUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXRFLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsVUFBVTtJQUV0RCxZQUN3QixvQkFBMkMsRUFDbkIsdUJBQXFELEVBQzlELGtCQUF1QztRQUU3RSxLQUFLLEVBQUUsQ0FBQztRQUh1Qyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQThCO1FBQzlELHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFHN0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN4RCxJQUFJLENBQUMsQ0FBQyxNQUFNLDRCQUFvQixFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pILENBQUM7SUFFTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsTUFBbUI7UUFDekQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0UsSUFBSSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzVFLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN6QixNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQy9ELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVPLFlBQVksQ0FBQyxNQUFtQjtRQUN2QyxPQUFPLE1BQU0sQ0FBQyxlQUFlLElBQUkscUJBQXFCLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsMEJBQTBCLENBQUMsQ0FBQztJQUM5RyxDQUFDO0lBRU8sOEJBQThCO1FBQ3JDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDeEYsSUFBSSxzQkFBc0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekMsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDdkcsS0FBSyxNQUFNLHFCQUFxQixJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDNUQsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsRUFBRSxLQUFLLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQy9GLFNBQVM7WUFDVixDQUFDO1lBQ0QsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRSxDQUFDO0lBQ0YsQ0FBQztDQUVELENBQUE7QUE5Q1ksdUJBQXVCO0lBR2pDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSw0QkFBNEIsQ0FBQTtJQUM1QixXQUFBLG1CQUFtQixDQUFBO0dBTFQsdUJBQXVCLENBOENuQyJ9