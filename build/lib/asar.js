"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAsar = void 0;
const path = require("path");
const es = require("event-stream");
const pickle = require('chromium-pickle-js');
const Filesystem = require('asar/lib/filesystem');
const VinylFile = require("vinyl");
const minimatch = require("minimatch");
function createAsar(folderPath, unpackGlobs, destFilename) {
    const shouldUnpackFile = (file) => {
        for (let i = 0; i < unpackGlobs.length; i++) {
            if (minimatch(file.relative, unpackGlobs[i])) {
                return true;
            }
        }
        return false;
    };
    const filesystem = new Filesystem(folderPath);
    const out = [];
    // Keep track of pending inserts
    let pendingInserts = 0;
    let onFileInserted = () => { pendingInserts--; };
    // Do not insert twice the same directory
    const seenDir = {};
    const insertDirectoryRecursive = (dir) => {
        if (seenDir[dir]) {
            return;
        }
        let lastSlash = dir.lastIndexOf('/');
        if (lastSlash === -1) {
            lastSlash = dir.lastIndexOf('\\');
        }
        if (lastSlash !== -1) {
            insertDirectoryRecursive(dir.substring(0, lastSlash));
        }
        seenDir[dir] = true;
        filesystem.insertDirectory(dir);
    };
    const insertDirectoryForFile = (file) => {
        let lastSlash = file.lastIndexOf('/');
        if (lastSlash === -1) {
            lastSlash = file.lastIndexOf('\\');
        }
        if (lastSlash !== -1) {
            insertDirectoryRecursive(file.substring(0, lastSlash));
        }
    };
    const insertFile = (relativePath, stat, shouldUnpack) => {
        insertDirectoryForFile(relativePath);
        pendingInserts++;
        // Do not pass `onFileInserted` directly because it gets overwritten below.
        // Create a closure capturing `onFileInserted`.
        filesystem.insertFile(relativePath, shouldUnpack, { stat: stat }, {}).then(() => onFileInserted(), () => onFileInserted());
    };
    return es.through(function (file) {
        if (file.stat.isDirectory()) {
            return;
        }
        if (!file.stat.isFile()) {
            throw new Error(`unknown item in stream!`);
        }
        const shouldUnpack = shouldUnpackFile(file);
        insertFile(file.relative, { size: file.contents.length, mode: file.stat.mode }, shouldUnpack);
        if (shouldUnpack) {
            // The file goes outside of xx.asar, in a folder xx.asar.unpacked
            const relative = path.relative(folderPath, file.path);
            this.queue(new VinylFile({
                base: '.',
                path: path.join(destFilename + '.unpacked', relative),
                stat: file.stat,
                contents: file.contents
            }));
        }
        else {
            // The file goes inside of xx.asar
            out.push(file.contents);
        }
    }, function () {
        const finish = () => {
            {
                const headerPickle = pickle.createEmpty();
                headerPickle.writeString(JSON.stringify(filesystem.header));
                const headerBuf = headerPickle.toBuffer();
                const sizePickle = pickle.createEmpty();
                sizePickle.writeUInt32(headerBuf.length);
                const sizeBuf = sizePickle.toBuffer();
                out.unshift(headerBuf);
                out.unshift(sizeBuf);
            }
            const contents = Buffer.concat(out);
            out.length = 0;
            this.queue(new VinylFile({
                base: '.',
                path: destFilename,
                contents: contents
            }));
            this.queue(null);
        };
        // Call finish() only when all file inserts have finished...
        if (pendingInserts === 0) {
            finish();
        }
        else {
            onFileInserted = () => {
                pendingInserts--;
                if (pendingInserts === 0) {
                    finish();
                }
            };
        }
    });
}
exports.createAsar = createAsar;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNhci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFzYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsNkJBQTZCO0FBQzdCLG1DQUFtQztBQUNuQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUM3QyxNQUFNLFVBQVUsR0FBMEIsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDekUsbUNBQW1DO0FBQ25DLHVDQUF1QztBQVN2QyxTQUFnQixVQUFVLENBQUMsVUFBa0IsRUFBRSxXQUFxQixFQUFFLFlBQW9CO0lBRXpGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFlLEVBQVcsRUFBRTtRQUNyRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUM1QyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUM3QyxPQUFPLElBQUksQ0FBQzthQUNaO1NBQ0Q7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUMsQ0FBQztJQUVGLE1BQU0sVUFBVSxHQUFHLElBQUksVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztJQUV6QixnQ0FBZ0M7SUFDaEMsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZCLElBQUksY0FBYyxHQUFHLEdBQUcsRUFBRSxHQUFHLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWpELHlDQUF5QztJQUN6QyxNQUFNLE9BQU8sR0FBK0IsRUFBRSxDQUFDO0lBQy9DLE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRTtRQUNoRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNqQixPQUFPO1NBQ1A7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