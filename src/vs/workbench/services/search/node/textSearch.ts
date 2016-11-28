/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';

import * as fs from 'fs';
import * as path from 'path';

import * as baseMime from 'vs/base/common/mime';
import { ILineMatch, IProgress } from 'vs/platform/search/common/search';
import { detectMimeAndEncodingFromBuffer } from 'vs/base/node/mime';
import { FileWalker } from 'vs/workbench/services/search/node/fileSearch';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode } from 'vs/base/node/encoding';
import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from './search';

interface ReadLinesOptions {
	bufferLength: number;
	encoding: string;
}

export class Engine implements ISearchEngine<ISerializedFileMatch> {

	private static PROGRESS_FLUSH_CHUNK_SIZE = 50; // optimization: number of files to process before emitting progress event

	private rootFolders: string[];
	private extraFiles: string[];
	private maxResults: number;
	private walker: FileWalker;
	private contentPattern: RegExp;
	private isCanceled: boolean;
	private isDone: boolean;
	private total: number;
	private worked: number;
	private progressed: number;
	private walkerError: Error;
	private walkerIsDone: boolean;
	private fileEncoding: string;
	private limitReached: boolean;

	constructor(config: IRawSearch, walker: FileWalker) {
		this.rootFolders = config.rootFolders;
		this.extraFiles = config.extraFiles;
		this.walker = walker;
		this.contentPattern = strings.createRegExp(config.contentPattern.pattern, config.contentPattern.isRegExp, { matchCase: config.contentPattern.isCaseSensitive, wholeWord: config.contentPattern.isWordMatch, multiline: false, global: true });
		this.isCanceled = false;
		this.limitReached = false;
		this.maxResults = config.maxResults;
		this.worked = 0;
		this.progressed = 0;
		this.total = 0;
		this.fileEncoding = encodingExists(config.fileEncoding) ? config.fileEncoding : UTF8;
	}

	public cancel(): void {
		this.isCanceled = true;
		this.walker.cancel();
	}

	public search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		let resultCounter = 0;

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

			let fileMatch: FileMatch = null;

			let doneCallback = (error?: Error) => {
				if (!error && !this.isCanceled && fileMatch && !fileMatch.isEmpty()) {
					onResult(fileMatch.serialize());
				}

				return unwind(size);
			};

			const absolutePath = result.base ? [result.base, result.relativePath].join(path.sep) : result.relativePath;
			let perLineCallback = (line: string, lineNumber: number) => {
				if (this.limitReached || this.isCanceled) {
					return; // return early if canceled or limit reached
				}

				let lineMatch: LineMatch = null;
				let match = this.contentPattern.exec(line);

				// Record all matches into file result
				while (match !== null && match[0].length > 0 && !this.limitReached && !this.isCanceled) {
					resultCounter++;
					if (this.maxResults && resultCounter >= this.maxResults) {
						this.limitReached = true;
					}

					if (fileMatch === null) {
						fileMatch = new FileMatch(absolutePath);
					}

					if (lineMatch === null) {
						lineMatch = new LineMatch(line, lineNumber);
						fileMatch.addMatch(lineMatch);
					}

					lineMatch.addMatch(match.index, match[0].length);

					match = this.contentPattern.exec(line);
				}
			};

			// Read lines buffered to support large files
			this.readlinesAsync(absolutePath, perLineCallback, { bufferLength: 8096, encoding: this.fileEncoding }, doneCallback);
		}, (error, isLimitHit) => {
			this.walkerIsDone = true;
			this.walkerError = error;
			unwind(0 /* walker is done, indicate this back to our handler to be able to unwind */);
		});
	}

	private readlinesAsync(filename: string, perLineCallback: (line: string, lineNumber: number) => void, options: ReadLinesOptions, callback: (error: Error) => void): void {
		fs.open(filename, 'r', null, (error: Error, fd: number) => {
			if (error) {
				return callback(error);
			}

			let buffer = new Buffer(options.bufferLength);
			let pos: number;
			let i: number;
			let line = '';
			let lineNumber = 0;
			let lastBufferHadTraillingCR = false;

			const outer = this;

			function decodeBuffer(buffer: NodeBuffer, start: number, end: number): string {
				if (options.encoding === UTF8 || options.encoding === UTF8_with_bom) {
					return buffer.toString(undefined, start, end); // much faster to use built in toString() when encoding is default
				}

				return decode(buffer.slice(start, end), options.encoding);
			}

			function lineFinished(offset: number): void {
				line += decodeBuffer(buffer, pos, i + offset);
				perLineCallback(line, lineNumber);
				line = '';
				lineNumber++;
				pos = i + offset;
			}

			function readFile(isFirstRead: boolean, clb: (error: Error) => void): void {
				if (outer.limitReached || outer.isCanceled) {
					return clb(null); // return early if canceled or limit reached
				}

				fs.read(fd, buffer, 0, buffer.length, null, (error: Error, bytesRead: number, buffer: NodeBuffer) => {
					if (error || bytesRead === 0 || outer.limitReached || outer.isCanceled) {
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
			}

			readFile(true /* isFirstRead */, (error: Error) => {
				if (error) {
					return callback(error);
				}

				if (line.length) {
					perLineCallback(line, lineNumber); // handle last line
				}

				fs.close(fd, (error: Error) => {
					callback(error);
				});
			});
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