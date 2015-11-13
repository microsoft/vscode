/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import strings = require('vs/base/common/strings');

import assert = require('assert');
import fs = require('fs');
import iconv = require('iconv-lite');

import baseMime = require('vs/base/common/mime');
import {ILineMatch, IProgress} from 'vs/platform/search/common/search';
import {detectMimesFromFile, IMimeAndEncoding} from 'vs/base/node/mime';
import {FileWalker} from 'vs/workbench/services/search/node/fileSearch';
import {UTF16le, UTF16be, UTF8, detectEncodingByBOMFromBuffer} from 'vs/base/node/encoding';
import {ISerializedFileMatch, IRawSearch, ISearchEngine} from 'vs/workbench/services/search/node/rawSearchService';

export class Engine implements ISearchEngine {
	private rootPaths: string[];
	private maxResults: number;
	private walker: FileWalker;
	private contentPattern: RegExp;
	private isCanceled: boolean;
	private isDone: boolean;
	private total: number = 0;
	private worked: number = 0;
	private walkerError: Error;
	private walkerIsDone: boolean;
	private fileEncoding: string;

	constructor(config: IRawSearch, walker: FileWalker) {
		this.rootPaths = config.rootPaths;
		this.walker = walker;
		this.contentPattern = strings.createRegExp(config.contentPattern.pattern, config.contentPattern.isRegExp, config.contentPattern.isCaseSensitive, config.contentPattern.isWordMatch);
		this.isCanceled = false;
		this.maxResults = config.maxResults;
		this.worked = 0;
		this.total = 0;
		this.fileEncoding = iconv.encodingExists(config.fileEncoding) ? config.fileEncoding : UTF8;
	}

	public cancel(): void {
		this.isCanceled = true;
		this.walker.cancel();
	}

	public search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, isLimitHit: boolean) => void): void {
		let resultCounter = 0;
		let limitReached = false;

		let unwind = (processed: number) => {
			this.worked += processed;

			// Emit progress()
			if (processed && !this.isDone) {
				onProgress({ total: this.total, worked: this.worked });
			}

			// Emit done()
			if (this.worked === this.total && this.walkerIsDone && !this.isDone) {
				this.isDone = true;
				done(this.walkerError, limitReached);
			}
		};

		this.walker.walk(this.rootPaths, (result) => {

			// Indicate progress to the outside
			this.total++;
			onProgress({ total: this.total, worked: this.worked });

			// If the result is empty or we have reached the limit or we are canceled, ignore it
			if (limitReached || this.isCanceled) {
				return unwind(1);
			}

			// Need to detect mime type now to find out if the file is binary or not
			this.isBinary(result.path, (isBinary: boolean) => {

				// If the file does not have textual content, do not return it as a result
				if (isBinary) {
					return unwind(1);
				}

				let fileMatch: FileMatch = null;

				let doneCallback = (error?: Error) => {

					// If the result is empty or we have reached the limit or we are canceled, ignore it
					if (error || !fileMatch || fileMatch.isEmpty() || this.isCanceled) {
						return unwind(1);
					}

					// Otherwise send it back as result
					else {
						onResult(fileMatch.serialize());

						return unwind(1);
					}
				};

				let perLineCallback = (line: string, lineNumber: number) => {
					if (limitReached || this.isCanceled) {
						return; // return early if canceled or limit reached
					}

					let lineMatch: LineMatch = null;
					let match = this.contentPattern.exec(line);

					// Record all matches into file result
					while (match !== null && match[0].length > 0 && !limitReached && !this.isCanceled) {
						resultCounter++;
						if (this.maxResults && resultCounter >= this.maxResults) {
							limitReached = true;
						}

						if (fileMatch === null) {
							fileMatch = new FileMatch(result.path);
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
				readlinesAsync(result.path, perLineCallback, { bufferLength: 8096, encoding: this.fileEncoding }, doneCallback);
			});
		}, (error, isLimitHit) => {
			this.walkerIsDone = true;
			this.walkerError = error;
			unwind(0 /* walker is done, indicate this back to our handler to be able to unwind */);
		});
	}

	private isBinary(path: string, callback: (isBinary: boolean) => void): void {

		// Return early if we guess that the file is text or binary
		let mimes = baseMime.guessMimeTypes(path);
		if (mimes.indexOf(baseMime.MIME_TEXT) >= 0) {
			return callback(false);
		}

		if (mimes.indexOf(baseMime.MIME_BINARY) >= 0) {
			return callback(true);
		}

		// Otherwise do full blown detection
		return detectMimesFromFile(path, (error: Error, result: IMimeAndEncoding) => {
			callback(!!error || result.mimes[result.mimes.length - 1] !== baseMime.MIME_TEXT);
		});
	}
}

interface ReadLinesOptions {
	bufferLength: number;
	encoding: string;
}

function readlinesAsync(filename: string, perLineCallback: (line: string, lineNumber: number) => void, options: ReadLinesOptions, callback: (error: Error) => void): void {
	fs.open(filename, 'r', null, (error: Error, fd: number) => {
		if (error) {
			return callback(error);
		}

		let buffer = new Buffer(options.bufferLength);
		let pos: number, i: number;
		let line = '';
		let lineNumber = 0;
		let lastBufferHadTraillingCR = false;

		function call(n: number): void {
			line += iconv.decode(buffer.slice(pos, i + n), options.encoding);
			perLineCallback(line, lineNumber);
			line = '';
			lineNumber++;
			pos = i + n;
		}

		function readFile(clb: (error: Error) => void): void {
			fs.read(fd, buffer, 0, buffer.length, null, (error: Error, bytesRead: number, buffer: NodeBuffer) => {
				if (error) {
					return clb(error);
				}

				if (bytesRead === 0) {
					return clb(null);
				}

				pos = 0;
				i = 0;

				// BOMs override the configured encoding so we want to detec them
				let enc = detectEncodingByBOMFromBuffer(buffer, bytesRead);
				switch (enc) {
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

				if (lastBufferHadTraillingCR) {
					if (buffer[i] === 0x0a) {
						call(1);
						i++;
					} else {
						call(0);
					}

					lastBufferHadTraillingCR = false;
				}

				for (; i < bytesRead; ++i) {
					if (buffer[i] === 0x0a) {
						call(1);
					} else if (buffer[i] === 0x0d) {
						if (i + 1 === bytesRead) {
							lastBufferHadTraillingCR = true;
						} else if (buffer[i + 1] === 0x0a) {
							call(2);
							i++;
						} else {
							call(1);
						}
					}
				}

				line += iconv.decode(buffer.slice(pos, bytesRead), options.encoding);

				readFile(clb); // Continue reading
			});
		}

		readFile((error: Error) => {
			if (error) {
				return callback(error);
			}

			if (line.length) {
				perLineCallback(line, lineNumber);
			}

			fs.close(fd, (error: Error) => {
				callback(error);
			});
		});
	});
}

class FileMatch implements ISerializedFileMatch {
	public path: string;
	public lineMatches: LineMatch[];

	constructor(path: string) {
		this.path = path;
		this.lineMatches = [];
	}

	public addMatch(lineMatch: LineMatch): void {
		assert.ok(lineMatch, 'Missing parameter (lineMatch = ' + lineMatch + ')');

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
		assert.ok(preview, 'Missing parameter (content = ' + preview + ')');
		assert.ok(!isNaN(Number(lineNumber)) && lineNumber >= 0, 'LineNumber must be positive');

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
		assert.ok(!isNaN(Number(offset)) && offset >= 0, 'Offset must be positive');
		assert.ok(!isNaN(Number(length)) && length >= 0, 'Length must be positive');

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