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
    var compile = createCompile(build, true);
    return function () {
        var src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src('node_modules/typescript/lib/lib.d.ts'));
        return src
            .pipe(compile())
            .pipe(gulp.dest(out))
            .pipe(monacodtsTask(out, false));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    var compile = createCompile(build);
    return function () {
        var src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src('node_modules/typescript/lib/lib.d.ts'));
        var watchSrc = watch('src/**', { base: 'src' });
        return watchSrc
            .pipe(util.incremental(compile, src, true))
            .pipe(gulp.dest(out))
            .pipe(monacodtsTask(out, true));
    };
}
exports.watchTask = watchTask;
function monacodtsTask(out, isWatch) {
    var timer = null;
    var runSoon = function (howSoon) {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        timer = setTimeout(function () {
            timer = null;
            runNow();
        }, howSoon);
    };
    var runNow = function () {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        // if (reporter.hasErrors()) {
        // 	monacodts.complainErrors();
        // 	return;
        // }
        var result = monacodts.run(out);
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
        var filesToWatchMap_1 = {};
        monacodts.getFilesToWatch(out).forEach(function (filePath) {
            filesToWatchMap_1[path.normalize(filePath)] = true;
        });
        watch('build/monaco/*').pipe(es.through(function () {
            runSoon(5000);
        }));
        resultStream = es.through(function (data) {
            var filePath = path.normalize(data.path);
            if (filesToWatchMap_1[filePath]) {
                runSoon(5000);
            }
            this.emit('data', data);
        });
    }
    else {
        resultStream = es.through(null, function () {
            runNow();
            this.emit('end');
        });
    }
    return resultStream;
}
