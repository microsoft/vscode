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
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { AbstractMeteredConnectionService } from '../common/meteredConnection.js';
/**
 * Electron-main implementation of the metered connection service.
 * This implementation receives metered connection updates via IPC channel from the renderer process.
 */
let MeteredConnectionMainService = class MeteredConnectionMainService extends AbstractMeteredConnectionService {
    constructor(configurationService) {
        super(configurationService, false);
    }
    setTelemetryService(telemetryService) {
        this.telemetryService = telemetryService;
    }
    onChangeBrowserConnection() {
        // Fire event after sending telemetry if switching to metered since telemetry will be paused.
        const fireAfter = this.isBrowserConnectionMetered;
        if (!fireAfter) {
            super.onChangeBrowserConnection();
        }
        this.telemetryService?.publicLog2('meteredConnectionStateChange', {
            connectionState: this.isBrowserConnectionMetered,
        });
        if (fireAfter) {
            super.onChangeBrowserConnection();
        }
    }
};
MeteredConnectionMainService = __decorate([
    __param(0, IConfigurationService)
], MeteredConnectionMainService);
export { MeteredConnectionMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb25NYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2VsZWN0cm9uLW1haW4vbWV0ZXJlZENvbm5lY3Rpb25NYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVwRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVsRjs7O0dBR0c7QUFDSSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLGdDQUFnQztJQUdqRixZQUFtQyxvQkFBMkM7UUFDN0UsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxnQkFBbUM7UUFDN0QsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDO0lBQzFDLENBQUM7SUFFa0IseUJBQXlCO1FBQzNDLDZGQUE2RjtRQUM3RixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUM7UUFDbEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ25DLENBQUM7UUFVRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsVUFBVSxDQUFnRiw4QkFBOEIsRUFBRTtZQUNoSixlQUFlLEVBQUUsSUFBSSxDQUFDLDBCQUEwQjtTQUNoRCxDQUFDLENBQUM7UUFFSCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsS0FBSyxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDbkMsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBbENZLDRCQUE0QjtJQUczQixXQUFBLHFCQUFxQixDQUFBO0dBSHRCLDRCQUE0QixDQWtDeEMifQ==