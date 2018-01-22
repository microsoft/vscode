/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITextBufferBuilder } from 'vs/editor/common/model';
import { generateRandomReplaces, generateRandomChunkWithLF } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';
import { BenchmarkSuite } from 'vs/editor/test/common/model/benchmark/benchmarkUtils';

let fileSizes = [1, 1000, 64 * 1000, 32 * 1000 * 1000];

for (let fileSize of fileSizes) {
	let chunks = [];

	let chunkCnt = Math.floor(fileSize / (64 * 1000));
	if (chunkCnt === 0) {
		chunks.push(generateRandomChunkWithLF(fileSize, fileSize));
	} else {
		let chunk = generateRandomChunkWithLF(64 * 1000, 64 * 1000);
		// try to avoid OOM
		for (let j = 0; j < chunkCnt; j++) {
			chunks.push(Buffer.from(chunk + j).toString());
		}
	}

	let replaceSuite = new BenchmarkSuite({
		name: `File Size: ${fileSize}Byte`,
		iterations: 10
	});

	let edits = generateRandomReplaces(chunks, 500, 5, 10);

	for (let i of [10, 100, 500]) {
		replaceSuite.add({
			name: `replace ${i} occurrences`,
			buildBuffer: (textBufferBuilder: ITextBufferBuilder) => {
				chunks.forEach(ck => textBufferBuilder.acceptChunk(ck));
				return textBufferBuilder.finish();
			},
			preCycle: (textBuffer) => {
				return textBuffer;
			},
			fn: (textBuffer) => {
				textBuffer.applyEdits(edits.slice(0, i), false);
			}
		});
	}

	replaceSuite.run();
}