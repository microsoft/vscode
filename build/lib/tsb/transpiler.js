"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwcTranspiler = exports.TscTranspiler = void 0;
const swc = require("@swc/core");
const ts = require("typescript");
const threads = require("node:worker_threads");
const Vinyl = require("vinyl");
const node_os_1 = require("node:os");
function transpile(tsSrc, options) {
    const isAmd = /\n(import|export)/m.test(tsSrc);
    if (!isAmd && options.compilerOptions?.module === ts.ModuleKind.AMD) {
        // enforce NONE module-system for not-amd cases
        options = { ...options, ...{ compilerOptions: { ...options.compilerOptions, module: ts.ModuleKind.None } } };
    }
    const out = ts.transpileModule(tsSrc, options);
    return {
        jsSrc: out.outputText,
        diag: out.diagnostics ?? []
    };
}
if (!threads.isMainThread) {
    // WORKER
    threads.parentPort?.addListener('message', (req) => {
        const res = {
            jsSrcs: [],
            diagnostics: []
        };
        for (const tsSrc of req.tsSrcs) {
            const out = transpile(tsSrc, req.options);
            res.jsSrcs.push(out.jsSrc);
            res.diagnostics.push(out.diag);
        }
        threads.parentPort.postMessage(res);
    });
}
class OutputFileNameOracle {
    getOutputFileName;
    constructor(cmdLine, configFilePath) {
        this.getOutputFileName = (file) => {
            try {
                // windows: path-sep normalizing
                file = ts.normalizePath(file);
                if (!cmdLine.options.configFilePath) {
                    // this is needed for the INTERNAL getOutputFileNames-call below...
                    cmdLine.options.configFilePath = configFilePath;
                }
                const isDts = file.endsWith('.d.ts');
                if (isDts) {
                    file = file.slice(0, -5) + '.ts';
                    cmdLine.fileNames.push(file);
                }
                const outfile = ts.getOutputFileNames(cmdLine, file, true)[0];
                if (isDts) {
                    cmdLine.fileNames.pop();
                }
                return outfile;
            }
            catch (err) {
                console.error(file, cmdLine.fileNames);
                console.error(err);
                throw new err;
            }
        };
    }
}
class TranspileWorker {
    static pool = 1;
    id = TranspileWorker.pool++;
    _worker = new threads.Worker(__filename);
    _pending;
    _durations = [];
    constructor(outFileFn) {
        this._worker.addListener('message', (res) => {
            if (!this._pending) {
                console.error('RECEIVING data WITHOUT request');
                return;
            }
            const [resolve, reject, files, options, t1] = this._pending;
            const outFiles = [];
            const diag = [];
            for (let i = 0; i < res.jsSrcs.length; i++) {
                // inputs and outputs are aligned across the arrays
                const file = files[i];
                const jsSrc = res.jsSrcs[i];
                const diag = res.diagnostics[i];
                if (diag.length > 0) {
                    diag.push(...diag);
                    continue;
                }
                let SuffixTypes;
                (function (SuffixTypes) {
                    SuffixTypes[SuffixTypes["Dts"] = 5] = "Dts";
                    SuffixTypes[SuffixTypes["Ts"] = 3] = "Ts";
                    SuffixTypes[SuffixTypes["Unknown"] = 0] = "Unknown";
                })(SuffixTypes || (SuffixTypes = {}));
                const suffixLen = file.path.endsWith('.d.ts') ? 5 /* SuffixTypes.Dts */
                    : file.path.endsWith('.ts') ? 3 /* SuffixTypes.Ts */
                        : 0 /* SuffixTypes.Unknown */;
                // check if output of a DTS-files isn't just "empty" and iff so
                // skip this file
                if (suffixLen === 5 /* SuffixTypes.Dts */ && _isDefaultEmpty(jsSrc)) {
                    continue;
                }
                const outBase = options.compilerOptions?.outDir ?? file.base;
                const outPath = outFileFn(file.path);
                outFiles.push(new Vinyl({
                    path: outPath,
                    base: outBase,
                    contents: Buffer.from(jsSrc),
                }));
            }
            this._pending = undefined;
            this._durations.push(Date.now() - t1);
            if (diag.length > 0) {
                reject(diag);
            }
            else {
                resolve(outFiles);
            }
        });
    }
    terminate() {
        // console.log(`Worker#${this.id} ENDS after ${this._durations.length} jobs (total: ${this._durations.reduce((p, c) => p + c, 0)}, avg: ${this._durations.reduce((p, c) => p + c, 0) / this._durations.length})`);
        this._worker.terminate();
    }
    get isBusy() {
        return this._pending !== undefined;
    }
    next(files, options) {
        if (this._pending !== undefined) {
            throw new Error('BUSY');
        }
        return new Promise((resolve, reject) => {
            this._pending = [resolve, reject, files, options, Date.now()];
            const req = {
                options,
                tsSrcs: files.map(file => String(file.contents))
            };
            this._worker.postMessage(req);
        });
    }
}
class TscTranspiler {
    _onError;
    _cmdLine;
    static P = Math.floor((0, node_os_1.cpus)().length * .5);
    _outputFileNames;
    onOutfile;
    _workerPool = [];
    _queue = [];
    _allJobs = [];
    constructor(logFn, _onError, configFilePath, _cmdLine) {
        this._onError = _onError;
        this._cmdLine = _cmdLine;
        logFn('Transpile', `will use ${TscTranspiler.P} transpile worker`);
        this._outputFileNames = new OutputFileNameOracle(_cmdLine, configFilePath);
    }
    async join() {
        // wait for all penindg jobs
        this._consumeQueue();
        await Promise.allSettled(this._allJobs);
        this._allJobs.length = 0;
        // terminate all worker
        this._workerPool.forEach(w => w.terminate());
        this._workerPool.length = 0;
    }
    transpile(file) {
        if (this._cmdLine.options.noEmit) {
            // not doing ANYTHING here
            return;
        }
        const newLen = this._queue.push(file);
        if (newLen > TscTranspiler.P ** 2) {
            this._consumeQueue();
        }
    }
    _consumeQueue() {
        if (this._queue.length === 0) {
            // no work...
            return;
        }
        // kinda LAZYily create workers
        if (this._workerPool.length === 0) {
            for (let i = 0; i < TscTranspiler.P; i++) {
                this._workerPool.push(new TranspileWorker(file => this._outputFileNames.getOutputFileName(file)));
            }
        }
        const freeWorker = this._workerPool.filter(w => !w.isBusy);
        if (freeWorker.length === 0) {
            // OK, they will pick up work themselves
            return;
        }
        for (const worker of freeWorker) {
            if (this._queue.length === 0) {
                break;
            }
            const job = new Promise(resolve => {
                const consume = () => {
                    const files = this._queue.splice(0, TscTranspiler.P);
                    if (files.length === 0) {
                        // DONE
                        resolve(undefined);
                        return;
                    }
                    // work on the NEXT file
                    // const [inFile, outFn] = req;
                    worker.next(files, { compilerOptions: this._cmdLine.options }).then(outFiles => {
                        if (this.onOutfile) {
                            outFiles.map(this.onOutfile, this);
                        }
                        consume();
                    }).catch(err => {
                        this._onError(err);
                    });
                };
                consume();
            });
            this._allJobs.push(job);
        }
    }
}
exports.TscTranspiler = TscTranspiler;
function _isDefaultEmpty(src) {
    return src
        .replace('"use strict";', '')
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
        .trim().length === 0;
}
class SwcTranspiler {
    _logFn;
    _onError;
    _cmdLine;
    onOutfile;
    _outputFileNames;
    _jobs = [];
    constructor(_logFn, _onError, configFilePath, _cmdLine) {
        this._logFn = _logFn;
        this._onError = _onError;
        this._cmdLine = _cmdLine;
        _logFn('Transpile', `will use SWC to transpile source files`);
        this._outputFileNames = new OutputFileNameOracle(_cmdLine, configFilePath);
    }
    async join() {
        const jobs = this._jobs.slice();
        this._jobs.length = 0;
        await Promise.allSettled(jobs);
    }
    transpile(file) {
        if (this._cmdLine.options.noEmit) {
            // not doing ANYTHING here
            return;
        }
        const tsSrc = String(file.contents);
        const t1 = Date.now();
        let options = SwcTranspiler._swcrcEsm;
        if (this._cmdLine.options.module === ts.ModuleKind.AMD) {
            const isAmd = /\n(import|export)/m.test(tsSrc);
            if (isAmd) {
                options = SwcTranspiler._swcrcAmd;
            }
        }
        else if (this._cmdLine.options.module === ts.ModuleKind.CommonJS) {
            options = SwcTranspiler._swcrcCommonJS;
        }
        this._jobs.push(swc.transform(tsSrc, options).then(output => {
            // check if output of a DTS-files isn't just "empty" and iff so
            // skip this file
            if (file.path.endsWith('.d.ts') && _isDefaultEmpty(output.code)) {
                return;
            }
            const outBase = this._cmdLine.options.outDir ?? file.base;
            const outPath = this._outputFileNames.getOutputFileName(file.path);
            this.onOutfile(new Vinyl({
                path: outPath,
                base: outBase,
                contents: Buffer.from(output.code),
            }));
            this._logFn('Transpile', `swc took ${Date.now() - t1}ms for ${file.path}`);
        }).catch(err => {
            this._onError(err);
        }));
    }
    // --- .swcrc
    static _swcrcAmd = {
        exclude: '\.js$',
        jsc: {
            parser: {
                syntax: 'typescript',
                tsx: false,
                decorators: true
            },
            target: 'es2022',
            loose: false,
            minify: {
                compress: false,
                mangle: false
            },
            transform: {
                useDefineForClassFields: false,
            },
        },
        module: {
            type: 'amd',
            noInterop: false
        },
        minify: false,
    };
    static _swcrcCommonJS = {
        ...this._swcrcAmd,
        module: {
            type: 'commonjs',
            importInterop: 'swc'
        }
    };
    static _swcrcEsm = {
        ...this._swcrcAmd,
        module: {
            type: 'es6'
        }
    };
}
exports.SwcTranspiler = SwcTranspiler;
//# sourceMappingURL=transpiler.js.map