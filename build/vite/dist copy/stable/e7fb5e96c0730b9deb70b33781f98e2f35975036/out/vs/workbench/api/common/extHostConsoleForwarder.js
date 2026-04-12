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
import { safeStringify } from '../../../base/common/objects.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
let AbstractExtHostConsoleForwarder = class AbstractExtHostConsoleForwarder {
    constructor(extHostRpc, initData) {
        this._mainThreadConsole = extHostRpc.getProxy(MainContext.MainThreadConsole);
        this._includeStack = initData.consoleForward.includeStack;
        this._logNative = initData.consoleForward.logNative;
        // Pass console logging to the outside so that we have it in the main side if told so
        this._wrapConsoleMethod('info', 'log');
        this._wrapConsoleMethod('log', 'log');
        this._wrapConsoleMethod('warn', 'warn');
        this._wrapConsoleMethod('debug', 'debug');
        this._wrapConsoleMethod('error', 'error');
    }
    /**
     * Wraps a console message so that it is transmitted to the renderer. If
     * native logging is turned on, the original console message will be written
     * as well. This is needed since the console methods are "magic" in V8 and
     * are the only methods that allow later introspection of logged variables.
     *
     * The wrapped property is not defined with `writable: false` to avoid
     * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
     */
    _wrapConsoleMethod(method, severity) {
        const that = this;
        const original = console[method];
        Object.defineProperty(console, method, {
            set: () => { },
            get: () => (...args) => {
                that._handleConsoleCall(method, severity, original, args);
            },
        });
    }
    _handleConsoleCall(method, severity, original, args) {
        this._mainThreadConsole.$logExtensionHostMessage({
            type: '__$console',
            severity,
            arguments: safeStringifyArgumentsToArray(args, this._includeStack)
        });
        if (this._logNative) {
            this._nativeConsoleLogMessage(method, original, args);
        }
    }
};
AbstractExtHostConsoleForwarder = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService)
], AbstractExtHostConsoleForwarder);
export { AbstractExtHostConsoleForwarder };
const MAX_LENGTH = 100000;
/**
 * Prevent circular stringify and convert arguments to real array
 */
function safeStringifyArgumentsToArray(args, includeStack) {
    const argsArray = [];
    // Massage some arguments with special treatment
    if (args.length) {
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            // Any argument of type 'undefined' needs to be specially treated because
            // JSON.stringify will simply ignore those. We replace them with the string
            // 'undefined' which is not 100% right, but good enough to be logged to console
            if (typeof arg === 'undefined') {
                arg = 'undefined';
            }
            // Any argument that is an Error will be changed to be just the error stack/message
            // itself because currently cannot serialize the error over entirely.
            else if (arg instanceof Error) {
                const errorObj = arg;
                if (errorObj.stack) {
                    arg = errorObj.stack;
                }
                else {
                    arg = errorObj.toString();
                }
            }
            argsArray.push(arg);
        }
    }
    // Add the stack trace as payload if we are told so. We remove the message and the 2 top frames
    // to start the stacktrace where the console message was being written
    if (includeStack) {
        const stack = new Error().stack;
        if (stack) {
            argsArray.push({ __$stack: stack.split('\n').slice(3).join('\n') });
        }
    }
    try {
        const res = safeStringify(argsArray);
        if (res.length > MAX_LENGTH) {
            return 'Output omitted for a large object that exceeds the limits';
        }
        return res;
    }
    catch (error) {
        return `Output omitted for an object that cannot be inspected ('${error.toString()}')`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENvbnNvbGVGb3J3YXJkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q29uc29sZUZvcndhcmRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFdBQVcsRUFBMEIsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVyRCxJQUFlLCtCQUErQixHQUE5QyxNQUFlLCtCQUErQjtJQU1wRCxZQUNxQixVQUE4QixFQUN6QixRQUFpQztRQUUxRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3RSxJQUFJLENBQUMsYUFBYSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDO1FBQzFELElBQUksQ0FBQyxVQUFVLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7UUFFcEQscUZBQXFGO1FBQ3JGLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9B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