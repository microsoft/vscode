/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IZaphBrainSearchResult, IZaphKnowledgeChunk } from '../common/zaphBrainTypes';

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9_\-\s]/g, ' ')
		.split(/\s+/)
		.filter(w => w.length > 2);
}

function termFrequency(tokens: string[]): Map<string, number> {
	const tf = new Map<string, number>();
	for (const t of tokens) {
		tf.set(t, (tf.get(t) ?? 0) + 1);
	}
	return tf;
}

/**
 * Lightweight TF-IDF index for Zaph brain RAG knowledge chunks.
 */
export class ZaphBrainRagIndex {

	private readonly _chunks: IZaphKnowledgeChunk[];
	private readonly _docFreq = new Map<string, number>();
	private readonly _chunkTokens = new Map<string, Map<string, number>>();

	constructor(chunks: IZaphKnowledgeChunk[]) {
		this._chunks = chunks;
		this._buildIndex();
	}

	get size(): number {
		return this._chunks.length;
	}

	search(query: string, maxResults: number, token: CancellationToken): IZaphBrainSearchResult[] {
		const queryTokens = tokenize(query);
		if (!queryTokens.length) {
			return [];
		}

		const queryTf = termFrequency(queryTokens);
		const scores: IZaphBrainSearchResult[] = [];

		for (const chunk of this._chunks) {
			if (token.isCancellationRequested) {
				return scores;
			}

			const chunkTf = this._chunkTokens.get(chunk.id);
			if (!chunkTf) {
				continue;
			}

			let score = 0;
			let totalTerms = 0;
			for (const count of chunkTf.values()) {
				totalTerms += count;
			}
			if (totalTerms === 0) {
				continue;
			}

			for (const [term, qWeight] of queryTf) {
				const tf = chunkTf.get(term);
				if (!tf) {
					continue;
				}
				const df = this._docFreq.get(term) ?? 1;
				const idf = Math.log((this._chunks.length + 1) / (df + 1)) + 1;
				score += (tf / totalTerms) * idf * qWeight;
			}

			if (score > 0) {
				scores.push({ chunk, score });
			}
		}

		scores.sort((a, b) => b.score - a.score);
		return scores.slice(0, maxResults);
	}

	private _buildIndex(): void {
		for (const chunk of this._chunks) {
			const tokens = tokenize(chunk.text);
			const tf = termFrequency(tokens);
			this._chunkTokens.set(chunk.id, tf);

			const uniqueTerms = new Set(tokens);
			for (const term of uniqueTerms) {
				this._docFreq.set(term, (this._docFreq.get(term) ?? 0) + 1);
			}
		}
	}
}
