/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var es = require("event-stream");
var util = require("gulp-util");
var Entry = /** @class */ (function () {
    function Entry(name, totalCount, totalSize) {
        this.name = name;
        this.totalCount = totalCount;
        this.totalSize = totalSize;
    }
    Entry.prototype.toString = function () {
        return this.name + ": " + this.totalCount + " files with " + this.totalSize + " bytes";
    };
    return Entry;
}());
var _entries = new Map();
function createStatsStream(group, log) {
    var entry = new Entry(group, 0, 0);
    _entries.set(entry.name, entry);
    return es.through(function (data) {
        var file = data;
        if (typeof file.path === 'string') {
            entry.totalCount += 1;
            if (Buffer.isBuffer(file.contents)) {
                entry.totalSize += file.contents.length;
            }
            else if (file.stat && typeof file.stat.size === 'number') {
                entry.totalSize += file.stat.size;
            }
            else {
                // funky file...
            }
        }
        this.emit('data', data);
    }, function () {
        if (log) {
            if (entry.totalCount === 1) {
                util.log("Stats for '" + util.colors.grey(entry.name) + "': " + Math.round(entry.totalSize / 1204) + "KB");
            }
            else {
                var count = entry.totalCount < 100
                    ? util.colors.green(entry.totalCount.toString())
                    : util.colors.red(entry.totalCount.toString());
                util.log("Stats for '" + util.colors.grey(entry.name) + "': " + count + " files, " + Math.round(entry.totalSize / 1204) + "KB");
            }
        }
        this.emit('end');
    });
}
exports.createStatsStream = createStatsStream;
