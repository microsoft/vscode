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
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { arch, platform } from '../../../../base/common/process.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/arrays.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
const POLLING_INTERVAL = 60 * 60 * 1000; // 1 hour
const BANNER_ID = 'emergencyAlert.banner';
let EmergencyAlert = class EmergencyAlert extends Disposable {
    static { this.ID = 'workbench.contrib.emergencyAlert'; }
    constructor(bannerService, requestService, productService, logService) {
        super();
        this.bannerService = bannerService;
        this.requestService = requestService;
        this.productService = productService;
        this.logService = logService;
        const emergencyAlertUrl = productService.emergencyAlertUrl;
        if (!emergencyAlertUrl) {
            return; // no emergency alert configured
        }
        this.fetchAlerts(emergencyAlertUrl);
        const pollingTimer = this._register(new IntervalTimer());
        pollingTimer.cancelAndSet(() => this.fetchAlerts(emergencyAlertUrl), POLLING_INTERVAL, mainWindow);
    }
    async fetchAlerts(url) {
        try {
            await this.doFetchAlerts(url);
        }
        catch (e) {
            this.logService.error(e);
        }
    }
    async doFetchAlerts(url) {
        const requestResult = await this.requestService.request({ type: 'GET', url, disableCache: true, timeout: 20000, callSite: 'emergencyAlert.doFetchAlerts' }, CancellationToken.None);
        if (requestResult.res.statusCode !== 200) {
            throw new Error(`Failed to fetch emergency alerts: HTTP ${requestResult.res.statusCode}`);
        }
        const emergencyAlerts = await asJson(requestResult);
        if (!emergencyAlerts || !Array.isArray(emergencyAlerts.alerts)) {
            this.dismissAlert();
            return;
        }
        // Find the first matching alert
        const matchingAlert = emergencyAlerts.alerts.find(alert => alert.commit === this.productService.commit &&
            (!alert.platform || alert.platform === platform) &&
            (!alert.arch || alert.arch === arch));
        if (!matchingAlert) {
            // No matching alert, dismiss the banner if it was shown
            this.dismissAlert();
            return;
        }
        // Don't update the banner if message and actions didn't change
        if (this.currentAlertMessage === matchingAlert.message &&
            equals(this.currentAlertActions ?? [], matchingAlert.actions ?? [], (a, b) => a.label === b.label && a.href === b.href)) {
            return;
        }
        this.currentAlertMessage = matchingAlert.message;
        this.currentAlertActions = matchingAlert.actions;
        this.bannerService.show({
            id: BANNER_ID,
            icon: Codicon.warning,
            message: matchingAlert.message,
            actions: matchingAlert.actions
        });
    }
    dismissAlert() {
        if (this.currentAlertMessage !== undefined) {
            this.currentAlertMessage = undefined;
            this.currentAlertActions = undefined;
            this.bannerService.hide(BANNER_ID);
        }
    }
};
EmergencyAlert = __decorate([
    __param(0, IBannerService),
    __param(1, IRequestService),
    __param(2, IProductService),
    __param(3, ILogService)
], EmergencyAlert);
export { EmergencyAlert };
registerWorkbenchContribution2(EmergencyAlert.ID, EmergencyAlert, 4 /* WorkbenchPhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1lcmdlbmN5QWxlcnQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZW1lcmdlbmN5QWxlcnQvZWxlY3Ryb24tYnJvd3Nlci9lbWVyZ2VuY3lBbGVydC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkYsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQWlCaEUsTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVM7QUFDbEQsTUFBTSxTQUFTLEdBQUcsdUJBQXVCLENBQUM7QUFFbkMsSUFB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