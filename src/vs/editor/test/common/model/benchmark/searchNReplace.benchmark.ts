/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { IIdentifiedSingleEditOperation, ITextBuffer } from 'vs/editor/common/model';
import { createMockText, createMockBuffer, generateRandomReplaces } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';
import { doBenchmark } from 'vs/editor/test/common/model/benchmark/benchmarkUtils';

let appyEditsBenchmark = function (id: string, buffers: ITextBuffer[], edits: IIdentifiedSingleEditOperation[]) {
	doBenchmark(id, buffers, buffer => {
		for (let i = 0, len = edits.length; i < len; i++) {
			buffer.applyEdits([edits[i]], false);
		}
	});
};

let text = createMockText(1000, 50, 100);

console.log(`\n|replace all\t|line buffer\t|piece table\t|`);
console.log('|---|---|---|');
for (let i of [10, 100, 500, 1000]) {
	let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
	let pieceTreeTextBuffer = createMockBuffer(text, new PieceTreeTextBufferBuilder());
	let edits = generateRandomReplaces(text, i, 5, 10);
	appyEditsBenchmark(`replace ${i} occurrences`, [linesTextBuffer, pieceTreeTextBuffer], edits);
}