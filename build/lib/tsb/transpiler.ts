/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as threads from 'node:worker_threads';
import * as Vinyl from 'vinyl';
import { cpus } from 'node:os';

interface TranspileReq {
	readonly tsSrcs: string[];
	readonly options: ts.TranspileOptions;
}

interface TranspileRes {
	readonly jsSrcs: string[];
	readonly diagnostics: ts.Diagnostic[][];
}

function transpile(tsSrc: string, options: ts.TranspileOptions): { jsSrc: string; diag: ts.Diagnostic[] } {

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
	threads.parentPort?.addListener('message', (req: TranspileReq) => {
		const res: TranspileRes = {
			jsSrcs: [],
			diagnostics: []
		};
		for (const tsSrc of req.tsSrcs) {
			const out = transpile(tsSrc, req.options);
			res.jsSrcs.push(out.jsSrc);
			res.diagnostics.push(out.diag);
		}
		threads.parentPort!.postMessage(res);
	});
}

class TranspileWorker {

	private static pool = 1;

	readonly id = TranspileWorker.pool++;

	private _worker = new threads.Worker(__filename);
	private _pending?: [resolve: Function, reject: Function, file: Vinyl[], options: ts.TranspileOptions, t1: number];
	private _durations: number[] = [];

	constructor(outFileFn: (fileName: string) => string) {

		this._worker.addListener('message', (res: TranspileRes) => {
			if (!this._pending) {
				console.error('RECEIVING data WITHOUT request');
				return;
			}

			const [resolve, reject, files, options, t1] = this._pending;

			const outFiles: Vinyl[] = [];
			const diag: ts.Diagnostic[] = [];

			for (let i = 0; i < res.jsSrcs.length; i++) {
				// inputs and outputs are aligned across the arrays
				const file = files[i];
				const jsSrc = res.jsSrcs[i];
				const diag = res.diagnostics[i];

				if (diag.length > 0) {
					diag.push(...diag);
					continue;
				}
				const enum SuffixTypes {
					Dts = 5,
					Ts = 3,
					Unknown = 0
				}
				const suffixLen = file.path.endsWith('.d.ts') ? SuffixTypes.Dts
					: file.path.endsWith('.ts') ? SuffixTypes.Ts
						: SuffixTypes.Unknown;

				// check if output of a DTS-files isn't just "empty" and iff so
				// skip this file
				if (suffixLen === SuffixTypes.Dts && _isDefaultEmpty(jsSrc)) {
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
			} else {
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

	next(files: Vinyl[], options: ts.TranspileOptions) {
		if (this._pending !== undefined) {
			throw new Error('BUSY');
		}
		return new Promise<Vinyl[]>((resolve, reject) => {
			this._pending = [resolve, reject, files, options, Date.now()];
			const req: TranspileReq = {
				options,
				tsSrcs: files.map(file => String(file.contents))
			};
			this._worker.postMessage(req);
		});
	}
}


export class Transpiler {

	static P = Math.floor(cpus().length * .5);

	public onOutfile?: (file: Vinyl) => void;

	private _workerPool: TranspileWorker[] = [];
	private _queue: Vinyl[] = [];
	private _allJobs: Promise<any>[] = [];

	constructor(
		logFn: (topic: string, message: string) => void,
		private readonly _onError: (err: any) => void,
		private readonly _cmdLine: ts.ParsedCommandLine
	) {
		logFn('Transpile', `will use ${Transpiler.P} transpile worker`);
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


	transpile(file: Vinyl) {

		if (this._cmdLine.options.noEmit) {
			// not doing ANYTHING here
			return;
		}

		const newLen = this._queue.push(file);
		if (newLen > Transpiler.P ** 2) {
			this._consumeQueue();
		}
	}

	private _consumeQueue(): void {

		if (this._queue.length === 0) {
			// no work...
			return;
		}

		// kinda LAZYily create workers
		if (this._workerPool.length === 0) {
			for (let i = 0; i < Transpiler.P; i++) {
				this._workerPool.push(new TranspileWorker(file => this._tsApiInternalOutfileName.getForInfile(file)));
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
					const files = this._queue.splice(0, Transpiler.P);
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

	private _tsApiInternalOutfileName = new class {

		getForInfile: (file: string) => string;

		constructor(parsedCmd: ts.ParsedCommandLine) {

			type InternalTsHost = {
				getCompilerOptions(): ts.CompilerOptions;
				getCurrentDirectory(): string;
				getCommonSourceDirectory(): string;
				getCanonicalFileName(file: string): string;
			};
			type InternalTsApi = { getOwnEmitOutputFilePath(fileName: string, host: InternalTsHost, extension: string): string } & typeof ts;

			const host = ts.createCompilerHost(parsedCmd.options);
			const program = ts.createProgram({ options: parsedCmd.options, rootNames: parsedCmd.fileNames, host });
			const emitHost: InternalTsHost = {
				getCompilerOptions: () => parsedCmd.options,
				getCurrentDirectory: () => host.getCurrentDirectory(),
				getCanonicalFileName: file => host.getCanonicalFileName(file),
				getCommonSourceDirectory: () => (<any>program).getCommonSourceDirectory()
			};

			this.getForInfile = file => {
				return (<InternalTsApi>ts).getOwnEmitOutputFilePath(file, emitHost, '.js');
			};
		}
	}(this._cmdLine);
}

function _isDefaultEmpty(src: string): boolean {
	return src
		.replace('"use strict";', '')
		.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
		.trim().length === 0;
}
