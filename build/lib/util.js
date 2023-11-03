"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Temp = exports.buildWebNodePaths = exports.createExternalLoaderConfig = exports.acquireWebNodePaths = exports.getElectronVersion = exports.streamToPromise = exports.versionStringToNumber = exports.filter = exports.rebase = exports.ensureDir = exports.rreddir = exports.rimraf = exports.rewriteSourceMappingURL = exports.appendOwnPathSourceURL = exports.$if = exports.stripSourceMappingURL = exports.loadSourcemaps = exports.cleanNodeModules = exports.skipDirectories = exports.toFileUri = exports.setExecutableBit = exports.fixWin32DirectoryPermissions = exports.debounce = exports.incremental = void 0;
const es = require("event-stream");
const _debounce = require("debounce");
const _filter = require("gulp-filter");
const rename = require("gulp-rename");
const path = require("path");
const fs = require("fs");
const _rimraf = require("rimraf");
const VinylFile = require("vinyl");
const url_1 = require("url");
const ternaryStream = require("ternary-stream");
const os = require("os");
const crypto = require("crypto");
const root = path.dirname(path.dirname(__dirname));
const NoCancellationToken = { isCancellationRequested: () => false };
function incremental(streamProvider, initial, supportsCancellation) {
    const input = es.through();
    const output = es.through();
    let state = 'idle';
    let buffer = Object.create(null);
    const token = !supportsCancellation ? undefined : { isCancellationRequested: () => Object.keys(buffer).length > 0 };
    const run = (input, isCancellable) => {
        state = 'running';
        const stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);
        input
            .pipe(stream)
            .pipe(es.through(undefined, () => {
            state = 'idle';
            eventuallyRun();
        }))
            .pipe(output);
    };
    if (initial) {
        run(initial, false);
    }
    const eventuallyRun = _debounce(() => {
        const paths = Object.keys(buffer);
        if (paths.length === 0) {
            return;
        }
        const data = paths.map(path => buffer[path]);
        buffer = Object.create(null);
        run(es.readArray(data), true);
    }, 500);
    input.on('data', (f) => {
        buffer[f.path] = f;
        if (state === 'idle') {
            eventuallyRun();
        }
    });
    return es.duplex(input, output);
}
exports.incremental = incremental;
function debounce(task, duration = 500) {
    const input = es.through();
    const output = es.through();
    let state = 'idle';
    const run = () => {
        state = 'running';
        task()
            .pipe(es.through(undefined, () => {
            const shouldRunAgain = state === 'stale';
            state = 'idle';
            if (shouldRunAgain) {
                eventuallyRun();
            }
        }))
            .pipe(output);
    };
    run();
    const eventuallyRun = _debounce(() => run(), duration);
    input.on('data', () => {
        if (state === 'idle') {
            eventuallyRun();
        }
        else {
            state = 'stale';
        }
    });
    return es.duplex(input, output);
}
exports.debounce = debounce;
function fixWin32DirectoryPermissions() {
    if (!/win32/.test(process.platform)) {
        return es.through();
    }
    return es.mapSync(f => {
        if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
            f.stat.mode = 16877;
        }
        return f;
    });
}
exports.fixWin32DirectoryPermissions = fixWin32DirectoryPermissions;
function setExecutableBit(pattern) {
    const setBit = es.mapSync(f => {
        if (!f.stat) {
            f.stat = { isFile() { return true; } };
        }
        f.stat.mode = /* 100755 */ 33261;
        return f;
    });
    if (!pattern) {
        return setBit;
    }
    const input = es.through();
    const filter = _filter(pattern, { restore: true });
    const output = input
        .pipe(filter)
        .pipe(setBit)
        .pipe(filter.restore);
    return es.duplex(input, output);
}
exports.setExecutableBit = setExecutableBit;
function toFileUri(filePath) {
    const match = filePath.match(/^([a-z])\:(.*)$/i);
    if (match) {
        filePath = '/' + match[1].toUpperCase() + ':' + match[2];
    }
    return 'file://' + filePath.replace(/\\/g, '/');
}
exports.toFileUri = toFileUri;
function skipDirectories() {
    return es.mapSync(f => {
        if (!f.isDirectory()) {
            return f;
        }
    });
}
exports.skipDirectories = skipDirectories;
function cleanNodeModules(rulePath) {
    const rules = fs.readFileSync(rulePath, 'utf8')
        .split(/\r?\n/g)
        .map(line => line.trim())
        .filter(line => line && !/^#/.test(line));
    const excludes = rules.filter(line => !/^!/.test(line)).map(line => `!**/node_modules/${line}`);
    const includes = rules.filter(line => /^!/.test(line)).map(line => `**/node_modules/${line.substr(1)}`);
    const input = es.through();
    const output = es.merge(input.pipe(_filter(['**', ...excludes])), input.pipe(_filter(includes)));
    return es.duplex(input, output);
}
exports.cleanNodeModules = cleanNodeModules;
function loadSourcemaps() {
    const input = es.through();
    const output = input
        .pipe(es.map((f, cb) => {
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
        fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', (err, contents) => {
            if (err) {
                return cb(err);
            }
            f.sourceMap = JSON.parse(contents);
            cb(undefined, f);
        });
    }));
    return es.duplex(input, output);
}
exports.loadSourcemaps = loadSourcemaps;
function stripSourceMappingURL() {
    const input = es.through();
    const output = input
        .pipe(es.mapSync(f => {
        const contents = f.contents.toString('utf8');
        f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
        return f;
    }));
    return es.duplex(input, output);
}
exports.stripSourceMappingURL = stripSourceMappingURL;
/** Splits items in the stream based on the predicate, sending them to onTrue if true, or onFalse otherwise */
function $if(test, onTrue, onFalse = es.through()) {
    if (typeof test === 'boolean') {
        return test ? onTrue : onFalse;
    }
    return ternaryStream(test, onTrue, onFalse);
}
exports.$if = $if;
/** Operator that appends the js files' original path a sourceURL, so debug locations map */
function appendOwnPathSourceURL() {
    const input = es.through();
    const output = input
        .pipe(es.mapSync(f => {
        if (!(f.contents instanceof Buffer)) {
            throw new Error(`contents of ${f.path} are not a buffer`);
        }
        f.contents = Buffer.concat([f.contents, Buffer.from(`\n//# sourceURL=${(0, url_1.pathToFileURL)(f.path)}`)]);
        return f;
    }));
    return es.duplex(input, output);
}
exports.appendOwnPathSourceURL = appendOwnPathSourceURL;
function rewriteSourceMappingURL(sourceMappingURLBase) {
    const input = es.through();
    const output = input
        .pipe(es.mapSync(f => {
        const contents = f.contents.toString('utf8');
        const str = `//# sourceMappingURL=${sourceMappingURLBase}/${path.dirname(f.relative).replace(/\\/g, '/')}/$1`;
        f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, str));
        return f;
    }));
    return es.duplex(input, output);
}
exports.rewriteSourceMappingURL = rewriteSourceMappingURL;
function rimraf(dir) {
    const result = () => new Promise((c, e) => {
        let retries = 0;
        const retry = () => {
            _rimraf(dir, { maxBusyTries: 1 }, (err) => {
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
    result.taskName = `clean-${path.basename(dir).toLowerCase()}`;
    return result;
}
exports.rimraf = rimraf;
function _rreaddir(dirPath, prepend, result) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            _rreaddir(path.join(dirPath, entry.name), `${prepend}/${entry.name}`, result);
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
exports.rreddir = rreddir;
function ensureDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        return;
    }
    ensureDir(path.dirname(dirPath));
    fs.mkdirSync(dirPath);
}
exports.ensureDir = ensureDir;
function rebase(count) {
    return rename(f => {
        const parts = f.dirname ? f.dirname.split(/[\/\\]/) : [];
        f.dirname = parts.slice(count).join(path.sep);
    });
}
exports.rebase = rebase;
function filter(fn) {
    const result = es.through(function (data) {
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
function versionStringToNumber(versionStr) {
    const semverRegex = /(\d+)\.(\d+)\.(\d+)/;
    const match = versionStr.match(semverRegex);
    if (!match) {
        throw new Error('Version string is not properly formatted: ' + versionStr);
    }
    return parseInt(match[1], 10) * 1e4 + parseInt(match[2], 10) * 1e2 + parseInt(match[3], 10);
}
exports.versionStringToNumber = versionStringToNumber;
function streamToPromise(stream) {
    return new Promise((c, e) => {
        stream.on('error', err => e(err));
        stream.on('end', () => c());
    });
}
exports.streamToPromise = streamToPromise;
function getElectronVersion() {
    const yarnrc = fs.readFileSync(path.join(root, '.yarnrc'), 'utf8');
    const electronVersion = /^target "(.*)"$/m.exec(yarnrc)[1];
    const msBuildId = /^ms_build_id "(.*)"$/m.exec(yarnrc)[1];
    return { electronVersion, msBuildId };
}
exports.getElectronVersion = getElectronVersion;
function acquireWebNodePaths() {
    const root = path.join(__dirname, '..', '..');
    const webPackageJSON = path.join(root, '/remote/web', 'package.json');
    const webPackages = JSON.parse(fs.readFileSync(webPackageJSON, 'utf8')).dependencies;
    const distroWebPackageJson = path.join(root, '.build/distro/npm/remote/web/package.json');
    if (fs.existsSync(distroWebPackageJson)) {
        const distroWebPackages = JSON.parse(fs.readFileSync(distroWebPackageJson, 'utf8')).dependencies;
        Object.assign(webPackages, distroWebPackages);
    }
    const nodePaths = {};
    for (const key of Object.keys(webPackages)) {
        const packageJSON = path.join(root, 'node_modules', key, 'package.json');
        const packageData = JSON.parse(fs.readFileSync(packageJSON, 'utf8'));
        // Only cases where the browser is a string are handled
        let entryPoint = typeof packageData.browser === 'string' ? packageData.browser : packageData.main;
        // On rare cases a package doesn't have an entrypoint so we assume it has a dist folder with a min.js
        if (!entryPoint) {
            // TODO @lramos15 remove this when jschardet adds an entrypoint so we can warn on all packages w/out entrypoint
            if (key !== 'jschardet') {
                console.warn(`No entry point for ${key} assuming dist/${key}.min.js`);
            }
            entryPoint = `dist/${key}.min.js`;
        }
        // Remove any starting path information so it's all relative info
        if (entryPoint.startsWith('./')) {
            entryPoint = entryPoint.substring(2);
        }
        else if (entryPoint.startsWith('/')) {
            entryPoint = entryPoint.substring(1);
        }
        // Search for a minified entrypoint as well
        if (/(?<!\.min)\.js$/i.test(entryPoint)) {
            const minEntryPoint = entryPoint.replace(/\.js$/i, '.min.js');
            if (fs.existsSync(path.join(root, 'node_modules', key, minEntryPoint))) {
                entryPoint = minEntryPoint;
            }
        }
        nodePaths[key] = entryPoint;
    }
    // @TODO lramos15 can we make this dynamic like the rest of the node paths
    // Add these paths as well for 1DS SDK dependencies.
    // Not sure why given the 1DS entrypoint then requires these modules
    // they are not fetched from the right location and instead are fetched from out/
    nodePaths['@microsoft/dynamicproto-js'] = 'lib/dist/umd/dynamicproto-js.min.js';
    nodePaths['@microsoft/applicationinsights-shims'] = 'dist/umd/applicationinsights-shims.min.js';
    nodePaths['@microsoft/applicationinsights-core-js'] = 'browser/applicationinsights-core-js.min.js';
    return nodePaths;
}
exports.acquireWebNodePaths = acquireWebNodePaths;
function createExternalLoaderConfig(webEndpoint, commit, quality) {
    if (!webEndpoint || !commit || !quality) {
        return undefined;
    }
    webEndpoint = webEndpoint + `/${quality}/${commit}`;
    const nodePaths = acquireWebNodePaths();
    Object.keys(nodePaths).map(function (key, _) {
        nodePaths[key] = `../node_modules/${key}/${nodePaths[key]}`;
    });
    const externalLoaderConfig = {
        baseUrl: `${webEndpoint}/out`,
        recordStats: true,
        paths: nodePaths
    };
    return externalLoaderConfig;
}
exports.createExternalLoaderConfig = createExternalLoaderConfig;
function buildWebNodePaths(outDir) {
    const result = () => new Promise((resolve, _) => {
        const root = path.join(__dirname, '..', '..');
        const nodePaths = acquireWebNodePaths();
        // Now we write the node paths to out/vs
        const outDirectory = path.join(root, outDir, 'vs');
        fs.mkdirSync(outDirectory, { recursive: true });
        const headerWithGeneratedFileWarning = `/*---------------------------------------------------------------------------------------------
	 *  Copyright (c) Microsoft Corporation. All rights reserved.
	 *  Licensed under the MIT License. See License.txt in the project root for license information.
	 *--------------------------------------------------------------------------------------------*/

	// This file is generated by build/npm/postinstall.js. Do not edit.`;
        const fileContents = `${headerWithGeneratedFileWarning}\nself.webPackagePaths = ${JSON.stringify(nodePaths, null, 2)};`;
        fs.writeFileSync(path.join(outDirectory, 'webPackagePaths.js'), fileContents, 'utf8');
        resolve();
    });
    result.taskName = 'build-web-node-paths';
    return result;
}
exports.buildWebNodePaths = buildWebNodePaths;
class Temp {
    _files = [];
    tmpNameSync() {
        const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex'));
        this._files.push(file);
        return file;
    }
    dispose() {
        for (const file of this._files) {
            try {
                fs.unlinkSync(file);
            }
            catch (err) {
                // noop
            }
        }
    }
}
exports.Temp = Temp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLHNDQUF1QztBQUN2Qyx1Q0FBdUM7QUFDdkMsc0NBQXNDO0FBQ3RDLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFDekIsa0NBQWtDO0FBQ2xDLG1DQUFtQztBQUduQyw2QkFBb0M7QUFDcEMsZ0RBQWdEO0FBQ2hELHlCQUF5QjtBQUN6QixpQ0FBaUM7QUFFakMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFNbkQsTUFBTSxtQkFBbUIsR0FBdUIsRUFBRSx1QkFBdUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQU16RixTQUFnQixXQUFXLENBQUMsY0FBK0IsRUFBRSxPQUErQixFQUFFLG9CQUE4QjtJQUMzSCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDM0IsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzVCLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQztJQUNuQixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLE1BQU0sS0FBSyxHQUFtQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLEVBQUUsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFFcEosTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUE2QixFQUFFLGFBQXNCLEVBQUUsRUFBRTtRQUNyRSxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBRWxCLE1BQU0sTUFB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