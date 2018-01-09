/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTableTextBufferBuilder } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableTextBufferBuilder';
import { ITextBuffer } from 'vs/editor/common/model';
import { randomEdits, createMockBuffer, createMockText } from 'vs/editor/test/common/model/benchmark/util';

let readLines = function (id: string, buffer: ITextBuffer) {
	console.time(id);
	for (let i = 0, len = buffer.getLineCount(); i < len; i++) {
		var str = buffer.getLineContent(i + 1);
		let firstChar = str.charCodeAt(0);
		let lastChar = str.charCodeAt(str.length - 1);
		firstChar = firstChar - lastChar;
		lastChar = firstChar + lastChar;
		firstChar = lastChar - firstChar;
	}
	console.timeEnd(id);
};

let text = createMockText(1000, 0, 50);
let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
let pieceTableTextBuffer = createMockBuffer(text, new PieceTableTextBufferBuilder());

readLines('line text buffer', linesTextBuffer);
readLines('piece table text buffer', pieceTableTextBuffer);

for (let i of [10, 100, 1000]) {
	let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
	let pieceTableTextBuffer = createMockBuffer(text, new PieceTableTextBufferBuilder());
	let edits = randomEdits(text, i);

	for (let i = 0, len = edits.length; i < len; i++) {
		linesTextBuffer.applyEdits([edits[i]], false);
		pieceTableTextBuffer.applyEdits([edits[i]], false);
	}
	readLines(`line text buffer after ${i} edits`, linesTextBuffer);
	readLines(`piece table text buffer after ${i} edits`, pieceTableTextBuffer);
}
