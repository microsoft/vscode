/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import { onUnexpectedError } from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { ISerializedFileMatch } from '../search';
import * as baseMime from 'vs/base/common/mime';
import { ILineMatch } from 'vs/platform/search/common/search';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode, bomLength } from 'vs/base/node/encoding';
import { detectMimeAndEncodingFromBuffer } from 'vs/base/node/mime';

import { ISearchWorker, ISearchWorkerSearchArgs, ISearchWorkerSearchResult } from './searchWorkerIpc';

interface ReadLinesOptions {
	bufferLength: number;
	encoding: string;
}

const MAX_FILE_ERRORS = 5; // Don't report more than this number of errors, 1 per file, to avoid flooding the log when there's a general issue
let numErrorsLogged = 0;
function onError(error: any): void {
	if (numErrorsLogged++ < MAX_FILE_ERRORS) {
		onUnexpectedError(error);
	}
}

export class SearchWorker implements ISearchWorker {
	private currentSearchEngine: SearchWorkerEngine;

	initialize(): TPromise<void> {
		this.currentSearchEngine = new SearchWorkerEngine();
		return TPromise.wrap<void>(undefined);
	}

	cancel(): TPromise<void> {
		// Cancel the current search. It will stop searching and close its open files.
		if (this.currentSearchEngine) {
			this.currentSearchEngine.cancel();
		}

		return TPromise.wrap<void>(null);
	}

	search(args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult> {
		if (!this.currentSearchEngine) {
			// Worker timed out during search
			this.initialize();
		}

		return this.currentSearchEngine.searchBatch(args);
	}
}

interface IFileSearchResult {
	match: FileMatch;
	numMatches: number;
	limitReached?: boolean;
}

const LF = 0x0a;
const CR = 0x0d;

export class SearchWorkerEngine {
	private nextSearch = TPromise.wrap(null);
	private isCanceled = false;

	/**
	 * Searches some number of the given paths concurrently, and starts searches in other paths when those complete.
	 */
	searchBatch(args: ISearchWorkerSearchArgs): TPromise<ISearchWorkerSearchResult> {
		const contentPattern = strings.createRegExp(args.pattern.pattern, args.pattern.isRegExp, { matchCase: args.pattern.isCaseSensitive, wholeWord: args.pattern.isWordMatch, multiline: false, global: true });
		const fileEncoding = encodingExists(args.fileEncoding) ? args.fileEncoding : UTF8;
		return this.nextSearch =
			this.nextSearch.then(() => this._searchBatch(args, contentPattern, fileEncoding));
	}


	private _searchBatch(args: ISearchWorkerSearchArgs, contentPattern: RegExp, fileEncoding: string): TPromise<ISearchWorkerSearchResult> {
		if (this.isCanceled) {
			return TPromise.wrap(null);
		}

		return new TPromise(batchDone => {
			const result: ISearchWorkerSearchResult = {
				matches: [],
				numMatches: 0,
				limitReached: false
			};

			// Search in the given path, and when it's finished, search in the next path in absolutePaths
			const startSearchInFile = (absolutePath: string): TPromise<void> => {
				return this.searchInFile(absolutePath, contentPattern, fileEncoding, args.maxResults && (args.maxResults - result.numMatches)).then(fileResult => {
					// Finish early if search is canceled
					if (this.isCanceled) {
						return;
					}

					if (fileResult) {
						result.numMatches += fileResult.numMatches;
						result.matches.push(fileResult.match.serialize());
						if (fileResult.limitReached) {
							// If the limit was reached, terminate early with the results so far and cancel in-progress searches.
							this.cancel();
							result.limitReached = true;
							return batchDone(result);
						}
					}
				}, onError);
			};

			TPromise.join(args.absolutePaths.map(startSearchInFile)).then(() => {
				batchDone(result);
			});
		});
	}

	cancel(): void {
		this.isCanceled = true;
	}

	private searchInFile(absolutePath: string, contentPattern: RegExp, fileEncoding: string, maxResults?: number): TPromise<IFileSearchResult> {
		let fileMatch: FileMatch = null;
		let limitReached = false;
		let numMatches = 0;

		const perLineCallback = (line: string, lineNumber: number) => {
			let lineMatch: LineMatch = null;
			let match = contentPattern.exec(line);

			// Record all matches into file result
			while (match !== null && match[0].length > 0 && !this.isCanceled && !limitReached) {
				if (fileMatch === null) {
					fileMatch = new FileMatch(absolutePath);
				}

				if (lineMatch === null) {
					lineMatch = new LineMatch(line, lineNumber);
					fileMatch.addMatch(lineMatch);
				}

				lineMatch.addMatch(match.index, match[0].length);

				numMatches++;
				if (maxResults && numMatches >= maxResults) {
					limitReached = true;
				}

				match = contentPattern.exec(line);
			}
		};

		// Read lines buffered to support large files
		return this.readlinesAsync(absolutePath, perLineCallback, { bufferLength: 8096, encoding: fileEncoding }).then(
			() => fileMatch ? { match: fileMatch, limitReached, numMatches } : null);
	}

	private readlinesAsync(filename: string, perLineCallback: (line: string, lineNumber: number) => void, options: ReadLinesOptions): TPromise<void> {
		return new TPromise<void>((resolve, reject) => {
			fs.open(filename, 'r', null, (error: Error, fd: number) => {
				if (error) {
					return resolve(null);
				}

				const buffer = new Buffer(options.bufferLength);
				let line = '';
				let lineNumber = 0;
				let lastBufferHadTrailingCR = false;

				const readFile = (isFirstRead: boolean, clb: (error: Error) => void): void => {
					if (this.isCanceled) {
						return clb(null); // return early if canceled or limit reached
					}

					fs.read(fd, buffer, 0, buffer.length, null, (error: Error, bytesRead: number, buffer: NodeBuffer) => {
						const decodeBuffer = (buffer: NodeBuffer, start: number, end: number): string => {
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

						if (error || bytesRead === 0 || this.isCanceled) {
							return clb(error); // return early if canceled or limit reached or no more bytes to read
						}

						let crlfCharSize = 1;
						let crBytes = [CR];
						let lfBytes = [LF];
						let pos = 0;
						let i = 0;

						// Detect encoding and mime when this is the beginning of the file
						if (isFirstRead) {
							const mimeAndEncoding = detectMimeAndEncodingFromBuffer({ buffer, bytesRead }, false);
							if (mimeAndEncoding.mimes[mimeAndEncoding.mimes.length - 1] !== baseMime.MIME_TEXT) {
								return clb(null); // skip files that seem binary
							}

							// Check for BOM offset
							switch (mimeAndEncoding.encoding) {
								case UTF8:
									pos = i = bomLength(UTF8);
									options.encoding = UTF8;
									break;
								case UTF16be:
									pos = i = bomLength(UTF16be);
									options.encoding = UTF16be;
									break;
								case UTF16le:
									pos = i = bomLength(UTF16le);
									options.encoding = UTF16le;
									break;
							}

							// when we are running with UTF16le/be, LF and CR are encoded as
							// two bytes, like 0A 00 (LF) / 0D 00 (CR) for LE or flipped around
							// for BE. We need to account for this when splitting the buffer into
							// newlines, and when detecting a CRLF combo.
							if (options.encoding === UTF16le) {
								crlfCharSize = 2;
								crBytes = [CR, 0x00];
								lfBytes = [LF, 0x00];
							} else if (options.encoding === UTF16be) {
								crlfCharSize = 2;
								crBytes = [0x00, CR];
								lfBytes = [0x00, LF];
							}
						}

						if (lastBufferHadTrailingCR) {
							if (buffer[i] === lfBytes[0] && (lfBytes.length === 1 || buffer[i + 1] === lfBytes[1])) {
								lineFinished(1 * crlfCharSize);
								i++;
							} else {
								lineFinished(0);
							}

							lastBufferHadTrailingCR = false;
						}

						/**
						 * This loop executes for every byte of every file in the workspace - it is highly performance-sensitive!
						 * Hence the duplication in reading the buffer to avoid a function call. Previously a function call was not
						 * being inlined by V8.
						 */
						for (; i < bytesRead; ++i) {
							if (buffer[i] === lfBytes[0] && (lfBytes.length === 1 || buffer[i + 1] === lfBytes[1])) {
								lineFinished(1 * crlfCharSize);
							} else if (buffer[i] === crBytes[0] && (crBytes.length === 1 || buffer[i + 1] === crBytes[1])) { // CR (Carriage Return)
								if (i + crlfCharSize === bytesRead) {
									lastBufferHadTrailingCR = true;
								} else if (buffer[i + crlfCharSize] === lfBytes[0] && (lfBytes.length === 1 || buffer[i + crlfCharSize + 1] === lfBytes[1])) {
									lineFinished(2 * crlfCharSize);
									i += 2 * crlfCharSize - 1;
								} else {
									lineFinished(1 * crlfCharSize);
								}
							}
						}

						line += decodeBuffer(buffer, pos, bytesRead);

						readFile(/*isFirstRead=*/false, clb); // Continue reading
					});
				};

				readFile(/*isFirstRead=*/true, (error: Error) => {
					if (error) {
						return resolve(null);
					}

					if (line.length) {
						perLineCallback(line, lineNumber); // handle last line
					}

					fs.close(fd, (error: Error) => {
						resolve(null);
					});
				});
			});
		});
	}
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
		let numMatches = 0;

		for (let i = 0; i < this.lineMatches.length; i++) {
			numMatches += this.lineMatches[i].offsetAndLengths.length;
			lineMatches.push(this.lineMatches[i].serialize());
		}

		return {
			path: this.path,
			lineMatches,
			numMatches
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
		const result = {
			preview: this.preview,
			lineNumber: this.lineNumber,
			offsetAndLengths: this.offsetAndLengths
		};

		return result;
	}
}