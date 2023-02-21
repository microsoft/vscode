"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReporter = void 0;
const es = require("event-stream");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const fs = require("fs");
const path = require("path");
class ErrorLog {
    id;
    constructor(id) {
        this.id = id;
    }
    allErrors = [];
    startTime = null;
    count = 0;
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
        const errors = this.allErrors.flat();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRTdCLE1BQU0sUUFBUTtJQUNNO0lBQW5CLFlBQW1CLEVBQVU7UUFBVixPQUFFLEdBQUYsRUFBRSxDQUFRO0lBQzdCLENBQUM7SUFDRCxTQUFTLEdBQWUsRUFBRSxDQUFDO0lBQzNCLFNBQVMsR0FBa0IsSUFBSSxDQUFDO0lBQ2hDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFFVixPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLE9BQU87U0FDUDtRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN0QyxRQUFRLENBQUMsWUFBWSxVQUFVLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM1RyxDQUFDO0lBRUQsS0FBSztRQUNKLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRTtZQUNyQixPQUFPO1NBQ1A7UUFFRCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQsR0FBRztRQUNGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckMsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUUvQixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxF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