/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as threads from 'node:worker_threads';
import * as Vinyl from 'vinyl';
import { join, relative } from 'path';
import { cpus } from 'node:os';

interface TranspileReq {
	readonly tsSrc: string;
	readonly options: ts.TranspileOptions;
}

interface TranspileRes {
	readonly jsSrc: string;
	readonly diagnostics?: ts.Diagnostic[];
}

function transpile(tsSrc: string, options: ts.TranspileOptions): { jsSrc: string; diag?: ts.Diagnostic[] } {

	const isAmd = /\n(import|export)/m.test(tsSrc);
	if (!isAmd) {
		options.compilerOptions!.module = ts.ModuleKind.None;
	}
	const out = ts.transpileModule(tsSrc, options);
	return {
		jsSrc: out.outputText,
		diag: out.diagnostics && out.diagnostics.length > 0 ? out.diagnostics : undefined
	};
}

if (!threads.isMainThread) {
	// WORKER
	threads.parentPort?.addListener('message', (req: TranspileReq) => {
		const out: TranspileRes = transpile(req.tsSrc, req.options);
		threads.parentPort!.postMessage(out);
	});
}

class TranspileWorker {

	private static pool = 1;

	readonly id = TranspileWorker.pool++;

	private _worker = new threads.Worker(__filename);
	private _pending?: [resolve: Function, reject: Function, file: Vinyl, options: ts.TranspileOptions, t1: number];
	private _durations: number[] = [];

	constructor() {

		this._worker.addListener('message', (value: TranspileRes) => {
			if (!this._pending) {
				console.error('RECEIVING data WITHOUT request');
				return;
			}

			const [resolve, reject, file, options, t1] = this._pending;

			if (value.diagnostics && value.diagnostics.length > 0) {
				reject(value.diagnostics);
				return;
			}

			const outBase = options.compilerOptions!.outDir!;
			const outRelative = relative(options.compilerOptions!.rootDir!, file.path);
			const outPath = join(outBase, outRelative.replace(/\.ts$/, '.js'));
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

	next(file: Vinyl, options: ts.TranspileOptions) {
		if (this._pending !== undefined) {
			throw new Error('BUSY');
		}
		return new Promise<Vinyl>((resolve, reject) => {
			this._pending = [resolve, reject, file, options, Date.now()];
			const req: TranspileReq = { tsSrc: String(file.contents), options };
			this._worker.postMessage(req);
		});
	}
}

export class Transpiler {

	static P = cpus().length * .5;
	// private _worker: TranspileWorker[] = [];
	private _queue: Vinyl[] = [];

	private _workerPool: TranspileWorker[] = [];
	private _allJobs: Promise<any>[] = [];

	constructor(
		readonly logFn: (topic: string, message: string) => void,
		readonly options: ts.TranspileOptions
	) {
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

	transpile(file: Vinyl, out: (file: Vinyl) => void, onError: (err: any) => void) {

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
