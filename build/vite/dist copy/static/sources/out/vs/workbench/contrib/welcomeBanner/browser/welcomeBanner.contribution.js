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
var WelcomeBannerContribution_1;
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
let WelcomeBannerContribution = class WelcomeBannerContribution {
    static { WelcomeBannerContribution_1 = this; }
    static { this.WELCOME_BANNER_DISMISSED_KEY = 'workbench.banner.welcome.dismissed'; }
    constructor(bannerService, storageService, environmentService) {
        const welcomeBanner = environmentService.options?.welcomeBanner;
        if (!welcomeBanner) {
            return; // welcome banner is not enabled
        }
        if (storageService.getBoolean(WelcomeBannerContribution_1.WELCOME_BANNER_DISMISSED_KEY, 0 /* StorageScope.PROFILE */, false)) {
            return; // welcome banner dismissed
        }
        let icon = undefined;
        if (typeof welcomeBanner.icon === 'string') {
            icon = ThemeIcon.fromId(welcomeBanner.icon);
        }
        else if (welcomeBanner.icon) {
            icon = URI.revive(welcomeBanner.icon);
        }
        bannerService.show({
            id: 'welcome.banner',
            message: welcomeBanner.message,
            icon,
            actions: welcomeBanner.actions,
            onClose: () => {
                storageService.store(WelcomeBannerContribution_1.WELCOME_BANNER_DISMISSED_KEY, true, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            }
        });
    }
};
WelcomeBannerContribution = WelcomeBannerContribution_1 = __decorate([
    __param(0, IBannerService),
    __param(1, IStorageService),
    __param(2, IBrowserWorkbenchEnvironmentService)
], WelcomeBannerContribution);
Registry.as(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(WelcomeBannerContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VsY29tZUJhbm5lci5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lQmFubmVyL2Jyb3dzZXIvd2VsY29tZUJhbm5lci5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixFQUFtQyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBeUI7O2FBRU4saUNBQTRCLEdBQUcsb0NBQW9DLEFBQXZDLENBQXdDO0lBRTVGLFlBQ2lCLGFBQTZCLEVBQzVCLGNBQStCLEVBQ1gsa0JBQXVEO1FBRTVGLE1BQU0sYUFBYSxHQUFHLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUM7UUFDaEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxnQ0FBZ0M7UUFDekMsQ0FBQztRQUVELElBQUksY0FBYyxDQUFDLFVBQVUsQ0FBQywyQkFBeUIsQ0FBQyw0QkFBNEIsZ0NBQXdCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEgsT0FBTyxDQUFDLDJCQUEyQjtRQUNwQyxDQUFDO1FBRUQsSUFBSSxJQUFJLEdBQWdDLFNBQVMsQ0FBQztRQUNsRCxJQUFJLE9BQU8sYUFBYSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QyxJQUFJLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLElBQUksYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQy9CLElBQUksR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBRUQsYUFBYSxDQUFDLElBQUksQ0FBQztZQUNsQixFQUFFLEVBQUUsZ0JBQWdCO1lBQ3BCLE9BQU8sRUFBRSxhQUFhLENBQUMsT0FBTztZQUM5QixJQUFJO1lBQ0osT0FBTyxFQUFFLGFBQWEsQ0FBQyxPQUFPO1lBQzlCLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2IsY0FBYyxDQUFDLEtBQUssQ0FBQywyQkFBeUIsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLDhEQUE4QyxDQUFDO1lBQ2pJLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDOztBQWxDSSx5QkFBeUI7SUFLNUIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUNBQW1DLENBQUE7R0FQaEMseUJBQXlCLENBbUM5QjtBQUVELFFBQVEsQ0FBQyxFQUFFLENBQWtDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQztLQUN6RSw2QkFBNkIsQ0FBQyx5QkFBeUIsa0NBQTBCLENBQUMifQ==