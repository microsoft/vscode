"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAsar = createAsar;
const path_1 = __importDefault(require("path"));
const event_stream_1 = __importDefault(require("event-stream"));
const pickle = require('chromium-pickle-js');
const Filesystem = require('asar/lib/filesystem');
const vinyl_1 = __importDefault(require("vinyl"));
const minimatch_1 = __importDefault(require("minimatch"));
function createAsar(folderPath, unpackGlobs, skipGlobs, duplicateGlobs, destFilename) {
    const shouldUnpackFile = (file) => {
        for (let i = 0; i < unpackGlobs.length; i++) {
            if ((0, minimatch_1.default)(file.relative, unpackGlobs[i])) {
                return true;
            }
        }
        return false;
    };
    const shouldSkipFile = (file) => {
        for (const skipGlob of skipGlobs) {
            if ((0, minimatch_1.default)(file.relative, skipGlob)) {
                return true;
            }
        }
        return false;
    };
    // Files that should be duplicated between
    // node_modules.asar and node_modules
    const shouldDuplicateFile = (file) => {
        for (const duplicateGlob of duplicateGlobs) {
            if ((0, minimatch_1.default)(file.relative, duplicateGlob)) {
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
    return event_stream_1.default.through(function (file) {
        if (file.stat.isDirectory()) {
            return;
        }
        if (!file.stat.isFile()) {
            throw new Error(`unknown item in stream!`);
        }
        if (shouldSkipFile(file)) {
            this.queue(new vinyl_1.default({
                base: '.',
                path: file.path,
                stat: file.stat,
                contents: file.contents
            }));
            return;
        }
        if (shouldDuplicateFile(file)) {
            this.queue(new vinyl_1.default({
                base: '.',
                path: file.path,
                stat: file.stat,
                contents: file.contents
            }));
        }
        const shouldUnpack = shouldUnpackFile(file);
        insertFile(file.relative, { size: file.contents.length, mode: file.stat.mode }, shouldUnpack);
        if (shouldUnpack) {
            // The file goes outside of xx.asar, in a folder xx.asar.unpacked
            const relative = path_1.default.relative(folderPath, file.path);
            this.queue(new vinyl_1.default({
                base: '.',
                path: path_1.default.join(destFilename + '.unpacked', relative),
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
            this.queue(new vinyl_1.default({
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
//# sourceMappingURL=asar.js.map