"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebNodePaths = exports.createExternalLoaderConfig = exports.acquireWebNodePaths = exports.getElectronVersion = exports.streamToPromise = exports.versionStringToNumber = exports.filter = exports.rebase = exports.ensureDir = exports.rreddir = exports.rimraf = exports.rewriteSourceMappingURL = exports.appendOwnPathSourceURL = exports.stripSourceMappingURL = exports.loadSourcemaps = exports.cleanNodeModules = exports.skipDirectories = exports.toFileUri = exports.setExecutableBit = exports.fixWin32DirectoryPermissions = exports.debounce = exports.incremental = void 0;
const es = require("event-stream");
const _debounce = require("debounce");
const _filter = require("gulp-filter");
const rename = require("gulp-rename");
const path = require("path");
const fs = require("fs");
const _rimraf = require("rimraf");
const VinylFile = require("vinyl");
const url_1 = require("url");
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
function debounce(task) {
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
    const eventuallyRun = _debounce(() => run(), 500);
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
                sources: [f.relative],
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
/** Operator that appends the js files' original path a sourceURL, so debug locations map */
function appendOwnPathSourceURL() {
    const input = es.through();
    const output = input
        .pipe(es.mapSync(f => {
        if (!f.path.endsWith('.js')) {
            return f;
        }
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
    const target = /^target "(.*)"$/m.exec(yarnrc)[1];
    return target;
}
exports.getElectronVersion = getElectronVersion;
function acquireWebNodePaths() {
    const root = path.join(__dirname, '..', '..');
    const webPackageJSON = path.join(root, '/remote/web', 'package.json');
    const webPackages = JSON.parse(fs.readFileSync(webPackageJSON, 'utf8')).dependencies;
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
        nodePaths[key] = `${webEndpoint}/node_modules/${key}/${nodePaths[key]}`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLHNDQUF1QztBQUN2Qyx1Q0FBdUM7QUFDdkMsc0NBQXNDO0FBRXRDLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFDekIsa0NBQWtDO0FBQ2xDLG1DQUFtQztBQUduQyw2QkFBb0M7QUFFcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFNbkQsTUFBTSxtQkFBbUIsR0FBdUIsRUFBRSx1QkFBdUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQU16RixTQUFnQixXQUFXLENBQUMsY0FBK0IsRUFBRSxPQUErQixFQUFFLG9CQUE4QjtJQUMzSCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDM0IsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzVCLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQztJQUNuQixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLE1BQU0sS0FBSyxHQUFtQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLEVBQUUsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFFcEosTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUE2QixFQUFFLGFBQXNCLEVBQUUsRUFBRTtRQUNyRSxLQUFLLEdBQUcsU0FBUyxDQUFDO1FBRWxCLE1BQU0sTUFBTSxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLGNBQWMs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