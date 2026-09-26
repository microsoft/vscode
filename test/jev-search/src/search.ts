/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChunkScorer, ScoringCandidate } from './scorer';

export const searchLimits = {
	files: 80,
	chunks: 200,
	fileBytes: 128 * 1024,
	chunkLines: 40,
	chunkCharacters: 6000,
	results: 20,
} as const;

export interface CodeChunk extends ScoringCandidate {
	readonly startLine: number;
	readonly endLine: number;
	readonly endCharacter: number;
}

export interface SourceFile<T> {
	readonly resource: T;
	readonly size: number;
	readonly isFile: boolean;
	readText(): Promise<string>;
}

export async function collectChunks<T>(source: AsyncIterable<SourceFile<T>>, maxFileSize: number | undefined, signal: AbortSignal): Promise<{
	chunks: (CodeChunk & { resource: T })[]; files: number; skipped: number; limitHit: boolean;
}> {
	signal.throwIfAborted();
	const chunks: (CodeChunk & { resource: T })[] = [];
	let files = 0;
	let skipped = 0;
	let limitHit = false;
	const maxFileBytes = Math.min(maxFileSize ?? searchLimits.fileBytes, searchLimits.fileBytes);

	for await (const file of source) {
		signal.throwIfAborted();
		if (files === searchLimits.files || chunks.length === searchLimits.chunks) {
			return { chunks, files, skipped, limitHit: true };
		}
		files++;
		if (!file.isFile || file.size > maxFileBytes) {
			skipped++;
			limitHit ||= file.size > searchLimits.fileBytes;
			continue;
		}
		const text = await file.readText();
		signal.throwIfAborted();
		const textBytes = Buffer.byteLength(text, 'utf8');
		if (text.includes('\0') || textBytes > maxFileBytes) {
			skipped++;
			limitHit ||= textBytes > searchLimits.fileBytes;
			continue;
		}
		const result = chunkText(text, String(files));
		const available = searchLimits.chunks - chunks.length;
		limitHit ||= result.limitHit || result.chunks.length > available;
		chunks.push(...result.chunks.slice(0, available).map(chunk => ({ ...chunk, resource: file.resource })));
	}
	return { chunks, files, skipped, limitHit };
}

export function chunkText(text: string, idPrefix: string): { chunks: CodeChunk[]; limitHit: boolean } {
	const lines = text.split(/\r\n|\n|\r/);
	const chunks: CodeChunk[] = [];
	let line = 0;
	let limitHit = false;

	while (line < lines.length) {
		const startLine = line;
		const chunkLines: string[] = [];
		let characters = 0;
		while (line < lines.length && chunkLines.length < searchLimits.chunkLines) {
			const current = lines[line];
			if (chunkLines.length && characters + 1 + current.length > searchLimits.chunkCharacters) {
				break;
			}
			const bounded = current.slice(0, searchLimits.chunkCharacters);
			limitHit ||= bounded.length !== current.length;
			characters += (chunkLines.length ? 1 : 0) + bounded.length;
			chunkLines.push(bounded);
			line++;
		}

		const chunk = chunkLines.join('\n');
		if (chunk.trim()) {
			chunks.push({
				id: `${idPrefix}:${startLine}`,
				text: chunk,
				startLine,
				endLine: line - 1,
				endCharacter: chunkLines[chunkLines.length - 1].length,
			});
		}
	}
	return { chunks, limitHit };
}

export async function rankCandidates<T extends ScoringCandidate>(
	query: string,
	candidates: readonly T[],
	scorer: ChunkScorer,
	maxResults: number,
	signal: AbortSignal,
): Promise<{ matches: { candidate: T; score: number }[]; limitHit: boolean }> {
	signal.throwIfAborted();
	if (!query.trim() || !Number.isInteger(maxResults) || maxResults < 0 || candidates.length > searchLimits.chunks) {
		throw new Error('Invalid or unbounded scoring request.');
	}
	if (!candidates.length) {
		return { matches: [], limitHit: false };
	}

	// Keep file paths and source ranges local to the provider.
	const scores = await scorer(query, candidates.map(({ id, text }) => ({ id, text })), signal);
	signal.throwIfAborted();
	const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
	if (candidateById.size !== candidates.length || scores.length !== candidates.length) {
		throw new Error('The scorer must return exactly one score for each unique candidate.');
	}

	const seen = new Set<string>();
	const matches: { candidate: T; score: number }[] = [];
	for (const { id, score } of scores) {
		const candidate = candidateById.get(id);
		if (!candidate || seen.has(id) || !Number.isFinite(score) || score < 0 || score > 1) {
			throw new Error('The scorer returned an unknown or duplicate candidate, or a score outside [0, 1].');
		}
		seen.add(id);
		if (score > 0) {
			matches.push({ candidate, score });
		}
	}
	const order = new Map(candidates.map((candidate, index) => [candidate.id, index]));
	matches.sort((a, b) => b.score - a.score || order.get(a.candidate.id)! - order.get(b.candidate.id)!);
	return { matches: matches.slice(0, maxResults), limitHit: matches.length > maxResults };
}
