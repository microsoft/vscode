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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IDebugService } from './debug.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
let DebugLifecycle = class DebugLifecycle {
    constructor(lifecycleService, debugService, configurationService, dialogService) {
        this.debugService = debugService;
        this.configurationService = configurationService;
        this.dialogService = dialogService;
        this.disposable = lifecycleService.onBeforeShutdown(async (e) => e.veto(this.shouldVetoShutdown(e.reason), 'veto.debug'));
    }
    shouldVetoShutdown(_reason) {
        const rootSessions = this.debugService.getModel().getSessions().filter(s => s.parentSession === undefined);
        if (rootSessions.length === 0) {
            return false;
        }
        const shouldConfirmOnExit = this.configurationService.getValue('debug').confirmOnExit;
        if (shouldConfirmOnExit === 'never') {
            return false;
        }
        return this.showWindowCloseConfirmation(rootSessions.length);
    }
    dispose() {
        return this.disposable.dispose();
    }
    async showWindowCloseConfirmation(numSessions) {
        let message;
        if (numSessions === 1) {
            message = nls.localize('debug.debugSessionCloseConfirmationSingular', "There is an active debug session, are you sure you want to stop it?");
        }
        else {
            message = nls.localize('debug.debugSessionCloseConfirmationPlural', "There are active debug sessions, are you sure you want to stop them?");
        }
        const res = await this.dialogService.confirm({
            message,
            type: 'warning',
            primaryButton: nls.localize({ key: 'debug.stop', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging")
        });
        return !res.confirmed;
    }
};
DebugLifecycle = __decorate([
    __param(0, ILifecycleService),
    __param(1, IDebugService),
    __param(2, IConfigurationService),
    __param(3, IDialogService)
], DebugLifecycle);
export { DebugLifecycle };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdMaWZlY3ljbGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdMaWZlY3ljbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFaEYsT0FBTyxFQUF1QixhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFrQixNQUFNLGlEQUFpRCxDQUFDO0FBRTdGLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWM7SUFHMUIsWUFDb0IsZ0JBQW1DLEVBQ3RCLFlBQTJCLEVBQ25CLG9CQUEyQyxFQUNsRCxhQUE2QjtRQUY5QixpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUNuQix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ2xELGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUU5RCxJQUFJLENBQUMsVUFBVSxHQUFHLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBQyxDQUFDLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQ3pILENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxPQUF1QjtRQUNqRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLEtBQUssU0FBUyxDQUFDLENBQUM7UUFDM0csSUFBSSxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQy9CLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBc0IsT0FBTyxDQUFDLENBQUMsYUFBYSxDQUFDO1FBQzNHLElBQUksbUJBQW1CLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDckMsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsMkJBQTJCLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFTSxPQUFPO1FBQ2IsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFTyxLQUFLLENBQUMsMkJBQTJCLENBQUMsV0FBbUI7UUFDNUQsSUFBSSxPQUFlLENBQUM7UUFDcEIsSUFBSSxXQUFXLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkIsT0FBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsNkNBQTZDLEVBQUUscUVBQXFFLENBQUMsQ0FBQztRQUM5SSxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLHNFQUFzRSxDQUFDLENBQUM7UUFDN0ksQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7WUFDNUMsT0FBTztZQUNQLElBQUksRUFBRSxTQUFTO1lBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxrQkFBa0IsQ0FBQztTQUMxRyxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0NBQ0QsQ0FBQTtBQTVDWSxjQUFjO0lBSXhCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsY0FBYyxDQUFBO0dBUEosY0FBYyxDQTRDMUIifQ==