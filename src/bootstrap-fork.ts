/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as performance from './vs/base/common/performance.js';
import { removeGlobalNodeJsModuleLookupPaths, devInjectNodeModuleLookupPath } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';

performance.mark('code/fork/start');

//#region Helpers

function pipeLoggingToParent(): void {
    const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
    const MAX_LENGTH = 100000;

    /**
     * Prevent circular stringify and convert arguments to real array
     */
    function safeToString(args: ArrayLike<unknown>): string {
        const seen: unknown[] = [];
        const argsArray: unknown[] = [];

        for (let i = 0; i < args.length; i++) {
            let arg = args[i];

            if (arg === undefined) {
                arg = 'undefined';
            } else if (arg instanceof Error) {
                arg = arg.stack ?? arg.toString();
            }

            argsArray.push(arg);
        }

        try {
            const res = JSON.stringify(argsArray, (key, value: unknown) => {
                if (isObject(value) || Array.isArray(value)) {
                    if (seen.includes(value)) {
                        return '[Circular]';
                    }
                    seen.push(value);
                }
                return value;
            });

            return res.length > MAX_LENGTH
                ? 'Output omitted for a large object that exceeds the limits'
                : res;

        } catch (error) {
            return `Output omitted for an object that cannot be inspected ('${String(error)}')`;
        }
    }

    function safeSend(arg: { type: string; severity: string; arguments: string }): void {
        try {
            process.send?.(arg);
        } catch {
            // Parent channel closed
        }
    }

    function isObject(obj: unknown): boolean {
        return typeof obj === 'object'
            && obj !== null
            && !Array.isArray(obj)
            && !(obj instanceof RegExp)
            && !(obj instanceof Date);
    }

    function safeSendConsoleMessage(severity: 'log' | 'warn' | 'error', args: string): void {
        safeSend({ type: '__$console', severity, arguments: args });
    }

    /**
     * Wraps a console message so that it is transmitted to the renderer.
     */
    function wrapConsoleMethod(
        method: 'log' | 'info' | 'warn' | 'error',
        severity: 'log' | 'warn' | 'error'
    ): void {
        Object.defineProperty(console, method, {
            set: () => { },
            get: () => (...args: unknown[]) => safeSendConsoleMessage(severity, safeToString(args)),
        });
    }

    /**
     * Wraps process.stderr/stdout.write() so that it is transmitted to the renderer or CLI.
     */
    function wrapStream(
        streamName: 'stdout' | 'stderr',
        severity: 'log' | 'warn' | 'error'
    ): void {
        const stream = process[streamName];
        const original = stream.write.bind(stream);

        let buf = '';

        Object.defineProperty(stream, 'write', {
            set: () => { },
            get: () => (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding, callback?: (err?: Error | null) => void) => {
                buf += chunk.toString(encoding);
                const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf('\n');

                if (eol !== -1) {
                    console[severity](buf.slice(0, eol));
                    buf = buf.slice(eol + 1);
                }

                return original(chunk, encoding, callback);
            },
        });
    }

    // Pass console logging to the outside so that we have it in the main side if told so
    if (process.env['VSCODE_VERBOSE_LOGGING'] === 'true') {
        wrapConsoleMethod('info', 'log');
        wrapConsoleMethod('log', 'log');
        wrapConsoleMethod('warn', 'warn');
        wrapConsoleMethod('error', 'error');
    } else {
        console.log = () => { };
        console.warn = () => { };
        console.info = () => { };
        wrapConsoleMethod('error', 'error');
    }

    wrapStream('stderr', 'error');
    wrapStream('stdout', 'log');
}

function handleExceptions(): void {
    process.on('uncaughtException', err => {
        console.error('Uncaught Exception: ', err);
    });

    process.on('unhandledRejection', reason => {
        console.error('Unhandled Promise Rejection: ', reason);
    });
}

function terminateWhenParentTerminates(): void {
    const parentPid = Number(process.env['VSCODE_PARENT_PID']);
    if (Number.isNaN(parentPid)) return;

    setInterval(() => {
        try {
            process.kill(parentPid, 0);
        } catch {
            process.exit();
        }
    }, 5000);
}

function configureCrashReporter(): void {
    const type = process.env['VSCODE_CRASH_REPORTER_PROCESS_TYPE'];
    if (!type) return;

    try {
        // @ts-expect-error Electron only
        const reporter = process['crashReporter'];
        if (reporter?.addExtraParameter) {
            reporter.addExtraParameter('processType', type);
        }
    } catch (error) {
        console.error(error);
    }
}

//#endregion

// Crash reporter
configureCrashReporter();

// Remove global paths from the node module lookup (node.js only)
removeGlobalNodeJsModuleLookupPaths();

const injectPath = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'];
if (injectPath) {
    devInjectNodeModuleLookupPath(injectPath);
}

// Configure: pipe logging to parent process
if (process.send && process.env['VSCODE_PIPE_LOGGING'] === 'true') {
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
await import(`./${process.env['VSCODE_ESM_ENTRYPOINT']}.js`);
