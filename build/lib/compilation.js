"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchApiProposalNamesTask = exports.compileApiProposalNamesTask = void 0;
exports.transpileTask = transpileTask;
exports.compileTask = compileTask;
exports.watchTask = watchTask;
const event_stream_1 = __importDefault(require("event-stream"));
const fs_1 = __importDefault(require("fs"));
const gulp_1 = __importDefault(require("gulp"));
const path_1 = __importDefault(require("path"));
const monacodts = __importStar(require("./monaco-api"));
const nls = __importStar(require("./nls"));
const reporter_1 = require("./reporter");
const util = __importStar(require("./util"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const os_1 = __importDefault(require("os"));
const vinyl_1 = __importDefault(require("vinyl"));
const task = __importStar(require("./task"));
const index_1 = require("./mangle/index");
const postcss_1 = require("./postcss");
const ts = require("typescript");
const watch = require('./watch');
// --- gulp-tsb: compile and transpile --------------------------------
const reporter = (0, reporter_1.createReporter)();
function getTypeScriptCompilerOptions(src) {
    const rootDir = path_1.default.join(__dirname, `../../${src}`);
    const options = {};
    options.verbose = false;
    options.sourceMap = true;
    if (process.env['VSCODE_NO_SOURCEMAP']) { // To be used by developers in a hurry
        options.sourceMap = false;
    }
    options.rootDir = rootDir;
    options.baseUrl = rootDir;
    options.sourceRoot = util.toFileUri(rootDir);
    options.newLine = /\r\n/.test(fs_1.default.readFileSync(__filename, 'utf8')) ? 0 : 1;
    return options;
}
function createCompile(src, { build, emitError, transpileOnly, preserveEnglish }) {
    const tsb = require('./tsb');
    const sourcemaps = require('gulp-sourcemaps');
    const projectPath = path_1.default.join(__dirname, '../../', src, 'tsconfig.json');
    const overrideOptions = { ...getTypeScriptCompilerOptions(src), inlineSources: Boolean(build) };
    if (!build) {
        overrideOptions.inlineSourceMap = true;
    }
    const compilation = tsb.create(projectPath, overrideOptions, {
        verbose: false,
        transpileOnly: Boolean(transpileOnly),
        transpileWithSwc: typeof transpileOnly !== 'boolean' && transpileOnly.esbuild
    }, err => reporter(err));
    function pipeline(token) {
        const bom = require('gulp-bom');
        const tsFilter = util.filter(data => /\.ts$/.test(data.path));
        const isUtf8Test = (f) => /(\/|\\)test(\/|\\).*utf8/.test(f.path);
        const isRuntimeJs = (f) => f.path.endsWith('.js') && !f.path.includes('fixtures');
        const isCSS = (f) => f.path.endsWith('.css') && !f.path.includes('fixtures');
        const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));
        const postcssNesting = require('postcss-nesting');
        const input = event_stream_1.default.through();
        const output = input
            .pipe(util.$if(isUtf8Test, bom())) // this is required to preserve BOM in test files that loose it otherwise
            .pipe(util.$if(!build && isRuntimeJs, util.appendOwnPathSourceURL()))
            .pipe(util.$if(isCSS, (0, postcss_1.gulpPostcss)([postcssNesting()], err => reporter(String(err)))))
            .pipe(tsFilter)
            .pipe(util.loadSourcemaps())
            .pipe(compilation(token))
            .pipe(noDeclarationsFilter)
            .pipe(util.$if(build, nls.nls({ preserveEnglish })))
            .pipe(noDeclarationsFilter.restore)
            .pipe(util.$if(!transpileOnly, sourcemaps.write('.', {
            addComment: false,
            includeContent: !!build,
            sourceRoot: overrideOptions.sourceRoot
        })))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(!!emitError));
        return event_stream_1.default.duplex(input, output);
    }
    pipeline.tsProjectSrc = () => {
        return compilation.src({ base: src });
    };
    pipeline.projectPath = projectPath;
    return pipeline;
}
function transpileTask(src, out, esbuild) {
    const task = () => {
        const transpile = createCompile(src, { build: false, emitError: true, transpileOnly: { esbuild }, preserveEnglish: false });
        const srcPipe = gulp_1.default.src(`${src}/**`, { base: `${src}` });
        return srcPipe
            .pipe(transpile())
            .pipe(gulp_1.default.dest(out));
    };
    task.taskName = `transpile-${path_1.default.basename(src)}`;
    return task;
}
function compileTask(src, out, build, options = {}) {
    const task = () => {
        if (os_1.default.totalmem() < 4_000_000_000) {
            throw new Error('compilation requires 4GB of RAM');
        }
        const compile = createCompile(src, { build, emitError: true, transpileOnly: false, preserveEnglish: !!options.preserveEnglish });
        const srcPipe = gulp_1.default.src(`${src}/**`, { base: `${src}` });
        const generator = new MonacoGenerator(false);
        if (src === 'src') {
            generator.execute();
        }
        // mangle: TypeScript to TypeScript
        let mangleStream = event_stream_1.default.through();
        if (build && !options.disableMangle) {
            let ts2tsMangler = new index_1.Mangler(compile.projectPath, (...data) => (0, fancy_log_1.default)(ansi_colors_1.default.blue('[mangler]'), ...data), { mangleExports: true, manglePrivateFields: true });
            const newContentsByFileName = ts2tsMangler.computeNewFileContents(new Set(['saveState']));
            mangleStream = event_stream_1.default.through(async function write(data) {
                const tsNormalPath = ts.normalizePath(data.path);
                const newContents = (await newContentsByFileName).get(tsNormalPath);
                if (newContents !== undefined) {
                    data.contents = Buffer.from(newContents.out);
                    data.sourceMap = newContents.sourceMap && JSON.parse(newContents.sourceMap);
                }
                this.push(data);
            }, async function end() {
                // free resources
                (await newContentsByFileName).clear();
                this.push(null);
                ts2tsMangler = undefined;
            });
        }
        return srcPipe
            .pipe(mangleStream)
            .pipe(generator.stream)
            .pipe(compile())
            .pipe(gulp_1.default.dest(out));
    };
    task.taskName = `compile-${path_1.default.basename(src)}`;
    return task;
}
function watchTask(out, build, srcPath = 'src') {
    const task = () => {
        const compile = createCompile(srcPath, { build, emitError: false, transpileOnly: false, preserveEnglish: false });
        const src = gulp_1.default.src(`${srcPath}/**`, { base: srcPath });
        const watchSrc = watch(`${srcPath}/**`, { base: srcPath, readDelay: 200 });
        const generator = new MonacoGenerator(true);
        generator.execute();
        return watchSrc
            .pipe(generator.stream)
            .pipe(util.incremental(compile, src, true))
            .pipe(gulp_1.default.dest(out));
    };
    task.taskName = `watch-${path_1.default.basename(out)}`;
    return task;
}
const REPO_SRC_FOLDER = path_1.default.join(__dirname, '../../src');
class MonacoGenerator {
    _isWatch;
    stream;
    _watchedFiles;
    _fsProvider;
    _declarationResolver;
    constructor(isWatch) {
        this._isWatch = isWatch;
        this.stream = event_stream_1.default.through();
        this._watchedFiles = {};
        const onWillReadFile = (moduleId, filePath) => {
            if (!this._isWatch) {
                return;
            }
            if (this._watchedFiles[filePath]) {
                return;
            }
            this._watchedFiles[filePath] = true;
            fs_1.default.watchFile(filePath, () => {
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
            fs_1.default.watchFile(monacodts.RECIPE_PATH, () => {
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
        (0, fancy_log_1.default)(ansi_colors_1.default.cyan('[monaco.d.ts]'), message, ...rest);
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
        fs_1.default.writeFileSync(result.filePath, result.content);
        fs_1.default.writeFileSync(path_1.default.join(REPO_SRC_FOLDER, 'vs/editor/common/standalone/standaloneEnums.ts'), result.enums);
        this._log(`monaco.d.ts is changed - total time took ${Date.now() - startTime} ms`);
        if (!this._isWatch) {
            this.stream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
        }
    }
}
function generateApiProposalNames() {
    let eol;
    try {
        const src = fs_1.default.readFileSync('src/vs/platform/extensions/common/extensionsApiProposals.ts', 'utf-8');
        const match = /\r?\n/m.exec(src);
        eol = match ? match[0] : os_1.default.EOL;
    }
    catch {
        eol = os_1.default.EOL;
    }
    const pattern = /vscode\.proposed\.([a-zA-Z\d]+)\.d\.ts$/;
    const versionPattern = /^\s*\/\/\s*version\s*:\s*(\d+)\s*$/mi;
    const proposals = new Map();
    const input = event_stream_1.default.through();
    const output = input
        .pipe(util.filter((f) => pattern.test(f.path)))
        .pipe(event_stream_1.default.through((f) => {
        const name = path_1.default.basename(f.path);
        const match = pattern.exec(name);
        if (!match) {
            return;
        }
        const proposalName = match[1];
        const contents = f.contents.toString('utf8');
        const versionMatch = versionPattern.exec(contents);
        const version = versionMatch ? versionMatch[1] : undefined;
        proposals.set(proposalName, {
            proposal: `https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${proposalName}.d.ts`,
            version: version ? parseInt(version) : undefined
        });
    }, function () {
        const names = [...proposals.keys()].sort();
        const contents = [
            '/*---------------------------------------------------------------------------------------------',
            ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
            ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
            ' *--------------------------------------------------------------------------------------------*/',
            '',
            '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
            '',
            'const _allApiProposals = {',
            `${names.map(proposalName => {
                const proposal = proposals.get(proposalName);
                return `\t${proposalName}: {${eol}\t\tproposal: '${proposal.proposal}',${eol}${proposal.version ? `\t\tversion: ${proposal.version}${eol}` : ''}\t}`;
            }).join(`,${eol}`)}`,
            '};',
            'export const allApiProposals = Object.freeze<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>(_allApiProposals);',
            'export type ApiProposalName = keyof typeof _allApiProposals;',
            '',
        ].join(eol);
        this.emit('data', new vinyl_1.default({
            path: 'vs/platform/extensions/common/extensionsApiProposals.ts',
            contents: Buffer.from(contents)
        }));
        this.emit('end');
    }));
    return event_stream_1.default.duplex(input, output);
}
const apiProposalNamesReporter = (0, reporter_1.createReporter)('api-proposal-names');
exports.compileApiProposalNamesTask = task.define('compile-api-proposal-names', () => {
    return gulp_1.default.src('src/vscode-dts/**')
        .pipe(generateApiProposalNames())
        .pipe(gulp_1.default.dest('src'))
        .pipe(apiProposalNamesReporter.end(true));
});
exports.watchApiProposalNamesTask = task.define('watch-api-proposal-names', () => {
    const task = () => gulp_1.default.src('src/vscode-dts/**')
        .pipe(generateApiProposalNames())
        .pipe(apiProposalNamesReporter.end(true));
    return watch('src/vscode-dts/**', { readDelay: 200 })
        .pipe(util.debounce(task))
        .pipe(gulp_1.default.dest('src'));
});
//# sourceMappingURL=compilation.js.map