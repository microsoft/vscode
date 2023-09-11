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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwaWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyYW5zcGlsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsaUNBQWlDO0FBQ2pDLGlDQUFpQztBQUNqQywrQ0FBK0M7QUFDL0MsK0JBQStCO0FBQy9CLHFDQUErQjtBQVkvQixTQUFTLFNBQVMsQ0FBQyxLQUFhLEVBQUUsT0FBNEI7SUFFN0QsTUFBTSxLQUFLLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9DLElBQUksQ0FBQyxLQUFLLElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxNQUFNLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDcEUsK0NBQStDO1FBQy9DLE9BQU8sR0FBRyxFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsRUFBRSxlQUFlLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxlQUFlLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDO0tBQzdHO0lBQ0QsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDL0MsT0FBTztRQUNOLEtBQUssRUFBRSxHQUFHLENBQUMsVUFBVTtRQUNyQixJQUFJLEVBQUUsR0FBRyxDQUFDLFdBQVcsSUFBSSxFQUFFO0tBQzNCLENBQUM7QUFDSCxDQUFDO0FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUU7SUFDMUIsU0FBUztJQUNULE9BQU8sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQWlCLEVBQUUsRUFBRTtRQUNoRSxNQUFNLEdBQUcsR0FBaUI7WUFDekIsTUFBTSxFQUFFLEVBQUU7WUFDVixXQUFXLEVBQUUsRUFBRTtTQUNmLENBQUM7UUFDRixLQUFLLE1BQU0sS0FBSyxJ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