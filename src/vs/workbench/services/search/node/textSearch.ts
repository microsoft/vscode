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

	private channels: ISearchWorker[] = [];

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
			pattern: config.contentPattern
		};
		const numWorkers = Math.ceil(os.cpus().length/2); // /2 because of hyperthreading. Maybe make better.
		for (let i = 0; i < numWorkers; i++) {
			this.channels.push(createWorker(i, workerConfig));
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

		let progress = () => {
			if (++this.progressed % Engine.PROGRESS_FLUSH_CHUNK_SIZE === 0) {
				onProgress({ total: this.total, worked: this.worked }); // buffer progress in chunks to reduce pressure
			}
		};

		let unwind = (processed: number) => {
			this.worked += processed;

			// Emit progress() unless we got canceled or hit the limit
			if (processed && !this.isDone && !this.isCanceled && !this.limitReached) {
				progress();
			}

			// Emit done()
			if (this.worked === this.total && this.walkerIsDone && !this.isDone) {
				this.isDone = true;
				done(this.walkerError, {
					limitHit: this.limitReached,
					stats: this.walker.getStats()
				});
			}
		};

		// Walk over the file system
		const files = [];
		let size;
		this.walker.walk(this.rootFolders, this.extraFiles, result => {
			size = result.size || 1;
			this.total += size;

			// If the result is empty or we have reached the limit or we are canceled, ignore it
			if (this.limitReached || this.isCanceled) {
				return unwind(size);
			}

			// Indicate progress to the outside
			progress();

			const absolutePath = result.base ? [result.base, result.relativePath].join(path.sep) : result.relativePath;
			files.push(absolutePath);
		}, (error, isLimitHit) => {
			const portionSize = Math.ceil(files.length/this.channels.length);
			TPromise.join(this.channels.map((c, i) => {
				const subsetFiles = files.slice(portionSize*i, portionSize*i + portionSize);
				return c.search({absolutePaths: subsetFiles, maxResults: 1e8 }).then(matches => {
					console.log('got result: ' + matches.length);
					matches.forEach(m => {
						if (m && m.lineMatches.length) {
							onResult(m);
						}
					})

				});
			})).then(() => {
				unwind(this.total);
			})


			this.walkerIsDone = true;
			this.walkerError = error;
			unwind(0 /* walker is done, indicate this back to our handler to be able to unwind */);
		});
	}
}

function createWorker(id: number, config: ISearchWorkerConfig): ISearchWorker {
	let client = new Client(
		uri.parse(require.toUrl('bootstrap')).fsPath,
		{
			serverName: 'Search Worker ' + id,
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