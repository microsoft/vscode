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
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from './telemetry.js';
import { TelemetryService } from './telemetryService.js';
import { NullTelemetryServiceShape } from './telemetryUtils.js';
let ServerTelemetryService = class ServerTelemetryService extends TelemetryService {
    constructor(config, injectedTelemetryLevel, _configurationService, _productService) {
        super(config, _configurationService, _productService);
        this._injectedTelemetryLevel = injectedTelemetryLevel;
    }
    publicLog(eventName, data) {
        if (this._injectedTelemetryLevel < 3 /* TelemetryLevel.USAGE */) {
            return;
        }
        return super.publicLog(eventName, data);
    }
    publicLog2(eventName, data) {
        return this.publicLog(eventName, data);
    }
    publicLogError(errorEventName, data) {
        if (this._injectedTelemetryLevel < 2 /* TelemetryLevel.ERROR */) {
            return Promise.resolve(undefined);
        }
        return super.publicLogError(errorEventName, data);
    }
    publicLogError2(eventName, data) {
        return this.publicLogError(eventName, data);
    }
    async updateInjectedTelemetryLevel(telemetryLevel) {
        if (telemetryLevel === undefined) {
            this._injectedTelemetryLevel = 0 /* TelemetryLevel.NONE */;
            throw new Error('Telemetry level cannot be undefined. This will cause infinite looping!');
        }
        // We always take the most restrictive level because we don't want multiple clients to connect and send data when one client does not consent
        this._injectedTelemetryLevel = this._injectedTelemetryLevel ? Math.min(this._injectedTelemetryLevel, telemetryLevel) : telemetryLevel;
        if (this._injectedTelemetryLevel === 0 /* TelemetryLevel.NONE */) {
            this.dispose();
        }
    }
};
ServerTelemetryService = __decorate([
    __param(2, IConfigurationService),
    __param(3, IProductService)
], ServerTelemetryService);
export { ServerTelemetryService };
export const ServerNullTelemetryService = new class extends NullTelemetryServiceShape {
    async updateInjectedTelemetryLevel() { return; } // No-op, telemetry is already disabled
};
export const IServerTelemetryService = refineServiceDecorator(ITelemetryService);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyVGVsZW1ldHJ5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vc2VydmVyVGVsZW1ldHJ5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFekUsT0FBTyxFQUFrQixpQkFBaUIsRUFBa0IsTUFBTSxnQkFBZ0IsQ0FBQztBQUNuRixPQUFPLEVBQTJCLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDbEYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFNekQsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxnQkFBZ0I7SUFLM0QsWUFDQyxNQUErQixFQUMvQixzQkFBc0MsRUFDZixxQkFBNEMsRUFDbEQsZUFBZ0M7UUFFakQsS0FBSyxDQUFDLE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsc0JBQXNCLENBQUM7SUFDdkQsQ0FBQztJQUVRLFNBQVMsQ0FBQyxTQUFpQixFQUFFLElBQXFCO1FBQzFELElBQUksSUFBSSxDQUFDLHVCQUF1QiwrQkFBdUIsRUFBRSxDQUFDO1lBQ3pELE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRVEsVUFBVSxDQUFzRixTQUFpQixFQUFFLElBQWdDO1FBQzNKLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsSUFBa0MsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFUSxjQUFjLENBQUMsY0FBc0IsRUFBRSxJQUFxQjtRQUNwRSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsK0JBQXVCLEVBQUUsQ0FBQztZQUN6RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVRLGVBQWUsQ0FBc0YsU0FBaUIsRUFBRSxJQUFnQztRQUNoSyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLElBQWtDLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQsS0FBSyxDQUFDLDRCQUE0QixDQUFDLGNBQThCO1FBQ2hFLElBQUksY0FBYyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyx1QkFBdUIsOEJBQXNCLENBQUM7WUFDbkQsTUFBTSxJQUFJLEtBQUssQ0FBQyx3RUFBd0UsQ0FBQyxDQUFDO1FBQzNGLENBQUM7UUFDRCw2SUFBNkk7UUFDN0ksSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQztRQUN0SSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsZ0NBQXdCLEVBQUUsQ0FBQztZQUMxRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBaERZLHNCQUFzQjtJQVFoQyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0dBVEwsc0JBQXNCLENBZ0RsQzs7QUFFRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLEtBQU0sU0FBUSx5QkFBeUI7SUFDcEYsS0FBSyxDQUFDLDRCQUE0QixLQUFvQixPQUFPLENBQUMsQ0FBQyxDQUFDLHVDQUF1QztDQUN2RyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQTZDLGlCQUFpQixDQUFDLENBQUMifQ==