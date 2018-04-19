/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextBufferBuilder, EndOfLinePreference } from 'vs/editor/common/model';
import { BenchmarkSuite } from 'vs/editor/test/common/model/benchmark/benchmarkUtils';
import { generateRandomChunkWithLF, generateRandomEdits, generateSequentialInserts, getRandomInt } from 'vs/editor/test/common/model/linesTextBuffer/textBufferAutoTestUtils';
import { Range } from 'vs/editor/common/core/range';

let fileSizes = [1, 1000, 64 * 1000, 32 * 1000 * 1000];
let editTypes = [
	{
		id: 'random edits',
		generateEdits: generateRandomEdits
	},
	{
		id: 'sequential inserts',
		generateEdits: generateSequentialInserts
	}
];

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

	for (let editType of editTypes) {
		const edits = editType.generateEdits(chunks, 1000);

		let editsSuite = new BenchmarkSuite({
			name: `File Size: ${fileSize}Byte, ${editType.id}`,
			iterations: 10
		});

		editsSuite.add({
			name: `apply 1000 edits`,
			buildBuffer: (textBufferBuilder: ITextBufferBuilder) => {
				chunks.forEach(ck => textBufferBuilder.acceptChunk(ck));
				return textBufferBuilder.finish();
			},
			preCycle: (textBuffer) => {
				return textBuffer;
			},
			fn: (textBuffer) => {
				// for line model, this loop doesn't reflect the real situation.
				for (let k = 0; k < edits.length; k++) {
					textBuffer.applyEdits([edits[k]], false);
				}
			}
		});

		editsSuite.add({
			name: `Read all lines after 1000 edits`,
			buildBuffer: (textBufferBuilder: ITextBufferBuilder) => {
				chunks.forEach(ck => textBufferBuilder.acceptChunk(ck));
				return textBufferBuilder.finish();
			},
			preCycle: (textBuffer) => {
				for (let k = 0; k < edits.length; k++) {
					textBuffer.applyEdits([edits[k]], false);
				}
				return textBuffer;
			},
			fn: (textBuffer) => {
				for (let j = 0, len = textBuffer.getLineCount(); j < len; j++) {
					var str = textBuffer.getLineContent(j + 1);
					let firstChar = str.charCodeAt(0);
					let lastChar = str.charCodeAt(str.length - 1);
					firstChar = firstChar - lastChar;
					lastChar = firstChar + lastChar;
					firstChar = lastChar - firstChar;
				}
			}
		});

		editsSuite.add({
			name: `Read 10 random windows after 1000 edits`,
			buildBuffer: (textBufferBuilder: ITextBufferBuilder) => {
				chunks.forEach(ck => textBufferBuilder.acceptChunk(ck));
				return textBufferBuilder.finish();
			},
			preCycle: (textBuffer) => {
				for (let k = 0; k < edits.length; k++) {
					textBuffer.applyEdits([edits[k]], false);
				}
				return textBuffer;
			},
			fn: (textBuffer) => {
				for (let i = 0; i < 10; i++) {
					let minLine = 1;
					let maxLine = textBuffer.getLineCount();
					let startLine = getRandomInt(minLine, Math.max(minLine, maxLine - 100));
					let endLine = Math.min(maxLine, startLine + 100);
					for (let j = startLine; j < endLine; j++) {
						var str = textBuffer.getLineContent(j + 1);
						let firstChar = str.charCodeAt(0);
						let lastChar = str.charCodeAt(str.length - 1);
						firstChar = firstChar - lastChar;
						lastChar = firstChar + lastChar;
						firstChar = lastChar - firstChar;
					}
				}
			}
		});

		editsSuite.add({
			name: `save file after 1000 edits`,
			buildBuffer: (textBufferBuilder: ITextBufferBuilder) => {
				chunks.forEach(ck => textBufferBuilder.acceptChunk(ck));
				return textBufferBuilder.finish();
			},
			preCycle: (textBuffer) => {
				for (let k = 0; k < edits.length; k++) {
					textBuffer.applyEdits([edits[k]], false);
				}
				return textBuffer;
			},
			fn: (textBuffer) => {
				const lineCount = textBuffer.getLineCount();
				const fullModelRange = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
				textBuffer.getValueInRange(fullModelRange, EndOfLinePreference.LF);
			}
		});

		editsSuite.run();
	}
}