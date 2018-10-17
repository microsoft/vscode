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
const ts = require("typescript");
const _ = require("underscore");
const monacodts = require("../monaco/api");
const nls = require("./nls");
const reporter_1 = require("./reporter");
const util = require("./util");
const util2 = require("gulp-util");
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
    const ts = tsb.create(opts, true, undefined, err => reporter(err.toString()));
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
        let generator = new MonacoGenerator(false);
        if (src === 'src') {
            generator.execute();
        }
        return srcPipe
            .pipe(generator.stream)
            .pipe(compile())
            .pipe(gulp.dest(out));
        // .pipe(src !== 'src' ? es.through() : monacodtsTask(out, false));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    return function () {
        const compile = createCompile('src', build);
        const src = es.merge(gulp.src('src/**', { base: 'src' }), gulp.src(typesDts));
        const watchSrc = watch('src/**', { base: 'src' });
        let generator = new MonacoGenerator(true);
        generator.execute();
        return watchSrc
            .pipe(generator.stream)
            .pipe(util.incremental(compile, src, true))
            .pipe(gulp.dest(out));
    };
}
exports.watchTask = watchTask;
const REPO_SRC_FOLDER = path.join(__dirname, '../../src');
class MonacoGenerator {
    constructor(isWatch) {
        this._isWatch = isWatch;
        this.stream = es.through();
        this._inputFiles = monacodts.getIncludesInRecipe().map((moduleId) => {
            if (/\.d\.ts$/.test(moduleId)) {
                // This source file is already in .d.ts form
                return path.join(REPO_SRC_FOLDER, moduleId);
            }
            else {
                return path.join(REPO_SRC_FOLDER, `${moduleId}.ts`);
            }
        });
        // Install watchers
        this._watchers = [];
        if (this._isWatch) {
            this._inputFiles.forEach((filePath) => {
                const watcher = fs.watch(filePath);
                watcher.addListener('change', () => {
                    this._inputFileChanged[filePath] = true;
                    // Avoid hitting empty files... :/
                    setTimeout(() => this.execute(), 10);
                });
                this._watchers.push(watcher);
            });
            const recipeWatcher = fs.watch(monacodts.RECIPE_PATH);
            recipeWatcher.addListener('change', () => {
                this._recipeFileChanged = true;
                // Avoid hitting empty files... :/
                setTimeout(() => this.execute(), 10);
            });
            this._watchers.push(recipeWatcher);
        }
        this._inputFileChanged = {};
        this._inputFiles.forEach(file => this._inputFileChanged[file] = true);
        this._recipeFileChanged = true;
        this._dtsFilesContents = {};
    }
    dispose() {
        this._watchers.forEach(watcher => watcher.close());
    }
    _run() {
        let somethingChanged = false;
        const setDTSFileContent = (file, contents) => {
            if (this._dtsFilesContents[file] === contents) {
                return;
            }
            this._dtsFilesContents[file] = contents;
            somethingChanged = true;
        };
        const fileMap = {};
        this._inputFiles.forEach((inputFile) => {
            if (!this._inputFileChanged[inputFile]) {
                return;
            }
            this._inputFileChanged[inputFile] = false;
            const inputFileContents = fs.readFileSync(inputFile).toString();
            if (/\.d\.ts$/.test(inputFile)) {
                // This is a .d.ts file
                setDTSFileContent(inputFile, inputFileContents);
                return;
            }
            fileMap[inputFile] = inputFileContents;
        });
        if (Object.keys(fileMap).length > 0) {
            const service = ts.createLanguageService(new monacodts.TypeScriptLanguageServiceHost({}, fileMap, {}));
            Object.keys(fileMap).forEach((fileName) => {
                const output = service.getEmitOutput(fileName, true).outputFiles[0].text;
                const destFileName = fileName.replace(/\.ts$/, '.d.ts');
                setDTSFileContent(destFileName, output);
            });
        }
        if (this._recipeFileChanged) {
            this._recipeFileChanged = false;
            somethingChanged = true;
        }
        if (!somethingChanged) {
            // Nothing changed
            return null;
        }
        return monacodts.run('src', this._dtsFilesContents);
    }
    _log(message, ...rest) {
        util2.log(util2.colors.cyan('[monaco.d.ts]'), message, ...rest);
    }
    execute() {
        const startTime = Date.now();
        const result = this._run();
        if (!result) {
            // nothing really changed
            return;
        }
        if (result.isTheSame) {
            this._log(`monaco.d.ts is unchanged - total time took ${Date.now() - startTime} ms`);
            return;
        }
        fs.writeFileSync(result.filePath, result.content);
        this._log(`monaco.d.ts is changed - total time took ${Date.now() - startTime} ms`);
        if (!this._isWatch) {
            this.stream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
        }
    }
}
