/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as performance from './vs/base/common/performance.js';
import { removeGlobalNodeJsModuleLookupPaths, devInjectNodeModuleLookupPath } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';
performance.mark('code/fork/start');
//#region Helpers
function pipeLoggingToParent() {
    const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
    const MAX_LENGTH = 100000;
    /**
     * Prevent circular stringify and convert arguments to real array
     */
    function safeToString(args) {
        const seen = [];
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
        try {
            const res = JSON.stringify(argsArray, function (key, value) {
                // Objects get special treatment to prevent circles
                if (isObject(value) || Array.isArray(value)) {
                    if (seen.indexOf(value) !== -1) {
                        return '[Circular]';
                    }
                    seen.push(value);
                }
                return value;
            });
            if (res.length > MAX_LENGTH) {
                return 'Output omitted for a large object that exceeds the limits';
            }
            return res;
        }
        catch (error) {
            return `Output omitted for an object that cannot be inspected ('${error.toString()}')`;
        }
    }
    function safeSend(arg) {
        try {
            if (process.send) {
                process.send(arg);
            }
        }
        catch (error) {
            // Can happen if the parent channel is closed meanwhile
        }
    }
    function isObject(obj) {
        return typeof obj === 'object'
            && obj !== null
            && !Array.isArray(obj)
            && !(obj instanceof RegExp)
            && !(obj instanceof Date);
    }
    function safeSendConsoleMessage(severity, args) {
        safeSend({ type: '__$console', severity, arguments: args });
    }
    /**
     * Wraps a console message so that it is transmitted to the renderer.
     *
     * The wrapped property is not defined with `writable: false` to avoid
     * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
     */
    function wrapConsoleMethod(method, severity) {
        Object.defineProperty(console, method, {
            set: () => { },
            get: () => function () { safeSendConsoleMessage(severity, safeToString(arguments)); },
        });
    }
    /**
     * Wraps process.stderr/stdout.write() so that it is transmitted to the
     * renderer or CLI. It both calls through to the original method as well
     * as to console.log with complete lines so that they're made available
     * to the debugger/CLI.
     */
    function wrapStream(streamName, severity) {
        const stream = process[streamName];
        const original = stream.write;
        let buf = '';
        Object.defineProperty(stream, 'write', {
            set: () => { },
            get: () => (chunk, encoding, callback) => {
                buf += chunk.toString(encoding);
                const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf('\n');
                if (eol !== -1) {
                    console[severity](buf.slice(0, eol));
                    buf = buf.slice(eol + 1);
                }
                original.call(stream, chunk, encoding, callback);
            },
        });
    }
    // Pass console logging to the outside so that we have it in the main side if told so
    if (process.env['VSCODE_VERBOSE_LOGGING'] === 'true') {
        wrapConsoleMethod('info', 'log');
        wrapConsoleMethod('log', 'log');
        wrapConsoleMethod('warn', 'warn');
        wrapConsoleMethod('error', 'error');
    }
    else {
        console.log = function () { };
        console.warn = function () { };
        console.info = function () { };
        wrapConsoleMethod('error', 'error');
    }
    wrapStream('stderr', 'error');
    wrapStream('stdout', 'log');
}
function handleExceptions() {
    // Handle uncaught exceptions
    process.on('uncaughtException', function (err) {
        console.error('Uncaught Exception: ', err);
    });
    // Handle unhandled promise rejections
    process.on('unhandledRejection', function (reason) {
        console.error('Unhandled Promise Rejection: ', reason);
    });
}
function terminateWhenParentTerminates() {
    const parentPid = Number(process.env['VSCODE_PARENT_PID']);
    if (typeof parentPid === 'number' && !isNaN(parentPid)) {
        setInterval(function () {
            try {
                process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
            }
            catch (e) {
                process.exit();
            }
        }, 5000);
    }
}
function configureCrashReporter() {
    const crashReporterProcessType = process.env['VSCODE_CRASH_REPORTER_PROCESS_TYPE'];
    if (crashReporterProcessType) {
        try {
            //@ts-expect-error
            if (process['crashReporter'] && typeof process['crashReporter'].addExtraParameter === 'function' /* Electron only */) {
                //@ts-expect-error
                process['crashReporter'].addExtraParameter('processType', crashReporterProcessType);
            }
        }
        catch (error) {
            console.error(error);
        }
    }
}
//#endregion
// Crash reporter
configureCrashReporter();
// Remove global paths from the node module lookup (node.js only)
removeGlobalNodeJsModuleLookupPaths();
if (process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']) {
    devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
}
// Configure: pipe logging to parent process
if (!!process.send && process.env['VSCODE_PIPE_LOGGING'] === 'true') {
    pipeLoggingToParent();
}
// Handle Exceptions
if (!process.env['VSCODE_HANDLES_UNCAUGHT_ERRORS']) {
    handleExceptions();
}
// Terminate when parent terminates
if (process.env['VSCODE_PARENT_PID']) {
    terminateWhenParentTerminates();
}
// Bootstrap ESM
await bootstrapESM();
// Load ESM entry point
await import([`./${process.env['VSCODE_ESM_ENTRYPOINT']}.js`].join('/') /* workaround: esbuild prints some strange warnings when trying to inline? */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLWZvcmsuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJib290c3RyYXAtZm9yay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssV0FBVyxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUVsRCxXQUFXLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFcEMsaUJBQWlCO0FBRWpCLFNBQVMsbUJBQW1CO0lBQzNCLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztJQUM3QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFFMUI7O09BRUc7SUFDSCxTQUFTLFlBQVksQ0FBQyxJQUF3QjtRQUM3QyxNQUFNLElBQUksR0FBYyxFQUFFLENBQUM7UUFDM0IsTUFBTSxTQUFTLEdBQWMsRUFBRSxDQUFDO1FBRWhDLGdEQUFnRDtRQUNoRCxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRWxCLHlFQUF5RTtnQkFDekUsMkVBQTJFO2dCQUMzRSwrRUFBK0U7Z0JBQy9FLElBQUksT0FBTyxHQUFHLEtBQUssV0FBVyxFQUFFLENBQUM7b0JBQ2hDLEdBQUcsR0FBRyxXQUFXLENBQUM7Z0JBQ25CLENBQUM7Z0JBRUQsbUZBQW1GO2dCQUNuRixxRUFBcUU7cUJBQ2hFLElBQUksR0FBRyxZ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