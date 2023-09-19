/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';

type SparseEmbedding = Record</* word */ string, /* weight */number>;
type TermFrequencies = Map</* word */ string, { occurrences: number; weight: number }>;
type DocumentOccurrences = Map</* word */ string, /*documentOccurrences*/ number>;

interface DocumentChunkEntry {
	readonly text: string;
	readonly tf: TermFrequencies;
}

interface Term {
	readonly term: string;
	readonly weight: number;
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
		const map = new Map<string, { weight: number; occurrences: number }>();
		for (const value of TfIdfCalculator.splitTerms(input)) {
			const existing = map.get(value.term);
			if (existing) {
				existing.occurrences++;
			} else {
				map.set(value.term, { weight: value.weight, occurrences: 1 });
			}
		}
		return map;
	}

	/**
	 * Break a string into terms (words).
	 *
	 * TODO: confirm that when we break up a word or generate stems, we likely accidentally over-weight its terms.
	 * For instance, if the document is: `cats wear hats` and the user searches `cats wear`, we could end up giving too
	 * much weight to `cats` since the document would be broken into: `[cats, cat, wear, hats, hat]` while the query
	 * would be broken into `[cats, cat, wear]`. This means that terms derived from `cats` end up being matched on multiple
	 * times, which isn't really right.
	 *
	 * Maybe we need to generate a tree of terms for the document where we stop searching once a match has been found:
	 */
	private static *splitTerms(input: string): Iterable<Term> {
		const normalize = (word: string) => word.toLowerCase();

		// Only match on words that are at least 3 characters long and start with a letter
		for (const [word] of input.matchAll(/\b\p{Letter}[\p{Letter}\d]{2,}\b/gu)) {
			yield { term: normalize(word), weight: 1 };

			// Include both the original term and the stemmed version
			const stemmedTerm = stem(word);
			if (stemmedTerm !== word) {
				yield { term: normalize(stemmedTerm), weight: 0.75 };
			}

			const camelParts = word.split(/(?=[A-Z])/g);
			if (camelParts.length > 1) {
				for (const part of camelParts) {
					// Require at least 3 letters in the parts of a camel case word
					if (part.length > 2 && /\p{Letter}{3,}/gu.test(part)) {
						yield { term: normalize(part), weight: 0.75 };

						const stemmedPart = stem(part);
						if (stemmedPart !== part && stemmedPart.length > 2) {
							yield { term: normalize(stemmedPart), weight: 0.5 };
						}
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

			const chunkTfidf = chunkTf.weight * chunkTf.occurrences * chunkIdf;
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
				embedding[word] = occurrences.weight * occurrences.occurrences * idf;
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

// https://github.com/maxxxxxdlp/porter-stemming

/**
 * TypeScript implementation of the Porter-Stemmer algorithm
 */
export function stem(raw: string): string {
	if (raw.length < minLength) { return raw; }

	let word = raw;
	const firstCharacter = word[0];
	if (firstCharacter === 'y') { word = firstCharacter.toUpperCase() + word.slice(1); }

	word = steps.reduce((word, step) => step(word), word);

	// Turn initial Y back to y
	if (firstCharacter === 'y') { word = firstCharacter.toLowerCase() + word.slice(1); }

	return word;
}

const minLength = 3;
const vowel = '[aeiouy]';
const consonant = '[^aeiou]';
const consonantSequence = `${consonant}[^aeiouy]*`;
const o = new RegExp(`^${consonantSequence}${vowel}[^aeiouwxy]$`, 'u');

/**
 * Try to match a word against a rule
 */
const replace =
	(
		replacements: Readonly<
			Record<
				string,
				| string
				| readonly [condition: (word: string) => boolean, replacement: string]
			>
		>
	) =>
		(word: string): string => {
			const entries = Object.entries(replacements).sort(
				([left], [right]) => right.length - left.length
			);
			for (const [suffix, replacement] of entries) {
				if (!word.endsWith(suffix)) { continue; }
				if (
					Array.isArray(replacement) &&
					!replacement[0](word.slice(0, -suffix.length))
				) { break; }
				return `${word.slice(0, -suffix.length)}${Array.isArray(replacement) ? replacement[1] : replacement
					}`;
			}
			return word;
		};

const calculateMeasure = (word: string): number =>
	sum(
		Array.from(word.split(''), (_, index) =>
			!isConsonant(word, index) &&
				index + 1 < word.length &&
				isConsonant(word, index + 1)
				? 1
				: 0
		)
	);

const sum = (array: readonly number[]): number =>
	array.reduce((sum, value) => sum + value, 0);

const measure =
	(min: number) =>
		(word: string): boolean =>
			calculateMeasure(word) > min;

function isConsonant(word: string, index: number): boolean {
	const vowels = 'aeiou';
	if (vowels.includes(word[index])) { return false; }
	if (word[index] === 'y') { return index === 0 ? true : !isConsonant(word, index - 1); }
	else { return true; }
}

const hasVowel = (word: string): boolean =>
	Array.from(word.split('')).some((_, index) => !isConsonant(word, index));

const steps: readonly ((word: string) => string)[] = [
	// Step 1a
	replace({
		sses: 'ss',
		ies: 'i',
		ss: 'ss',
		s: '',
	}),
	// Step 1b
	(word): string => {
		if (word.endsWith('eed')) { return replace({ eed: [measure(0), 'ee'] })(word); }
		const updated = replace({ ed: [hasVowel, ''], ing: [hasVowel, ''] })(word);
		if (updated === word) { return word; }
		const replaced = replace({
			at: 'ate',
			bl: 'ble',
			iz: 'ize',
		})(updated);
		if (replaced !== updated) { return replaced; }

		if (
			replaced.at(-1) === replaced.at(-'dd'.length) &&
			isConsonant(replaced, replaced.length - 1) &&
			!['l', 's', 'z'].some((letter) => replaced.endsWith(letter))
		) { return replaced.slice(0, -1); }

		if (calculateMeasure(replaced) === 1 && o.test(replaced)) { return `${replaced}e`; }
		return replaced;
	},
	// Step 1c
	replace({
		y: [hasVowel, 'i'],
	}),
	// Step 2
	replace({
		ational: [measure(0), 'ate'],
		tional: [measure(0), 'tion'],
		enci: [measure(0), 'ence'],
		anci: [measure(0), 'ance'],
		izer: [measure(0), 'ize'],
		abli: [measure(0), 'able'],
		alli: [measure(0), 'al'],
		entli: [measure(0), 'ent'],
		eli: [measure(0), 'e'],
		ousli: [measure(0), 'ous'],
		ization: [measure(0), 'ize'],
		ation: [measure(0), 'ate'],
		ator: [measure(0), 'ate'],
		alism: [measure(0), 'al'],
		iveness: [measure(0), 'ive'],
		fulness: [measure(0), 'ful'],
		ousness: [measure(0), 'ous'],
		aliti: [measure(0), 'al'],
		iviti: [measure(0), 'ive'],
		biliti: [measure(0), 'ble'],
		logi: [measure(0), 'log'],
		bli: [measure(0), 'ble'],
	}),
	// Step 3
	replace({
		icate: [measure(0), 'ic'],
		ative: [measure(0), ''],
		alize: [measure(0), 'al'],
		iciti: [measure(0), 'ic'],
		ical: [measure(0), 'ic'],
		ful: [measure(0), ''],
		ness: [measure(0), ''],
	}),
	// Step 4
	(word): string => {
		const newWord = replace({
			al: [measure(1), ''],
			ance: [measure(1), ''],
			ence: [measure(1), ''],
			er: [measure(1), ''],
			ic: [measure(1), ''],
			able: [measure(1), ''],
			ible: [measure(1), ''],
			ant: [measure(1), ''],
			ement: [measure(1), ''],
			ment: [measure(1), ''],
			ent: [measure(1), ''],
			ou: [measure(1), ''],
			ism: [measure(1), ''],
			ate: [measure(1), ''],
			iti: [measure(1), ''],
			ous: [measure(1), ''],
			ive: [measure(1), ''],
			ize: [measure(1), ''],
		})(word);
		if (newWord !== word) { return newWord; }
		return (word.endsWith('tion') || word.endsWith('sion')) &&
			measure(1)(word.slice(0, -'ion'.length))
			? word.slice(0, -'ion'.length)
			: word;
	},
	// Step 5a
	(word): string => {
		if (!word.endsWith('e')) { return word; }
		const stem = word.slice(0, -1);
		const measure = calculateMeasure(stem);
		return measure > 1 || (measure === 1 && !o.test(stem)) ? stem : word;
	},
	// Step 5b
	(word): string =>
		word.endsWith('ll') && measure(1)(word.slice(0, -1))
			? word.slice(0, -1)
			: word,
];
