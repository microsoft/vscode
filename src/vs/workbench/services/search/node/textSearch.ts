/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';

import * as os from 'os';
import * as path from 'path';

import * as ipc from 'vs/base/parts/ipc/common/ipc';

import { onUnexpectedError } from 'vs/base/common/errors';
import { IProgress } from 'vs/platform/search/common/search';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from './search';
import { ISearchWorkerConfig, ISearchWorker, ISearchWorkerChannel, SearchWorkerChannelClient } from './worker/searchWorkerIpc';

import { Client } from 'vs/base/parts/ipc/node/ipc.cp';

export class Engine implements ISearchEngine<ISerializedFileMatch> {

	private static PROGRESS_FLUSH_CHUNK_SIZE = 50; // optimization: number of files to process before emitting progress event

	private config: IRawSearch;
	private walker: FileWalker;
	private walkerError: Error;

	private isCanceled = false;
	private isDone = false;
	private totalBytes = 0;
	private processedBytes = 0;
	private progressed = 0;
	private walkerIsDone = false;
	private limitReached = false;
	private numResults = 0;

	private nextWorker = 0;
	private workers: ISearchWorker[] = [];
	private workerClients: Client[] = [];

	constructor(config: IRawSearch, walker: FileWalker) {
		this.config = config;
		this.walker = walker;
	}

	cancel(): void {
		this.isCanceled = true;
		this.walker.cancel();

		this.workers.forEach(w => {
			w.cancel()
				.then(null, onUnexpectedError);
		});
	}

	search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		this.startWorkers();
		const progress = () => {
			if (++this.progressed % Engine.PROGRESS_FLUSH_CHUNK_SIZE === 0) {
				onProgress({ total: this.totalBytes, worked: this.processedBytes }); // buffer progress in chunks to reduce pressure
			}
		};

		const unwind = (processed: number) => {
			this.processedBytes += processed;

			// Emit progress() unless we got canceled or hit the limit
			if (processed && !this.isDone && !this.isCanceled && !this.limitReached) {
				progress();
			}

			// Emit done()
			if (!this.isDone && this.processedBytes === this.totalBytes && this.walkerIsDone) {
				this.isDone = true;
				this.disposeWorkers();
				done(this.walkerError, {
					limitHit: this.limitReached,
					stats: this.walker.getStats()
				});
			}
		};

		const run = (batch: string[], batchBytes: number): void => {
			const worker = this.workers[this.nextWorker];
			this.nextWorker = (this.nextWorker + 1) % this.workers.length;

			const maxResults = this.config.maxResults && (this.config.maxResults - this.numResults);
			worker.search({ absolutePaths: batch, maxResults }).then(result => {
				if (!result || this.limitReached || this.isCanceled) {
					return unwind(batchBytes);
				}

				const matches = result.matches;
				this.numResults += result.numMatches;
				matches.forEach(m => {
					onResult(m);
				});

				if (this.config.maxResults && this.numResults >= this.config.maxResults) {
					// It's possible to go over maxResults like this, but it's much simpler than trying to extract the exact number
					// of file matches, line matches, and matches within a line to == maxResults.
					this.limitReached = true;
				}

				unwind(batchBytes);
			},
				error => {
					// An error on the worker's end, not in reading the file, but in processing the batch. Log and continue.
					onUnexpectedError(error);
					unwind(batchBytes);
				});
		};

		// Walk over the file system
		let nextBatch = [];
		let nextBatchBytes = 0;
		const batchFlushBytes = 2 ** 20; // 1MB
		this.walker.walk(this.config.rootFolders, this.config.extraFiles, result => {
			let bytes = result.size || 1;
			this.totalBytes += bytes;

			// If we have reached the limit or we are canceled, ignore it
			if (this.limitReached || this.isCanceled) {
				return unwind(bytes);
			}

			// Indicate progress to the outside
			progress();

			const absolutePath = result.base ? [result.base, result.relativePath].join(path.sep) : result.relativePath;
			nextBatch.push(absolutePath);
			nextBatchBytes += bytes;

			if (nextBatchBytes >= batchFlushBytes) {
				run(nextBatch, nextBatchBytes);
				nextBatch = [];
				nextBatchBytes = 0;
			}
		}, (error, isLimitHit) => {
			// Send any remaining paths to a worker, or unwind if we're stopping
			if (nextBatch.length) {
				if (this.limitReached || this.isCanceled) {
					unwind(nextBatchBytes);
				} else {
					run(nextBatch, nextBatchBytes);
				}
			}

			this.walkerIsDone = true;
			this.walkerError = error;
		});
	}

	private startWorkers(): void {
		// If the CPU has hyperthreading enabled, this will report (# of physical cores)*2.
		const numWorkers = os.cpus().length;
		for (let i = 0; i < numWorkers; i++) {
			this.createWorker(i);
		}
	}

	private createWorker(id: number): void {
		let client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Search Worker ' + id,
				args: ['--type=searchWorker'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/search/node/worker/searchWorkerApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: process.env.VERBOSE_LOGGING
				}
			});

		// Make async?
		const channel = ipc.getNextTickChannel(client.getChannel<ISearchWorkerChannel>('searchWorker'));
		const channelClient = new SearchWorkerChannelClient(channel);
		const config: ISearchWorkerConfig = { pattern: this.config.contentPattern, id, fileEncoding: this.config.fileEncoding };
		channelClient.initialize(config).then(null, onUnexpectedError);

		this.workers.push(channelClient);
		this.workerClients.push(client);
	}

	private disposeWorkers(): void {
		this.workerClients.forEach(c => c.dispose());
	}
}
