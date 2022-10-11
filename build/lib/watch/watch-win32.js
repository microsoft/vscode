"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const vinyl_1 = __importDefault(require("vinyl"));
const es = __importStar(require("event-stream"));
const gulp_filter_1 = __importDefault(require("gulp-filter"));
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
            const file = new vinyl_1.default({
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
        .pipe((0, gulp_filter_1.default)(['**', '!.git{,/**}'])) // ignore all things git
        .pipe((0, gulp_filter_1.default)(pattern))
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
