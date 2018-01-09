/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IIdentifiedSingleEditOperation, ITextBufferBuilder, DefaultEndOfLine, ITextBuffer } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { getRandomString, getRandomInt, getRandomEOLSequence } from 'vs/editor/test/common/model/linesTextBuffer/linesTextBufferBuilderAuto.test';
import { CharCode } from 'vs/base/common/charCode';

export function randomEdits(str: string, editCnt: number): IIdentifiedSingleEditOperation[] {
	let lines = str.split(/\r\n|\r|\n/);
	let ops: IIdentifiedSingleEditOperation[] = [];

	for (let i = 0; i < editCnt; i++) {
		let line = getRandomInt(1, lines.length);
		let startColumn = getRandomInt(1, lines[line - 1].length + 1);
		let endColumn = getRandomInt(startColumn, lines[line - 1].length + 1);
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
		if (randomI === 0) {
			r += '\n';
		} else {
			r += String.fromCharCode(randomI + CharCode.a - 1);
		}
	}
	return r;
}