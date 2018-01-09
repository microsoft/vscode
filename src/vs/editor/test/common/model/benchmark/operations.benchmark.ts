/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTableTextBufferBuilder } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableTextBufferBuilder';
import { ITextBuffer, IIdentifiedSingleEditOperation, EndOfLinePreference } from 'vs/editor/common/model';
import { generateRandomEdits, createMockBuffer, createMockText, generateSequentialInserts } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';
import { Range } from 'vs/editor/common/core/range';

let readLinesBenchmark = function (id: string, buffer: ITextBuffer) {
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
let appyEditsBenchmark = function (id: string, buffer: ITextBuffer, edits: IIdentifiedSingleEditOperation[]) {
	console.time(id);
	for (let i = 0, len = edits.length; i < len; i++) {
		buffer.applyEdits([edits[i]], false);
	}
	console.timeEnd(id);
};
let getValueBenchmark = function (id: string, buffer: ITextBuffer, eol: EndOfLinePreference = EndOfLinePreference.LF): void {
	console.time(id);
	const lineCount = buffer.getLineCount();
	const fullModelRange = new Range(1, 1, lineCount, buffer.getLineLength(lineCount) + 1);
	buffer.getValueInRange(fullModelRange, eol);
	console.timeEnd(id);
};

let suites = [
	{
		id: 'random edits',
		generateEdits: generateRandomEdits
	},
	{
		id: 'sequential inserts',
		generateEdits: generateSequentialInserts
	}
];

let text = createMockText(1000, 0, 50);

for (let i = 0, len = suites.length; i < len; i++) {
	console.log(`--- ${suites[i].id} ---`);

	for (let j of [10, 100, 1000]) {
		let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
		let pieceTableTextBuffer = createMockBuffer(text, new PieceTableTextBufferBuilder());
		let edits = suites[i].generateEdits(text, j);

		appyEditsBenchmark(`line text model \t applyEdits ${j}\t`, linesTextBuffer, edits);
		appyEditsBenchmark(`piece table model \t applyEdits ${j}\t`, pieceTableTextBuffer, edits);

		readLinesBenchmark(`line text model \t getLineContent after ${j} edits\t`, linesTextBuffer);
		readLinesBenchmark(`piece table model \t getLineContent after ${j} edits\t`, pieceTableTextBuffer);

		getValueBenchmark(`line text model \t save after ${j} edits\t`, linesTextBuffer);
		getValueBenchmark(`piece table model \t save after ${j} edits\t`, pieceTableTextBuffer);
	}
}