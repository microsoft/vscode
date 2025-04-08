"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incremental = incremental;
exports.debounce = debounce;
exports.fixWin32DirectoryPermissions = fixWin32DirectoryPermissions;
exports.setExecutableBit = setExecutableBit;
exports.toFileUri = toFileUri;
exports.skipDirectories = skipDirectories;
exports.cleanNodeModules = cleanNodeModules;
exports.loadSourcemaps = loadSourcemaps;
exports.stripSourceMappingURL = stripSourceMappingURL;
exports.$if = $if;
exports.appendOwnPathSourceURL = appendOwnPathSourceURL;
exports.rewriteSourceMappingURL = rewriteSourceMappingURL;
exports.rimraf = rimraf;
exports.rreddir = rreddir;
exports.ensureDir = ensureDir;
exports.rebase = rebase;
exports.filter = filter;
exports.streamToPromise = streamToPromise;
exports.getElectronVersion = getElectronVersion;
const event_stream_1 = __importDefault(require("event-stream"));
const debounce_1 = __importDefault(require("debounce"));
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const gulp_rename_1 = __importDefault(require("gulp-rename"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const rimraf_1 = __importDefault(require("rimraf"));
const url_1 = require("url");
const ternary_stream_1 = __importDefault(require("ternary-stream"));
const root = path_1.default.dirname(path_1.default.dirname(__dirname));
const NoCancellationToken = { isCancellationRequested: () => false };
function incremental(streamProvider, initial, supportsCancellation) {
    const input = event_stream_1.default.through();
    const output = event_stream_1.default.through();
    let state = 'idle';
    let buffer = Object.create(null);
    const token = !supportsCancellation ? undefined : { isCancellationRequested: () => Object.keys(buffer).length > 0 };
    const run = (input, isCancellable) => {
        state = 'running';
        const stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);
        input
            .pipe(stream)
            .pipe(event_stream_1.default.through(undefined, () => {
            state = 'idle';
            eventuallyRun();
        }))
            .pipe(output);
    };
    if (initial) {
        run(initial, false);
    }
    const eventuallyRun = (0, debounce_1.default)(() => {
        const paths = Object.keys(buffer);
        if (paths.length === 0) {
            return;
        }
        const data = paths.map(path => buffer[path]);
        buffer = Object.create(null);
        run(event_stream_1.default.readArray(data), true);
    }, 500);
    input.on('data', (f) => {
        buffer[f.path] = f;
        if (state === 'idle') {
            eventuallyRun();
        }
    });
    return event_stream_1.default.duplex(input, output);
}
function debounce(task, duration = 500) {
    const input = event_stream_1.default.through();
    const output = event_stream_1.default.through();
    let state = 'idle';
    const run = () => {
        state = 'running';
        task()
            .pipe(event_stream_1.default.through(undefined, () => {
            const shouldRunAgain = state === 'stale';
            state = 'idle';
            if (shouldRunAgain) {
                eventuallyRun();
            }
        }))
            .pipe(output);
    };
    run();
    const eventuallyRun = (0, debounce_1.default)(() => run(), duration);
    input.on('data', () => {
        if (state === 'idle') {
            eventuallyRun();
        }
        else {
            state = 'stale';
        }
    });
    return event_stream_1.default.duplex(input, output);
}
function fixWin32DirectoryPermissions() {
    if (!/win32/.test(process.platform)) {
        return event_stream_1.default.through();
    }
    return event_stream_1.default.mapSync(f => {
        if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
            f.stat.mode = 16877;
        }
        return f;
    });
}
function setExecutableBit(pattern) {
    const setBit = event_stream_1.default.mapSync(f => {
        if (!f.stat) {
            f.stat = { isFile() { return true; } };
        }
        f.stat.mode = /* 100755 */ 33261;
        return f;
    });
    if (!pattern) {
        return setBit;
    }
    const input = event_stream_1.default.through();
    const filter = (0, gulp_filter_1.default)(pattern, { restore: true });
    const output = input
        .pipe(filter)
        .pipe(setBit)
        .pipe(filter.restore);
    return event_stream_1.default.duplex(input, output);
}
function toFileUri(filePath) {
    const match = filePath.match(/^([a-z])\:(.*)$/i);
    if (match) {
        filePath = '/' + match[1].toUpperCase() + ':' + match[2];
    }
    return 'file://' + filePath.replace(/\\/g, '/');
}
function skipDirectories() {
    return event_stream_1.default.mapSync(f => {
        if (!f.isDirectory()) {
            return f;
        }
    });
}
function cleanNodeModules(rulePath) {
    const rules = fs_1.default.readFileSync(rulePath, 'utf8')
        .split(/\r?\n/g)
        .map(line => line.trim())
        .filter(line => line && !/^#/.test(line));
    const excludes = rules.filter(line => !/^!/.test(line)).map(line => `!**/node_modules/${line}`);
    const includes = rules.filter(line => /^!/.test(line)).map(line => `**/node_modules/${line.substr(1)}`);
    const input = event_stream_1.default.through();
    const output = event_stream_1.default.merge(input.pipe((0, gulp_filter_1.default)(['**', ...excludes])), input.pipe((0, gulp_filter_1.default)(includes)));
    return event_stream_1.default.duplex(input, output);
}
function loadSourcemaps() {
    const input = event_stream_1.default.through();
    const output = input
        .pipe(event_stream_1.default.map((f, cb) => {
        if (f.sourceMap) {
            cb(undefined, f);
            return;
        }
        if (!f.contents) {
            cb(undefined, f);
            return;
        }
        const contents = f.contents.toString('utf8');
        const reg = /\/\/# sourceMappingURL=(.*)$/g;
        let lastMatch = null;
        let match = null;
        while (match = reg.exec(contents)) {
            lastMatch = match;
        }
        if (!lastMatch) {
            f.sourceMap = {
                version: '3',
                names: [],
                mappings: '',
                sources: [f.relative.replace(/\\/g, '/')],
                sourcesContent: [contents]
            };
            cb(undefined, f);
            return;
        }
        f.contents = Buffer.from(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');
        fs_1.default.readFile(path_1.default.join(path_1.default.dirname(f.path), lastMatch[1]), 'utf8', (err, contents) => {
            if (err) {
                return cb(err);
            }
            f.sourceMap = JSON.parse(contents);
            cb(undefined, f);
        });
    }));
    return event_stream_1.default.duplex(input, output);
}
function stripSourceMappingURL() {
    const input = event_stream_1.default.through();
    const output = input
        .pipe(event_stream_1.default.mapSync(f => {
        const contents = f.contents.toString('utf8');
        f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
        return f;
    }));
    return event_stream_1.default.duplex(input, output);
}
/** Splits items in the stream based on the predicate, sending them to onTrue if true, or onFalse otherwise */
function $if(test, onTrue, onFalse = event_stream_1.default.through()) {
    if (typeof test === 'boolean') {
        return test ? onTrue : onFalse;
    }
    return (0, ternary_stream_1.default)(test, onTrue, onFalse);
}
/** Operator that appends the js files' original path a sourceURL, so debug locations map */
function appendOwnPathSourceURL() {
    const input = event_stream_1.default.through();
    const output = input
        .pipe(event_stream_1.default.mapSync(f => {
        if (!(f.contents instanceof Buffer)) {
            throw new Error(`contents of ${f.path} are not a buffer`);
        }
        f.contents = Buffer.concat([f.contents, Buffer.from(`\n//# sourceURL=${(0, url_1.pathToFileURL)(f.path)}`)]);
        return f;
    }));
    return event_stream_1.default.duplex(input, output);
}
function rewriteSourceMappingURL(sourceMappingURLBase) {
    const input = event_stream_1.default.through();
    const output = input
        .pipe(event_stream_1.default.mapSync(f => {
        const contents = f.contents.toString('utf8');
        const str = `//# sourceMappingURL=${sourceMappingURLBase}/${path_1.default.dirname(f.relative).replace(/\\/g, '/')}/$1`;
        f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, str));
        return f;
    }));
    return event_stream_1.default.duplex(input, output);
}
function rimraf(dir) {
    const result = () => new Promise((c, e) => {
        let retries = 0;
        const retry = () => {
            (0, rimraf_1.default)(dir, { maxBusyTries: 1 }, (err) => {
                if (!err) {
                    return c();
                }
                if (err.code === 'ENOTEMPTY' && ++retries < 5) {
                    return setTimeout(() => retry(), 10);
                }
                return e(err);
            });
        };
        retry();
    });
    result.taskName = `clean-${path_1.default.basename(dir).toLowerCase()}`;
    return result;
}
function _rreaddir(dirPath, prepend, result) {
    const entries = fs_1.default.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            _rreaddir(path_1.default.join(dirPath, entry.name), `${prepend}/${entry.name}`, result);
        }
        else {
            result.push(`${prepend}/${entry.name}`);
        }
    }
}
function rreddir(dirPath) {
    const result = [];
    _rreaddir(dirPath, '', result);
    return result;
}
function ensureDir(dirPath) {
    if (fs_1.default.existsSync(dirPath)) {
        return;
    }
    ensureDir(path_1.default.dirname(dirPath));
    fs_1.default.mkdirSync(dirPath);
}
function rebase(count) {
    return (0, gulp_rename_1.default)(f => {
        const parts = f.dirname ? f.dirname.split(/[\/\\]/) : [];
        f.dirname = parts.slice(count).join(path_1.default.sep);
    });
}
function filter(fn) {
    const result = event_stream_1.default.through(function (data) {
        if (fn(data)) {
            this.emit('data', data);
        }
        else {
            result.restore.push(data);
        }
    });
    result.restore = event_stream_1.default.through();
    return result;
}
function streamToPromise(stream) {
    return new Promise((c, e) => {
        stream.on('error', err => e(err));
        stream.on('end', () => c());
    });
}
function getElectronVersion() {
    const npmrc = fs_1.default.readFileSync(path_1.default.join(root, '.npmrc'), 'utf8');
    const electronVersion = /^target="(.*)"$/m.exec(npmrc)[1];
    const msBuildId = /^ms_build_id="(.*)"$/m.exec(npmrc)[1];
    return { electronVersion, msBuildId };
}
//# sourceMappingURL=util.js.map