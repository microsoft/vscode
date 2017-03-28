/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IStringStream } from 'vs/platform/files/common/files';
import * as crypto from 'crypto';
import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { CharCode } from 'vs/base/common/charCode';
import { IRawTextSource } from 'vs/editor/common/model/textSource';

export interface ModelBuilderResult {
	readonly hash: string;
	readonly value: IRawTextSource;
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

	public acceptLines(lines: string[]): void {
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

	public finish(length: number, carriageReturnCnt: number, containsRTL: boolean, isBasicASCII: boolean): ModelBuilderResult {
		return {
			hash: this.hash.digest('hex'),
			value: {
				BOM: this.BOM,
				lines: this.lines,
				length,
				containsRTL: containsRTL,
				totalCRCount: carriageReturnCnt,
				isBasicASCII,
			}
		};
	}
}

export function computeHash(rawText: IRawTextSource): string {
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
	private containsRTL: boolean;
	private isBasicASCII: boolean;

	public static fromStringStream(stream: IStringStream): TPromise<ModelBuilderResult> {
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
					c(builder.finish());
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
		this.containsRTL = false;
		this.isBasicASCII = true;
	}

	private _updateCRCount(chunk: string): void {
		// Count how many \r are present in chunk to determine the majority EOL sequence
		let chunkCarriageReturnCnt = 0;
		let lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = chunk.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			chunkCarriageReturnCnt++;
		}
		this.totalCRCount += chunkCarriageReturnCnt;
	}

	public acceptChunk(chunk: string): void {
		if (chunk.length === 0) {
			return;
		}
		this.totalLength += chunk.length;

		this._updateCRCount(chunk);

		if (!this.containsRTL) {
			this.containsRTL = strings.containsRTL(chunk);
		}
		if (this.isBasicASCII) {
			this.isBasicASCII = strings.isBasicASCII(chunk);
		}

		// Avoid dealing with a chunk that ends in \r (push the \r to the next chunk)
		if (this.leftoverEndsInCR) {
			chunk = '\r' + chunk;
		}
		if (chunk.charCodeAt(chunk.length - 1) === CharCode.CarriageReturn) {
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

	public finish(): ModelBuilderResult {
		let finalLines = [this.leftoverPrevChunk];
		if (this.leftoverEndsInCR) {
			finalLines.push('');
		}
		this.lineBasedBuilder.acceptLines(finalLines);
		return this.lineBasedBuilder.finish(this.totalLength, this.totalCRCount, this.containsRTL, this.isBasicASCII);
	}
}
