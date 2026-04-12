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
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import * as extHostProtocol from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
export const IExtHostApiDeprecationService = createDecorator('IExtHostApiDeprecationService');
let ExtHostApiDeprecationService = class ExtHostApiDeprecationService {
    constructor(rpc, _extHostLogService) {
        this._extHostLogService = _extHostLogService;
        this._reportedUsages = new Set();
        this._telemetryShape = rpc.getProxy(extHostProtocol.MainContext.MainThreadTelemetry);
    }
    report(apiId, extension, migrationSuggestion, options) {
        const key = this.getUsageKey(apiId, extension, options?.usageId);
        if (this._reportedUsages.has(key)) {
            return;
        }
        this._reportedUsages.add(key);
        if (extension.isUnderDevelopment) {
            this._extHostLogService.warn(`[Deprecation Warning] '${apiId}' is deprecated. ${migrationSuggestion}`);
        }
        this._telemetryShape.$publicLog2('extHostDeprecatedApiUsage', {
            extensionId: extension.identifier.value,
            apiId: apiId,
            usageId: options?.usageId ?? '',
        });
    }
    getUsageKey(apiId, extension, usageId) {
        const rootKey = `${apiId}-${extension.identifier.value}`;
        return usageId ? `${rootKey}-${usageId}` : rootKey;
    }
};
ExtHostApiDeprecationService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService)
], ExtHostApiDeprecationService);
export { ExtHostApiDeprecationService };
export const NullApiDeprecationService = Object.freeze(new class {
    report(_apiId, _extension, _warningMessage) {
        // noop
    }
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEtBQUssZUFBZSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBUTVELE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLGVBQWUsQ0FBZ0MsK0JBQStCLENBQUMsQ0FBQztBQUV0SCxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE0QjtJQU94QyxZQUNxQixHQUF1QixFQUM5QixrQkFBZ0Q7UUFBL0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFhO1FBTDdDLG9CQUFlLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQU9wRCxJQUFJLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFTSxNQUFNLENBQUMsS0FBYSxFQUFFLFNBQWdDLEVBQUUsbUJBQTJCLEVBQUUsT0FBOEI7UUFDekgsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNqRSxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QixJQUFJLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEtBQUssb0JBQW9CLG1CQUFtQixFQUFFLENBQUMsQ0FBQztRQUN4RyxDQUFDO1FBY0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQWlELDJCQUEyQixFQUFFO1lBQzdHLFdBQVcsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLEtBQUs7WUFDdkMsS0FBSyxFQUFFLEtBQUs7WUFDWixPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sSUFBSSxFQUFFO1NBQy9CLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxXQUFXLENBQUMsS0FBYSxFQUFFLFNBQWdDLEVBQUUsT0FBZ0I7UUFDcEYsTUFBTSxPQUFPLEdBQUcsR0FBRyxLQUFLLElBQUksU0FBUyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN6RCxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUNwRCxDQUFDO0NBQ0QsQ0FBQTtBQWhEWSw0QkFBNEI7SUFRdEMsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLFdBQVcsQ0FBQTtHQVRELDRCQUE0QixDQWdEeEM7O0FBR0QsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJO0lBR25ELE1BQU0sQ0FBQyxNQUFjLEVBQUUsVUFBaUMsRUFBRSxlQUF1QjtRQUN2RixPQUFPO0lBQ1IsQ0FBQztDQUNELEVBQUUsQ0FBQyxDQUFDIn0=