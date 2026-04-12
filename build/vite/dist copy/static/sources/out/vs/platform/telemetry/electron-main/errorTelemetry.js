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
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import BaseErrorTelemetry from '../common/errorTelemetry.js';
import { ITelemetryService } from '../common/telemetry.js';
let ErrorTelemetry = class ErrorTelemetry extends BaseErrorTelemetry {
    constructor(logService, telemetryService) {
        super(telemetryService);
        this.logService = logService;
    }
    installErrorListeners() {
        // We handle uncaught exceptions here to prevent electron from opening a dialog to the user
        setUnexpectedErrorHandler(error => this.onUnexpectedError(error));
        process.on('uncaughtException', error => {
            if (!isSigPipeError(error)) {
                onUnexpectedError(error);
            }
        });
        process.on('unhandledRejection', (reason) => onUnexpectedError(reason));
    }
    onUnexpectedError(error) {
        this.logService.error(`[uncaught exception in main]: ${error}`);
        if (error.stack) {
            this.logService.error(error.stack);
        }
    }
};
ErrorTelemetry = __decorate([
    __param(1, ITelemetryService)
], ErrorTelemetry);
export default ErrorTelemetry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvZWxlY3Ryb24tbWFpbi9lcnJvclRlbGVtZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUcsT0FBTyxrQkFBa0IsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUc1QyxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFlLFNBQVEsa0JBQWtCO0lBQzdELFlBQ2tCLFVBQXVCLEVBQ3JCLGdCQUFtQztRQUV0RCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUhQLGVBQVUsR0FBVixVQUFVLENBQWE7SUFJekMsQ0FBQztJQUVrQixxQkFBcUI7UUFDdkMsMkZBQTJGO1FBQzNGLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFbEUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsRUFBRTtZQUN2QyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxNQUFlLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUVPLGlCQUFpQixDQUFDLEtBQVk7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDaEUsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQTNCb0IsY0FBYztJQUdoQyxXQUFBLGlCQUFpQixDQUFBO0dBSEMsY0FBYyxDQTJCbEM7ZUEzQm9CLGNBQWMifQ==