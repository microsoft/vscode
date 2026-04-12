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
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { localize } from '../../../../nls.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
let ExtensionActivationProgress = class ExtensionActivationProgress {
    constructor(extensionService, progressService, logService) {
        const options = {
            location: 10 /* ProgressLocation.Window */,
            title: localize('activation', "Activating Extensions...")
        };
        let deferred;
        let count = 0;
        this._listener = extensionService.onWillActivateByEvent(e => {
            logService.trace('onWillActivateByEvent: ', e.event);
            if (!deferred) {
                deferred = new DeferredPromise();
                progressService.withProgress(options, _ => deferred.p);
            }
            count++;
            Promise.race([e.activation, timeout(5000, CancellationToken.None)]).finally(() => {
                if (--count === 0) {
                    deferred.complete(undefined);
                    deferred = undefined;
                }
            });
        });
    }
    dispose() {
        this._listener.dispose();
    }
};
ExtensionActivationProgress = __decorate([
    __param(0, IExtensionService),
    __param(1, IProgressService),
    __param(2, ILogService)
], ExtensionActivationProgress);
export { ExtensionActivationProgress };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0FjdGl2YXRpb25Qcm9ncmVzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zQWN0aXZhdGlvblByb2dyZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBb0IsTUFBTSxrREFBa0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckUsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBMkI7SUFJdkMsWUFDb0IsZ0JBQW1DLEVBQ3BDLGVBQWlDLEVBQ3RDLFVBQXVCO1FBR3BDLE1BQU0sT0FBTyxHQUFHO1lBQ2YsUUFBUSxrQ0FBeUI7WUFDakMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxZQUFZLEVBQUUsMEJBQTBCLENBQUM7U0FDekQsQ0FBQztRQUVGLElBQUksUUFBMEMsQ0FBQztRQUMvQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxJQUFJLENBQUMsU0FBUyxHQUFHLGdCQUFnQixDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzNELFVBQVUsQ0FBQyxLQUFLLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZixRQUFRLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztnQkFDakMsZUFBZSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUVELEtBQUssRUFBRSxDQUFDO1lBRVIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtnQkFDaEYsSUFBSSxFQUFFLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDbkIsUUFBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDOUIsUUFBUSxHQUFHLFNBQVMsQ0FBQztnQkFDdEIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNELENBQUE7QUF4Q1ksMkJBQTJCO0lBS3JDLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLFdBQVcsQ0FBQTtHQVBELDJCQUEyQixDQXdDdkMifQ==