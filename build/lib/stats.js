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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGF0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUcxQyxNQUFNLEtBQUs7SUFDVztJQUFxQjtJQUEyQjtJQUFyRSxZQUFxQixJQUFZLEVBQVMsVUFBa0IsRUFBUyxTQUFpQjtRQUFqRSxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUFTLGNBQVMsR0FBVCxTQUFTLENBQVE7SUFBSSxDQUFDO0lBRTNGLFFBQVEsQ0FBQyxNQUFnQjtRQUN4QixJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ1osSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRTtnQkFDMUIsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLFNBQVMsUUFBUSxDQUFDO2FBQy9DO2lCQUFNO2dCQUNOLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxVQUFVLGVBQWUsSUFBSSxDQUFDLFNBQVMsUUFBUSxDQUFDO2FBQzdFO1NBQ0Q7YUFBTTtZQUNOLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxDQUFDLEVBQUU7Z0JBQzFCLE9BQU8sY0FBYyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQzthQUUzRjtpQkFBTTtnQkFDTixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUc7b0JBQ2xDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzlDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUks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