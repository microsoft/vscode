/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTableTextBufferBuilder } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableTextBufferBuilder';
import { IIdentifiedSingleEditOperation, ITextBuffer } from 'vs/editor/common/model';
import { createMockText, createMockBuffer, generateRandomReplaces } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';

let appyEditsBenchmark = function (id: string, buffer: ITextBuffer, edits: IIdentifiedSingleEditOperation[]) {
	console.time(id);
	for (let i = 0, len = edits.length; i < len; i++) {
		buffer.applyEdits([edits[i]], false);
	}
	console.timeEnd(id);
};

let text = createMockText(1000, 50, 100);

console.log('--- replace all ---');
for (let i of [10, 100, 500, 1000]) {
	let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
	let pieceTableTextBuffer = createMockBuffer(text, new PieceTableTextBufferBuilder());
	let edits = generateRandomReplaces(text, i, 5, 10);
	appyEditsBenchmark(`line text model \t replace all ${i}\t`, linesTextBuffer, edits);
	appyEditsBenchmark(`piece table model \t replace all ${i}\t`, pieceTableTextBuffer, edits);
}