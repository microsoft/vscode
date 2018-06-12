/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var es = require("event-stream");
var debounce = require("debounce");
var _filter = require("gulp-filter");
var rename = require("gulp-rename");
var _ = require("underscore");
var path = require("path");
var fs = require("fs");
var _rimraf = require("rimraf");
var git = require("./git");
var VinylFile = require("vinyl");
var cp = require("child_process");
var NoCancellationToken = { isCancellationRequested: function () { return false; } };
function incremental(streamProvider, initial, supportsCancellation) {
    var input = es.through();
    var output = es.through();
    var state = 'idle';
    var buffer = Object.create(null);
    var token = !supportsCancellation ? null : { isCancellationRequested: function () { return Object.keys(buffer).length > 0; } };
    var run = function (input, isCancellable) {
        state = 'running';
        var stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);
        input
            .pipe(stream)
            .pipe(es.through(null, function () {
            state = 'idle';
            eventuallyRun();
        }))
            .pipe(output);
    };
    if (initial) {
        run(initial, false);
    }
    var eventuallyRun = debounce(function () {
        var paths = Object.keys(buffer);
        if (paths.length === 0) {
            return;
        }
        var data = paths.map(function (path) { return buffer[path]; });
        buffer = Object.create(null);
        run(es.readArray(data), true);
    }, 500);
    input.on('data', function (f) {
        buffer[f.path] = f;
        if (state === 'idle') {
            eventuallyRun();
        }
    });
    return es.duplex(input, output);
}
exports.incremental = incremental;
function fixWin32DirectoryPermissions() {
    if (!/win32/.test(process.platform)) {
        return es.through();
    }
    return es.mapSync(function (f) {
        if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
            f.stat.mode = 16877;
        }
        return f;
    });
}
exports.fixWin32DirectoryPermissions = fixWin32DirectoryPermissions;
function setExecutableBit(pattern) {
    var setBit = es.mapSync(function (f) {
        f.stat.mode = /* 100755 */ 33261;
        return f;
    });
    if (!pattern) {
        return setBit;
    }
    var input = es.through();
    var filter = _filter(pattern, { restore: true });
    var output = input
        .pipe(filter)
        .pipe(setBit)
        .pipe(filter.restore);
    return es.duplex(input, output);
}
exports.setExecutableBit = setExecutableBit;
function toFileUri(filePath) {
    var match = filePath.match(/^([a-z])\:(.*)$/i);
    if (match) {
        filePath = '/' + match[1].toUpperCase() + ':' + match[2];
    }
    return 'file://' + filePath.replace(/\\/g, '/');
}
exports.toFileUri = toFileUri;
function skipDirectories() {
    return es.mapSync(function (f) {
        if (!f.isDirectory()) {
            return f;
        }
    });
}
exports.skipDirectories = skipDirectories;
function cleanNodeModule(name, excludes, includes) {
    var toGlob = function (path) { return '**/node_modules/' + name + (path ? '/' + path : ''); };
    var negate = function (str) { return '!' + str; };
    var allFilter = _filter(toGlob('**'), { restore: true });
    var globs = [toGlob('**')].concat(excludes.map(_.compose(negate, toGlob)));
    var input = es.through();
    var nodeModuleInput = input.pipe(allFilter);
    var output = nodeModuleInput.pipe(_filter(globs));
    if (includes) {
        var includeGlobs = includes.map(toGlob);
        output = es.merge(output, nodeModuleInput.pipe(_filter(includeGlobs)));
    }
    output = output.pipe(allFilter.restore);
    return es.duplex(input, output);
}
exports.cleanNodeModule = cleanNodeModule;
function loadSourcemaps() {
    var input = es.through();
    var output = input
        .pipe(es.map(function (f, cb) {
        if (f.sourceMap) {
            cb(null, f);
            return;
        }
        if (!f.contents) {
            cb(new Error('empty file'));
            return;
        }
        var contents = f.contents.toString('utf8');
        var reg = /\/\/# sourceMappingURL=(.*)$/g;
        var lastMatch = null, match = null;
        while (match = reg.exec(contents)) {
            lastMatch = match;
        }
        if (!lastMatch) {
            f.sourceMap = {
                version: 3,
                names: [],
                mappings: '',
                sources: [f.relative.replace(/\//g, '/')],
                sourcesContent: [contents]
            };
            cb(null, f);
            return;
        }
        f.contents = Buffer.from(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');
        fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', function (err, contents) {
            if (err) {
                return cb(err);
            }
            f.sourceMap = JSON.parse(contents);
            cb(null, f);
        });
    }));
    return es.duplex(input, output);
}
exports.loadSourcemaps = loadSourcemaps;
function stripSourceMappingURL() {
    var input = es.through();
    var output = input
        .pipe(es.mapSync(function (f) {
        var contents = f.contents.toString('utf8');
        f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
        return f;
    }));
    return es.duplex(input, output);
}
exports.stripSourceMappingURL = stripSourceMappingURL;
function rimraf(dir) {
    var retries = 0;
    var retry = function (cb) {
        _rimraf(dir, { maxBusyTries: 1 }, function (err) {
            if (!err) {
                return cb();
            }
            if (err.code === 'ENOTEMPTY' && ++retries < 5) {
                return setTimeout(function () { return retry(cb); }, 10);
            }
            return cb(err);
        });
    };
    return function (cb) { return retry(cb); };
}
exports.rimraf = rimraf;
function getVersion(root) {
    var version = process.env['BUILD_SOURCEVERSION'];
    if (!version || !/^[0-9a-f]{40}$/i.test(version)) {
        version = git.getVersion(root);
    }
    return version;
}
exports.getVersion = getVersion;
function rebase(count) {
    return rename(function (f) {
        var parts = f.dirname.split(/[\/\\]/);
        f.dirname = parts.slice(count).join(path.sep);
    });
}
exports.rebase = rebase;
function filter(fn) {
    var result = es.through(function (data) {
        if (fn(data)) {
            this.emit('data', data);
        }
        else {
            result.restore.push(data);
        }
    });
    result.restore = es.through();
    return result;
}
exports.filter = filter;
function tagExists(tagName) {
    try {
        cp.execSync("git rev-parse " + tagName, { stdio: 'ignore' });
        return true;
    }
    catch (e) {
        return false;
    }
}
/**
 * Returns the version previous to the given version. Throws if a git tag for that version doesn't exist.
 * Given 1.17.2, return 1.17.1
 * 1.18.0 => 1.17.2. (or the highest 1.17.x)
 * 2.0.0 => 1.18.0 (or the highest 1.x)
 */
function getPreviousVersion(versionStr, _tagExists) {
    if (_tagExists === void 0) { _tagExists = tagExists; }
    function getLatestTagFromBase(semverArr, componentToTest) {
        var baseVersion = semverArr.join('.');
        if (!_tagExists(baseVersion)) {
            throw new Error('Failed to find git tag for base version, ' + baseVersion);
        }
        var goodTag;
        do {
            goodTag = semverArr.join('.');
            semverArr[componentToTest]++;
        } while (_tagExists(semverArr.join('.')));
        return goodTag;
    }
    var semverArr = versionStringToNumberArray(versionStr);
    if (semverArr[2] > 0) {
        semverArr[2]--;
        var previous = semverArr.join('.');
        if (!_tagExists(previous)) {
            throw new Error('Failed to find git tag for previous version, ' + previous);
        }
        return previous;
    }
    else if (semverArr[1] > 0) {
        semverArr[1]--;
        return getLatestTagFromBase(semverArr, 2);
    }
    else {
        semverArr[0]--;
        // Find 1.x.0 for latest x
        var latestMinorVersion = getLatestTagFromBase(semverArr, 1);
        // Find 1.x.y for latest y
        return getLatestTagFromBase(versionStringToNumberArray(latestMinorVersion), 2);
    }
}
exports.getPreviousVersion = getPreviousVersion;
function versionStringToNumberArray(versionStr) {
    return versionStr
        .split('.')
        .map(function (s) { return parseInt(s); });
}
function versionStringToNumber(versionStr) {
    var semverRegex = /(\d+)\.(\d+)\.(\d+)/;
    var match = versionStr.match(semverRegex);
    if (!match) {
        throw new Error('Version string is not properly formatted: ' + versionStr);
    }
    return parseInt(match[1], 10) * 1e4 + parseInt(match[2], 10) * 1e2 + parseInt(match[3], 10);
}
exports.versionStringToNumber = versionStringToNumber;
