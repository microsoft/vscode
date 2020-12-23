/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReporter = void 0;
const es = require("event-stream");
const _ = require("underscore");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const fs = require("fs");
const path = require("path");
class ErrorLog {
    constructor(id) {
        this.id = id;
        this.allErrors = [];
        this.startTime = null;
        this.count = 0;
    }
    onStart() {
        if (this.count++ > 0) {
            return;
        }
        this.startTime = new Date().getTime();
        fancyLog(`Starting ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''}...`);
    }
    onEnd() {
        if (--this.count > 0) {
            return;
        }
        this.log();
    }
    log() {
        const errors = _.flatten(this.allErrors);
        const seen = new Set();
        errors.map(err => {
            if (!seen.has(err)) {
                seen.add(err);
                fancyLog(`${ansiColors.red('Error')}: ${err}`);
            }
        });
        fancyLog(`Finished ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''} with ${errors.length} errors after ${ansiColors.magenta((new Date().getTime() - this.startTime) + ' ms')}`);
        const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
        const messages = errors
            .map(err => regex.exec(err))
            .filter(match => !!match)
            .map(x => x)
            .map(([, path, line, column, message]) => ({ path, line: parseInt(line), column: parseInt(column), message }));
        try {
            const logFileName = 'log' + (this.id ? `_${this.id}` : '');
            fs.writeFileSync(path.join(buildLogFolder, logFileName), JSON.stringify(messages));
        }
        catch (err) {
            //noop
        }
    }
}
const errorLogsById = new Map();
function getErrorLog(id = '') {
    let errorLog = errorLogsById.get(id);
    if (!errorLog) {
        errorLog = new ErrorLog(id);
        errorLogsById.set(id, errorLog);
    }
    return errorLog;
}
const buildLogFolder = path.join(path.dirname(path.dirname(__dirname)), '.build');
try {
    fs.mkdirSync(buildLogFolder);
}
catch (err) {
    // ignore
}
function createReporter(id) {
    const errorLog = getErrorLog(id);
    const errors = [];
    errorLog.allErrors.push(errors);
    const result = (err) => errors.push(err);
    result.hasErrors = () => errors.length > 0;
    result.end = (emitError) => {
        errors.length = 0;
        errorLog.onStart();
        return es.through(undefined, function () {
            errorLog.onEnd();
            if (emitError && errors.length > 0) {
                if (!errors.__logged__) {
                    errorLog.log();
                }
                errors.__logged__ = true;
                const err = new Error(`Found ${errors.length} errors`);
                err.__reporter__ = true;
                this.emit('error', err);
            }
            else {
                this.emit('end');
            }
        });
    };
    return result;
}
exports.createReporter = createReporter;
