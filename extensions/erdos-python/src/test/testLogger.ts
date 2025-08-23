// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { initializeFileLogging, logTo } from '../client/logging';
import { LogLevel } from '../client/logging/types';

// IMPORTANT: This file should only be importing from the '../client/logging' directory, as we
// delete everything in '../client' except for '../client/logging' before running smoke tests.

const isCI = process.env.TRAVIS === 'true' || process.env.TF_BUILD !== undefined;

export function initializeLogger() {
    if (isCI && process.env.VSC_PYTHON_LOG_FILE) {
        initializeFileLogging([]);
        // Send console.*() to the non-console loggers.
        monkeypatchConsole();
    }
}

/**
 * What we're doing here is monkey patching the console.log so we can
 * send everything sent to console window into our logs.  This is only
 * required when we're directly writing to `console.log` or not using
 * our `winston logger`.  This is something we'd generally turn on only
 * on CI so we can see everything logged to the console window
 * (via the logs).
 */
function monkeypatchConsole() {
    // The logging "streams" (methods) of the node console.
    const streams = ['log', 'error', 'warn', 'info', 'debug', 'trace'];
    const levels: { [key: string]: LogLevel } = {
        error: LogLevel.Error,
        warn: LogLevel.Warning,
        debug: LogLevel.Debug,
        trace: LogLevel.Debug,
        info: LogLevel.Info,
        log: LogLevel.Info,
    };

    const consoleAny: any = console;
    for (const stream of streams) {
        // Using symbols guarantee the properties will be unique & prevents
        // clashing with names other code/library may create or have created.
        // We could use a closure but it's a bit trickier.
        const sym = Symbol.for(stream);
        consoleAny[sym] = consoleAny[stream];
        consoleAny[stream] = function () {
            const args = Array.prototype.slice.call(arguments);
            const fn = consoleAny[sym];
            fn(...args);
            const level = levels[stream] || LogLevel.Info;
            logTo(level, args);
        };
    }
}
