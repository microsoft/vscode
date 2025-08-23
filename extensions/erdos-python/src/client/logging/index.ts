// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createWriteStream } from 'fs-extra';
import { isPromise } from 'rxjs/internal-compatibility';
import { Disposable } from 'vscode';
import { StopWatch } from '../common/utils/stopWatch';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';
import { FileLogger } from './fileLogger';
import { Arguments, ILogging, LogLevel, TraceDecoratorType, TraceOptions } from './types';
import { argsToLogString, returnValueToLogString } from './util';

const DEFAULT_OPTS: TraceOptions = TraceOptions.Arguments | TraceOptions.ReturnValue;

let loggers: ILogging[] = [];
export function registerLogger(logger: ILogging): Disposable {
    loggers.push(logger);
    return {
        dispose: () => {
            loggers = loggers.filter((l) => l !== logger);
        },
    };
}

export function initializeFileLogging(disposables: Disposable[]): void {
    if (process.env.VSC_PYTHON_LOG_FILE) {
        const fileLogger = new FileLogger(createWriteStream(process.env.VSC_PYTHON_LOG_FILE));
        disposables.push(fileLogger);
        disposables.push(registerLogger(fileLogger));
    }
}

export function traceLog(...args: Arguments): void {
    loggers.forEach((l) => l.traceLog(...args));
}

export function traceError(...args: Arguments): void {
    loggers.forEach((l) => l.traceError(...args));
}

export function traceWarn(...args: Arguments): void {
    loggers.forEach((l) => l.traceWarn(...args));
}

export function traceInfo(...args: Arguments): void {
    loggers.forEach((l) => l.traceInfo(...args));
}

export function traceVerbose(...args: Arguments): void {
    loggers.forEach((l) => l.traceVerbose(...args));
}

/** Logging Decorators go here */

export function traceDecoratorVerbose(message: string, opts: TraceOptions = DEFAULT_OPTS): TraceDecoratorType {
    return createTracingDecorator({ message, opts, level: LogLevel.Debug });
}
export function traceDecoratorError(message: string): TraceDecoratorType {
    return createTracingDecorator({ message, opts: DEFAULT_OPTS, level: LogLevel.Error });
}
export function traceDecoratorInfo(message: string): TraceDecoratorType {
    return createTracingDecorator({ message, opts: DEFAULT_OPTS, level: LogLevel.Info });
}
export function traceDecoratorWarn(message: string): TraceDecoratorType {
    return createTracingDecorator({ message, opts: DEFAULT_OPTS, level: LogLevel.Warning });
}

// Information about a function/method call.
type CallInfo = {
    kind: string; // "Class", etc.
    name: string;

    args: unknown[];
};

// Information about a traced function/method call.
type TraceInfo = {
    elapsed: number; // milliseconds
    // Either returnValue or err will be set.

    returnValue?: any;
    err?: Error;
};

type LogInfo = {
    opts: TraceOptions;
    message: string;
    level?: LogLevel;
};

// Return a decorator that traces the decorated function.
function traceDecorator(log: (c: CallInfo, t: TraceInfo) => void): TraceDecoratorType {
    return function (_: Object, __: string, descriptor: TypedPropertyDescriptor<any>) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: unknown[]) {
            const call = {
                kind: 'Class',
                name: _ && _.constructor ? _.constructor.name : '',
                args,
            };

            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const scope = this;
            return tracing(
                // "log()"
                (t) => log(call, t),
                // "run()"
                () => originalMethod.apply(scope, args),
            );
        };

        return descriptor;
    };
}

// Call run(), call log() with the trace info, and return the result.
function tracing<T>(log: (t: TraceInfo) => void, run: () => T): T {
    const timer = new StopWatch();
    try {
        const result = run();

        // If method being wrapped returns a promise then wait for it.
        if (isPromise(result)) {
            ((result as unknown) as Promise<void>)
                .then((data) => {
                    log({ elapsed: timer.elapsedTime, returnValue: data });
                    return data;
                })
                .catch((ex) => {
                    log({ elapsed: timer.elapsedTime, err: ex });

                    // TODO(GH-11645) Re-throw the error like we do
                    // in the non-Promise case.
                });
        } else {
            log({ elapsed: timer.elapsedTime, returnValue: result });
        }
        return result;
    } catch (ex) {
        log({ elapsed: timer.elapsedTime, err: ex as Error | undefined });
        throw ex;
    }
}

function createTracingDecorator(logInfo: LogInfo): TraceDecoratorType {
    return traceDecorator((call, traced) => logResult(logInfo, traced, call));
}

function normalizeCall(call: CallInfo): CallInfo {
    let { kind, name, args } = call;
    if (!kind || kind === '') {
        kind = 'Function';
    }
    if (!name || name === '') {
        name = '<anon>';
    }
    if (!args) {
        args = [];
    }
    return { kind, name, args };
}

function formatMessages(logInfo: LogInfo, traced: TraceInfo, call?: CallInfo): string {
    call = normalizeCall(call!);
    const messages = [logInfo.message];
    messages.push(
        `${call.kind} name = ${call.name}`.trim(),
        `completed in ${traced.elapsed}ms`,
        `has a ${traced.returnValue ? 'truthy' : 'falsy'} return value`,
    );
    if ((logInfo.opts & TraceOptions.Arguments) === TraceOptions.Arguments) {
        messages.push(argsToLogString(call.args));
    }
    if ((logInfo.opts & TraceOptions.ReturnValue) === TraceOptions.ReturnValue) {
        messages.push(returnValueToLogString(traced.returnValue));
    }
    return messages.join(', ');
}

function logResult(logInfo: LogInfo, traced: TraceInfo, call?: CallInfo) {
    const formatted = formatMessages(logInfo, traced, call);
    if (traced.err === undefined) {
        // The call did not fail.
        if (!logInfo.level || logInfo.level > LogLevel.Error) {
            logTo(LogLevel.Info, [formatted]);
        }
    } else {
        logTo(LogLevel.Error, [formatted, traced.err]);
        sendTelemetryEvent(('ERROR' as unknown) as EventName, undefined, undefined, traced.err);
    }
}

export function logTo(logLevel: LogLevel, ...args: Arguments): void {
    switch (logLevel) {
        case LogLevel.Error:
            traceError(...args);
            break;
        case LogLevel.Warning:
            traceWarn(...args);
            break;
        case LogLevel.Info:
            traceInfo(...args);
            break;
        case LogLevel.Debug:
            traceVerbose(...args);
            break;
        default:
            break;
    }
}
