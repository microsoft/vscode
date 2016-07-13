/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IStringStream} from 'vs/platform/files/common/files';
import * as crypto from 'crypto';
import {DefaultEndOfLine, ITextModelCreationOptions, ITextModelResolvedOptions, IRawText} from 'vs/editor/common/editorCommon';
import * as strings from 'vs/base/common/strings';
import {guessIndentation} from 'vs/editor/common/model/indentationGuesser';
import {TPromise} from 'vs/base/common/winjs.base';

export class ModelBuilderResult {
	rawText: IRawText;
	hash: string;
}

class ModelLineBasedBuilder {

	private hash: crypto.Hash;
	private BOM: string;
	private lines: string[];
	private currLineIndex: number;

	constructor() {
		this.hash = crypto.createHash('sha1');
		this.BOM = '';
		this.lines = [];
		this.currLineIndex = 0;
	}

	public acceptLines(lines:string[]): void {
		if (this.currLineIndex === 0) {
			// Remove the BOM (if present)
			if (strings.startsWithUTF8BOM(lines[0])) {
				this.BOM = strings.UTF8_BOM_CHARACTER;
				lines[0] = lines[0].substr(1);
			}
		}

		for (let i = 0, len = lines.length; i < len; i++) {
			this.lines[this.currLineIndex++] = lines[i];
		}
		this.hash.update(lines.join('\n') + '\n');
	}

	public finish(totalLength:number, carriageReturnCnt:number, opts:ITextModelCreationOptions): ModelBuilderResult {

		let lineFeedCnt = this.lines.length - 1;
		let EOL = '';
		if (lineFeedCnt === 0) {
			// This is an empty file or a file with precisely one line
			EOL = (opts.defaultEOL === DefaultEndOfLine.LF ? '\n' : '\r\n');
		} else if (carriageReturnCnt > lineFeedCnt / 2) {
			// More than half of the file contains \r\n ending lines
			EOL = '\r\n';
		} else {
			// At least one line more ends in \n
			EOL = '\n';
		}

		let resolvedOpts: ITextModelResolvedOptions;
		if (opts.detectIndentation) {
			let guessedIndentation = guessIndentation(this.lines, opts.tabSize, opts.insertSpaces);
			resolvedOpts = {
				tabSize: guessedIndentation.tabSize,
				insertSpaces: guessedIndentation.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			};
		} else {
			resolvedOpts = {
				tabSize: opts.tabSize,
				insertSpaces: opts.insertSpaces,
				trimAutoWhitespace: opts.trimAutoWhitespace,
				defaultEOL: opts.defaultEOL
			};
		}

		return {
			rawText: {
				BOM: this.BOM,
				EOL: EOL,
				lines: this.lines,
				length: totalLength,
				options: resolvedOpts
			},
			hash: this.hash.digest('hex')
		};
	}
}

export function computeHash(rawText:IRawText): string {
	let hash = crypto.createHash('sha1');
	for (let i = 0, len = rawText.lines.length; i < len; i++) {
		hash.update(rawText.lines[i] + '\n');
	}
	return hash.digest('hex');
}

export class ModelBuilder {

	private leftoverPrevChunk: string;
	private leftoverEndsInCR: boolean;
	private totalCRCount: number;
	private lineBasedBuilder: ModelLineBasedBuilder;
	private totalLength: number;

	public static fromStringStream(stream:IStringStream, options:ITextModelCreationOptions): TPromise<ModelBuilderResult> {
		return new TPromise<ModelBuilderResult>((c, e, p) => {
			let done = false;
			let builder = new ModelBuilder();

			stream.on('data', (chunk) => {
				builder.acceptChunk(chunk);
			});

			stream.on('error', (error) => {
				if (!done) {
					done = true;
					e(error);
				}
			});

			stream.on('end', () => {
				if (!done) {
					done = true;
					c(builder.finish(options));
				}
			});
		});
	}

	constructor() {
		this.leftoverPrevChunk = '';
		this.leftoverEndsInCR = false;
		this.totalCRCount = 0;
		this.lineBasedBuilder = new ModelLineBasedBuilder();
		this.totalLength = 0;
	}

	private _updateCRCount(chunk:string): void {
		// Count how many \r are present in chunk to determine the majority EOL sequence
		let chunkCarriageReturnCnt = 0;
		let lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = chunk.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			chunkCarriageReturnCnt++;
		}
		this.totalCRCount += chunkCarriageReturnCnt;
	}

	public acceptChunk(chunk:string): void {
		if (chunk.length === 0) {
			return;
		}
		this.totalLength += chunk.length;

		this._updateCRCount(chunk);

		// Avoid dealing with a chunk that ends in \r (push the \r to the next chunk)
		if (this.leftoverEndsInCR) {
			chunk = '\r' + chunk;
		}
		if (chunk.charCodeAt(chunk.length - 1) === 13 /*\r*/) {
			this.leftoverEndsInCR = true;
			chunk = chunk.substr(0, chunk.length - 1);
		} else {
			this.leftoverEndsInCR = false;
		}

		let lines = chunk.split(/\r\n|\r|\n/);

		if (lines.length === 1) {
			// no \r or \n encountered
			this.leftoverPrevChunk += lines[0];
			return;
		}

		lines[0] = this.leftoverPrevChunk + lines[0];
		this.lineBasedBuilder.acceptLines(lines.slice(0, lines.length - 1));
		this.leftoverPrevChunk = lines[lines.length - 1];
	}

	public finish(opts:ITextModelCreationOptions): ModelBuilderResult {
		let finalLines = [this.leftoverPrevChunk];
		if (this.leftoverEndsInCR) {
			finalLines.push('');
		}
		this.lineBasedBuilder.acceptLines(finalLines);
		return this.lineBasedBuilder.finish(this.totalLength, this.totalCRCount, opts);
	}
}
