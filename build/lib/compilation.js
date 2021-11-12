/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchApiProposalNames = exports.compileApiProposalNames = exports.watchTask = exports.compileTask = void 0;
const es = require("event-stream");
const fs = require("fs");
const gulp = require("gulp");
const path = require("path");
const monacodts = require("./monaco-api");
const nls = require("./nls");
const reporter_1 = require("./reporter");
const util = require("./util");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const os = require("os");
const watch = require('./watch');
const reporter = (0, reporter_1.createReporter)();
function getTypeScriptCompilerOptions(src) {
    const rootDir = path.join(__dirname, `../../${src}`);
    let options = {};
    options.verbose = false;
    options.sourceMap = true;
    if (process.env['VSCODE_NO_SOURCEMAP']) { // To be used by developers in a hurry
        options.sourceMap = false;
    }
    options.rootDir = rootDir;
    options.baseUrl = rootDir;
    options.sourceRoot = util.toFileUri(rootDir);
    options.newLine = /\r\n/.test(fs.readFileSync(__filename, 'utf8')) ? 0 : 1;
    return options;
}
function createCompile(src, build, emitError) {
    const tsb = require('gulp-tsb');
    const sourcemaps = require('gulp-sourcemaps');
    const projectPath = path.join(__dirname, '../../', src, 'tsconfig.json');
    const overrideOptions = Object.assign(Object.assign({}, getTypeScriptCompilerOptions(src)), { inlineSources: Boolean(build) });
    if (!build) {
        overrideOptions.inlineSourceMap = true;
    }
    const compilation = tsb.create(projectPath, overrideOptions, false, err => reporter(err));
    function pipeline(token) {
        const bom = require('gulp-bom');
        const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
        const tsFilter = util.filter(data => /\.ts$/.test(data.path));
        const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));
        const input = es.through();
        const output = input
            .pipe(utf8Filter)
            .pipe(bom()) // this is required to preserve BOM in test files that loose it otherwise
            .pipe(utf8Filter.restore)
            .pipe(tsFilter)
            .pipe(util.loadSourcemaps())
            .pipe(compilation(token))
            .pipe(noDeclarationsFilter)
            .pipe(build ? nls.nls() : es.through())
            .pipe(noDeclarationsFilter.restore)
            .pipe(sourcemaps.write('.', {
            addComment: false,
            includeContent: !!build,
            sourceRoot: overrideOptions.sourceRoot
        }))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(!!emitError));
        return es.duplex(input, output);
    }
    pipeline.tsProjectSrc = () => {
        return compilation.src({ base: src });
    };
    return pipeline;
}
function compileTask(src, out, build) {
    return function () {
        if (os.totalmem() < 4000000000) {
            throw new Error('compilation requires 4GB of RAM');
        }
        const compile = createCompile(src, build, true);
        const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
        let generator = new MonacoGenerator(false);
        if (src === 'src') {
            generator.execute();
        }
        return srcPipe
            .pipe(generator.stream)
            .pipe(compile())
            .pipe(gulp.dest(out));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    return function () {
        const compile = createCompile('src', build);
        const src = gulp.src('src/**', { base: 'src' });
        const watchSrc = watch('src/**', { base: 'src', readDelay: 200 });
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
        this._executeSoonTimer = null;
        this._isWatch = isWatch;
        this.stream = es.through();
        this._watchedFiles = {};
        let onWillReadFile = (moduleId, filePath) => {
            if (!this._isWatch) {
                return;
            }
            if (this._watchedFiles[filePath]) {
                return;
            }
            this._watchedFiles[filePath] = true;
            fs.watchFile(filePath, () => {
                this._declarationResolver.invalidateCache(moduleId);
                this._executeSoon();
            });
        };
        this._fsProvider = new class extends monacodts.FSProvider {
            readFileSync(moduleId, filePath) {
                onWillReadFile(moduleId, filePath);
                return super.readFileSync(moduleId, filePath);
            }
        };
        this._declarationResolver = new monacodts.DeclarationResolver(this._fsProvider);
        if (this._isWatch) {
            fs.watchFile(monacodts.RECIPE_PATH, () => {
                this._executeSoon();
            });
        }
    }
    _executeSoon() {
        if (this._executeSoonTimer !== null) {
            clearTimeout(this._executeSoonTimer);
            this._executeSoonTimer = null;
        }
        this._executeSoonTimer = setTimeout(() => {
            this._executeSoonTimer = null;
            this.execute();
        }, 20);
    }
    _run() {
        let r = monacodts.run3(this._declarationResolver);
        if (!r && !this._isWatch) {
            // The build must always be able to generate the monaco.d.ts
            throw new Error(`monaco.d.ts generation error - Cannot continue`);
        }
        return r;
    }
    _log(message, ...rest) {
        fancyLog(ansiColors.cyan('[monaco.d.ts]'), message, ...rest);
    }
    execute() {
        const startTime = Date.now();
        const result = this._run();
        if (!result) {
            // nothing really changed
            return;
        }
        if (result.isTheSame) {
            return;
        }
        fs.writeFileSync(result.filePath, result.content);
        fs.writeFileSync(path.join(REPO_SRC_FOLDER, 'vs/editor/common/standalone/standaloneEnums.ts'), result.enums);
        this._log(`monaco.d.ts is changed - total time took ${Date.now() - startTime} ms`);
        if (!this._isWatch) {
            this.stream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
        }
    }
}
function apiProposalNamesGenerator() {
    const stream = es.through();
    const pattern = /vscode\.proposed\.([a-zA-Z]+)\.d\.ts/;
    const dtsFolder = path.join(REPO_SRC_FOLDER, 'vscode-dts');
    const generateFile = () => {
        try {
            const t1 = Date.now();
            const proposalNames = [];
            for (let file of fs.readdirSync(dtsFolder).sort()) {
                const match = pattern.exec(file);
                if (match) {
                    proposalNames.push([match[1], `https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/${file}`]);
                }
            }
            const source = [
                '/*---------------------------------------------------------------------------------------------',
                ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
                ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
                ' *--------------------------------------------------------------------------------------------*/',
                '',
                '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
                '',
                'export const allApiProposals = Object.freeze({',
                `${proposalNames.map(t => `\t${t[0]}: '${t[1]}'`).join(',\n')}`,
                '});',
                'export type ApiProposalName = keyof typeof allApiProposals;',
                '',
            ].join('\n');
            const outFile = path.join(dtsFolder, '../vs/workbench/services/extensions/common/extensionsApiProposals.ts');
            if (fs.readFileSync(outFile).toString() !== source) {
                fs.writeFileSync(outFile, source);
                console.log(`Generated 'extensionsApiProposals.ts' in ${Date.now() - t1}ms`);
            }
        }
        catch (err) {
            stream.emit('error', err);
        }
    };
    let handle;
    stream.on('data', () => {
        clearTimeout(handle);
        handle = setTimeout(generateFile, 250);
    });
    return stream;
}
function compileApiProposalNames() {
    return function () {
        const srcPipe = gulp.src('src/vscode-dts/**', { base: 'src' });
        const proposals = apiProposalNamesGenerator();
        return srcPipe.pipe(proposals);
    };
}
exports.compileApiProposalNames = compileApiProposalNames;
function watchApiProposalNames() {
    return function () {
        const watchSrc = watch('src/vscode-dts/**', { base: 'src', readDelay: 200 });
        const proposals = apiProposalNamesGenerator();
        proposals.write(undefined); // send something to trigger initial generate
        return watchSrc.pipe(proposals);
    };
}
exports.watchApiProposalNames = watchApiProposalNames;
