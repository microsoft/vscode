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
import { WebWorkerDescriptor } from '../../webWorker/browser/webWorkerDescriptor.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWebWorkerService } from '../../webWorker/browser/webWorkerService.js';
import { ILogService } from '../../log/common/log.js';
import { reportSample } from '../common/profilingTelemetrySpec.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { FileAccess } from '../../../base/common/network.js';
export var ProfilingOutput;
(function (ProfilingOutput) {
    ProfilingOutput[ProfilingOutput["Failure"] = 0] = "Failure";
    ProfilingOutput[ProfilingOutput["Irrelevant"] = 1] = "Irrelevant";
    ProfilingOutput[ProfilingOutput["Interesting"] = 2] = "Interesting";
})(ProfilingOutput || (ProfilingOutput = {}));
export const IProfileAnalysisWorkerService = createDecorator('IProfileAnalysisWorkerService');
// ---- impl
let ProfileAnalysisWorkerService = class ProfileAnalysisWorkerService {
    constructor(_telemetryService, _logService, _webWorkerService) {
        this._telemetryService = _telemetryService;
        this._logService = _logService;
        this._webWorkerService = _webWorkerService;
    }
    async _withWorker(callback) {
        const worker = this._webWorkerService.createWorkerClient(new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri('vs/platform/profiling/electron-browser/profileAnalysisWorkerMain.js'),
            label: 'CpuProfileAnalysisWorker'
        }));
        try {
            const r = await callback(worker.proxy);
            return r;
        }
        finally {
            worker.dispose();
        }
    }
    async analyseBottomUp(profile, callFrameClassifier, perfBaseline, sendAsErrorTelemtry) {
        return this._withWorker(async (worker) => {
            const result = await worker.$analyseBottomUp(profile);
            if (result.kind === 2 /* ProfilingOutput.Interesting */) {
                for (const sample of result.samples) {
                    reportSample({
                        sample,
                        perfBaseline,
                        source: callFrameClassifier(sample.url)
                    }, this._telemetryService, this._logService, sendAsErrorTelemtry);
                }
            }
            return result.kind;
        });
    }
    async analyseByLocation(profile, locations) {
        return this._withWorker(async (worker) => {
            const result = await worker.$analyseByUrlCategory(profile, locations);
            return result;
        });
    }
};
ProfileAnalysisWorkerService = __decorate([
    __param(0, ITelemetryService),
    __param(1, ILogService),
    __param(2, IWebWorkerService)
], ProfileAnalysisWorkerService);
registerSingleton(IProfileAnalysisWorkerService, ProfileAnalysisWorkerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZmlsZUFuYWx5c2lzV29ya2VyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Byb2ZpbGluZy9lbGVjdHJvbi1icm93c2VyL3Byb2ZpbGVBbmFseXNpc1dvcmtlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHckYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHdEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUU3RCxNQUFNLENBQU4sSUFBa0IsZUFJakI7QUFKRCxXQUFrQixlQUFlO0lBQ2hDLDJEQUFPLENBQUE7SUFDUCxpRUFBVSxDQUFBO0lBQ1YsbUVBQVcsQ0FBQTtBQUNaLENBQUMsRUFKaUIsZUFBZSxLQUFmLGVBQWUsUUFJaEM7QUFNRCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyxlQUFlLENBQWdDLCtCQUErQixDQUFDLENBQUM7QUFTN0gsWUFBWTtBQUVaLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTRCO0lBSWpDLFlBQ3FDLGlCQUFvQyxFQUMxQyxXQUF3QixFQUNsQixpQkFBb0M7UUFGcEMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUMxQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUNsQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO0lBQ3JFLENBQUM7SUFFRyxLQUFLLENBQUMsV0FBVyxDQUFJLFFBQWlFO1FBRTdGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FDdkQsSUFBSSxtQkFBbUIsQ0FBQztZQUN2QixpQkFBaUIsRUFBRSxVQUFVLENBQUMsWUFBWSxDQUFDLHFFQUFxRSxDQUFDO1lBQ2pILEtBQUssRUFBRSwwQkFBMEI7U0FDakMsQ0FBQyxDQUNGLENBQUM7UUFFRixJQUFJLENBQUM7WUFDSixNQUFNLENBQUMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO2dCQUFTLENBQUM7WUFDVixNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQW1CLEVBQUUsbUJBQXlDLEVBQUUsWUFBb0IsRUFBRSxtQkFBNEI7UUFDdkksT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBQyxNQUFNLEVBQUMsRUFBRTtZQUN0QyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0RCxJQUFJLE1BQU0sQ0FBQyxJQUFJLHdDQUFnQyxFQUFFLENBQUM7Z0JBQ2pELEtBQUssTUFBTSxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNyQyxZQUFZLENBQUM7d0JBQ1osTUFBTTt3QkFDTixZQUFZO3dCQUNaLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO3FCQUN2QyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLG1CQUFtQixDQUFDLENBQUM7Z0JBQ25FLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxPQUFtQixFQUFFLFNBQXdDO1FBQ3BGLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUMsTUFBTSxFQUFDLEVBQUU7WUFDdEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMscUJBQXFCLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQTtBQWpESyw0QkFBNEI7SUFLL0IsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsaUJBQWlCLENBQUE7R0FQZCw0QkFBNEIsQ0FpRGpDO0FBcUJELGlCQUFpQixDQUFDLDZCQUE2QixFQUFFLDRCQUE0QixvQ0FBNEIsQ0FBQyJ9