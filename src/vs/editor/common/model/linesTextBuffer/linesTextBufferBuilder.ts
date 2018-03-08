/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';
import { ITextBufferBuilder, ITextBufferFactory, ITextBuffer, DefaultEndOfLine } from 'vs/editor/common/model';
import { IRawTextSource, TextSource } from 'vs/editor/common/model/linesTextBuffer/textSource';
import { LinesTextBuffer } from 'vs/editor/common/model/linesTextBuffer/linesTextBuffer';

export class TextBufferFactory implements ITextBufferFactory {

	constructor(public readonly rawTextSource: IRawTextSource) {
	}

	public create(defaultEOL: DefaultEndOfLine): ITextBuffer {
		const textSource = TextSource.fromRawTextSource(this.rawTextSource, defaultEOL);
		return new LinesTextBuffer(textSource);
	}

	public getFirstLineText(lengthLimit: number): string {
		return this.rawTextSource.lines[0].substr(0, lengthLimit);
	}
}

class ModelLineBasedBuilder {

	private BOM: string;
	private lines: string[];
	private currLineIndex: number;

	constructor() {
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
	}

	public finish(carriageReturnCnt: number, containsRTL: boolean, isBasicASCII: boolean): TextBufferFactory {
		return new TextBufferFactory({
			BOM: this.BOM,
			lines: this.lines,
			containsRTL: containsRTL,
			totalCRCount: carriageReturnCnt,
			isBasicASCII,
		});
	}
}

export class LinesTextBufferBuilder implements ITextBufferBuilder {

	private leftoverPrevChunk: string;
	private leftoverEndsInCR: boolean;
	private totalCRCount: number;
	private lineBasedBuilder: ModelLineBasedBuilder;
	private containsRTL: boolean;
	private isBasicASCII: boolean;

	constructor() {
		this.leftoverPrevChunk = '';
		this.leftoverEndsInCR = false;
		this.totalCRCount = 0;
		this.lineBasedBuilder = new ModelLineBasedBuilder();
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

	public finish(): TextBufferFactory {
		let finalLines = [this.leftoverPrevChunk];
		if (this.leftoverEndsInCR) {
			finalLines.push('');
		}
		this.lineBasedBuilder.acceptLines(finalLines);
		return this.lineBasedBuilder.finish(this.totalCRCount, this.containsRTL, this.isBasicASCII);
	}
}
