"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReporter = void 0;
const es = require("event-stream");
const _ = require("underscore");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsZ0NBQWdDO0FBQ2hDLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFDMUMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUU3QixNQUFNLFFBQVE7SUFDTTtJQUFuQixZQUFtQixFQUFVO1FBQVYsT0FBRSxHQUFGLEVBQUUsQ0FBUTtJQUM3QixDQUFDO0lBQ0QsU0FBUyxHQUFlLEVBQUUsQ0FBQztJQUMzQixTQUFTLEdBQWtCLElBQUksQ0FBQztJQUNoQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBRVYsT0FBTztRQUNOLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsRUFBRTtZQUNyQixPQUFPO1NBQ1A7UUFFRCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEMsUUFBUSxDQUFDLFlBQVksVUFBVSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUU7WUFDckIsT0FBTztTQUNQO1FBRUQsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ1osQ0FBQztJQUVELEdBQUc7UUFDRixNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRS9CLE1BQU0sQ0FB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