/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var es = require("event-stream");
var _ = require("underscore");
var util = require("gulp-util");
var allErrors = [];
var startTime = null;
var count = 0;
function onStart() {
    if (count++ > 0) {
        return;
    }
    startTime = new Date().getTime();
    util.log("Starting " + util.colors.green('compilation') + "...");
}
function onEnd() {
    if (--count > 0) {
        return;
    }
    log();
}
function log() {
    var errors = _.flatten(allErrors);
    errors.map(function (err) { return util.log(util.colors.red('Error') + ": " + err); });
    util.log("Finished " + util.colors.green('compilation') + " with " + errors.length + " errors after " + util.colors.magenta((new Date().getTime() - startTime) + ' ms'));
}
function createReporter() {
    var errors = [];
    allErrors.push(errors);
    var ReportFunc = (function () {
        function ReportFunc(err) {
            errors.push(err);
        }
        ReportFunc.hasErrors = function () {
            return errors.length > 0;
        };
        ReportFunc.end = function (emitError) {
            errors.length = 0;
            onStart();
            return es.through(null, function () {
                onEnd();
                if (emitError && errors.length > 0) {
                    log();
                    this.emit('error');
                }
                else {
                    this.emit('end');
                }
            });
        };
        return ReportFunc;
    }());
    return ReportFunc;
}
exports.createReporter = createReporter;
;
