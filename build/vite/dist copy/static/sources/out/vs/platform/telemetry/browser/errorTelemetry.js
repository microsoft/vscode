/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from '../../../base/browser/window.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import BaseErrorTelemetry from '../common/errorTelemetry.js';
export default class ErrorTelemetry extends BaseErrorTelemetry {
    installErrorListeners() {
        let oldOnError;
        const that = this;
        if (typeof mainWindow.onerror === 'function') {
            oldOnError = mainWindow.onerror;
        }
        mainWindow.onerror = function (message, filename, line, column, error) {
            that._onUncaughtError(message, filename, line, column, error);
            oldOnError?.apply(this, [message, filename, line, column, error]);
        };
        this._disposables.add(toDisposable(() => {
            if (oldOnError) {
                mainWindow.onerror = oldOnError;
            }
        }));
    }
    _onUncaughtError(msg, file, line, column, err) {
        const data = {
            callstack: msg,
            msg,
            file,
            line,
            column
        };
        if (err) {
            // If it's the no telemetry error it doesn't get logged
            if (ErrorNoTelemetry.isErrorNoTelemetry(err)) {
                return;
            }
            const { name, message, stack } = err;
            data.uncaught_error_name = name;
            if (message) {
                data.uncaught_error_msg = message;
            }
            if (stack) {
                data.callstack = Array.isArray(err.stack)
                    ? err.stack = err.stack.join('\n')
                    : err.stack;
            }
        }
        this._enqueue(data);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvYnJvd3Nlci9lcnJvclRlbGVtZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pFLE9BQU8sa0JBQWtDLE1BQU0sNkJBQTZCLENBQUM7QUFFN0UsTUFBTSxDQUFDLE9BQU8sT0FBTyxjQUFlLFNBQVEsa0JBQWtCO0lBQzFDLHFCQUFxQjtRQUN2QyxJQUFJLFVBQStCLENBQUM7UUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksT0FBTyxVQUFVLENBQUMsT0FBTyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQzlDLFVBQVUsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDO1FBQ2pDLENBQUM7UUFDRCxVQUFVLENBQUMsT0FBTyxHQUFHLFVBQVUsT0FBdUIsRUFBRSxRQUFpQixFQUFFLElBQWEsRUFBRSxNQUFlLEVBQUUsS0FBYTtZQUN2SCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBaUIsRUFBRSxRQUFrQixFQUFFLElBQWMsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDNUYsVUFBVSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3ZDLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLFVBQVUsQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGdCQUFnQixDQUFDLEdBQVcsRUFBRSxJQUFZLEVBQUUsSUFBWSxFQUFFLE1BQWUsRUFBRSxHQUFTO1FBQzNGLE1BQU0sSUFBSSxHQUFlO1lBQ3hCLFNBQVMsRUFBRSxHQUFHO1lBQ2QsR0FBRztZQUNILElBQUk7WUFDSixJQUFJO1lBQ0osTUFBTTtTQUNOLENBQUM7UUFFRixJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ1QsdURBQXVEO1lBQ3ZELElBQUksZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDOUMsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxHQUFHLENBQUM7WUFDckMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztZQUNoQyxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNiLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLENBQUM7WUFDbkMsQ0FBQztZQUNELElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7b0JBQ3hDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDbEMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckIsQ0FBQztDQUNEIn0=