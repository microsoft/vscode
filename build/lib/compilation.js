"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchApiProposalNamesTask = exports.compileApiProposalNamesTask = exports.watchTask = exports.compileTask = exports.transpileTask = void 0;
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
const ts = require("typescript");
const File = require("vinyl");
const task = require("./task");
const mangleTypeScript_1 = require("./mangleTypeScript");
const watch = require('./watch');
// --- gulp-tsb: compile and transpile --------------------------------
const reporter = (0, reporter_1.createReporter)();
function getTypeScriptCompilerOptions(src) {
    const rootDir = path.join(__dirname, `../../${src}`);
    const options = {};
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
function createCompile(src, build, emitError, transpileOnly) {
    const tsb = require('./tsb');
    const sourcemaps = require('gulp-sourcemaps');
    const projectPath = path.join(__dirname, '../../', src, 'tsconfig.json');
    const overrideOptions = { ...getTypeScriptCompilerOptions(src), inlineSources: Boolean(build) };
    if (!build) {
        overrideOptions.inlineSourceMap = true;
    }
    const compilation = tsb.create(projectPath, overrideOptions, {
        verbose: false,
        transpileOnly: Boolean(transpileOnly),
        transpileWithSwc: typeof transpileOnly !== 'boolean' && transpileOnly.swc
    }, err => reporter(err));
    function pipeline(token) {
        const bom = require('gulp-bom');
        const tsFilter = util.filter(data => /\.ts$/.test(data.path));
        const isUtf8Test = (f) => /(\/|\\)test(\/|\\).*utf8/.test(f.path);
        const isRuntimeJs = (f) => f.path.endsWith('.js') && !f.path.includes('fixtures');
        const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));
        const input = es.through();
        const output = input
            .pipe(util.$if(isUtf8Test, bom())) // this is required to preserve BOM in test files that loose it otherwise
            .pipe(util.$if(!build && isRuntimeJs, util.appendOwnPathSourceURL()))
            .pipe(tsFilter)
            .pipe(util.loadSourcemaps())
            .pipe(compilation(token))
            .pipe(noDeclarationsFilter)
            .pipe(util.$if(build, nls.nls()))
            .pipe(noDeclarationsFilter.restore)
            .pipe(util.$if(!transpileOnly, sourcemaps.write('.', {
            addComment: false,
            includeContent: !!build,
            sourceRoot: overrideOptions.sourceRoot
        })))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(!!emitError));
        return es.duplex(input, output);
    }
    pipeline.tsProjectSrc = () => {
        return compilation.src({ base: src });
    };
    pipeline.projectPath = projectPath;
    return pipeline;
}
function transpileTask(src, out, swc) {
    return function () {
        const transpile = createCompile(src, false, true, { swc });
        const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
        return srcPipe
            .pipe(transpile())
            .pipe(gulp.dest(out));
    };
}
exports.transpileTask = transpileTask;
function compileTask(src, out, build) {
    return function () {
        if (os.totalmem() < 4000000000) {
            throw new Error('compilation requires 4GB of RAM');
        }
        const compile = createCompile(src, build, true, false);
        const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
        const generator = new MonacoGenerator(false);
        if (src === 'src') {
            generator.execute();
        }
        // mangle: TypeScript to TypeScript
        let mangleStream = es.through();
        if (build) {
            let ts2tsMangler = new mangleTypeScript_1.Mangler(compile.projectPath, (...data) => fancyLog(ansiColors.blue('[mangler]'), ...data));
            const newContentsByFileName = ts2tsMangler.computeNewFileContents();
            mangleStream = es.through(function write(data) {
                const tsNormalPath = ts.normalizePath(data.path);
                const newContents = newContentsByFileName.get(tsNormalPath);
                if (newContents !== undefined) {
                    data.contents = Buffer.from(newContents.out);
                    data.sourceMap = newContents.sourceMap && JSON.parse(newContents.sourceMap);
                }
                this.push(data);
            }, function end() {
                this.push(null);
                // free resources
                newContentsByFileName.clear();
                ts2tsMangler = undefined;
            });
        }
        return srcPipe
            .pipe(mangleStream)
            .pipe(generator.stream)
            .pipe(compile())
            .pipe(gulp.dest(out));
    };
}
exports.compileTask = compileTask;
function watchTask(out, build) {
    return function () {
        const compile = createCompile('src', build, false, false);
        const src = gulp.src('src/**', { base: 'src' });
        const watchSrc = watch('src/**', { base: 'src', readDelay: 200 });
        const generator = new MonacoGenerator(true);
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
    _isWatch;
    stream;
    _watchedFiles;
    _fsProvider;
    _declarationResolver;
    constructor(isWatch) {
        this._isWatch = isWatch;
        this.stream = es.through();
        this._watchedFiles = {};
        const onWillReadFile = (moduleId, filePath) => {
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
    _executeSoonTimer = null;
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
        const r = monacodts.run3(this._declarationResolver);
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
function generateApiProposalNames() {
    let eol;
    try {
        const src = fs.readFileSync('src/vs/workbench/services/extensions/common/extensionsApiProposals.ts', 'utf-8');
        const match = /\r?\n/m.exec(src);
        eol = match ? match[0] : os.EOL;
    }
    catch {
        eol = os.EOL;
    }
    const pattern = /vscode\.proposed\.([a-zA-Z]+)\.d\.ts$/;
    const proposalNames = new Set();
    const input = es.through();
    const output = input
        .pipe(util.filter((f) => pattern.test(f.path)))
        .pipe(es.through((f) => {
        const name = path.basename(f.path);
        const match = pattern.exec(name);
        if (match) {
            proposalNames.add(match[1]);
        }
    }, function () {
        const names = [...proposalNames.values()].sort();
        const contents = [
            '/*---------------------------------------------------------------------------------------------',
            ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
            ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
            ' *--------------------------------------------------------------------------------------------*/',
            '',
            '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
            '',
            'export const allApiProposals = Object.freeze({',
            `${names.map(name => `\t${name}: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${name}.d.ts'`).join(`,${eol}`)}`,
            '});',
            'export type ApiProposalName = keyof typeof allApiProposals;',
            '',
        ].join(eol);
        this.emit('data', new File({
            path: 'vs/workbench/services/extensions/common/extensionsApiProposals.ts',
            contents: Buffer.from(contents)
        }));
        this.emit('end');
    }));
    return es.duplex(input, output);
}
const apiProposalNamesReporter = (0, reporter_1.createReporter)('api-proposal-names');
exports.compileApiProposalNamesTask = task.define('compile-api-proposal-names', () => {
    return gulp.src('src/vscode-dts/**')
        .pipe(generateApiProposalNames())
        .pipe(gulp.dest('src'))
        .pipe(apiProposalNamesReporter.end(true));
});
exports.watchApiProposalNamesTask = task.define('watch-api-proposal-names', () => {
    const task = () => gulp.src('src/vscode-dts/**')
        .pipe(generateApiProposalNames())
        .pipe(apiProposalNamesReporter.end(true));
    return watch('src/vscode-dts/**', { readDelay: 200 })
        .pipe(util.debounce(task))
        .pipe(gulp.dest('src'));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21waWxhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFDN0IsMENBQTBDO0FBQzFDLDZCQUE2QjtBQUM3Qix5Q0FBNEM7QUFDNUMsK0JBQStCO0FBQy9CLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFDMUMseUJBQXlCO0FBQ3pCLGlDQUFrQztBQUNsQyw4QkFBOEI7QUFDOUIsK0JBQStCO0FBQy9CLHlEQUE2QztBQUU3QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFHakMsdUVBQXVFO0FBRXZFLE1BQU0sUUFBUSxHQUFHLElBQUEseUJBQWMsR0FBRSxDQUFDO0FBRWxDLFNBQVMsNEJBQTRCLENBQUMsR0FBVztJQUNoRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDckQsTUFBTSxPQUFPLEdBQXVCLEVBQUUsQ0FBQztJQUN2QyxPQUFPLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztJQUN4QixPQUFPLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUN6QixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsRUFBRSxFQUFFLHNDQUFzQztRQUMvRSxPQUFPLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztLQUMxQjtJQUNELE9BQU8sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQzFCLE9BQU8sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQzFCLE9BQU8sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM3QyxPQUFPLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxJQUFJ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