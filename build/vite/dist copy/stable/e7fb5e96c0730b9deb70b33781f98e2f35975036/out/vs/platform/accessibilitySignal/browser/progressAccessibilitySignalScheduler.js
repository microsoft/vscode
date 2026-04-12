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
import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from './accessibilitySignalService.js';
const PROGRESS_SIGNAL_LOOP_DELAY = 5000;
/**
 * Schedules a signal to play while progress is happening.
 */
let AccessibilityProgressSignalScheduler = class AccessibilityProgressSignalScheduler extends Disposable {
    constructor(msDelayTime, msLoopTime, _accessibilitySignalService) {
        super();
        this._accessibilitySignalService = _accessibilitySignalService;
        this._scheduler = this._register(new RunOnceScheduler(() => {
            this._signalLoop = this._accessibilitySignalService.playSignalLoop(AccessibilitySignal.progress, msLoopTime ?? PROGRESS_SIGNAL_LOOP_DELAY);
        }, msDelayTime));
        this._scheduler.schedule();
    }
    dispose() {
        super.dispose();
        this._signalLoop?.dispose();
        this._scheduler.dispose();
    }
};
AccessibilityProgressSignalScheduler = __decorate([
    __param(2, IAccessibilitySignalService)
], AccessibilityProgressSignalScheduler);
export { AccessibilityProgressSignalScheduler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsU2NoZWR1bGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL3Byb2dyZXNzQWNjZXNzaWJpbGl0eVNpZ25hbFNjaGVkdWxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFbkcsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUM7QUFFeEM7O0dBRUc7QUFDSSxJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7SUFHbkUsWUFBWSxXQUFtQixFQUFFLFVBQThCLEVBQWdELDJCQUF3RDtRQUN0SyxLQUFLLEVBQUUsQ0FBQztRQURzRyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQTZCO1FBRXRLLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUMxRCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsUUFBUSxFQUFFLFVBQVUsSUFBSSwwQkFBMEIsQ0FBQyxDQUFDO1FBQzVJLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUNRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzNCLENBQUM7Q0FDRCxDQUFBO0FBZlksb0NBQW9DO0lBR2tCLFdBQUEsMkJBQTJCLENBQUE7R0FIakYsb0NBQW9DLENBZWhEIn0=