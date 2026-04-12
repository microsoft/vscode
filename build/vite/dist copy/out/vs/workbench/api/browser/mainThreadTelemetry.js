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
var MainThreadTelemetry_1;
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { ITelemetryService, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../../platform/telemetry/common/telemetry.js';
import { supportsTelemetry } from '../../../platform/telemetry/common/telemetryUtils.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadTelemetry = class MainThreadTelemetry extends Disposable {
    static { MainThreadTelemetry_1 = this; }
    static { this._name = 'pluginHostTelemetry'; }
    constructor(extHostContext, _telemetryService, _configurationService, _environmentService, _productService) {
        super();
        this._telemetryService = _telemetryService;
        this._configurationService = _configurationService;
        this._environmentService = _environmentService;
        this._productService = _productService;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTelemetry);
        if (supportsTelemetry(this._productService, this._environmentService)) {
            this._register(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)) {
                    this._proxy.$onDidChangeTelemetryLevel(this.telemetryLevel);
                }
            }));
        }
        this._proxy.$initializeTelemetryLevel(this.telemetryLevel, supportsTelemetry(this._productService, this._environmentService), this._productService.enabledTelemetryLevels);
    }
    get telemetryLevel() {
        if (!supportsTelemetry(this._productService, this._environmentService)) {
            return 0 /* TelemetryLevel.NONE */;
        }
        return this._telemetryService.telemetryLevel;
    }
    $publicLog(eventName, data = Object.create(null)) {
        // __GDPR__COMMON__ "pluginHostTelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
        data[MainThreadTelemetry_1._name] = true;
        this._telemetryService.publicLog(eventName, data);
    }
    $publicLog2(eventName, data) {
        this.$publicLog(eventName, data);
    }
};
MainThreadTelemetry = MainThreadTelemetry_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadTelemetry),
    __param(1, ITelemetryService),
    __param(2, IConfigurationService),
    __param(3, IEnvironmentService),
    __param(4, IProductService)
], MainThreadTelemetry);
export { MainThreadTelemetry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRlbGVtZXRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVGVsZW1ldHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0Isd0JBQXdCLEVBQUUsb0JBQW9CLEVBQWtCLE1BQU0saURBQWlELENBQUM7QUFDcEssT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQXlCLFdBQVcsRUFBNEIsTUFBTSwrQkFBK0IsQ0FBQztBQUd0SCxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7O2FBRzFCLFVBQUssR0FBRyxxQkFBcUIsQUFBeEIsQ0FBeUI7SUFFdEQsWUFDQyxjQUErQixFQUNLLGlCQUFvQyxFQUNoQyxxQkFBNEMsRUFDOUMsbUJBQXdDLEVBQzVDLGVBQWdDO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBTDRCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFDaEMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM5Qyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQzVDLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUlsRSxJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdkUsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDdkUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3RFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLEVBQUUsQ0FBQztvQkFDdEcsSUFBSSxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQzdELENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUNELElBQUksQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUM1SyxDQUFDO0lBRUQsSUFBWSxjQUFjO1FBQ3pCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDeEUsbUNBQTJCO1FBQzVCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLENBQUM7SUFDOUMsQ0FBQztJQUVELFVBQVUsQ0FBQyxTQUFpQixFQUFFLE9BQXVCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3ZFLHNJQUFzSTtRQUN0SSxJQUFJLENBQUMscUJBQW1CLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxXQUFXLENBQXNGLFNBQWlCLEVBQUUsSUFBZ0M7UUFDbkosSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQzs7QUExQ1csbUJBQW1CO0lBRC9CLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQztJQVFuRCxXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGVBQWUsQ0FBQTtHQVZMLG1CQUFtQixDQTJDL0IifQ==