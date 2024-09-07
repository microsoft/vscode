"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const cp = require("child_process");
const fs = require("fs");
const File = require("vinyl");
const es = require("event-stream");
const filter = require("gulp-filter");
const watcherPath = path.join(__dirname, 'watcher.exe');
function toChangeType(type) {
    switch (type) {
        case '0': return 'change';
        case '1': return 'add';
        default: return 'unlink';
    }
}
function watch(root) {
    const result = es.through();
    let child = cp.spawn(watcherPath, [root]);
    child.stdout.on('data', function (data) {
        const lines = data.toString('utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) {
                continue;
            }
            const changeType = line[0];
            const changePath = line.substr(2);
            // filter as early as possible
            if (/^\.git/.test(changePath) || /(^|\\)out($|\\)/.test(changePath)) {
                continue;
            }
            const changePathFull = path.join(root, changePath);
            const file = new File({
                path: changePathFull,
                base: root
            });
            file.event = toChangeType(changeType);
            result.emit('data', file);
        }
    });
    child.stderr.on('data', function (data) {
        result.emit('error', data);
    });
    child.on('exit', function (code) {
        result.emit('error', 'Watcher died with code ' + code);
        child = null;
    });
    process.once('SIGTERM', function () { process.exit(0); });
    process.once('SIGTERM', function () { process.exit(0); });
    process.once('exit', function () { if (child) {
        child.kill();
    } });
    return result;
}
const cache = Object.create(null);
module.exports = function (pattern, options) {
    options = options || {};
    const cwd = path.normalize(options.cwd || process.cwd());
    let watcher = cache[cwd];
    if (!watcher) {
        watcher = cache[cwd] = watch(cwd);
    }
    const rebase = !options.base ? es.through() : es.mapSync(function (f) {
        f.base = options.base;
        return f;
    });
    return watcher
        .pipe(filter(['**', '!.git{,/**}'], { dot: options.dot })) // ignore all things git
        .pipe(filter(pattern, { dot: options.dot }))
        .pipe(es.map(function (file, cb) {
        fs.stat(file.path, function (err, stat) {
            if (err && err.code === 'ENOENT') {
                return cb(undefined, file);
            }
            if (err) {
                return cb();
            }
            if (!stat.isFile()) {
                return cb();
            }
            fs.readFile(file.path, function (err, contents) {
                if (err && err.code === 'ENOENT') {
                    return cb(undefined, file);
                }
                if (err) {
                    return cb();
                }
                file.contents = contents;
                file.stat = stat;
                cb(undefined, file);
            });
        });
    }))
        .pipe(rebase);
};
//# sourceMappingURL=watch-win32.js.map