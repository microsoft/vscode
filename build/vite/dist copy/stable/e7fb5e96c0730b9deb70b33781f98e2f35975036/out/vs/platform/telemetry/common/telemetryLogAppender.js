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
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { TelemetryLogGroup, isLoggingOnly, telemetryLogId, validateTelemetryData } from './telemetryUtils.js';
let TelemetryLogAppender = class TelemetryLogAppender extends Disposable {
    constructor(prefix, remote, loggerService, environmentService, productService) {
        super();
        this.prefix = prefix;
        const id = remote ? 'remoteTelemetry' : telemetryLogId;
        const logger = loggerService.getLogger(id);
        if (logger) {
            this.logger = this._register(logger);
        }
        else {
            // Not a perfect check, but a nice way to indicate if we only have logging enabled for debug purposes and nothing is actually being sent
            const justLoggingAndNotSending = isLoggingOnly(productService, environmentService);
            const logSuffix = justLoggingAndNotSending ? ' (Not Sent)' : '';
            this.logger = this._register(loggerService.createLogger(id, {
                name: localize('telemetryLog', "Telemetry{0}", logSuffix),
                group: TelemetryLogGroup,
                hidden: true
            }));
        }
    }
    flush() {
        return Promise.resolve();
    }
    log(eventName, data) {
        this.logger.trace(`${this.prefix}telemetry/${eventName}`, validateTelemetryData(data));
    }
};
TelemetryLogAppender = __decorate([
    __param(2, ILoggerService),
    __param(3, IEnvironmentService),
    __param(4, IProductService)
], TelemetryLogAppender);
export { TelemetryLogAppender };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5TG9nQXBwZW5kZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeUxvZ0FwcGVuZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFXLGNBQWMsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RSxPQUFPLEVBQXNCLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUUzSCxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFJbkQsWUFDa0IsTUFBYyxFQUMvQixNQUFlLEVBQ0MsYUFBNkIsRUFDeEIsa0JBQXVDLEVBQzNDLGNBQStCO1FBRWhELEtBQUssRUFBRSxDQUFDO1FBTlMsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQVEvQixNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUM7UUFDdkQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLENBQUM7YUFBTSxDQUFDO1lBQ1Asd0lBQXdJO1lBQ3hJLE1BQU0sd0JBQXdCLEdBQUcsYUFBYSxDQUFDLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sU0FBUyxHQUFHLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNoRSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQ3pEO2dCQUNDLElBQUksRUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLGNBQWMsRUFBRSxTQUFTLENBQUM7Z0JBQ3pELEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLE1BQU0sRUFBRSxJQUFJO2FBQ1osQ0FBQyxDQUFDLENBQUM7UUFDTixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsR0FBRyxDQUFDLFNBQWlCLEVBQUUsSUFBYTtRQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLGFBQWEsU0FBUyxFQUFFLEVBQUUscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4RixDQUFDO0NBQ0QsQ0FBQTtBQXJDWSxvQkFBb0I7SUFPOUIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsZUFBZSxDQUFBO0dBVEwsb0JBQW9CLENBcUNoQyJ9