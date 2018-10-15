/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const es = require("event-stream");
const fs = require("fs");
const gulp = require("gulp");
const bom = require("gulp-bom");
const sourcemaps = require("gulp-sourcemaps");
const tsb = require("gulp-tsb");
const path = require("path");
const _ = require("underscore");
const monacodts = require("../monaco/api");
const nls = require("./nls");
const reporter_1 = require("./reporter");
const util = require("./util");
const watch = require('./watch');
const reporter = reporter_1.createReporter();
function getTypeScriptCompilerOptions(src) {
    const rootDir = path.join(__dirname, `../../${src}`);
    const tsconfig = require(`../../${src}/tsconfig.json`);
    let options;
    if (tsconfig.extends) {
        options = Object.assign({}, require(path.join(rootDir, tsconfig.extends)).compilerOptions, tsconfig.compilerOptions);
    }
    else {
        options = tsconfig.compilerOptions;
    }
    options.verbose = false;
    options.sourceMap = true;
    if (process.env['VSCODE_NO_SOURCEMAP']) { // To be used by developers in a hurry
        options.sourceMap = false;
    }
    options.rootDir = rootDir;
    options.baseUrl = rootDir;
    options.sourceRoot = util.toFileUri(rootDir);
    options.newLine = /\r\n/.test(fs.readFileSync(__filename, 'utf8')) ? 'CRLF' : 'LF';
    return options;
}
function createCompile(src, build, emitError) {
    const opts = _.clone(getTypeScriptCompilerOptions(src));
    opts.inlineSources = !!build;
    opts.noFilesystemLookup = true;
    const ts = tsb.create(opts, true, undefined, err => new reporter(err.toString()));
    return function (token) {
        const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
        const tsFilter = util.filter(data => /\.ts$/.test(data.path));
        const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));
        const input = es.through();
        const output = input
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
            sourceRoot: opts.sourceRoot
        }))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(!!emitError));
        return es.duplex(input, output);
    };
}
const typesDts = [
    'node_modules/typescript/lib/*.d.ts',
    'node_modules/@types/**/*.d.ts',
    '!node_modules/@types/webpack/**/*',
    '!node_modules/@types/uglify-js/**/*',
];
function compileTask(src, out, build) {
    return function () {
        const compile = createCompile(src, build, true);
        const srcPipe = es.merge(gulp.src(`${src}/**`, { base: `${src}` }), gulp.src(typesDts));
        // Do not write .d.ts files to disk, as they are not needed there.
        const dtsFilter = util.filter(data => !/\.d\.ts$/.test(data.path));
        return srcPipe
            .pipe(compile())
            .pipe(dtsFilter)
            .pipe(gulp.dest(out))
            .pipe(dtsFilter.restore)
            .pipe(src !== 'src' ? es.through() : monacodtsTask(out, false));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    return function () {
        const compile = createCompile('src', build);
        const src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src(typesDts));
        const watchSrc = watch('src/**', { base: 'src' });
        // Do not write .d.ts files to disk, as they are not needed there.
        const dtsFilter = util.filter(data => !/\.d\.ts$/.test(data.path));
        return watchSrc
            .pipe(util.incremental(compile, src, true))
            .pipe(dtsFilter)
            .pipe(gulp.dest(out))
            .pipe(dtsFilter.restore)
            .pipe(monacodtsTask(out, true));
    };
}
exports.watchTask = watchTask;
function monacodtsTask(out, isWatch) {
    const basePath = path.resolve(process.cwd(), out);
    const neededFiles = {};
    monacodts.getFilesToWatch(out).forEach(function (filePath) {
        filePath = path.normalize(filePath);
        neededFiles[filePath] = true;
    });
    const inputFiles = {};
    for (const filePath in neededFiles) {
        if (/\bsrc(\/|\\)vs\b/.test(filePath)) {
            // This file is needed from source => simply read it now
            inputFiles[filePath] = fs.readFileSync(filePath).toString();
        }
    }
    const setInputFile = (filePath, contents) => {
        if (inputFiles[filePath] === contents) {
            // no change
            return;
        }
        inputFiles[filePath] = contents;
        const neededInputFilesCount = Object.keys(neededFiles).length;
        const availableInputFilesCount = Object.keys(inputFiles).length;
        if (neededInputFilesCount === availableInputFilesCount) {
            run();
        }
    };
    const run = () => {
        const result = monacodts.run(out, inputFiles);
        if (!result.isTheSame) {
            if (isWatch) {
                fs.writeFileSync(result.filePath, result.content);
            }
            else {
                fs.writeFileSync(result.filePath, result.content);
                resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
            }
        }
    };
    let resultStream;
    if (isWatch) {
        watch('build/monaco/*').pipe(es.through(function () {
            run();
        }));
    }
    resultStream = es.through(function (data) {
        const filePath = path.normalize(path.resolve(basePath, data.relative));
        if (neededFiles[filePath]) {
            setInputFile(filePath, data.contents.toString());
        }
        this.emit('data', data);
    });
    return resultStream;
}
