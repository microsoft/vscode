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
        .pipe(filter(['**', '!.git{,/**}'])) // ignore all things git
        .pipe(filter(pattern))
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2gtd2luMzIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaC13aW4zMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLDZCQUE2QjtBQUM3QixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLDhCQUE4QjtBQUM5QixtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBR3RDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBRXhELFNBQVMsWUFBWSxDQUFDLElBQXFCO0lBQzFDLFFBQVEsSUFBSSxFQUFFO1FBQ2IsS0FBSyxHQUFHLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQztRQUMxQixLQUFLLEdBQUcsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDO0tBQ3pCO0FBQ0YsQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLElBQVk7SUFDMUIsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzVCLElBQUksS0FBSyxHQUEyQixFQUFFLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFbEUsS0FBSyxDQUFDLE1BQU8sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLFVBQVUsSUFBSTtRQUN0QyxNQUFNLEtBQUssR0FBYSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN0QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0IsSUFBSSxJQUFJLENBQUMsTUFBTSxL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