/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import uri from 'vs/base/common/uri';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

import * as ipc from 'vs/base/parts/ipc/common/ipc';
import * as baseMime from 'vs/base/common/mime';
import { TPromise } from 'vs/base/common/winjs.base';

import { ILineMatch, IProgress, IPatternInfo } from 'vs/platform/search/common/search';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode } from 'vs/base/node/encoding';
import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from './search';
import { ISearchWorkerConfig, ISearchWorkerSearchArgs, ISearchWorker, ISearchWorkerChannel, SearchWorkerChannelClient } from './worker/searchWorkerIpc'

import { Client } from 'vs/base/parts/ipc/node/ipc.cp';

export class Engine implements ISearchEngine<ISerializedFileMatch> {

	private static PROGRESS_FLUSH_CHUNK_SIZE = 50; // optimization: number of files to process before emitting progress event

	private rootFolders: string[];
	private extraFiles: string[];
	private maxResults: number;
	private walker: FileWalker;
	private isCanceled: boolean;
	private isDone: boolean;
	private total: number;
	private worked: number;
	private progressed: number;
	private walkerError: Error;
	private walkerIsDone: boolean;
	private fileEncoding: string;
	private limitReached: boolean;

	private workers: ISearchWorker[] = [];
	private readyWorkers: ISearchWorker[] = [];

	private nextWorker = 0;

	private batches = [];

	private onResult: any;

	constructor(config: IRawSearch, walker: FileWalker) {
		this.rootFolders = config.rootFolders;
		this.extraFiles = config.extraFiles;
		this.walker = walker;
		this.isCanceled = false;
		this.limitReached = false;
		this.maxResults = config.maxResults;
		this.worked = 0;
		this.progressed = 0;
		this.total = 0;
		this.fileEncoding = encodingExists(config.fileEncoding) ? config.fileEncoding : UTF8;

		// Spin up workers
		const workerConfig: ISearchWorkerConfig = {
			pattern: config.contentPattern,
			id: undefined
		};
		const numWorkers = Math.ceil(os.cpus().length/2); // /2 because of hyperthreading. Maybe make better.
		// const numWorkers = 2;
		for (let i = 0; i < numWorkers; i++) {
			workerConfig.id = i;
			const worker = createWorker(workerConfig);
			this.workers.push(worker);
			this.readyWorkers.push(worker);
		}
	}

	public cancel(): void {
		this.isCanceled = true;
		this.walker.cancel();

		// TODO cancel workers
	}

	public search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		let resultCounter = 0;
		this.onResult = onResult;

		const progress = () => {
			if (++this.progressed % Engine.PROGRESS_FLUSH_CHUNK_SIZE === 0) {
				onProgress({ total: this.total, worked: this.worked }); // buffer progress in chunks to reduce pressure
			}
		};

		const unwind = (processed: number, iAmDone?) => {
			this.worked += processed;

			// Emit progress() unless we got canceled or hit the limit
			if (processed && !this.isDone && !this.isCanceled && !this.limitReached) {
				progress();
			}

			// Emit done()
			// console.log('unwind: ' + this.worked + '/' + this.total);
			if (iAmDone && !this.isDone && this.worked === this.total) {
				this.isDone = true;
				done(this.walkerError, {
					limitHit: this.limitReached,
					stats: this.walker.getStats()
				});
			}
		};

		const onBatchReady = (batch: string[], batchSize): void => {
			// console.log(`onBatchReady: ${batchSize}, ${this.worked}/${this.total}`);
			if (this.workers.length) {
				run(this.workers[this.nextWorker], batch, batchSize);
				this.nextWorker = ((this.nextWorker + 1) % this.workers.length)
			} else {
				this.batches.push(batch);
			}
		};

		const run = (worker, batch, batchSize) => {
			worker.search({absolutePaths: batch, maxResults: 1e8 }).then(matches => {
				// console.log('got result - ' + batchSize);
				matches.forEach(m => {
					if (m && m.lineMatches.length) {
						onResult(m);
					}
				});

				unwind(batchSize);
				if (this.batches.length) run(worker, this.batches.shift(), 0);
				else if (this.walkerIsDone) unwind(0, true);
				else {
					// this.readyWorkers.push(worker);
				}
			});
		}

		// Walk over the file system
		const files = [];
		let nextBatch = [];
		let nextBatchSize = 0;
		let workerBatchSize = 500;
		this.walker.walk(this.rootFolders, this.extraFiles, result => {
			let size = result.size || 1;
			// this.total += size;

			// If the result is empty or we have reached the limit or we are canceled, ignore it
			if (this.limitReached || this.isCanceled) {
				return unwind(size);
			}

			// Indicate progress to the outside
			progress();

			const absolutePath = result.base ? [result.base, result.relativePath].join(path.sep) : result.relativePath;
			// files.push(absolutePath);
			nextBatch.push(absolutePath);
			nextBatchSize += size;
			if (nextBatch.length >= workerBatchSize) {

				this.total += nextBatchSize;
				onBatchReady(nextBatch, nextBatchSize);
				nextBatch = [];
				nextBatchSize = 0;
			}
		}, (error, isLimitHit) => {
			if (nextBatch.length) {
				this.total += nextBatchSize;
				onBatchReady(nextBatch, nextBatchSize);
			}

			this.walkerIsDone = true;
			this.walkerError = error;
			// unwind(0 /* walker is done, indicate this back to our handler to be able to unwind */);
		});
	}
}

function createWorker(config: ISearchWorkerConfig): ISearchWorker {
	config = JSON.parse(JSON.stringify(config)); // copy
	let client = new Client(
		uri.parse(require.toUrl('bootstrap')).fsPath,
		{
			serverName: 'Search Worker ' + config.id,
			timeout: 60 * 60 * 1000,
			args: ['--type=searchWorker'],
			env: {
				AMD_ENTRYPOINT: 'vs/workbench/services/search/node/worker/searchWorkerApp',
				PIPE_LOGGING: 'true',
				VERBOSE_LOGGING: 'true'
			}
		});

	// Make async?
	const channel = ipc.getNextTickChannel(client.getChannel<ISearchWorkerChannel>('searchWorker'));
	const channelClient = new SearchWorkerChannelClient(channel);
	channelClient.initialize(config);
	return channelClient;
}