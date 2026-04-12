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
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
let DebugTelemetry = class DebugTelemetry {
    constructor(model, telemetryService) {
        this.model = model;
        this.telemetryService = telemetryService;
    }
    logDebugSessionStart(dbgr, launchJsonExists) {
        const extension = dbgr.getMainExtensionDescriptor();
        /* __GDPR__
            "debugSessionStart" : {
                "owner": "connor4312",
                "type": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "exceptionBreakpoints": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "extensionName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
                "isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true},
                "launchJsonExists": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
            }
        */
        this.telemetryService.publicLog('debugSessionStart', {
            type: dbgr.type,
            breakpointCount: this.model.getBreakpoints().length,
            exceptionBreakpoints: this.model.getExceptionBreakpoints(),
            watchExpressionsCount: this.model.getWatchExpressions().length,
            extensionName: extension.identifier.value,
            isBuiltin: extension.isBuiltin,
            launchJsonExists
        });
    }
    logDebugSessionStop(session, adapterExitEvent) {
        const breakpoints = this.model.getBreakpoints();
        /* __GDPR__
            "debugSessionStop" : {
                "owner": "connor4312",
                "type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "sessionLengthInSeconds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
                "watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
            }
        */
        this.telemetryService.publicLog('debugSessionStop', {
            type: session && session.configuration.type,
            success: adapterExitEvent.emittedStopped || breakpoints.length === 0,
            sessionLengthInSeconds: adapterExitEvent.sessionLengthInSeconds,
            breakpointCount: breakpoints.length,
            watchExpressionsCount: this.model.getWatchExpressions().length
        });
    }
};
DebugTelemetry = __decorate([
    __param(1, ITelemetryService)
], DebugTelemetry);
export { DebugTelemetry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdUZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFHaEYsSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBYztJQUUxQixZQUNrQixLQUFrQixFQUNDLGdCQUFtQztRQUR0RCxVQUFLLEdBQUwsS0FBSyxDQUFhO1FBQ0MscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtJQUNwRSxDQUFDO0lBRUwsb0JBQW9CLENBQUMsSUFBYyxFQUFFLGdCQUF5QjtRQUM3RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUNwRDs7Ozs7Ozs7Ozs7VUFXRTtRQUNGLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUU7WUFDcEQsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsZUFBZSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTTtZQUNuRCxvQkFBb0IsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFO1lBQzFELHFCQUFxQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxNQUFNO1lBQzlELGFBQWEsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLEtBQUs7WUFDekMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTO1lBQzlCLGdCQUFnQjtTQUNoQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsbUJBQW1CLENBQUMsT0FBc0IsRUFBRSxnQkFBaUM7UUFFNUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUVoRDs7Ozs7Ozs7O1VBU0U7UUFDRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFO1lBQ25ELElBQUksRUFBRSxPQUFPLElBQUksT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJO1lBQzNDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxjQUFjLElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQ3BFLHNCQUFzQixFQUFFLGdCQUFnQixDQUFDLHNCQUFzQjtZQUMvRCxlQUFlLEVBQUUsV0FBVyxDQUFDLE1BQU07WUFDbkMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLE1BQU07U0FDOUQsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUF0RFksY0FBYztJQUl4QixXQUFBLGlCQUFpQixDQUFBO0dBSlAsY0FBYyxDQXNEMUIifQ==