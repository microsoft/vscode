/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../base/common/lifecycle.js';
export class ServerTelemetryChannel extends Disposable {
    constructor(telemetryService, telemetryAppender) {
        super();
        this.telemetryService = telemetryService;
        this.telemetryAppender = telemetryAppender;
    }
    async call(_, command, arg) {
        switch (command) {
            case 'updateTelemetryLevel': {
                const { telemetryLevel } = arg;
                return this.telemetryService.updateInjectedTelemetryLevel(telemetryLevel);
            }
            case 'logTelemetry': {
                const { eventName, data } = arg;
                // Logging is done directly to the appender instead of through the telemetry service
                // as the data sent from the client has already had common properties added to it and
                // has already been sent to the telemetry output channel
                if (this.telemetryAppender) {
                    return this.telemetryAppender.log(eventName, data);
                }
                return Promise.resolve();
            }
            case 'flushTelemetry': {
                if (this.telemetryAppender) {
                    return this.telemetryAppender.flush();
                }
                return Promise.resolve();
            }
            case 'ping': {
                return;
            }
        }
        // Command we cannot handle so we throw an error
        throw new Error(`IPC Command ${command} not found`);
    }
    listen(_, event, arg) {
        throw new Error('Not supported');
    }
    /**
     * Disposing the channel also disables the telemetryService as there is
     * no longer a way to control it
     */
    dispose() {
        this.telemetryService.updateInjectedTelemetryLevel(0 /* TelemetryLevel.NONE */);
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVGVsZW1ldHJ5Q2hhbm5lbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vcmVtb3RlVGVsZW1ldHJ5Q2hhbm5lbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFNL0QsTUFBTSxPQUFPLHNCQUF1QixTQUFRLFVBQVU7SUFDckQsWUFDa0IsZ0JBQXlDLEVBQ3pDLGlCQUE0QztRQUU3RCxLQUFLLEVBQUUsQ0FBQztRQUhTLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBeUI7UUFDekMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUEyQjtJQUc5RCxDQUFDO0lBR0QsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFNLEVBQUUsT0FBZSxFQUFFLEdBQVM7UUFDNUMsUUFBUSxPQUFPLEVBQUUsQ0FBQztZQUNqQixLQUFLLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDN0IsTUFBTSxFQUFFLGNBQWMsRUFBRSxHQUFHLEdBQUcsQ0FBQztnQkFDL0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsNEJBQTRCLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUVELEtBQUssY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDckIsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUM7Z0JBQ2hDLG9GQUFvRjtnQkFDcEYscUZBQXFGO2dCQUNyRix3REFBd0Q7Z0JBQ3hELElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQzVCLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3BELENBQUM7Z0JBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUIsQ0FBQztZQUVELEtBQUssZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO29CQUM1QixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdkMsQ0FBQztnQkFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQixDQUFDO1lBRUQsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNiLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUNELGdEQUFnRDtRQUNoRCxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsT0FBTyxZQUFZLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsTUFBTSxDQUFDLENBQU0sRUFBRSxLQUFhLEVBQUUsR0FBUTtRQUNyQyxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7O09BR0c7SUFDYSxPQUFPO1FBQ3RCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsNkJBQXFCLENBQUM7UUFDeEUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRCJ9