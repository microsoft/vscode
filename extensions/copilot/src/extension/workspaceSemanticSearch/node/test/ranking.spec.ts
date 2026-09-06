/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { expect, it, suite } from 'vitest';
import { FileChunk, FileChunkAndScore } from '../../../../platform/chunking/common/chunk';
import { EmbeddingType } from '../../../../platform/embeddings/common/embeddingsComputer';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { combineRankingInsights } from '../combinedRank';

suite('combineRankingInsights', () => {
	// Helper function to create a FileChunk object
	function createFileChunk(path: string, text: string, startLine: number, endLine: number): FileChunk {
		return {
			file: URI.file(path),
			text,
			rawText: undefined,
			range: new Range(startLine, 1, endLine, 1),
		};
	}

	// Helper function to create a FileChunkAndScore object
	function createFileChunkAndScore(
		path: string,
		text: string,
		startLine: number,
		endLine: number,
		distance?: number
	): FileChunkAndScore<FileChunk> {
		return {
			chunk: createFileChunk(path, text, startLine, endLine),
			distance: typeof distance === 'number' ? { value: distance, embeddingType: EmbeddingType.text3small_512 } : undefined,
		};
	}

	it('correctly computes best and worst rank when LLM selects multiple chunks', () => {
		const chunks: FileChunkAndScore<FileChunk>[] = [
			createFileChunkAndScore('/file1', 'function foo() {}', 1, 5, 0.9),
			createFileChunkAndScore('/file2', 'const bar = 42;', 1, 1, 0.8),
			createFileChunkAndScore('/file3', 'class Baz {}', 1, 3, 0.7),
			createFileChunkAndScore('/file4', 'let x = 10;', 1, 1, 0.6),
		];

		const llmResponse = [
			{
				file: 'file1',
				query: 'function foo() {}',
			},
			{
				file: 'file3',
				query: 'class Baz {}',
			}
		];

		const result = combineRankingInsights(chunks, llmResponse);

		expect(result.llmBestRank).toBe(0);  // 'file1' is at index 0
		expect(result.llmWorstRank).toBe(2); // 'file3' is at index 2
	});

	it('returns -1 when no LLM selections match', () => {
		const chunks: FileChunkAndScore<FileChunk>[] = [
			createFileChunkAndScore('/file1', 'function foo() {}', 1, 5, 0.9),
			createFileChunkAndScore('/file2', 'const bar = 42;', 1, 1, 0.8),
		];

		const llmResponse = [
			{
				file: 'file3',
				query: 'class Baz {}',
			}
		];

		const result = combineRankingInsights(chunks, llmResponse);

		expect(result.llmBestRank).toBe(-1);
		expect(result.llmWorstRank).toBe(-1);
	});

	it('handles cases with partial matches correctly', () => {
		const chunks: FileChunkAndScore<FileChunk>[] = [
			createFileChunkAndScore('/fileA', 'let test = 5;', 1, 2, 0.95),
			createFileChunkAndScore('/fileB', 'console.log(test);', 3, 4, 0.85),
			createFileChunkAndScore('/fileC', 'function run() {}', 5, 8, 0.75),
			createFileChunkAndScore('/fileD', 'return true;', 9, 10, 0.65),
		];

		const llmResponse = [
			{
				file: 'fileA',
				query: 'let test = 5;',
			},
			{
				file: 'fileD',
				query: 'return true;',
			}
		];

		const result = combineRankingInsights(chunks, llmResponse);

		expect(result.llmBestRank).toBe(0); // 'fileA' at index 0
		expect(result.llmWorstRank).toBe(3); // 'fileD' at index 3
	});
});