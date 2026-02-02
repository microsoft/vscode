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
            noInterop: true
        },
        minify: false,
    };
    static _swcrcCommonJS = {
        ...this._swcrcAmd,
        module: {
            type: 'commonjs',
            importInterop: 'none'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwaWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyYW5zcGlsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsaUNBQWlDO0FBQ2pDLGlDQUFpQztBQUNqQywrQ0FBK0M7QUFDL0MsK0JBQStCO0FBQy9CLHFDQUErQjtBQVkvQixTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsT0FBNEI7SUFFN0QsTUFBTSxLQUFLLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9DLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxNQUFNLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNyRSwrQ0FBK0M7UUFDL0MsT0FBTyxHQUFHLEVBQUUsR0FBRyxPQUFPLEVBQUUsR0FBRyxFQUFFLGVBQWUsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLGVBQWUsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDOUcsQ0FBQztJQUNELE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQy9DLE9BQU87UUFDTixLQUFLLEVBQUUsR0FBRyxDQUFDLFVBQVU7UUFDckIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxXQUFXLElBQUksRUFBRTtLQUMzQixDQUFDO0FBQ0gsQ0FBQztBQUVELElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDM0IsU0FBUztJQUNULE9BQU8sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQWlCLEVBQUUsRUFBRTtRQUNoRSxNQUFNLEdBQUcsR0FBaUI7WUFDekIsTUFBTSxFQUFFLEVBQUU7WUFDVixXQUFXLEVBQUUsRUFBRTtTQUNmLENBQUM7UUFDRixL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