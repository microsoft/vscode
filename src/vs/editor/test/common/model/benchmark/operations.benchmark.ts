/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { ITextBuffer, IIdentifiedSingleEditOperation, EndOfLinePreference } from 'vs/editor/common/model';
import { generateRandomEdits, createMockBuffer, createMockText, generateSequentialInserts } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';
import { Range } from 'vs/editor/common/core/range';
import { doBenchmark } from 'vs/editor/test/common/model/benchmark/benchmarkUtils';

let readLinesBenchmark = function (id: string, buffers: ITextBuffer[]) {
	doBenchmark(id, buffers, (buffer) => {
		for (let j = 0, len = buffer.getLineCount(); j < len; j++) {
			var str = buffer.getLineContent(j + 1);
			let firstChar = str.charCodeAt(0);
			let lastChar = str.charCodeAt(str.length - 1);
			firstChar = firstChar - lastChar;
			lastChar = firstChar + lastChar;
			firstChar = lastChar - firstChar;
		}
	});
};

let appyEditsBenchmark = function (id: string, buffers: ITextBuffer[], edits: IIdentifiedSingleEditOperation[]) {
	doBenchmark(id, buffers, (buffer) => {
		for (let j = 0; j < edits.length; j++) {
			buffer.applyEdits([edits[j]], false);
		}
	});
};

let getValueBenchmark = function (id: string, buffers: ITextBuffer[], eol: EndOfLinePreference = EndOfLinePreference.LF): void {
	doBenchmark(id, buffers, (buffer) => {
		const lineCount = buffer.getLineCount();
		const fullModelRange = new Range(1, 1, lineCount, buffer.getLineLength(lineCount) + 1);
		buffer.getValueInRange(fullModelRange, eol);
	});
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
	console.log(`\n|${suites[i].id}\t|line buffer\t|piece table\t|`);
	console.log('|---|---|---|');
	for (let j of [10, 100, 1000]) {
		let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
		let pieceTreeTextBuffer = createMockBuffer(text, new PieceTreeTextBufferBuilder());
		let edits = suites[i].generateEdits(text, j);

		appyEditsBenchmark(`apply ${j} edits`, [linesTextBuffer, pieceTreeTextBuffer], edits);
		readLinesBenchmark(`getLineContent after ${j} edits`, [linesTextBuffer, pieceTreeTextBuffer]);
		getValueBenchmark(`save after ${j} edits`, [linesTextBuffer, pieceTreeTextBuffer]);
	}
}