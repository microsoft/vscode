/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
interface Alignment {
	distance: number;
	startOffset: number;
	endOffset: number;
}

/**
 * Computes the best alignment, under edit-distance, of placing `needle` within
 * `haystack`. These may be strings or arrays.
 *
 * In other words, the entirety of `needle` will count towards the distance,
 * while only the sub-range within `haystack` corresponding to the best match
 * will be included. This means `editDistance(a, b) !== editDistance(b, a)` in
 * general.
 *
 * If `needle` and `haystack` are strings, the distance is in UTF-16 code units.
 * For instance, an emoji inserted in `needle` will increase the distance by 2,
 * while an ASCII character will increase it only by one.
 *
 * @param haystack The big string or array within which the needle should match
 * @param needle The small string or array to match
 * @param compare An optional comparison operator for the elements of `haystack`
 * and `needle`. It should return a "cost" for substituting a given element of
 * `haystack` with a given element of `needle`. If these elements are equal then
 * `compare` should return 0. The indices of these elements are also given to
 * compare.
 *
 * @returns An alignment of the best match possible, with offsets within
 * `haystack`.
 */
export function editDistance<E, T extends string | E[]>(
	haystack: T,
	needle: T,
	compare: (
		haystackElem: (typeof haystack)[number],
		needleElem: (typeof needle)[number],
		haystackIndex: number,
		needleIndex: number
	) => number = (h, n) => (h === n ? 0 : 1)
): Alignment {
	if (needle.length === 0 || haystack.length === 0) { return { distance: needle.length, startOffset: 0, endOffset: 0 }; }
	let curRow = new Array<number>(needle.length + 1).fill(0);
	let curStart = new Array<number>(needle.length + 1).fill(0);
	let prevRow = new Array<number>(haystack.length + 1).fill(0);
	let prevStart = new Array<number>(haystack.length + 1).fill(0);
	// Initialise the alignment of needle inside haystack
	let c = needle[0];
	for (let i = 0; i < haystack.length + 1; i++) {
		if (i === 0) { curRow[i] = 1; }
		else { curRow[i] = compare(haystack[i - 1], c, i - 1, 0); }
		// We record the starting offset as 0 in two distinct cases:
		//  - At least one char of needle is inserted left of haystack
		//  - 0th char of needle = or subst. 0'th char of haystack
		curStart[i] = i > 0 ? i - 1 : 0;
	}
	// Iterate over the rest of needle
	for (let j = 1; j < needle.length; j++) {
		// Set curRow to prevRow, and reuse the prevRow allocation for this
		// iteration (its contents will be entirely overwritten).
		let swap = prevRow;
		prevRow = curRow;
		curRow = swap;
		swap = prevStart;
		prevStart = curStart;
		curStart = swap;

		c = needle[j];
		curRow[0] = j + 1; // All chars of needle inserted before haystack.
		// Note: curStart[0] = 0 is invariant
		for (let i = 1; i < haystack.length + 1; i++) {
			// What happens to the j'th char of needle
			const inserted = 1 + prevRow[i]; // inserted after i'th char of haystack
			const deleted = 1 + curRow[i - 1]; // deleted after i'th char of haystack
			const substituted = compare(haystack[i - 1], c, i - 1, j) + prevRow[i - 1]; // substituted w. i'th char of haystack
			curRow[i] = Math.min(deleted, inserted, substituted);
			if (curRow[i] === substituted) {
				curStart[i] = prevStart[i - 1];
			} else if (curRow[i] === inserted) {
				curStart[i] = prevStart[i];
			} else {
				curStart[i] = curStart[i - 1];
			}
		}
	}

	// Find the best matching end-offset
	let best = 0;
	for (let i = 0; i < haystack.length + 1; i++) {
		if (curRow[i] < curRow[best]) { best = i; }
	}
	return { distance: curRow[best], startOffset: curStart[best], endOffset: best };
}

type LexDictionary = Map<string, number>;

interface LexGenerator {
	(s: string): Generator<string, void, unknown>;
}

export function emptyLexDictionary(): LexDictionary {
	return new Map();
}

export function reverseLexDictionary(d: LexDictionary): string[] {
	const lookup = new Array<string>(d.size);
	for (const [lexeme, idx] of d) {
		lookup[idx] = lexeme;
	}
	return lookup;
}

/**
 * A simple lex generator.
 * A lexeme is one of the following three:
 *  1. A sequence of letters, numbers, _ and -
 *  2. A sequence of spaces
 *  3. Any other single Unicode code point
 */
export function* lexGeneratorWords(s: string): Generator<string, void, unknown> {
	let buffer = '';
	enum State {
		Word,
		Space,
		Other,
	}
	let state: State = State.Word;
	for (const c of s) {
		let newState: State;
		if (/(\p{L}|\p{Nd}|_)/u.test(c)) { newState = State.Word; }
		else if (c === ' ') { newState = State.Space; }
		else { newState = State.Other; }
		if (newState === state && newState !== State.Other) {
			buffer += c;
		} else {
			if (buffer.length > 0) { yield buffer; }
			buffer = c;
			state = newState;
		}
	}
	if (buffer.length > 0) { yield buffer; }
}

/**
 * Convert a string into an array of lexeme ids, as defined by a lexeme dictionary.
 *
 * Lexemes not already in the dictionary will be added with a fresh key. Hence,
 * this function can be called with an `emptyLexDictionary()`.
 *
 * @param s The string to convert
 * @param lexDictionary The dictionary to begin with
 * @param lexGenerator The generator to use to convert `s` into a stream of
 * substring lexemes
 * @param lexFilter Keep only lexemes satisfying this conditional
 *
 * @returns Pair containing:
 *   - an array of (lexeme ids, lexeme starting offset within `s`),
 *   - the updated dictionary.
 */
export function lexicalAnalyzer(
	s: string,
	d: LexDictionary,
	lexGenerator: LexGenerator,
	lexFilter: (lexeme: string) => boolean
): [[number, number][], LexDictionary] {
	const lexed = [] as [number, number][];
	let offset = 0;
	for (const lexeme of lexGenerator(s)) {
		if (lexFilter(lexeme)) {
			if (!d.has(lexeme)) { d.set(lexeme, d.size); }
			lexed.push([d.get(lexeme)!, offset]);
		}
		offset += lexeme.length;
	}
	return [lexed, d];
}

function notSingleSpace(s: string): boolean {
	return s !== ' ';
}

interface LexAlignment {
	lexDistance: number;
	startOffset: number; // offsets in utf-16 code units
	endOffset: number;
	haystackLexLength: number;
	needleLexLength: number;
}

/**
 * Computes the best alignment, under edit-distance, of placing the lexemes of
 * `needle` within those of `haystack`.
 *
 * More precisely, we compute the lex tokens of `needle` and `haystack` under
 * the same dictionary, and then align these by their edit distance using
 * `editDistance`. We then translate the offsets in the lex-match-alignment back
 * to character offsets.
 *
 * @param haystack The big string within which the needle should match
 * @param needle The small string to match
 * @param lexGenerator Generator which chops up a string into lexemes
 * @param lexFilter Keep only lexemes that return true on this function
 *
 * @returns An alignment of the best match possible, with offsets within
 * `haystack`.
 */
export function lexEditDistance(
	haystack: string,
	needle: string,
	lexGenerator: LexGenerator = lexGeneratorWords
): LexAlignment {
	const [haystackLexed, d] = lexicalAnalyzer(haystack, emptyLexDictionary(), lexGenerator, notSingleSpace);
	const [needleLexed, dBoth] = lexicalAnalyzer(needle, d, lexGenerator, notSingleSpace);
	// Special case for empty haystack or needle (or either consisting of single space)
	if (needleLexed.length === 0 || haystackLexed.length === 0) {
		return {
			lexDistance: needleLexed.length,
			startOffset: 0,
			endOffset: 0,
			haystackLexLength: haystackLexed.length,
			needleLexLength: needleLexed.length,
		};
	}
	// Align the lexed strings
	// Take special care to not add cost if first lexeme of needle is postfix of
	// lexeme in haystack, or last lexeme of needle is prefix of lexeme in
	// haystack
	const lookupId = reverseLexDictionary(dBoth);
	const needleLexedLength = needleLexed.length;
	const needleFirst = lookupId[needleLexed[0][0]];
	const needleLast = lookupId[needleLexed[needleLexedLength - 1][0]];
	function compare(hLexId: number, nLexId: number, hIndex: number, nIndex: number) {
		if (nIndex === 0 || nIndex === needleLexedLength - 1) {
			const haystackLexeme = lookupId[haystackLexed[hIndex][0]];
			return (nIndex === 0 && haystackLexeme.endsWith(needleFirst)) ||
				(nIndex === needleLexedLength - 1 && haystackLexeme.startsWith(needleLast))
				? 0
				: 1;
		} else {
			return hLexId === nLexId ? 0 : 1;
		}
	}
	const alignment = editDistance(
		haystackLexed.map(x => x[0]),
		needleLexed.map(x => x[0]),
		compare
	);
	// Convert the lexeme offsets in alignment to character offsets
	const startOffset = haystackLexed[alignment.startOffset][1];
	let endOffset =
		alignment.endOffset < haystackLexed.length ? haystackLexed[alignment.endOffset][1] : haystack.length;
	// Account for a possible filtered-out single-space lexeme at end of match
	if (endOffset > 0 && haystack[endOffset - 1] === ' ') { --endOffset; }

	return {
		lexDistance: alignment.distance,
		startOffset,
		endOffset,
		haystackLexLength: haystackLexed.length,
		needleLexLength: needleLexed.length,
	};
}
