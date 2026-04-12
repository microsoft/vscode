/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { binarySearch } from '../../../base/common/arrays.js';
import { errorHandler, ErrorNoTelemetry, PendingMigrationError } from '../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { safeStringify } from '../../../base/common/objects.js';
import { FileOperationError } from '../../files/common/files.js';
export var ErrorEvent;
(function (ErrorEvent) {
    function compare(a, b) {
        if (a.callstack < b.callstack) {
            return -1;
        }
        else if (a.callstack > b.callstack) {
            return 1;
        }
        return 0;
    }
    ErrorEvent.compare = compare;
})(ErrorEvent || (ErrorEvent = {}));
/**
 * Extracts a callstack and message from an error object for telemetry.
 * Handles the `Array.isArray(err.stack)` workaround from workerServer.ts
 * and falls back to {@link safeStringify} when no message is available.
 */
export function packErrorForTelemetry(err) {
    if (!err || typeof err !== 'object') {
        return { callstack: undefined, msg: safeStringify(err) };
    }
    const callstack = Array.isArray(err.stack) ? err.stack.join('\n') : err.stack;
    const msg = err.message ? err.message : safeStringify(err);
    return { callstack, msg };
}
export default class BaseErrorTelemetry {
    static { this.ERROR_FLUSH_TIMEOUT = 5 * 1000; }
    constructor(telemetryService, flushDelay = BaseErrorTelemetry.ERROR_FLUSH_TIMEOUT) {
        this._flushHandle = undefined;
        this._buffer = [];
        this._disposables = new DisposableStore();
        this._telemetryService = telemetryService;
        this._flushDelay = flushDelay;
        // (1) check for unexpected but handled errors
        const unbind = errorHandler.addListener((err) => this._onErrorEvent(err));
        this._disposables.add(toDisposable(unbind));
        // (2) install implementation-specific error listeners
        this.installErrorListeners();
    }
    dispose() {
        clearTimeout(this._flushHandle);
        this._flushBuffer();
        this._disposables.dispose();
    }
    installErrorListeners() {
        // to override
    }
    _onErrorEvent(err) {
        if (!err || err.code) {
            return;
        }
        // unwrap nested errors from loader
        if (err.detail && err.detail.stack) {
            err = err.detail;
        }
        // If it's the no telemetry error it doesn't get logged
        // TOOD @lramos15 hacking in FileOperation error because it's too messy to adopt ErrorNoTelemetry. A better solution should be found
        //
        // Explicitly filter out PendingMigrationError for https://github.com/microsoft/vscode/issues/250648#issuecomment-3394040431
        // We don't inherit from ErrorNoTelemetry to preserve the name used in reporting for exthostdeprecatedapiusage event.
        // TODO(deepak1556): remove when PendingMigrationError is no longer needed.
        if (ErrorNoTelemetry.isErrorNoTelemetry(err) || err instanceof FileOperationError || PendingMigrationError.is(err) || (typeof err?.message === 'string' && err.message.includes('Unable to read file'))) {
            return;
        }
        // work around behavior in workerServer.ts that breaks up Error.stack
        const { callstack, msg } = packErrorForTelemetry(err);
        // errors without a stack are not useful telemetry
        if (!callstack) {
            return;
        }
        this._enqueue({ msg, callstack });
    }
    _enqueue(e) {
        const idx = binarySearch(this._buffer, e, ErrorEvent.compare);
        if (idx < 0) {
            e.count = 1;
            this._buffer.splice(~idx, 0, e);
        }
        else {
            if (!this._buffer[idx].count) {
                this._buffer[idx].count = 0;
            }
            this._buffer[idx].count += 1;
        }
        if (this._flushHandle === undefined) {
            this._flushHandle = setTimeout(() => {
                this._flushBuffer();
                this._flushHandle = undefined;
            }, this._flushDelay);
        }
    }
    _flushBuffer() {
        for (const error of this._buffer) {
            this._telemetryService.publicLogError2('UnhandledError', error);
        }
        this._buffer.length = 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2Vycm9yVGVsZW1ldHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDdkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUEwQmpFLE1BQU0sS0FBVyxVQUFVLENBUzFCO0FBVEQsV0FBaUIsVUFBVTtJQUMxQixTQUFnQixPQUFPLENBQUMsQ0FBYSxFQUFFLENBQWE7UUFDbkQsSUFBSSxDQUFDLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvQixPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ1gsQ0FBQzthQUFNLElBQUksQ0FBQyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdEMsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBQ0QsT0FBTyxDQUFDLENBQUM7SUFDVixDQUFDO0lBUGUsa0JBQU8sVUFPdEIsQ0FBQTtBQUNGLENBQUMsRUFUZ0IsVUFBVSxLQUFWLFVBQVUsUUFTMUI7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUFDLEdBQVE7SUFDN0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNyQyxP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