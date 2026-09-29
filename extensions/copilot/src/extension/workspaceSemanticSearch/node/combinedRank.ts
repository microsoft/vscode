/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileChunk, FileChunkAndScore } from '../../../platform/chunking/common/chunk';
import { IRankResult } from './semanticSearchTextSearchProvider';

// Normalize scores to a range of 0 to 1
const normalizeScores = (scores: number[]) => {
	const maxScore = Math.max(...scores);
	const minScore = Math.min(...scores);
	if (maxScore === minScore) {
		return scores.map(() => 1); // If all scores are the same, return 1 for all
	}
	return scores.map((score: number) => (score - minScore) / (maxScore - minScore));
};

// Combine scores using a weighted average
const combineScores = (chunkScores: number[], llmScores: number[], chunkWeight = 0.5, llmWeight = 0.5) => {
	return chunkScores.map((score, index) => {
		const llmScore = llmScores[index] !== undefined ? llmScores[index] : 0;
		return (score * chunkWeight) + (llmScore * llmWeight);
	});
};

export const combinedRanking = (
	chunks: FileChunkAndScore<FileChunk>[],
	llmResponse: IRankResult[],
	topFiles: number = 5,
	topChunks: number = 3
) => {
	const chunkScores = chunks.map(chunk => chunk.distance?.value || 0);
	const usedChunks: FileChunk[] = [];
	const llmScores = chunks.map((chunk) => {
		// Check if the lines in this chunk are already contained in another chosen chunk
		const chunkExists = usedChunks.some(usedChunk =>
			usedChunk.file.path === chunk.chunk.file.path && (usedChunk.range.startLineNumber <= chunk.chunk.range.startLineNumber && usedChunk.range.endLineNumber >= chunk.chunk.range.endLineNumber)
		);
		if (chunkExists) {
			return 0;
		}
		const llmResult = llmResponse.some(response =>
			chunk.chunk.file.path.endsWith(response.file) && chunk.chunk.text.includes(response.query)
		);
		if (llmResult) {
			usedChunks.push(chunk.chunk);
			return 1;
		} else {
			return 0;
		}
	});

	const normalizedChunkScores = normalizeScores(chunkScores);
	const normalizedLlmScores = normalizeScores(llmScores);

	const combinedScores = combineScores(normalizedChunkScores, normalizedLlmScores);
	const sortedResults = chunks.map((chunk, index) => ({
		...chunk,
		combinedScore: combinedScores[index],
		llmSelected: llmScores[index] === 1,
	})).sort((a, b) => b.combinedScore - a.combinedScore);

	// return chunks below topFiles and only 3 chunks per file
	const filePaths: { [key: string]: number } = {};
	const filteredResults = sortedResults.filter((result) => {
		const filePath = result.chunk.file.path;
		if (!filePaths[filePath]) {
			if (Object.keys(filePaths).length >= topFiles) {
				return false;
			}
			filePaths[filePath] = 0;
		}
		if (filePaths[filePath] < topChunks) {
			filePaths[filePath]++;
			return true;
		}
		return false;
	});
	return filteredResults;
};

export function combineRankingInsights(
	chunks: FileChunkAndScore<FileChunk>[],
	llmResponse: IRankResult[]
): { llmBestRank: number; llmWorstRank: number } {
	// Identify which chunks were selected by LLM
	const selectedChunkIndices: number[] = [];
	chunks.forEach((chunk, index) => {
		const isPickedByLLM = llmResponse.some(response =>
			chunk.chunk.file.path.endsWith(response.file) &&
			chunk.chunk.text.includes(response.query)
		);
		if (isPickedByLLM) {
			selectedChunkIndices.push(index);
		}
	});

	// Compute best rank and worst rank
	const llmBestRank = selectedChunkIndices.length ? Math.min(...selectedChunkIndices) : -1;
	const llmWorstRank = selectedChunkIndices.length ? Math.max(...selectedChunkIndices) : -1;

	return { llmBestRank, llmWorstRank };
}