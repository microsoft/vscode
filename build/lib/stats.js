"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatsStream = void 0;
const es = require("event-stream");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
class Entry {
    name;
    totalCount;
    totalSize;
    constructor(name, totalCount, totalSize) {
        this.name = name;
        this.totalCount = totalCount;
        this.totalSize = totalSize;
    }
    toString(pretty) {
        if (!pretty) {
            if (this.totalCount === 1) {
                return `${this.name}: ${this.totalSize} bytes`;
            }
            else {
                return `${this.name}: ${this.totalCount} files with ${this.totalSize} bytes`;
            }
        }
        else {
            if (this.totalCount === 1) {
                return `Stats for '${ansiColors.grey(this.name)}': ${Math.round(this.totalSize / 1204)}KB`;
            }
            else {
                const count = this.totalCount < 100
                    ? ansiColors.green(this.totalCount.toString())
                    : ansiColors.red(this.totalCount.toString());
                return `Stats for '${ansiColors.grey(this.name)}': ${count} files, ${Math.round(this.totalSize / 1204)}KB`;
            }
        }
    }
}
const _entries = new Map();
function createStatsStream(group, log) {
    const entry = new Entry(group, 0, 0);
    _entries.set(entry.name, entry);
    return es.through(function (data) {
        const file = data;
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
                fancyLog(`Stats for '${ansiColors.grey(entry.name)}': ${Math.round(entry.totalSize / 1204)}KB`);
            }
            else {
                const count = entry.totalCount < 100
                    ? ansiColors.green(entry.totalCount.toString())
                    : ansiColors.red(entry.totalCount.toString());
                fancyLog(`Stats for '${ansiColors.grey(entry.name)}': ${count} files, ${Math.round(entry.totalSize / 1204)}KB`);
            }
        }
        this.emit('end');
    });
}
exports.createStatsStream = createStatsStream;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGF0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUcxQyxNQUFNLEtBQUs7SUFDVztJQUFxQjtJQUEyQjtJQUFyRSxZQUFxQixJQUFZLEVBQVMsVUFBa0IsRUFBUyxTQUFpQjtRQUFqRSxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUFTLGNBQVMsR0FBVCxTQUFTLENBQVE7SUFBSSxDQUFDO0lBRTNGLFFBQVEsQ0FBQyxNQUFnQjtRQUN4QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxTQUFTLFFBQVEsQ0FBQztZQUNoRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLFVBQVUsZUFBZSxJQUFJLENBQUMsU0FBUyxRQUFRLENBQUM7WUFDOUUsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMzQixPQUFPLGNBQWMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7WUFFNUYsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRztvQkFDbEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVB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