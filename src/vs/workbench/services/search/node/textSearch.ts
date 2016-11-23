/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import uri from 'vs/base/common/uri';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

import * as baseMime from 'vs/base/common/mime';
import { ILineMatch, IProgress } from 'vs/platform/search/common/search';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode } from 'vs/base/node/encoding';
import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from './search';

import { Client } from 'vs/base/parts/ipc/node/ipc.cp';

export class Engine implements ISearchEngine<ISerializedFileMatch> {

	private static PROGRESS_FLUSH_CHUNK_SIZE = 50; // optimization: number of files to process before emitting progress event

	private rootFolders: string[];
	private extraFiles: string[];
	private maxResults: number;
	private walker: FileWalker;
	private contentPattern: string;
	private isCanceled: boolean;
	private isDone: boolean;
	private total: number;
	private worked: number;
	private progressed: number;
	private walkerError: Error;
	private walkerIsDone: boolean;
	private fileEncoding: string;
	private limitReached: boolean;

	// private worker: cp.ChildProcess;
	private client: Client;
	private channel: any;

	private onResult: any;

	constructor(config: IRawSearch, walker: FileWalker) {
		this.rootFolders = config.rootFolders;
		this.extraFiles = config.extraFiles;
		this.walker = walker;
		this.contentPattern = config.contentPattern.pattern;
		const pattern = strings.createRegExp(config.contentPattern.pattern, config.contentPattern.isRegExp, { matchCase: config.contentPattern.isCaseSensitive, wholeWord: config.contentPattern.isWordMatch, multiline: false, global: true });
		console.log('pattern: ' + pattern.toString());
		this.isCanceled = false;
		this.limitReached = false;
		this.maxResults = config.maxResults;
		this.worked = 0;
		this.progressed = 0;
		this.total = 0;
		this.fileEncoding = encodingExists(config.fileEncoding) ? config.fileEncoding : UTF8;

		// this.worker = cp.fork('/Users/roblou/code/vscode/out/vs/workbench/services/search/node/searchWorker.js', [], { execArgv: ['--debug-brk=5878']});
		// this.worker.on('message', m => {
		// 	console.log('parent got message');
		// 	if (this.onResult) {
		// 		this.onResult(JSON.parse(m));
		// 	}
		// });

		// this.worker.send({ initialize: { contentPattern: config.contentPattern.pattern }});
		this.client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Search Worker',
				timeout: 60 * 60 * 1000,
				args: ['--type=searchWorker'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/search/node/worker/searchWorkerApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: 'true'
				},
				// debugBrk: 5878
			}
		);
		this.channel = this.client.getChannel('searchWorker');

		// process.on('exit', () => this.worker.kill());
	}

	public cancel(): void {
		this.isCanceled = true;
		this.walker.cancel();
	}

	public search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		this.channel.call('initialize', { contentPattern: this.contentPattern });

		let resultCounter = 0;
		this.onResult = onResult;

		let progress = () => {
			this.progressed++;
			if (this.progressed % Engine.PROGRESS_FLUSH_CHUNK_SIZE === 0) {
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
		this.walker.walk(this.rootFolders, this.extraFiles, result => {
			const size = result.size || 1;
			this.total += size;

			// If the result is empty or we have reached the limit or we are canceled, ignore it
			if (this.limitReached || this.isCanceled) {
				return unwind(size);
			}

			// Indicate progress to the outside
			progress();

			const absolutePath = result.base ? [result.base, result.relativePath].join(path.sep) : result.relativePath;
			this.channel.call('search', absolutePath).then(fileMatch => {
				// console.log('got result: ' + fileMatch);
				if (fileMatch && fileMatch.lineMatches.length) {
					onResult(fileMatch);
				}

				unwind(size);
			});
		}, (error, isLimitHit) => {
			this.walkerIsDone = true;
			this.walkerError = error;
			unwind(0 /* walker is done, indicate this back to our handler to be able to unwind */);
		});
	}
}

class FileMatch implements ISerializedFileMatch {
	public path: string;
	public lineMatches: LineMatch[];

	constructor(path: string) {
		this.path = path;
		this.lineMatches = [];
	}

	public addMatch(lineMatch: LineMatch): void {
		this.lineMatches.push(lineMatch);
	}

	public isEmpty(): boolean {
		return this.lineMatches.length === 0;
	}

	public serialize(): ISerializedFileMatch {
		let lineMatches: ILineMatch[] = [];

		for (let i = 0; i < this.lineMatches.length; i++) {
			lineMatches.push(this.lineMatches[i].serialize());
		}

		return {
			path: this.path,
			lineMatches: lineMatches
		};
	}
}

class LineMatch implements ILineMatch {
	public preview: string;
	public lineNumber: number;
	public offsetAndLengths: number[][];

	constructor(preview: string, lineNumber: number) {
		this.preview = preview.replace(/(\r|\n)*$/, '');
		this.lineNumber = lineNumber;
		this.offsetAndLengths = [];
	}

	public getText(): string {
		return this.preview;
	}

	public getLineNumber(): number {
		return this.lineNumber;
	}

	public addMatch(offset: number, length: number): void {
		this.offsetAndLengths.push([offset, length]);
	}

	public serialize(): ILineMatch {
		let result = {
			preview: this.preview,
			lineNumber: this.lineNumber,
			offsetAndLengths: this.offsetAndLengths
		};

		return result;
	}
}