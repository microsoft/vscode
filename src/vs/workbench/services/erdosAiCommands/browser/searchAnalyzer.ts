/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISearchAnalyzer } from '../common/searchAnalyzer.js';

export class SearchAnalyzer extends Disposable implements ISearchAnalyzer {
	readonly _serviceBrand: undefined;

	constructor() {
		super();
	}

	performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{similarity: number, line: number, text: string}> {
		if (!searchString || searchString.trim().length === 0 || !fileLines || fileLines.length === 0) {
			return [];
		}
		
		searchString = searchString.trim();
		
		const fileText = fileLines.join('\n');
		
		const searchLen = searchString.length;
		const fileLen = fileText.length;
		
		if (searchLen < 3 || fileLen < searchLen) {
			return [];
		}
		
		const searchLines = searchString.split('\n');
		const seeds: string[] = [];
		const seedPositions: number[] = [];
		
		for (let i = 0; i < searchLines.length; i++) {
			const line = searchLines[i];
			const trimmedLine = line.trim();
			
			if (trimmedLine.length > 0) {
				const seedMatch = searchString.indexOf(trimmedLine);
				if (seedMatch !== -1) {
					seeds.push(trimmedLine);
					seedPositions.push(seedMatch);
				}
			}
		}
		
		const candidatePositions: Array<{filePos: number, seedMatchPos: number, seedInSearch: number}> = [];
		for (let j = 0; j < seeds.length; j++) {
			const seed = seeds[j];
			const seedPos = seedPositions[j];
			
			let searchPos = 0;
			while (true) {
				const matchPos = fileText.indexOf(seed, searchPos);
				if (matchPos === -1) break;
				
				const alignStart = matchPos - seedPos + 1;
				candidatePositions.push({
					filePos: alignStart,
					seedMatchPos: matchPos,
					seedInSearch: seedPos
				});
				searchPos = matchPos + 1;
			}
		}
		
		if (candidatePositions.length === 0) {
			return [];
		}
		
		candidatePositions.sort((a, b) => a.filePos - b.filePos);
		
		const alignments: Array<{text: string, similarity: number, line: number, distance: number, filePos: number}> = [];
		const processedPositions: number[] = [];
		
		for (const candidate of candidatePositions) {
			const filePos = candidate.filePos;
			
			if (processedPositions.some(pos => Math.abs(pos - filePos) < 10)) {
				continue;
			}
			
			const alignStart = Math.max(1, filePos);
			const alignEnd = Math.min(fileLen, alignStart + searchLen - 1);
			
			if (alignEnd > alignStart + 2) {
				const alignedText = fileText.slice(alignStart - 1, alignEnd);
				const actualLen = alignedText.length;
				
				const compareLen = Math.min(searchLen, actualLen);
				if (compareLen >= 3) {
					const searchSubstr = searchString.slice(0, compareLen);
					const alignedSubstr = alignedText.slice(0, compareLen);
					
					const distance = this.calculateEditDistance(searchSubstr, alignedSubstr);
					const similarity = Math.round((1 - distance / compareLen) * 100 * 10) / 10;
					
					if (similarity >= 50) {
						const textBefore = fileText.slice(0, alignStart - 1);
						const lineNum = textBefore.split('\n').length;
						
						alignments.push({
							text: alignedText,
							similarity: similarity,
							line: lineNum,
							distance: distance,
							filePos: alignStart
						});
						
						processedPositions.push(filePos);
					}
				}
			}
		}
		
		if (alignments.length === 0) {
			return [];
		}
		
		alignments.sort((a, b) => b.similarity - a.similarity);
		
		const results: Array<{similarity: number, line: number, text: string}> = [];
		const usedLineRanges: Array<{start: number, end: number}> = [];
		
		for (const alignment of alignments) {
			const startLine = alignment.line;
			const matchLines = alignment.text.split('\n');
			const endLine = startLine + matchLines.length - 1;
			
			let hasOverlap = false;
			for (const usedRange of usedLineRanges) {
				if (!(endLine < usedRange.start || startLine > usedRange.end)) {
					hasOverlap = true;
					break;
				}
			}
			
			if (hasOverlap) {
				continue;
			}
			
			results.push({
				similarity: alignment.similarity,
				line: alignment.line,
				text: alignment.text
			});
			usedLineRanges.push({start: startLine, end: endLine});
			
			if (results.length >= 5) {
				break;
			}
		}
		
		return results;
	}

	calculateEditDistance(str1: string, str2: string): number {
		const len1 = str1.length;
		const len2 = str2.length;
		
		const matrix: number[][] = [];
		for (let i = 0; i <= len1; i++) {
			matrix[i] = [];
			matrix[i][0] = i;
		}
		for (let j = 0; j <= len2; j++) {
			matrix[0][j] = j;
		}
		
		for (let i = 1; i <= len1; i++) {
			for (let j = 1; j <= len2; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j - 1] + cost
				);
			}
		}
		
		return matrix[len1][len2];
	}

	generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[] {
		if (matchLineNums.length <= 1) {
			return [];
		}
		
		const maxContext = 10;
		
		for (let contextSize = 1; contextSize <= maxContext; contextSize++) {
			const currentContexts: Array<{context: string, display: string}> = [];
			
			for (let i = 0; i < matchLineNums.length; i++) {
				const lineNum = matchLineNums[i];
				
				const startLine = Math.max(0, lineNum - contextSize - 1);
				const endLine = Math.min(fileLines.length - 1, lineNum + contextSize - 1);
				const contextLines = fileLines.slice(startLine, endLine + 1);
				
				const contextStr = contextLines.join('\n');
				currentContexts[i] = {
					context: contextStr,
					display: `Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``
				};
			}
			
			const contextStrings = currentContexts.map(x => x.context);
			const uniqueStrings = new Set(contextStrings);
			if (uniqueStrings.size === contextStrings.length) {
				return currentContexts.map(x => x.display);
			}
		}
		
		const finalContexts: string[] = [];
		for (let i = 0; i < matchLineNums.length; i++) {
			const lineNum = matchLineNums[i];
			const startLine = Math.max(0, lineNum - maxContext - 1);
			const endLine = Math.min(fileLines.length - 1, lineNum + maxContext - 1);
			const contextLines = fileLines.slice(startLine, endLine + 1);
			const contextStr = contextLines.join('\n');
			finalContexts.push(`Match ${i + 1} (around line ${lineNum}):\n\`\`\`\n${contextStr}\n\`\`\``);
		}
		
		return finalContexts;
	}
}
