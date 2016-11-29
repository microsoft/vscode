/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';

import * as errors from 'vs/base/common/errors'
import * as strings from 'vs/base/common/strings';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { ISerializedFileMatch } from '../search';
import * as baseMime from 'vs/base/common/mime';
import { ILineMatch, IPatternInfo } from 'vs/platform/search/common/search';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode } from 'vs/base/node/encoding';
import { detectMimeAndEncodingFromBuffer } from 'vs/base/node/mime';

import { ISearchWorker, ISearchWorkerConfig, ISearchWorkerSearchArgs, ISearchWorkerSearchResult } from './searchWorkerIpc';

// import profiler = require('v8-profiler');

interface ReadLinesOptions {
	bufferLength: number;
	encoding: string;
}

// Global isCanceled flag for the process. It's only set once and this avoids awkwardness in passing it around.
let isCanceled = false;

export class SearchWorker implements ISearchWorker {
	static CONCURRENT_SEARCH_PATHS = 2;

	private contentPattern: RegExp;

	private nextSearch = TPromise.wrap(null);

	private config;

	initialize(config: ISearchWorkerConfig): TPromise<void> {
		// console.log('worker started: ' + Date.now());
		this.contentPattern = strings.createRegExp(config.pattern.pattern, config.pattern.isRegExp, { matchCase: config.pattern.isCaseSensitive, wholeWord: config.pattern.isWordMatch, multiline: false, global: true });
		this.config = config;
		if (config.id === 0) {
			// console.log('startProfiling');
			// profiler.startProfiling('p1');
		}

		return TPromise.wrap<void>(undefined);
	}

	cancel(): TPromise<void> {
		isCanceled = true;
		return TPromise.wrap<void>(null);
	}

	search(args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult> {
		// console.log('starting search: ' + Date.now() + ' ' + args.absolutePaths.length);
		// Queue this search to run after the current one
		return this.nextSearch = (new TPromise((resolve, reject) => {
			this.nextSearch
				.then(() => searchBatch(args.absolutePaths, this.contentPattern, args.maxResults))
				.then(resolve, reject);
		}));
	}
}

/**
 * Searches some number of the paths concurrently, and starts searches in other paths when those complete.
 */
function searchBatch(absolutePaths: string[], contentPattern: RegExp, maxResults: number): TPromise<ISearchWorkerSearchResult> {
	return new TPromise(batchDone => {
		const result: ISearchWorkerSearchResult = {
			matches: [],
			limitReached: false
		};
		let runningCount = 0;

		const startSearchInFile = (absolutePath: string): TPromise<void> => {
			runningCount++;
			const searchPromise = searchInFile(absolutePath, contentPattern, maxResults).then(fileMatch => {
				if (fileMatch) {
					result.matches.push(fileMatch.match);
					if (fileMatch.limitReached) {
						isCanceled = true;
						result.limitReached = true;
						return batchDone(result);
					}
				}

				runningCount--;
				if (absolutePaths.length) {
					startSearchInFile(absolutePaths.pop());
				} else if (runningCount === 0) {
					batchDone(result);
				}
			});

			return searchPromise;
		};

		for (let i = 0; i < SearchWorker.CONCURRENT_SEARCH_PATHS && i < absolutePaths.length; i++) {
			startSearchInFile(absolutePaths[i]);
		}
	});
}

interface IFileSearchResult {
	match: FileMatch;
	limitReached?: boolean;
}

function searchInFile(absolutePath: string, contentPattern: RegExp, maxResults: number): TPromise<IFileSearchResult> {
	let fileMatch: FileMatch = null;
	let limitReached = false;
	// console.log('doing search: ' + absolutePath);

	const perLineCallback = (line: string, lineNumber: number) => {
		let lineMatch: LineMatch = null;
		let match = contentPattern.exec(line);
		let numResults = 0;

		// Record all matches into file result
		while (match !== null && match[0].length > 0 && !isCanceled && !limitReached) {
			if (fileMatch === null) {
				fileMatch = new FileMatch(absolutePath);
			}

			if (lineMatch === null) {
				lineMatch = new LineMatch(line, lineNumber);
				fileMatch.addMatch(lineMatch);
			}

			lineMatch.addMatch(match.index, match[0].length);

			numResults++;
			if (maxResults && numResults >= maxResults) {
				limitReached = true;
			}

			match = contentPattern.exec(line);
		}
	};

	// Read lines buffered to support large files
	return readlinesAsync(absolutePath, perLineCallback, { bufferLength: 8096, encoding: 'utf8' }).then(
		() => ({ match: fileMatch, limitReached }));
}

function readlinesAsync(filename: string, perLineCallback: (line: string, lineNumber: number) => void, options: ReadLinesOptions): TPromise<void> {
	return new TPromise<void>((resolve, reject) => {
		fs.open(filename, 'r', null, (error: Error, fd: number) => {
			if (error) {
				return reject(error);
			}

			let buffer = new Buffer(options.bufferLength);
			let pos: number;
			let i: number;
			let line = '';
			let lineNumber = 0;
			let lastBufferHadTraillingCR = false;

			const decodeBuffer = (buffer: NodeBuffer, start, end): string => {
				if (options.encoding === UTF8 || options.encoding === UTF8_with_bom) {
					return buffer.toString(undefined, start, end); // much faster to use built in toString() when encoding is default
				}

				return decode(buffer.slice(start, end), options.encoding);
			};

			const lineFinished = (offset: number): void => {
				line += decodeBuffer(buffer, pos, i + offset);
				perLineCallback(line, lineNumber);
				line = '';
				lineNumber++;
				pos = i + offset;
			};

			const readFile = (isFirstRead: boolean, clb: (error: Error) => void): void => {
				if (isCanceled) {
					return clb(null); // return early if canceled or limit reached
				}

				fs.read(fd, buffer, 0, buffer.length, null, (error: Error, bytesRead: number, buffer: NodeBuffer) => {
					if (error || bytesRead === 0 || isCanceled) {
						return clb(error); // return early if canceled or limit reached or no more bytes to read
					}

					pos = 0;
					i = 0;

					// Detect encoding and mime when this is the beginning of the file
					if (isFirstRead) {
						let mimeAndEncoding = detectMimeAndEncodingFromBuffer(buffer, bytesRead);
						if (mimeAndEncoding.mimes[mimeAndEncoding.mimes.length - 1] !== baseMime.MIME_TEXT) {
							return clb(null); // skip files that seem binary
						}

						// Check for BOM offset
						switch (mimeAndEncoding.encoding) {
							case UTF8:
								pos = i = 3;
								options.encoding = UTF8;
								break;
							case UTF16be:
								pos = i = 2;
								options.encoding = UTF16be;
								break;
							case UTF16le:
								pos = i = 2;
								options.encoding = UTF16le;
								break;
						}
					}

					if (lastBufferHadTraillingCR) {
						if (buffer[i] === 0x0a) { // LF (Line Feed)
							lineFinished(1);
							i++;
						} else {
							lineFinished(0);
						}

						lastBufferHadTraillingCR = false;
					}

					for (; i < bytesRead; ++i) {
						if (buffer[i] === 0x0a) { // LF (Line Feed)
							lineFinished(1);
						} else if (buffer[i] === 0x0d) { // CR (Carriage Return)
							if (i + 1 === bytesRead) {
								lastBufferHadTraillingCR = true;
							} else if (buffer[i + 1] === 0x0a) { // LF (Line Feed)
								lineFinished(2);
								i++;
							} else {
								lineFinished(1);
							}
						}
					}

					line += decodeBuffer(buffer, pos, bytesRead);

					readFile(false /* isFirstRead */, clb); // Continue reading
				});
			};

			readFile(/*isFirstRead=*/true, (error: Error) => {
				if (error) {
					return reject(error);
				}

				if (line.length) {
					perLineCallback(line, lineNumber); // handle last line
				}

				fs.close(fd, (error: Error) => {
					if (error) {
						reject(error);
					} else {
						resolve(null);
					}
				});
			});
		});
	});
}

export class FileMatch implements ISerializedFileMatch {
	path: string;
	lineMatches: LineMatch[];

	constructor(path: string) {
		this.path = path;
		this.lineMatches = [];
	}

	addMatch(lineMatch: LineMatch): void {
		this.lineMatches.push(lineMatch);
	}

	isEmpty(): boolean {
		return this.lineMatches.length === 0;
	}

	serialize(): ISerializedFileMatch {
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

export class LineMatch implements ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];

	constructor(preview: string, lineNumber: number) {
		this.preview = preview.replace(/(\r|\n)*$/, '');
		this.lineNumber = lineNumber;
		this.offsetAndLengths = [];
	}

	getText(): string {
		return this.preview;
	}

	getLineNumber(): number {
		return this.lineNumber;
	}

	addMatch(offset: number, length: number): void {
		this.offsetAndLengths.push([offset, length]);
	}

	serialize(): ILineMatch {
		let result = {
			preview: this.preview,
			lineNumber: this.lineNumber,
			offsetAndLengths: this.offsetAndLengths
		};

		return result;
	}
}