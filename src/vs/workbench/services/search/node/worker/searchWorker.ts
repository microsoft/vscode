/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';

import * as strings from 'vs/base/common/strings';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { ISerializedFileMatch } from '../search';
import * as baseMime from 'vs/base/common/mime';
import { ILineMatch } from 'vs/platform/search/common/search';
import { UTF16le, UTF16be, UTF8, UTF8_with_bom, encodingExists, decode } from 'vs/base/node/encoding';
import { detectMimeAndEncodingFromBuffer } from 'vs/base/node/mime';

import profiler = require('v8-profiler');

interface ReadLinesOptions {
	bufferLength: number;
	encoding: string;
}

// let worker: SearchWorker;
// process.on('message', m => {
// 	if (m.initialize) {
// 		worker = new SearchWorker(m.initialize);
// 	} else {
// 		worker.search(m.absolutePath);
// 	}
// })

export class SearchWorker {
	private contentPattern: RegExp;

	private limitReached: boolean;
	private isCanceled: boolean;

	private nResults = 0;

	private running = true;

	private results = [];

	private paths;

	private finalCallback;

	constructor(args: any) {
		this.contentPattern = strings.createRegExp(args.contentPattern, false, { multiline: false, global: true, matchCase: false });
		console.log('worker started: ' + Date.now());
	}

	private start(p: string) {
		return this.doSearch(p).then(fileMatch => {
			this.results.push(fileMatch);

			if (this.paths.length) {
				this.start(this.paths.pop());
			} else if (this.running) {
				this.running = false;
				this.finalCallback(this.results.filter(r => !!r));
			}
		})
	}

	public search(absolutePaths: string[]): TPromise<FileMatch[]> {
		// profiler.startProfiling('p1');
		console.log('starting search: ' + Date.now());
		this.paths = absolutePaths;
		for (let i=0; i<50; i++) {
			this.start(absolutePaths[i]);
		}

		return new TPromise(resolve => {
			this.finalCallback = resolve;
		});
	}

	public doSearch(absolutePath: string): TPromise<FileMatch> {
		let fileMatch: FileMatch = null;
		// console.log('doing search: ' + absolutePath);

		let perLineCallback = (line: string, lineNumber: number) => {
			let lineMatch: LineMatch = null;
			let match = this.contentPattern.exec(line);

			// Record all matches into file result
			while (match !== null && match[0].length > 0 && !this.limitReached && !this.isCanceled) {
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

		return new TPromise(resolve => {
			// Read lines buffered to support large files
			this.readlinesAsync(absolutePath, perLineCallback, { bufferLength: 8096, encoding: 'utf8' }, resolve);
		}).then(() => {
			// if (this.nResults++ === 200) {
			// 	const profile = profiler.stopProfiling('p1');
			// 	profile.export(function(error, result) {
			// 		fs.writeFileSync('p1.cpuprofile', result);
			// 		profile.delete();
			// 	});
			// }
			return fileMatch;
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
				if (this.limitReached || this.isCanceled) {
					return clb(null); // return early if canceled or limit reached
				}

				fs.read(fd, buffer, 0, buffer.length, null, (error: Error, bytesRead: number, buffer: NodeBuffer) => {
					if (error || bytesRead === 0 || this.limitReached || this.isCanceled) {
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


export class FileMatch implements ISerializedFileMatch {
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

export class LineMatch implements ILineMatch {
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