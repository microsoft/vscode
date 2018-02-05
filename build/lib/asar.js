/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var es = require("event-stream");
var pickle = require("chromium-pickle-js");
var Filesystem = require("asar/lib/filesystem");
var VinylFile = require("vinyl");
var minimatch = require("minimatch");
function createAsar(folderPath, unpackGlobs, destFilename) {
    var shouldUnpackFile = function (file) {
        for (var i = 0; i < unpackGlobs.length; i++) {
            if (minimatch(file.relative, unpackGlobs[i])) {
                return true;
            }
        }
        return false;
    };
    var filesystem = new Filesystem(folderPath);
    var out = [];
    // Keep track of pending inserts
    var pendingInserts = 0;
    var onFileInserted = function () { pendingInserts--; };
    // Do not insert twice the same directory
    var seenDir = {};
    var insertDirectoryRecursive = function (dir) {
        if (seenDir[dir]) {
            return;
        }
        var lastSlash = dir.lastIndexOf('/');
        if (lastSlash === -1) {
            lastSlash = dir.lastIndexOf('\\');
        }
        if (lastSlash !== -1) {
            insertDirectoryRecursive(dir.substring(0, lastSlash));
        }
        seenDir[dir] = true;
        filesystem.insertDirectory(dir);
    };
    var insertDirectoryForFile = function (file) {
        var lastSlash = file.lastIndexOf('/');
        if (lastSlash === -1) {
            lastSlash = file.lastIndexOf('\\');
        }
        if (lastSlash !== -1) {
            insertDirectoryRecursive(file.substring(0, lastSlash));
        }
    };
    var insertFile = function (relativePath, stat, shouldUnpack) {
        insertDirectoryForFile(relativePath);
        pendingInserts++;
        filesystem.insertFile(relativePath, shouldUnpack, { stat: stat }, {}, onFileInserted);
    };
    return es.through(function (file) {
        if (file.stat.isDirectory()) {
            return;
        }
        if (!file.stat.isFile()) {
            throw new Error("unknown item in stream!");
        }
        var shouldUnpack = shouldUnpackFile(file);
        insertFile(file.relative, { size: file.contents.length, mode: file.stat.mode }, shouldUnpack);
        if (shouldUnpack) {
            // The file goes outside of xx.asar, in a folder xx.asar.unpacked
            var relative = path.relative(folderPath, file.path);
            this.queue(new VinylFile({
                cwd: folderPath,
                base: folderPath,
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
        var _this = this;
        var finish = function () {
            {
                var headerPickle = pickle.createEmpty();
                headerPickle.writeString(JSON.stringify(filesystem.header));
                var headerBuf = headerPickle.toBuffer();
                var sizePickle = pickle.createEmpty();
                sizePickle.writeUInt32(headerBuf.length);
                var sizeBuf = sizePickle.toBuffer();
                out.unshift(headerBuf);
                out.unshift(sizeBuf);
            }
            var contents = Buffer.concat(out);
            out.length = 0;
            _this.queue(new VinylFile({
                cwd: folderPath,
                base: folderPath,
                path: destFilename,
                contents: contents
            }));
            _this.queue(null);
        };
        // Call finish() only when all file inserts have finished...
        if (pendingInserts === 0) {
            finish();
        }
        else {
            onFileInserted = function () {
                pendingInserts--;
                if (pendingInserts === 0) {
                    finish();
                }
            };
        }
    });
}
exports.createAsar = createAsar;
