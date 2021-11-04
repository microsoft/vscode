/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
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
        let finish = () => {
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
