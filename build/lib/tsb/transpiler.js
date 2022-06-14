"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transpiler = void 0;
const ts = require("typescript");
const threads = require("node:worker_threads");
const Vinyl = require("vinyl");
const path_1 = require("path");
const node_os_1 = require("node:os");
function transpile(tsSrc, options) {
    const isAmd = /\n(import|export)/m.test(tsSrc);
    if (!isAmd) {
        options.compilerOptions.module = ts.ModuleKind.None;
    }
    const out = ts.transpileModule(tsSrc, options);
    return {
        jsSrc: out.outputText,
        diag: out.diagnostics && out.diagnostics.length > 0 ? out.diagnostics : undefined
    };
}
if (!threads.isMainThread) {
    // WORKER
    threads.parentPort?.addListener('message', (req) => {
        const out = transpile(req.tsSrc, req.options);
        threads.parentPort.postMessage(out);
    });
}
class TranspileWorker {
    constructor() {
        this.id = TranspileWorker.pool++;
        this._worker = new threads.Worker(__filename);
        this._durations = [];
        this._worker.addListener('message', (value) => {
            if (!this._pending) {
                console.error('RECEIVING data WITHOUT request');
                return;
            }
            const [resolve, reject, file, options, t1] = this._pending;
            if (value.diagnostics && value.diagnostics.length > 0) {
                reject(value.diagnostics);
                return;
            }
            const outBase = options.compilerOptions.outDir;
            const outRelative = (0, path_1.relative)(options.compilerOptions.rootDir, file.path);
            const outPath = (0, path_1.join)(outBase, outRelative.replace(/\.ts$/, '.js'));
            const outFile = new Vinyl({
                path: outPath,
                base: outBase,
                contents: Buffer.from(value.jsSrc),
            });
            this._pending = undefined;
            this._durations.push(Date.now() - t1);
            resolve(outFile);
        });
    }
    terminate() {
        // console.log(`Worker#${this.id} ENDS after ${this._durations.length} jobs (total: ${this._durations.reduce((p, c) => p + c, 0)}, avg: ${this._durations.reduce((p, c) => p + c, 0) / this._durations.length})`);
        this._worker.terminate();
    }
    get isBusy() {
        return this._pending !== undefined;
    }
    next(file, options) {
        if (this._pending !== undefined) {
            throw new Error('BUSY');
        }
        return new Promise((resolve, reject) => {
            this._pending = [resolve, reject, file, options, Date.now()];
            const req = { tsSrc: String(file.contents), options };
            this._worker.postMessage(req);
        });
    }
}
TranspileWorker.pool = 1;
class Transpiler {
    constructor(logFn, options) {
        this.logFn = logFn;
        this.options = options;
        // private _worker: TranspileWorker[] = [];
        this._queue = [];
        this._workerPool = [];
        this._allJobs = [];
        logFn('Transpile', `will use ${Transpiler.P} transpile worker`);
    }
    async join() {
        // wait for all penindg jobs
        await Promise.allSettled(this._allJobs);
        this._allJobs.length = 0;
        // terminate all worker
        this._workerPool.forEach(w => w.terminate());
        this._workerPool.length = 0;
    }
    transpile(file, out, onError) {
        const len = this._queue.push(file);
        if (len < 2 * Transpiler.P) {
            return;
        }
        // LAZYily create worker
        if (this._workerPool.length === 0) {
            for (let i = 0; i < Transpiler.P; i++) {
                this._workerPool.push(new TranspileWorker());
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
                    const inFile = this._queue.pop();
                    if (!inFile) {
                        // DONE
                        resolve(undefined);
                        return;
                    }
                    // work on the NEXT file
                    worker.next(inFile, this.options).then(outFile => {
                        out(outFile);
                        consume();
                    }).catch(err => {
                        onError(err);
                    });
                };
                consume();
            });
            this._allJobs.push(job);
        }
    }
}
exports.Transpiler = Transpiler;
Transpiler.P = (0, node_os_1.cpus)().length * .5;
