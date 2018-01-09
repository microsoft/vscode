/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTableTextBufferBuilder } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableTextBufferBuilder';
import { IIdentifiedSingleEditOperation, ITextBuffer } from 'vs/editor/common/model';
import { randomEdits, createMockText, createMockBuffer } from 'vs/editor/test/common/model/benchmark/util';

let modelBuildBenchmark = function (id: string, buffer: ITextBuffer, edits: IIdentifiedSingleEditOperation[]) {
	console.time(id);
	for (let i = 0, len = edits.length; i < len; i++) {
		buffer.applyEdits([edits[i]], false);
	}
	console.timeEnd(id);
};

let text = createMockText(1000, 0, 10);

for (let i of [10, 100, 1000]) {
	let linesTextBuffer = createMockBuffer(text, new LinesTextBufferBuilder());
	let pieceTableTextBuffer = createMockBuffer(text, new PieceTableTextBufferBuilder());
	let edits = randomEdits(text, i);
	modelBuildBenchmark(`line text model builder ${i}\t`, linesTextBuffer, edits);
	modelBuildBenchmark(`piece table model builder ${i}\t`, pieceTableTextBuffer, edits);
}
