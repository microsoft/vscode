/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';
import { IIdentifiedSingleEditOperation, DefaultEndOfLine, ITextBufferBuilder, ITextBuffer } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';

export function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getRandomEOLSequence(): string {
	let rnd = getRandomInt(1, 3);
	if (rnd === 1) {
		return '\n';
	}
	if (rnd === 2) {
		return '\r';
	}
	return '\r\n';
}

export function getRandomString(minLength: number, maxLength: number): string {
	let length = getRandomInt(minLength, maxLength);
	let r = '';
	for (let i = 0; i < length; i++) {
		r += String.fromCharCode(getRandomInt(CharCode.a, CharCode.z));
	}
	return r;
}

export function generateRandomEdits(chunks: string[], editCnt: number): IIdentifiedSingleEditOperation[] {
	let lines = [];
	for (let i = 0; i < chunks.length; i++) {
		let newLines = chunks[i].split(/\r\n|\r|\n/);
		if (lines.length === 0) {
			lines.push(...newLines);
		} else {
			newLines[0] = lines[lines.length - 1] + newLines[0];
			lines.splice(lines.length - 1, 1, ...newLines);
		}
	}

	let ops: IIdentifiedSingleEditOperation[] = [];

	for (let i = 0; i < editCnt; i++) {
		let line = getRandomInt(1, lines.length);
		let startColumn = getRandomInt(1, Math.max(lines[line - 1].length, 1));
		let endColumn = getRandomInt(startColumn, Math.max(lines[line - 1].length, startColumn));
		let text: string = '';
		if (Math.random() < .5) {
			text = getRandomString(5, 10);
		}

		ops.push({
			text: text,
			range: new Range(line, startColumn, line, endColumn)
		});
		lines[line - 1] = lines[line - 1].substring(0, startColumn - 1) + text + lines[line - 1].substring(endColumn - 1);
	}

	return ops;
}

export function generateSequentialInserts(chunks: string[], editCnt: number): IIdentifiedSingleEditOperation[] {
	let lines = [];
	for (let i = 0; i < chunks.length; i++) {
		let newLines = chunks[i].split(/\r\n|\r|\n/);
		if (lines.length === 0) {
			lines.push(...newLines);
		} else {
			newLines[0] = lines[lines.length - 1] + newLines[0];
			lines.splice(lines.length - 1, 1, ...newLines);
		}
	}

	let ops: IIdentifiedSingleEditOperation[] = [];

	for (let i = 0; i < editCnt; i++) {
		let line = lines.length;
		let column = lines[line - 1].length + 1;
		let text: string = '';
		if (Math.random() < .5) {
			text = '\n';
			lines.push('');
		} else {
			text = getRandomString(1, 2);
			lines[line - 1] += text;
		}

		ops.push({
			text: text,
			range: new Range(line, column, line, column)
		});
	}

	return ops;
}

export function generateRandomReplaces(chunks: string[], editCnt: number, searchStringLen: number, replaceStringLen: number): IIdentifiedSingleEditOperation[] {
	let lines = [];
	for (let i = 0; i < chunks.length; i++) {
		let newLines = chunks[i].split(/\r\n|\r|\n/);
		if (lines.length === 0) {
			lines.push(...newLines);
		} else {
			newLines[0] = lines[lines.length - 1] + newLines[0];
			lines.splice(lines.length - 1, 1, ...newLines);
		}
	}

	let ops: IIdentifiedSingleEditOperation[] = [];
	let chunkSize = Math.max(1, Math.floor(lines.length / editCnt));
	let chunkCnt = Math.floor(lines.length / chunkSize);
	let replaceString = getRandomString(replaceStringLen, replaceStringLen);

	let previousChunksLength = 0;
	for (let i = 0; i < chunkCnt; i++) {
		let startLine = previousChunksLength + 1;
		let endLine = previousChunksLength + chunkSize;
		let line = getRandomInt(startLine, endLine);
		let maxColumn = lines[line - 1].length + 1;
		let startColumn = getRandomInt(1, maxColumn);
		let endColumn = Math.min(maxColumn, startColumn + searchStringLen);

		ops.push({
			text: replaceString,
			range: new Range(line, startColumn, line, endColumn)
		});
		previousChunksLength = endLine;
	}

	return ops;
}

export function createMockText(lineCount: number, minColumn: number, maxColumn: number) {
	let fixedEOL = getRandomEOLSequence();
	let lines: string[] = [];
	for (let i = 0; i < lineCount; i++) {
		if (i !== 0) {
			lines.push(fixedEOL);
		}
		lines.push(getRandomString(minColumn, maxColumn));
	}
	return lines.join('');
}

export function createMockBuffer(str: string, bufferBuilder: ITextBufferBuilder): ITextBuffer {
	bufferBuilder.acceptChunk(str);
	let bufferFactory = bufferBuilder.finish();
	let buffer = bufferFactory.create(DefaultEndOfLine.LF);
	return buffer;
}

export function generateRandomChunkWithLF(minLength: number, maxLength: number): string {
	let length = getRandomInt(minLength, maxLength);
	let r = '';
	for (let i = 0; i < length; i++) {
		let randomI = getRandomInt(0, CharCode.z - CharCode.a + 1);
		if (randomI === 0 && Math.random() < 0.3) {
			r += '\n';
		} else {
			r += String.fromCharCode(randomI + CharCode.a - 1);
		}
	}
	return r;
}