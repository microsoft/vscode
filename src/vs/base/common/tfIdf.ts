/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from './cancellation.js';

type SparseEmbedding = Record</* word */ string, /* weight */number>;
type TermFrequencies = Map</* word */ string, /*occurrences*/ number>;
type DocumentOccurrences = Map</* word */ string, /*documentOccurrences*/ number>;

function countMapFrom<K>(values: Iterable<K>): Map<K, number> {
	const map = new Map<K, number>();
	for (const value of values) {
		map.set(value, (map.get(value) ?? 0) + 1);
	}
	return map;
}

interface DocumentChunkEntry {
	readonly text: string;
	readonly tf: TermFrequencies;
}

export interface TfIdfDocument {
	readonly key: string;
	readonly textChunks: readonly string[];
}

export interface TfIdfScore {
	readonly key: string;
	/**
	 * An unbounded number.
	 */
	readonly score: number;
}

export interface NormalizedTfIdfScore {
	readonly key: string;
	/**
	 * A number between 0 and 1.
	 */
	readonly score: number;
}

/**
 * Implementation of tf-idf (term frequency-inverse document frequency) for a set of
 * documents where each document contains one or more chunks of text.
 * Each document is identified by a key, and the score for each document is computed
 * by taking the max score over all the chunks in the document.
 */
export class TfIdfCalculator {
	calculateScores(query: string, token: CancellationToken): TfIdfScore[] {
		const embedding = this.computeEmbedding(query);
		const idfCache = new Map<string, number>();
		const scores: TfIdfScore[] = [];
		// For each document, generate one score
		for (const [key, doc] of this.documents) {
			if (token.isCancellationRequested) {
				return [];
			}

			for (const chunk of doc.chunks) {
				const score = this.computeSimilarityScore(chunk, embedding, idfCache);
				if (score > 0) {
					scores.push({ key, score });
				}
			}
		}

		return scores;
	}

	/**
	 * Count how many times each term (word) appears in a string.
	 */
	private static termFrequencies(input: string): TermFrequencies {
		return countMapFrom(TfIdfCalculator.splitTerms(input));
	}

	/**
	 * Break a string into terms (words).
	 */
	private static *splitTerms(input: string): Iterable<string> {
		const normalize = (word: string) => word.toLowerCase();

		// Only match on words that are at least 3 characters long and start with a letter
		for (const [word] of input.matchAll(/\b\p{Letter}[\p{Letter}\d]{2,}\b/gu)) {
			yield normalize(word);

			const camelParts = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/g);
			if (camelParts.length > 1) {
				for (const part of camelParts) {
					// Require at least 3 letters in the parts of a camel case word
					if (part.length > 2 && /\p{Letter}{3,}/gu.test(part)) {
						yield normalize(part);
					}
				}
			}
		}
	}

	/**
	 * Total number of chunks
	 */
	private chunkCount = 0;

	private readonly chunkOccurrences: DocumentOccurrences = new Map</* word */ string, /*documentOccurrences*/ number>();

	private readonly documents = new Map</* key */ string, {
		readonly chunks: ReadonlyArray<DocumentChunkEntry>;
	}>();

	updateDocuments(documents: ReadonlyArray<TfIdfDocument>): this {
		for (const { key } of documents) {
			this.deleteDocument(key);
		}

		for (const doc of documents) {
			const chunks: Array<{ text: string; tf: TermFrequencies }> = [];
			for (const text of doc.textChunks) {
				// TODO: See if we can compute the tf lazily
				// The challenge is that we need to also update the `chunkOccurrences`
				// and all of those updates need to get flushed before the real TF-IDF of
				// anything is computed.
				const tf = TfIdfCalculator.termFrequencies(text);

				// Update occurrences list
				for (const term of tf.keys()) {
					this.chunkOccurrences.set(term, (this.chunkOccurrences.get(term) ?? 0) + 1);
				}

				chunks.push({ text, tf });
			}

			this.chunkCount += chunks.length;
			this.documents.set(doc.key, { chunks });
		}
		return this;
	}

	deleteDocument(key: string) {
		const doc = this.documents.get(key);
		if (!doc) {
			return;
		}

		this.documents.delete(key);
		this.chunkCount -= doc.chunks.length;

		// Update term occurrences for the document
		for (const chunk of doc.chunks) {
			for (const term of chunk.tf.keys()) {
				const currentOccurrences = this.chunkOccurrences.get(term);
				if (typeof currentOccurrences === 'number') {
					const newOccurrences = currentOccurrences - 1;
					if (newOccurrences <= 0) {
						this.chunkOccurrences.delete(term);
					} else {
						this.chunkOccurrences.set(term, newOccurrences);
					}
				}
			}
		}
	}

	private computeSimilarityScore(chunk: DocumentChunkEntry, queryEmbedding: SparseEmbedding, idfCache: Map<string, number>): number {
		// Compute the dot product between the chunk's embedding and the query embedding

		// Note that the chunk embedding is computed lazily on a per-term basis.
		// This lets us skip a large number of calculations because the majority
		// of chunks do not share any terms with the query.

		let sum = 0;
		for (const [term, termTfidf] of Object.entries(queryEmbedding)) {
			const chunkTf = chunk.tf.get(term);
			if (!chunkTf) {
				// Term does not appear in chunk so it has no contribution
				continue;
			}

			let chunkIdf = idfCache.get(term);
			if (typeof chunkIdf !== 'number') {
				chunkIdf = this.computeIdf(term);
				idfCache.set(term, chunkIdf);
			}

			const chunkTfidf = chunkTf * chunkIdf;
			sum += chunkTfidf * termTfidf;
		}
		return sum;
	}

	private computeEmbedding(input: string): SparseEmbedding {
		const tf = TfIdfCalculator.termFrequencies(input);
		return this.computeTfidf(tf);
	}

	private computeIdf(term: string): number {
		const chunkOccurrences = this.chunkOccurrences.get(term) ?? 0;
		return chunkOccurrences > 0
			? Math.log((this.chunkCount + 1) / chunkOccurrences)
			: 0;
	}

	private computeTfidf(termFrequencies: TermFrequencies): SparseEmbedding {
		const embedding = Object.create(null);
		for (const [word, occurrences] of termFrequencies) {
			const idf = this.computeIdf(word);
			if (idf > 0) {
				embedding[word] = occurrences * idf;
			}
		}
		return embedding;
	}
}

/**
 * Normalize the scores to be between 0 and 1 and sort them decending.
 * @param scores array of scores from {@link TfIdfCalculator.calculateScores}
 * @returns normalized scores
 */
export function normalizeTfIdfScores(scores: TfIdfScore[]): NormalizedTfIdfScore[] {

	// copy of scores
	const result = scores.slice(0) as { score: number }[];

	// sort descending
	result.sort((a, b) => b.score - a.score);

	// normalize
	const max = result[0]?.score ?? 0;
	if (max > 0) {
		for (const score of result) {
			score.score /= max;
		}
	}

	return result as TfIdfScore[];
}
