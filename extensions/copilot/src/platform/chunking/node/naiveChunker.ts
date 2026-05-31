/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITokenizer } from '../../../util/common/tokenizer';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { commonPrefixLength, isFalsyOrWhitespace, splitLines } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { ITokenizerProvider, TokenizationEndpoint } from '../../tokenizer/node/tokenizer';
import { FileChunk } from '../common/chunk';

export const MAX_CHUNK_SIZE_TOKENS = 250;

interface IChunkedLine {
	readonly text: string;
	readonly lineNumber: number;
}

export class NaiveChunker {
	private readonly tokenizer: ITokenizer;

	constructor(
		endpoint: TokenizationEndpoint,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider
	) {
		this.tokenizer = tokenizerProvider.acquireTokenizer(endpoint);
	}

	async chunkFile(uri: URI, text: string, {
		maxTokenLength = MAX_CHUNK_SIZE_TOKENS,
		removeEmptyLines = true,
	}: {
		maxTokenLength?: number;
		removeEmptyLines?: boolean;
	}, token: CancellationToken): Promise<FileChunk[]> {
		const chunks: FileChunk[] = [];
		for await (const chunk of this._processLinesIntoChunks(
			uri, text,
			maxTokenLength,
			true,
			removeEmptyLines,
			token
		)) {
			if (token.isCancellationRequested) {
				return [];
			}

			if (!removeEmptyLines || (!!chunk.text.length && /[\w\d]{2}/.test(chunk.text))) {
				chunks.push(chunk);
			}
		}
		return chunks;
	}

	private async *_processLinesIntoChunks(
		uri: URI,
		text: string,
		maxTokenLength: number,
		shouldDedent: boolean,
		removeEmptyLines: boolean,
		token: CancellationToken,
	): AsyncIterable<FileChunk> {
		const originalLines = splitLines(text);

		const accumulatingChunk: IChunkedLine[] = [];
		let usedTokensInChunk = 0;
		let longestCommonWhitespaceInChunk: string | undefined;

		for (let i = 0; i < originalLines.length; ++i) {
			const line = originalLines[i];
			if (removeEmptyLines && isFalsyOrWhitespace(line)) {
				continue;
			}

			const lineText = line.slice(0, maxTokenLength * 4).trimEnd();
			const lineTokenCount = await this.tokenizer.tokenLength(lineText);
			if (token.isCancellationRequested) {
				return;
			}

			if (longestCommonWhitespaceInChunk === undefined || longestCommonWhitespaceInChunk.length > 0) {
				const leadingWhitespaceMatches = line.match(/^\s+/);
				const currentLeadingWhitespace = leadingWhitespaceMatches ? leadingWhitespaceMatches[0] : '';

				longestCommonWhitespaceInChunk = longestCommonWhitespaceInChunk
					? commonLeadingStr(longestCommonWhitespaceInChunk, currentLeadingWhitespace)
					: currentLeadingWhitespace;
			}

			if (usedTokensInChunk + lineTokenCount > maxTokenLength) {
				// Emit previous chunk and reset state
				const chunk = this.finalizeChunk(uri, accumulatingChunk, shouldDedent, longestCommonWhitespaceInChunk ?? '', false);
				if (chunk) {
					yield chunk;
				}

				accumulatingChunk.length = 0;
				usedTokensInChunk = 0;
				longestCommonWhitespaceInChunk = undefined;
			}

			accumulatingChunk.push({
				text: lineText,
				lineNumber: i,
			});
			usedTokensInChunk += lineTokenCount;
		}

		const finalChunk = this.finalizeChunk(uri, accumulatingChunk, shouldDedent, longestCommonWhitespaceInChunk ?? '', true);
		if (finalChunk) {
			yield finalChunk;
		}
	}

	private finalizeChunk(file: URI, chunkLines: readonly IChunkedLine[], shouldDedent: boolean, leadingWhitespace: string, isLastChunk: boolean): FileChunk | undefined {
		if (!chunkLines.length) {
			return undefined;
		}

		const finalizedChunkText = shouldDedent
			? chunkLines.map(x => x.text.substring(leadingWhitespace.length)).join('\n')
			: chunkLines.map(x => x.text).join('\n');

		const lastLine = chunkLines[chunkLines.length - 1];
		return {
			file: file,
			// For naive chunking, the raw text is the same as the processed text
			text: finalizedChunkText,
			rawText: finalizedChunkText,
			isFullFile: isLastChunk && chunkLines[0].lineNumber === 0,
			range: new Range(
				chunkLines[0].lineNumber,
				0,
				lastLine.lineNumber,
				lastLine.text.length,
			),
		};
	}
}

export function trimCommonLeadingWhitespace(lines: string[]): { trimmedLines: string[]; shortestLeadingCommonWhitespace: string } {
	let longestCommonWhitespace: string | undefined;
	for (const line of lines) {
		const leadingWhitespaceMatches = line.match(/^\s+/);
		const currentLeadingWhitespace = leadingWhitespaceMatches ? leadingWhitespaceMatches[0] : '';

		if (longestCommonWhitespace === undefined) {
			longestCommonWhitespace = currentLeadingWhitespace;
		} else {
			longestCommonWhitespace = commonLeadingStr(longestCommonWhitespace, currentLeadingWhitespace);
		}

		if (!longestCommonWhitespace || longestCommonWhitespace.length === 0) {
			// No common leading whitespace, no need to continue
			return {
				trimmedLines: lines,
				shortestLeadingCommonWhitespace: '',
			};
		}
	}

	const dedentLength = (longestCommonWhitespace ?? '').length;
	return {
		trimmedLines: lines.map(e => e.substring(dedentLength)),
		shortestLeadingCommonWhitespace: longestCommonWhitespace ?? '',
	};
}

function commonLeadingStr(str1: string, str2: string) {
	const prefixLength = commonPrefixLength(str1, str2);
	return str1.substring(0, prefixLength);
}
