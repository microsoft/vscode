/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { PieceTableTextBufferBuilder } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableTextBufferBuilder';
import { ITextBufferBuilder } from 'vs/editor/common/model';
import { generateRandomChunkWithLF } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';

let linesTextBufferBuilder = new LinesTextBufferBuilder();
let pieceTableTextBufferBuilder = new PieceTableTextBufferBuilder();
let chunks = [];

for (let i = 0; i < 1000; i++) {
	chunks.push(generateRandomChunkWithLF(16 * 1000, 64 * 1000));
}

let modelBuildBenchmark = function (id: string, builder: ITextBufferBuilder, chunkCnt: number) {
	console.time(id);
	for (let i = 0, len = Math.min(chunkCnt, chunks.length); i < len; i++) {
		builder.acceptChunk(chunks[i]);
	}
	builder.finish();
	console.timeEnd(id);
};

for (let i of [10, 100, 1000]) {
	modelBuildBenchmark(`line text model builder ${i}`, linesTextBufferBuilder, i);
	modelBuildBenchmark(`piece table model builder ${i}`, pieceTableTextBufferBuilder, i);
}
