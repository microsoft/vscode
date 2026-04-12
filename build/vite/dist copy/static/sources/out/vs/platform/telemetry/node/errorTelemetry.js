/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isCancellationError, isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import BaseErrorTelemetry from '../common/errorTelemetry.js';
export default class ErrorTelemetry extends BaseErrorTelemetry {
    installErrorListeners() {
        setUnexpectedErrorHandler(err => console.error(err));
        // Print a console message when rejection isn't handled within N seconds. For details:
        // see https://nodejs.org/api/process.html#process_event_unhandledrejection
        // and https://nodejs.org/api/process.html#process_event_rejectionhandled
        const unhandledPromises = [];
        process.on('unhandledRejection', (reason, promise) => {
            unhandledPromises.push(promise);
            setTimeout(() => {
                const idx = unhandledPromises.indexOf(promise);
                if (idx >= 0) {
                    promise.catch(e => {
                        unhandledPromises.splice(idx, 1);
                        if (!isCancellationError(e)) {
                            console.warn(`rejected promise not handled within 1 second: ${e}`);
                            if (e.stack) {
                                console.warn(`stack trace: ${e.stack}`);
                            }
                            if (reason) {
                                onUnexpectedError(reason);
                            }
                        }
                    });
                }
            }, 1000);
        });
        process.on('rejectionHandled', (promise) => {
            const idx = unhandledPromises.indexOf(promise);
            if (idx >= 0) {
                unhandledPromises.splice(idx, 1);
            }
        });
        // Print a console message when an exception isn't handled.
        process.on('uncaughtException', (err) => {
            if (isSigPipeError(err)) {
                return;
            }
            onUnexpectedError(err);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvbm9kZS9lcnJvclRlbGVtZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkksT0FBTyxrQkFBa0IsTUFBTSw2QkFBNkIsQ0FBQztBQUU3RCxNQUFNLENBQUMsT0FBTyxPQUFPLGNBQWUsU0FBUSxrQkFBa0I7SUFDMUMscUJBQXFCO1FBQ3ZDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXJELHNGQUFzRjtRQUN0RiwyRUFBMkU7UUFDM0UseUVBQXlFO1FBQ3pFLE1BQU0saUJBQWlCLEdBQXVCLEVBQUUsQ0FBQztRQUNqRCxPQUFPLENBQUMsRUFBRSxDQUFDLG9CQUFvQixFQUFFLENBQUMsTUFBZSxFQUFFLE9BQXlCLEVBQUUsRUFBRTtZQUMvRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEMsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDZixNQUFNLEdBQUcsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQy9DLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7d0JBQ2pCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ2pDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDOzRCQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLGlEQUFpRCxDQUFDLEVBQUUsQ0FBQyxDQUFDOzRCQUNuRSxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQ0FDYixPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQzs0QkFDekMsQ0FBQzs0QkFDRCxJQUFJLE1BQU0sRUFBRSxDQUFDO2dDQUNaLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDOzRCQUMzQixDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLE9BQXlCLEVBQUUsRUFBRTtZQUM1RCxNQUFNLEdBQUcsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDL0MsSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ2QsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCwyREFBMkQ7UUFDM0QsT0FBTyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEdBQWtDLEVBQUUsRUFBRTtZQUN0RSxJQUFJLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN6QixPQUFPO1lBQ1IsQ0FBQztZQUVELGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=