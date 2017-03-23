/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var gulp = require("gulp");
var tsb = require("gulp-tsb");
var es = require("event-stream");
var watch = require('./watch');
var nls = require("./nls");
var util = require("./util");
var reporter_1 = require("./reporter");
var path = require("path");
var bom = require("gulp-bom");
var sourcemaps = require("gulp-sourcemaps");
var _ = require("underscore");
var monacodts = require("../monaco/api");
var fs = require("fs");
var reporter = reporter_1.createReporter();
var rootDir = path.join(__dirname, '../../src');
var options = require('../../src/tsconfig.json').compilerOptions;
options.verbose = false;
options.sourceMap = true;
options.rootDir = rootDir;
options.sourceRoot = util.toFileUri(rootDir);
function createCompile(build, emitError) {
    var opts = _.clone(options);
    opts.inlineSources = !!build;
    opts.noFilesystemLookup = true;
    var ts = tsb.create(opts, null, null, function (err) { return reporter(err.toString()); });
    return function (token) {
        var utf8Filter = util.filter(function (data) { return /(\/|\\)test(\/|\\).*utf8/.test(data.path); });
        var tsFilter = util.filter(function (data) { return /\.ts$/.test(data.path); });
        var noDeclarationsFilter = util.filter(function (data) { return !(/\.d\.ts$/.test(data.path)); });
        var input = es.through();
        var output = input
            .pipe(utf8Filter)
            .pipe(bom())
            .pipe(utf8Filter.restore)
            .pipe(tsFilter)
            .pipe(util.loadSourcemaps())
            .pipe(ts(token))
            .pipe(build ? reloadTypeScriptNodeModule() : es.through())
            .pipe(noDeclarationsFilter)
            .pipe(build ? nls() : es.through())
            .pipe(noDeclarationsFilter.restore)
            .pipe(sourcemaps.write('.', {
            addComment: false,
            includeContent: !!build,
            sourceRoot: options.sourceRoot
        }))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(emitError));
        return es.duplex(input, output);
    };
}
function compileTask(out, build) {
    return function () {
        var compile = createCompile(build, true);
        var src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src('node_modules/typescript/lib/lib.d.ts'), gulp.src('node_modules/@types/**/index.d.ts'));
        return src
            .pipe(compile())
            .pipe(gulp.dest(out))
            .pipe(monacodtsTask(out, false));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    return function () {
        var compile = createCompile(build);
        var src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src('node_modules/typescript/lib/lib.d.ts'), gulp.src('node_modules/@types/**/index.d.ts'));
        var watchSrc = watch('src/**', { base: 'src' });
        return watchSrc
            .pipe(util.incremental(compile, src, true))
            .pipe(gulp.dest(out))
            .pipe(monacodtsTask(out, true));
    };
}
exports.watchTask = watchTask;
function reloadTypeScriptNodeModule() {
    var util = require('gulp-util');
    function log(message) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        util.log.apply(util, [util.colors.cyan('[memory watch dog]'), message].concat(rest));
    }
    function heapUsed() {
        return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
    }
    return es.through(function (data) {
        this.emit('data', data);
    }, function () {
        log('memory usage after compilation finished: ' + heapUsed());
        // It appears we are running into some variant of
        // https://bugs.chromium.org/p/v8/issues/detail?id=2073
        //
        // Even though all references are dropped, some
        // optimized methods in the TS compiler end up holding references
        // to the entire TypeScript language host (>600MB)
        //
        // The idea is to force v8 to drop references to these
        // optimized methods, by "reloading" the typescript node module
        log('Reloading typescript node module...');
        var resolvedName = require.resolve('typescript');
        var originalModule = require.cache[resolvedName];
        delete require.cache[resolvedName];
        var newExports = require('typescript');
        require.cache[resolvedName] = originalModule;
        for (var prop in newExports) {
            if (newExports.hasOwnProperty(prop)) {
                originalModule.exports[prop] = newExports[prop];
            }
        }
        log('typescript node module reloaded.');
        this.emit('end');
    });
}
function monacodtsTask(out, isWatch) {
    var neededFiles = {};
    monacodts.getFilesToWatch(out).forEach(function (filePath) {
        filePath = path.normalize(filePath);
        neededFiles[filePath] = true;
    });
    var inputFiles = {};
    for (var filePath in neededFiles) {
        if (/\bsrc(\/|\\)vs\b/.test(filePath)) {
            // This file is needed from source => simply read it now
            inputFiles[filePath] = fs.readFileSync(filePath).toString();
        }
    }
    var setInputFile = function (filePath, contents) {
        if (inputFiles[filePath] === contents) {
            // no change
            return;
        }
        inputFiles[filePath] = contents;
        var neededInputFilesCount = Object.keys(neededFiles).length;
        var availableInputFilesCount = Object.keys(inputFiles).length;
        if (neededInputFilesCount === availableInputFilesCount) {
            run();
        }
    };
    var run = function () {
        var result = monacodts.run(out, inputFiles);
        if (!result.isTheSame) {
            if (isWatch) {
                fs.writeFileSync(result.filePath, result.content);
            }
            else {
                resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
            }
        }
    };
    var resultStream;
    if (isWatch) {
        watch('build/monaco/*').pipe(es.through(function () {
            run();
        }));
    }
    resultStream = es.through(function (data) {
        var filePath = path.normalize(data.path);
        if (neededFiles[filePath]) {
            setInputFile(filePath, data.contents.toString());
        }
        this.emit('data', data);
    });
    return resultStream;
}
