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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRTdCLE1BQU0sUUFBUTtJQUNNO0lBQW5CLFlBQW1CLEVBQVU7UUFBVixPQUFFLEdBQUYsRUFBRSxDQUFRO0lBQzdCLENBQUM7SUFDRCxTQUFTLEdBQWUsRUFBRSxDQUFDO0lBQzNCLFNBQVMsR0FBa0IsSUFBSSxDQUFDO0lBQ2hDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFFVixPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEMsUUFBUSxDQUFDLFlBQVksVUFBVSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFFRCxHQUFHO1FBQ0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNyQyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxH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