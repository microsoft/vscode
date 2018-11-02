/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const es = require("event-stream");
const _ = require("underscore");
const util = require("gulp-util");
const fs = require("fs");
const path = require("path");
const allErrors = [];
let startTime = null;
let count = 0;
function onStart() {
    if (count++ > 0) {
        return;
    }
    startTime = new Date().getTime();
    util.log(`Starting ${util.colors.green('compilation')}...`);
}
function onEnd() {
    if (--count > 0) {
        return;
    }
    log();
}
const buildLogPath = path.join(path.dirname(path.dirname(__dirname)), '.build', 'log');
try {
    fs.mkdirSync(path.dirname(buildLogPath));
}
catch (err) {
    // ignore
}
function log() {
    const errors = _.flatten(allErrors);
    const seen = new Set();
    errors.map(err => {
        if (!seen.has(err)) {
            seen.add(err);
            util.log(`${util.colors.red('Error')}: ${err}`);
        }
    });
    const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/;
    const messages = errors
        .map(err => regex.exec(err))
        .filter(match => !!match)
        .map(x => x)
        .map(([, path, line, column, message]) => ({ path, line: parseInt(line), column: parseInt(column), message }));
    try {
        fs.writeFileSync(buildLogPath, JSON.stringify(messages));
    }
    catch (err) {
        //noop
    }
    util.log(`Finished ${util.colors.green('compilation')} with ${errors.length} errors after ${util.colors.magenta((new Date().getTime() - startTime) + ' ms')}`);
}
function createReporter() {
    const errors = [];
    allErrors.push(errors);
    const result = (err) => errors.push(err);
    result.hasErrors = () => errors.length > 0;
    result.end = (emitError) => {
        errors.length = 0;
        onStart();
        return es.through(undefined, function () {
            onEnd();
            if (emitError && errors.length > 0) {
                if (!errors.__logged__) {
                    log();
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
