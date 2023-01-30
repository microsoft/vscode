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
                const newContents = newContentsByFileName.get(data.path);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21waWxhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFDN0IsMENBQTBDO0FBQzFDLDZCQUE2QjtBQUM3Qix5Q0FBNEM7QUFDNUMsK0JBQStCO0FBQy9CLHNDQUFzQztBQUN0QywwQ0FBMEM7QUFDMUMseUJBQXlCO0FBRXpCLDhCQUE4QjtBQUM5QiwrQkFBK0I7QUFDL0IseURBQTZDO0FBRTdDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUdqQyx1RUFBdUU7QUFFdkUsTUFBTSxRQUFRLEdBQUcsSUFBQSx5QkFBYyxHQUFFLENBQUM7QUFFbEMsU0FBUyw0QkFBNEIsQ0FBQyxHQUFXO0lBQ2hELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFNBQVMsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNyRCxNQUFNLE9BQU8sR0FBdUIsRUFBRSxDQUFDO0lBQ3ZDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ3hCLE9BQU8sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLEVBQUUsc0NBQXNDO1FBQy9FLE9BQU8sQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO0tBQzFCO0lBQ0QsT0FBTyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDMUIsT0FBTyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDMUIsT0FBTyxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdDLE9BQU8sQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENB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