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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2gtd2luMzIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YXRjaC13aW4zMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLDZCQUE2QjtBQUM3QixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLDhCQUE4QjtBQUM5QixtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBR3RDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBRXhELFNBQVMsWUFBWSxDQUFDLElBQXFCO0lBQzFDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLEdBQUcsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDO1FBQzFCLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUM7UUFDdkIsT0FBTyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUM7SUFDMUIsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLEtBQUssQ0FBQyxJQUFZO0lBQzFCLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUM1QixJQUFJLEtBQUssR0FBMkIsRUFBRSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBRWxFLEtBQUssQ0FBQyxNQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxVQUFVLElBQUk7UUFDdEMsTUFBTSxLQUFLLEdBQWEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0IsSUFBSSxJ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